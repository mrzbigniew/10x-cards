import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateProposals, GenerationError } from "@/lib/services/generation";

// Override the global astro:env/server mock from vitest.setup.ts with a getter
// so individual tests can toggle OPENROUTER_API_KEY without vi.resetModules().
let mockApiKey: string | undefined = "test-key";

vi.mock("astro:env/server", () => ({
  get OPENROUTER_API_KEY() {
    return mockApiKey;
  },
}));

// vi.hoisted ensures mockCreate is available when the vi.mock("openai") factory runs.
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  // Regular function required — arrow functions cannot be used as constructors.
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  }),
}));

function stubContent(content: string): void {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content } }],
  });
}

describe("generateProposals", () => {
  beforeEach(() => {
    mockApiKey = "test-key";
    vi.clearAllMocks();
  });

  // --- Macierz błędów (6 wierszy) ---

  it.each([
    {
      scenario: "OPENROUTER_API_KEY undefined — brakująca konfiguracja API",
      setup: () => {
        mockApiKey = undefined;
      },
      expectedMsg: "Generowanie AI nie jest skonfigurowane",
    },
    {
      scenario: "SDK rzuca Error — błąd sieci lub limitu",
      setup: () => {
        mockCreate.mockRejectedValueOnce(new Error("network timeout"));
      },
      expectedMsg: "Żądanie do AI nie powiodło się: network timeout",
    },
    {
      scenario: "SDK rzuca nie-Error — nieznany błąd dostawcy",
      setup: () => {
        mockCreate.mockRejectedValueOnce("oops");
      },
      expectedMsg: "Żądanie do AI nie powiodło się: Unknown error from AI provider",
    },
    {
      scenario: "odpowiedź nie jest poprawnym JSON — nieprawidłowy format",
      setup: () => {
        stubContent("to nie jest json {{");
      },
      expectedMsg: "AI zwróciło nieprawidłową odpowiedź",
    },
    {
      scenario: "JSON parsuje się, ale kształt tablicy nie pasuje do ProposalSchema",
      setup: () => {
        stubContent(JSON.stringify([{ zly_klucz: "wartość" }]));
      },
      expectedMsg: "AI zwróciło nieoczekiwany format odpowiedzi",
    },
    {
      scenario: "poprawna tablica o długości 0 — brak propozycji",
      setup: () => {
        stubContent(JSON.stringify([]));
      },
      expectedMsg: "AI nie zwróciło żadnych propozycji",
    },
  ])("$scenario → rzuca GenerationError z polskim komunikatem", async ({ setup, expectedMsg }) => {
    setup();
    const err = await generateProposals("przykładowy tekst źródłowy").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).message).toContain(expectedMsg);
  });

  // --- Ścieżka szczęśliwa ---

  it("ścieżka szczęśliwa — zwraca niepustą tablicę z prawidłowymi kartami", async () => {
    stubContent(JSON.stringify([{ front: "Pytanie 1", back: "Odpowiedź 1" }]));
    const result = await generateProposals("przykładowy tekst źródłowy");
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const item of result) {
      expect(item.front.length).toBeGreaterThan(0);
      expect(item.back.length).toBeGreaterThan(0);
    }
  });

  // --- Przypadek brzegowy: whitespace-only po .trim().min(1) ---

  it("front zawiera tylko białe znaki → rzuca błąd nieoczekiwanego formatu (ProposalSchema .trim().min(1))", async () => {
    stubContent(JSON.stringify([{ front: "   ", back: "prawidłowa odpowiedź" }]));
    const err = await generateProposals("przykładowy tekst źródłowy").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).message).toContain("AI zwróciło nieoczekiwany format odpowiedzi");
  });
});
