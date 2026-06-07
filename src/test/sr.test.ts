import { describe, it, expect, vi, beforeEach } from "vitest";
import { fsrs, type Card } from "ts-fsrs";
import { loadDueCards, applyRating, fsrsCardToDbUpdate } from "@/lib/services/sr";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase";

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CARD_ID = "card-uuid-1";
const USER_ID = "user-uuid-1";
const DECK_ID = "deck-uuid-1";
const TEST_NOW = new Date("2026-01-15T10:00:00Z");

const INITIAL_CARD_ROW: Tables<"card_sr_state"> = {
  id: "sr-row-1",
  card_id: CARD_ID,
  user_id: USER_ID,
  due: "2026-01-14T00:00:00Z",
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
  last_review: null,
  learning_steps: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Fluent-builder Supabase stub
//
// from("card_sr_state") routes by operation type (select vs update):
//   - select mode: .order() → loadDueResultFn(), .single() → srLoadSingleFn()
//   - update mode: first .eq() → chain, second .eq() → srUpdateFn() (lazy terminal)
// from("review_logs") always routes .insert() → reviewLogsInsertFn.
// ---------------------------------------------------------------------------

type DbSrRow = Tables<"card_sr_state"> & { cards: { deck_id: string } };
type DbSrRowWithEmbed = Tables<"card_sr_state"> & { cards: { id: string; front: string; back: string } };

type DbSrSingleFn = () => Promise<{ data: DbSrRow | null; error: { message: string } | null }>;
type DbSrArrayFn = () => Promise<{ data: DbSrRowWithEmbed[] | null; error: { message: string } | null }>;
type DbMutateFn = () => Promise<{ error: { message: string } | null }>;

const srLoadSingleFn = vi.fn<DbSrSingleFn>();
const srUpdateFn = vi.fn<DbMutateFn>();
const reviewLogsInsertFn = vi.fn<DbMutateFn>();
const loadDueResultFn = vi.fn<DbSrArrayFn>();
const lteFn = vi.fn();

function makeSrCardStateChain() {
  let operation: "select" | "update" | null = null;
  const chain: Record<string, unknown> = {};

  chain.select = vi.fn().mockImplementation(() => {
    operation ??= "select";
    return chain;
  });

  chain.update = vi.fn().mockImplementation(() => {
    operation = "update";
    // Re-configure eq for the update-mode two-call pattern (lazy terminal).
    // mockReset() clears the default mockReturnValue(chain) from chain construction.
    (chain.eq as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockReturnValueOnce(chain)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .mockImplementation(() => srUpdateFn());
    return chain;
  });

  chain.eq = vi.fn().mockReturnValue(chain);

  // lteFn is module-level so its call history can be asserted in tests.
  lteFn.mockReturnValue(chain);
  chain.lte = lteFn;

  chain.order = vi.fn().mockImplementation(() => loadDueResultFn());
  chain.single = vi.fn().mockImplementation(() => srLoadSingleFn());

  return chain;
}

function makeReviewLogsChain() {
  const chain: Record<string, unknown> = {};
  chain.insert = reviewLogsInsertFn;
  return chain;
}

function makeSrSupabase(): SupabaseClientType {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "review_logs") return makeReviewLogsChain();
      return makeSrCardStateChain();
    }),
  } as unknown as SupabaseClientType;
}

// ---------------------------------------------------------------------------
// Helper: replicate rowToFsrsCard (not exported from sr.ts) for oracle construction
// ---------------------------------------------------------------------------

function buildCard(row: Tables<"card_sr_state">): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps,
  };
}

// ---------------------------------------------------------------------------
// loadDueCards
// ---------------------------------------------------------------------------

describe("loadDueCards", () => {
  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSrSupabase();
  });

  it("zwraca zmapowane karty DueCard[] gdy Supabase zwróci dane", async () => {
    const rowWithEmbed: DbSrRowWithEmbed = {
      ...INITIAL_CARD_ROW,
      cards: { id: CARD_ID, front: "Pytanie", back: "Odpowiedź" },
    };
    loadDueResultFn.mockResolvedValueOnce({ data: [rowWithEmbed], error: null });

    const result = await loadDueCards(supabase, USER_ID, DECK_ID, TEST_NOW.toISOString());

    expect(result).toEqual([
      {
        id: CARD_ID,
        front: "Pytanie",
        back: "Odpowiedź",
        sr: INITIAL_CARD_ROW,
      },
    ]);
  });

  it("przekazuje filtr lte('due', dueBefore) do Supabase", async () => {
    const dueBefore = TEST_NOW.toISOString();
    loadDueResultFn.mockResolvedValueOnce({ data: [], error: null });

    await loadDueCards(supabase, USER_ID, DECK_ID, dueBefore);

    expect(lteFn).toHaveBeenCalledWith("due", dueBefore);
  });

  it("rzuca błąd gdy Supabase zwróci error", async () => {
    loadDueResultFn.mockResolvedValueOnce({ data: null, error: { message: "db error" } });

    await expect(loadDueCards(supabase, USER_ID, DECK_ID, TEST_NOW.toISOString())).rejects.toThrow("db error");
  });
});

// ---------------------------------------------------------------------------
// applyRating
// ---------------------------------------------------------------------------

describe("applyRating", () => {
  let supabase: SupabaseClientType;
  const scheduler = fsrs();

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSrSupabase();
  });

  it("aktualizuje card_sr_state z wynikiem FSRS i zwraca RatingResult przy ocenie Dobra", async () => {
    const expectedUpdate = fsrsCardToDbUpdate(scheduler.next(buildCard(INITIAL_CARD_ROW), TEST_NOW, 3).card);

    srLoadSingleFn.mockResolvedValueOnce({
      data: { ...INITIAL_CARD_ROW, cards: { deck_id: DECK_ID } },
      error: null,
    });
    srUpdateFn.mockResolvedValueOnce({ error: null });
    reviewLogsInsertFn.mockResolvedValueOnce({ error: null });

    const result = await applyRating(supabase, USER_ID, CARD_ID, DECK_ID, 3, TEST_NOW);

    expect(result).toEqual(expectedUpdate);
    expect(srUpdateFn).toHaveBeenCalled();
    expect(reviewLogsInsertFn).toHaveBeenCalled();
  });

  it("rzuca błąd gdy ładowanie card_sr_state nie powiedzie się", async () => {
    srLoadSingleFn.mockResolvedValueOnce({ data: null, error: { message: "load failed" } });

    await expect(applyRating(supabase, USER_ID, CARD_ID, DECK_ID, 3, TEST_NOW)).rejects.toThrow("load failed");
  });

  it("rzuca błąd gdy update card_sr_state nie powiedzie się", async () => {
    srLoadSingleFn.mockResolvedValueOnce({
      data: { ...INITIAL_CARD_ROW, cards: { deck_id: DECK_ID } },
      error: null,
    });
    srUpdateFn.mockResolvedValueOnce({ error: { message: "update failed" } });

    await expect(applyRating(supabase, USER_ID, CARD_ID, DECK_ID, 3, TEST_NOW)).rejects.toThrow("update failed");
  });

  it("błąd wstawiania review_log nie jest propagowany — applyRating rozwiązuje się pomyślnie", async () => {
    const expectedUpdate = fsrsCardToDbUpdate(scheduler.next(buildCard(INITIAL_CARD_ROW), TEST_NOW, 3).card);

    srLoadSingleFn.mockResolvedValueOnce({
      data: { ...INITIAL_CARD_ROW, cards: { deck_id: DECK_ID } },
      error: null,
    });
    srUpdateFn.mockResolvedValueOnce({ error: null });
    reviewLogsInsertFn.mockResolvedValueOnce({ error: { message: "log insert failed" } });

    const result = await applyRating(supabase, USER_ID, CARD_ID, DECK_ID, 3, TEST_NOW);

    expect(result).toEqual(expectedUpdate);
  });
});
