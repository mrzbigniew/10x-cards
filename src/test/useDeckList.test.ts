import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeckList } from "@/components/hooks/useDeckList";

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderWithInitialLoad() {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: vi.fn().mockResolvedValue([]),
  } as unknown as Response);

  const { result } = renderHook(() => useDeckList());
  await act(() => Promise.resolve());

  fetchSpy.mockClear();
  return { result, fetchSpy };
}

describe("createDeck", () => {
  it("błąd serwera — rzuca wyjątek i nie odświeża", async () => {
    const { result, fetchSpy } = await renderWithInitialLoad();

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Błąd serwera" }),
    } as unknown as Response);

    await act(async () => {
      await expect(result.current.createDeck("Nowy zestaw")).rejects.toThrow("Błąd serwera");
    });

    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it("sukces — nie rzuca wyjątku i odświeża listę", async () => {
    const { result, fetchSpy } = await renderWithInitialLoad();

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      } as unknown as Response);

    await act(async () => {
      await result.current.createDeck("Nowy zestaw");
    });
    await act(() => Promise.resolve());

    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});

describe("deleteDeck", () => {
  it("błąd serwera — rzuca wyjątek i nie odświeża", async () => {
    const { result, fetchSpy } = await renderWithInitialLoad();

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Błąd serwera" }),
    } as unknown as Response);

    await act(async () => {
      await expect(result.current.deleteDeck("deck-1")).rejects.toThrow("Błąd serwera");
    });

    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it("sukces — nie rzuca wyjątku i odświeża listę", async () => {
    const { result, fetchSpy } = await renderWithInitialLoad();

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      } as unknown as Response);

    await act(async () => {
      await result.current.deleteDeck("deck-1");
    });
    await act(() => Promise.resolve());

    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});

describe("resetDeckProgress", () => {
  it("błąd serwera — rzuca wyjątek i nie odświeża", async () => {
    const { result, fetchSpy } = await renderWithInitialLoad();

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Błąd serwera" }),
    } as unknown as Response);

    await act(async () => {
      await expect(result.current.resetDeckProgress("deck-1")).rejects.toThrow("Błąd serwera");
    });

    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it("sukces — nie rzuca wyjątku i odświeża listę", async () => {
    const { result, fetchSpy } = await renderWithInitialLoad();

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      } as unknown as Response);

    await act(async () => {
      await result.current.resetDeckProgress("deck-1");
    });
    await act(() => Promise.resolve());

    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});
