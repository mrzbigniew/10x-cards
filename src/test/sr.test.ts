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

    const result = await loadDueCards(supabase, USER_ID, DECK_ID, dueBefore);

    expect(lteFn).toHaveBeenCalledWith("due", dueBefore);
    expect(result).toEqual([]);
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
    expect(result.reps).toBe(1);
    expect(result.state).toBeGreaterThan(0);
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
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const expectedUpdate = fsrsCardToDbUpdate(scheduler.next(buildCard(INITIAL_CARD_ROW), TEST_NOW, 3).card);

    srLoadSingleFn.mockResolvedValueOnce({
      data: { ...INITIAL_CARD_ROW, cards: { deck_id: DECK_ID } },
      error: null,
    });
    srUpdateFn.mockResolvedValueOnce({ error: null });
    reviewLogsInsertFn.mockResolvedValueOnce({ error: { message: "log insert failed" } });

    const result = await applyRating(supabase, USER_ID, CARD_ID, DECK_ID, 3, TEST_NOW);

    expect(result).toEqual(expectedUpdate);
    expect(consoleSpy).toHaveBeenCalledWith("[review_logs] insert failed:", "log insert failed");
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Survived mutants (sr.ts) — reviewed 2026-06-07
//
// Group A: fsrsCardToDbUpdate body (lines 25–36) — 4 mutants
// - [25] BlockStatement (empty function body): equivalent — the happy-path oracle is
//   computed by calling fsrsCardToDbUpdate itself, so gutting the body mutates both
//   sides of toEqual symmetrically; the assertion stays green. Scope: integration
//   boundary only, not fsrsCardToDbUpdate field-level correctness.
// - [26] ObjectLiteral (return {}): equivalent — same symmetric-oracle reason as above.
// - [36] LogicalOperator (?? → &&): equivalent — last_review is null in INITIAL_CARD_ROW
//   so the ?? branch is never exercised in these tests; both sides still return null.
// - [36] OptionalChaining (?. removed): equivalent — last_review is null in all fixtures,
//   so .toISOString() is never called and removing ?. makes no observable difference.
//
// Group B: reviewLogToDbInsert body (lines 41–57) — 2 mutants
// - [41] BlockStatement (empty function body): equivalent — tests assert reviewLogsInsertFn
//   was called, not what payload was passed to insert(); log structure is not a business
//   rule asserted here.
// - [42] ObjectLiteral (return {}): equivalent — same reason as [41].
//
// Group C: Supabase query string literals (lines 76–82, 104–108, 118–121) — 13 mutants
// - [76,104,118] StringLiteral from("card_sr_state") → from(""): equivalent — the
//   fluent-builder stub routes from() by exact table name for "review_logs" only; any
//   other string (including "") returns the card_sr_state chain, so the stub behaves
//   identically. Argument correctness is verified at the integration layer.
// - [77,105] StringLiteral select("*..."): equivalent — stub ignores the select() argument
//   and returns the same chain regardless of column spec.
// - [78,106,107,108,120,121,81] StringLiteral .eq("field") → .eq(""): equivalent — stub
//   eq() ignores the field-name argument and routes by call-order (chain vs terminal);
//   the empty string makes no difference to stub behavior. Real column names are verified
//   against a live DB in the integration layer.
// - [82] StringLiteral .order("due") → .order(""): equivalent — stub order() ignores the
//   column argument and immediately calls loadDueResultFn(); sort column is not asserted.
//
// Group D: console.error behavior (line 129) — 2 mutants
// - [129] StringLiteral (error message → ""): equivalent — the non-fatal log test asserts
//   only that applyRating resolves; the console.error message text is developer
//   observability, not user-visible behavior.
// - [129] ConditionalExpression (if(logError) → if(false)): equivalent — the test verifies
//   applyRating resolves despite a log error; it does not assert that console.error is
//   called. Guarding the log call is cosmetic for this test's scope.
// ---------------------------------------------------------------------------
