import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeckWithCards, appendCardsToDeck } from "@/lib/services/decks";
import type { createClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Supabase fluent-builder stub
//
// Each call to from("decks") creates a fresh chain that tracks which operation
// was initiated first (insert / select / delete) and routes single() to the
// appropriate vi.fn() terminal. This lets createDeckWithCards and
// appendCardsToDeck share the same makeSupabase() without counter-based routing.
// ---------------------------------------------------------------------------

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;

// Explicit types prevent vi.fn() from defaulting to `any`, satisfying no-unsafe-return.
type DbSingleResult = () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
type DbInsertResult = () => Promise<{ error: { message: string } | null }>;

// Exposed vi.fn() terminals — configured per-test with mockResolvedValueOnce.
const deckInsertSingleFn = vi.fn<DbSingleResult>(); // from("decks").insert(...).select("id").single()
const deckDeleteSingleFn = vi.fn<DbSingleResult>(); // from("decks").delete().eq(...).select("id").single()
const deckSelectSingleFn = vi.fn<DbSingleResult>(); // from("decks").select("id").eq(...).single()
const cardInsertFn = vi.fn<DbInsertResult>(); // from("cards").insert(...)

function makeDecksChain() {
  let operation: "insert" | "select" | "delete" | null = null;
  const chain: Record<string, unknown> = {};

  chain.insert = vi.fn().mockImplementation(() => {
    operation = "insert";
    return chain;
  });
  chain.select = vi.fn().mockImplementation(() => {
    operation ??= "select";
    return chain;
  });
  chain.delete = vi.fn().mockImplementation(() => {
    operation = "delete";
    return chain;
  });
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockImplementation(() => {
    if (operation === "insert") return deckInsertSingleFn();
    if (operation === "delete") return deckDeleteSingleFn();
    return deckSelectSingleFn();
  });

  return chain;
}

function makeCardsChain() {
  const chain: Record<string, unknown> = {};
  chain.insert = cardInsertFn;
  return chain;
}

function makeSupabase(): SupabaseClientType {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "cards") return makeCardsChain();
      return makeDecksChain();
    }),
  } as unknown as SupabaseClientType;
}

const DECK_ID = "deck-uuid-1";
const USER_ID = "user-uuid-1";
const CARDS = [
  { front: "Pytanie 1", back: "Odpowiedź 1" },
  { front: "Pytanie 2", back: "Odpowiedź 2" },
];

// ---------------------------------------------------------------------------
// createDeckWithCards
// ---------------------------------------------------------------------------

describe("createDeckWithCards", () => {
  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("zwraca { deckId } gdy deck i karty zostaną pomyślnie zapisane", async () => {
    deckInsertSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });
    cardInsertFn.mockResolvedValueOnce({ error: null });

    const result = await createDeckWithCards(supabase, USER_ID, "Mój zestaw", CARDS);
    expect(result).toEqual({ deckId: DECK_ID });
  });

  it("rzuca błąd gdy insert decku nie powiedzie się", async () => {
    deckInsertSingleFn.mockResolvedValueOnce({ data: null, error: { message: "deck insert failed" } });

    await expect(createDeckWithCards(supabase, USER_ID, "Mój zestaw", CARDS)).rejects.toThrow("deck insert failed");
  });

  it("zwraca { deckId } i nie dotyka tabeli kart gdy cards: []", async () => {
    deckInsertSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });

    const result = await createDeckWithCards(supabase, USER_ID, "Pusty zestaw", []);
    expect(result).toEqual({ deckId: DECK_ID });
    expect(cardInsertFn).not.toHaveBeenCalled();
  });

  it("rzuca błąd i woła kompensujący deleteDeck gdy insert kart nie powiedzie się", async () => {
    deckInsertSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });
    cardInsertFn.mockResolvedValueOnce({ error: { message: "card insert failed" } });
    deckDeleteSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });

    await expect(createDeckWithCards(supabase, USER_ID, "Mój zestaw", CARDS)).rejects.toThrow("card insert failed");
    expect(deckDeleteSingleFn).toHaveBeenCalledOnce();
  });

  it("rzuca oryginalny błąd nawet gdy kompensujący delete też się nie powiedzie", async () => {
    deckInsertSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });
    cardInsertFn.mockResolvedValueOnce({ error: { message: "card insert failed" } });
    deckDeleteSingleFn.mockResolvedValueOnce({ data: null, error: { message: "delete also failed" } });

    await expect(createDeckWithCards(supabase, USER_ID, "Mój zestaw", CARDS)).rejects.toThrow("card insert failed");
  });
});

// ---------------------------------------------------------------------------
// appendCardsToDeck
// ---------------------------------------------------------------------------

describe("appendCardsToDeck", () => {
  let supabase: SupabaseClientType;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase();
  });

  it("rzuca błąd gdy deck nie istnieje lub brak dostępu", async () => {
    deckSelectSingleFn.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(appendCardsToDeck(supabase, USER_ID, DECK_ID, CARDS)).rejects.toThrow(
      "Deck not found or access denied",
    );
  });

  it("nie dotyka tabeli kart i kończy się pomyślnie gdy cards: []", async () => {
    deckSelectSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });

    await expect(appendCardsToDeck(supabase, USER_ID, DECK_ID, [])).resolves.toBeUndefined();
    expect(cardInsertFn).not.toHaveBeenCalled();
  });

  it("rzuca błąd gdy insert kart nie powiedzie się", async () => {
    deckSelectSingleFn.mockResolvedValueOnce({ data: { id: DECK_ID }, error: null });
    cardInsertFn.mockResolvedValueOnce({ error: { message: "insert error" } });

    await expect(appendCardsToDeck(supabase, USER_ID, DECK_ID, CARDS)).rejects.toThrow("insert error");
  });
});

// ---------------------------------------------------------------------------
// Deferred integration placeholder (test-plan §4)
// ---------------------------------------------------------------------------

describe.skip("integration: createDeckWithCards happy path — deferred", () => {
  it.todo("deck row count = N, card_sr_state count = N after successful save");
});
