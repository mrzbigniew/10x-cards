import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGeneration } from "@/components/hooks/useGeneration";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchError(errorBody: string) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    json: vi.fn().mockResolvedValue({ error: errorBody }),
  } as unknown as Response);
}

function mockFetchReject(message: string) {
  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error(message));
}

describe("useGeneration — obsługa błędów w generate()", () => {
  it("!res.ok — phase wraca do 'input', errorMessage jest ustawiony, text jest zachowany", async () => {
    mockFetchError("Błąd serwera — generowanie niedostępne");

    const { result } = renderHook(() => useGeneration());

    act(() => {
      result.current.setText("mój tekst wejściowy");
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.phase).toBe("input");
    expect(result.current.errorMessage).toBe("Błąd serwera — generowanie niedostępne");
    expect(result.current.text).toBe("mój tekst wejściowy");
  });

  it("fetch rzuca wyjątek (odrzucenie sieci) — phase wraca do 'input', errorMessage jest ustawiony, text jest zachowany", async () => {
    mockFetchReject("Połączenie zerwane");

    const { result } = renderHook(() => useGeneration());

    act(() => {
      result.current.setText("mój tekst wejściowy");
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.phase).toBe("input");
    expect(result.current.errorMessage).toBe("Połączenie zerwane");
    expect(result.current.text).toBe("mój tekst wejściowy");
  });

  it("udane ponowienie po błędzie — phase przechodzi do 'reviewing', tekst niezmieniony, proposals wypełnione", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockRejectedValueOnce(new Error("Chwilowy błąd sieci"));
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ proposals: [{ front: "Pytanie", back: "Odpowiedź" }] }),
    } as unknown as Response);

    const { result } = renderHook(() => useGeneration());

    act(() => {
      result.current.setText("mój tekst wejściowy");
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.phase).toBe("input");
    expect(result.current.errorMessage).toContain("Chwilowy błąd sieci");

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.phase).toBe("reviewing");
    expect(result.current.text).toBe("mój tekst wejściowy");
    expect(result.current.proposals.length).toBeGreaterThanOrEqual(1);
  });
});
