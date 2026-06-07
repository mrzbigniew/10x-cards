import { describe, it, expect, vi, beforeEach } from "vitest";
import { listDecksWithCardCount, renameDeck, deleteDeck, appendCardsToDeck } from "@/lib/services/decks";
import { listCardsInDeck } from "@/lib/services/cards";
import { applyRating } from "@/lib/services/sr";
import type { createClient } from "@/lib/supabase";

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;

const USER_A_ID = "user-a-uuid";
const USER_B_ID = "user-b-uuid";
const USER_A_DECK_ID = "deck-a-uuid";
const USER_A_CARD_ID = "card-a-uuid";
const CARDS = [
  { front: "Pytanie", back: "Odpowiedź" },
];
const TEST_NOW = new Date("2026-01-15T10:00:00Z");

// ---------------------------------------------------------------------------
// listDecksWithCardCount — terminal: .order()
// ---------------------------------------------------------------------------

describe("listDecksWithCardCount: użytkownik B próbuje wylistować zestawy użytkownika A", () => {
  const orderFn = vi.fn();

  function makeSupabase(): SupabaseClientType {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockImplementation(() => orderFn());
    return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClientType;
  }

  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("zwraca pusty zestaw [] gdy użytkownik B nie ma zestawów powiązanych z jego userId", async () => {
    orderFn.mockResolvedValueOnce({ data: [], error: null });

    const result = await listDecksWithCardCount(supabase, USER_B_ID);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// renameDeck — terminal: .single() on update chain
// ---------------------------------------------------------------------------

describe("renameDeck: użytkownik B próbuje zmienić nazwę zestawu użytkownika A", () => {
  const singleFn = vi.fn();

  function makeSupabase(): SupabaseClientType {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockImplementation(() => singleFn());
    return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClientType;
  }

  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("rzuca błąd gdy użytkownik B próbuje zmienić nazwę zestawu należącego do użytkownika A", async () => {
    singleFn.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(renameDeck(supabase, USER_B_ID, USER_A_DECK_ID, "nowa nazwa")).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// deleteDeck — terminal: .single() on delete chain
// ---------------------------------------------------------------------------

describe("deleteDeck: użytkownik B próbuje usunąć zestaw użytkownika A", () => {
  const singleFn = vi.fn();

  function makeSupabase(): SupabaseClientType {
    const chain: Record<string, unknown> = {};
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockImplementation(() => singleFn());
    return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClientType;
  }

  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("rzuca błąd gdy użytkownik B próbuje usunąć zestaw należący do użytkownika A", async () => {
    singleFn.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(deleteDeck(supabase, USER_B_ID, USER_A_DECK_ID)).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// appendCardsToDeck — terminal: .single() on ownership SELECT
// ---------------------------------------------------------------------------

describe("appendCardsToDeck: użytkownik B próbuje dołączyć karty do zestawu użytkownika A", () => {
  const singleFn = vi.fn();

  function makeSupabase(): SupabaseClientType {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockImplementation(() => singleFn());
    return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClientType;
  }

  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("rzuca 'Deck not found or access denied' gdy użytkownik B próbuje dołączyć karty do zestawu użytkownika A", async () => {
    singleFn.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(appendCardsToDeck(supabase, USER_B_ID, USER_A_DECK_ID, CARDS)).rejects.toThrow(
      "Deck not found or access denied",
    );
  });
});

// ---------------------------------------------------------------------------
// applyRating — terminal: srLoadSingleFn pattern
// ---------------------------------------------------------------------------

describe("applyRating: użytkownik B próbuje ocenić kartę użytkownika A", () => {
  const srLoadSingleFn = vi.fn();
  const srUpdateFn = vi.fn();
  const reviewLogsInsertFn = vi.fn();

  function makeSrCardStateChain() {
    let operation: "select" | "update" | null = null;
    const chain: Record<string, unknown> = {};

    chain.select = vi.fn().mockImplementation(() => {
      operation ??= "select";
      return chain;
    });
    chain.update = vi.fn().mockImplementation(() => {
      operation = "update";
      (chain.eq as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockReturnValueOnce(chain)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .mockImplementation(() => srUpdateFn());
      return chain;
    });
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.lte = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockImplementation(() => srLoadSingleFn());

    return chain;
  }

  function makeSupabase(): SupabaseClientType {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "review_logs") return { insert: reviewLogsInsertFn };
        return makeSrCardStateChain();
      }),
    } as unknown as SupabaseClientType;
  }

  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("rzuca błąd gdy użytkownik B próbuje ocenić kartę należącą do użytkownika A", async () => {
    srLoadSingleFn.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(applyRating(supabase, USER_B_ID, USER_A_CARD_ID, USER_A_DECK_ID, 3, TEST_NOW)).rejects.toThrow(
      "not found",
    );
  });
});

// ---------------------------------------------------------------------------
// listCardsInDeck — terminal: .order()
// ---------------------------------------------------------------------------

describe("listCardsInDeck: użytkownik B próbuje wylistować karty z zestawu użytkownika A", () => {
  const orderFn = vi.fn();

  function makeSupabase(): SupabaseClientType {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockImplementation(() => orderFn());
    return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClientType;
  }

  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("zwraca pustą tablicę [] gdy użytkownik B odpytuje karty zestawu użytkownika A z własnym userId", async () => {
    orderFn.mockResolvedValueOnce({ data: [], error: null });

    const result = await listCardsInDeck(supabase, USER_B_ID, USER_A_DECK_ID);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deferred integration placeholder (test-plan §4 — Risk #4)
// ---------------------------------------------------------------------------

describe.skip("integracja: izolacja między użytkownikami z prawdziwą bazą danych — odroczone", () => {
  it.todo("użytkownik B nie widzi zestawów użytkownika A przy zapytaniu z własnym userId (prawdziwe RLS)");
  it.todo("użytkownik B otrzymuje błąd przy próbie modyfikacji zasobu użytkownika A (prawdziwe RLS)");
});
