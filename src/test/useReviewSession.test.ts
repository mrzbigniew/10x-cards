import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReviewSession } from "@/components/hooks/useReviewSession";
import type { DueCard, RatingResult } from "@/lib/services/sr";
import type { Tables } from "@/lib/database.types";

const DECK_ID = "deck-1";

const CARD_A: DueCard = {
  id: "card-a",
  front: "Pytanie A",
  back: "Odpowiedź A",
  sr: {
    id: "sr-a",
    card_id: "card-a",
    user_id: "user-1",
    due: "2026-01-01T00:00:00Z",
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
  } satisfies Tables<"card_sr_state">,
};

const CARD_B: DueCard = {
  id: "card-b",
  front: "Pytanie B",
  back: "Odpowiedź B",
  sr: {
    id: "sr-b",
    card_id: "card-b",
    user_id: "user-1",
    due: "2026-01-01T00:00:00Z",
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
  } satisfies Tables<"card_sr_state">,
};

const UPDATED_SR_A: RatingResult = {
  due: "2026-01-16T00:00:00Z",
  stability: 1.5,
  difficulty: 5.0,
  elapsed_days: 1,
  scheduled_days: 1,
  reps: 1,
  lapses: 0,
  state: 2,
  last_review: "2026-01-15T10:00:00Z",
  learning_steps: 0,
};

const UPDATED_SR_B: RatingResult = {
  due: "2026-01-17T00:00:00Z",
  stability: 1.5,
  difficulty: 5.0,
  elapsed_days: 1,
  scheduled_days: 1,
  reps: 1,
  lapses: 0,
  state: 2,
  last_review: "2026-01-15T10:00:00Z",
  learning_steps: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useReviewSession — logika kolejki", () => {
  it("ocena 'Raz jeszcze' (1) przesuwa kartę na koniec kolejki ze zaktualizowanym sr", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A, CARD_B] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_B }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));

    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.current?.id).toBe(CARD_B.id);
    expect(result.current.remaining).toBe(1);
    expect(result.current.againCount).toBe(1);

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.current?.id).toBe(CARD_A.id);
    expect(result.current.current?.sr).toMatchObject(UPDATED_SR_A);
  });

  it("ocena niezerowa (3) usuwa kartę z kolejki i zwiększa reviewedCount", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A, CARD_B] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));

    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(3);
    });

    expect(result.current.remaining).toBe(0);
    expect(result.current.current?.id).toBe(CARD_B.id);
    expect(result.current.reviewedCount).toBe(1);
    expect(result.current.finished).toBe(false);
  });

  it("reviewedCount nie zwiększa się, gdy ta sama karta pojawia się w kolejce dwukrotnie", async () => {
    const CARD_A_DUP: DueCard = { ...CARD_A, sr: { ...CARD_A.sr, id: "sr-a-dup" } };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A, CARD_A_DUP] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));
    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(3);
    });
    expect(result.current.reviewedCount).toBe(1);

    await act(async () => {
      await result.current.rate(3);
    });
    expect(result.current.reviewedCount).toBe(1);
  });

  it("błąd fetch przy rate() ustawia stan error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A, CARD_B] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Błąd serwera" }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));

    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(3);
    });

    expect(result.current.error).toBe("Błąd serwera");
  });
});

describe("useReviewSession — głębokość ponownego kolejkowania", () => {
  it("pojedyncza karta: Raz jeszcze → Raz jeszcze → dobra → finished === true", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));

    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.current?.id).toBe(CARD_A.id);
    expect(result.current.finished).toBe(false);

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.current?.id).toBe(CARD_A.id);
    expect(result.current.finished).toBe(false);

    await act(async () => {
      await result.current.rate(3);
    });

    expect(result.current.finished).toBe(true);
    expect(result.current.current).toBeNull();
  });

  it("wiele kart: wszystkie Raz jeszcze, potem wszystkie dobra → sesja kończy się na końcu", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A, CARD_B] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_B }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_B }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));

    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.current?.id).toBe(CARD_B.id);
    expect(result.current.finished).toBe(false);

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.current?.id).toBe(CARD_A.id);
    expect(result.current.finished).toBe(false);

    await act(async () => {
      await result.current.rate(3);
    });

    expect(result.current.current?.id).toBe(CARD_B.id);
    expect(result.current.finished).toBe(false);

    await act(async () => {
      await result.current.rate(3);
    });

    expect(result.current.finished).toBe(true);
  });

  it("remaining > 0 kiedy ponownie kolejkowane karty są w kolejce", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ cards: [CARD_A, CARD_B] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sr: UPDATED_SR_A }),
      } as unknown as Response);

    const { result } = renderHook(() => useReviewSession(DECK_ID));

    await act(() => Promise.resolve());

    await act(async () => {
      await result.current.rate(1);
    });

    expect(result.current.remaining).toBe(1);
  });
});
