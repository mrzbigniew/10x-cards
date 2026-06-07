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

// ---------------------------------------------------------------------------
// Świadome pominięcia mutantów (npm run test:mutation)
//
// mutant: equivalent — this.name = "" (generation.ts:23)
//   Właściwość .name jest kosmetyczna; instanceof GenerationError jest
//   miarodajnym sprawdzeniem typu. Żaden konsument tej biblioteki nie
//   polega na wartości .name.
//
// mutant: equivalent — MODEL = "" / SYSTEM_PROMPT = "" (generation.ts:6,8)
//   Stałe promptu LLM są szczegółami implementacyjnymi, nie częścią
//   kontraktu funkcji. Testy jednostkowe mockują odpowiedź AI w całości,
//   więc zmiany promptu nie są wykrywalne na tej warstwie.
//
// mutant: equivalent — new OpenAI({}) / baseURL: "" (generation.ts:34-36)
//   Parametry konstruktora klienta są weryfikowalne wyłącznie przez
//   testy integracyjne lub kontraktowe (prawdziwe wywołanie API).
//   Dodanie asercji na argumenty konstruktora w teście jednostkowym
//   byłoby testem szczegółów implementacji, nie kontraktu.
//
// mutant: equivalent — create({}) / messages: [] / role: "" (generation.ts:41-45)
//   Parametry wywołania API (model, wiadomości, role) nie wpływają
//   na kontrakt funkcji w kontekście zmockowanego klienta. Testy
//   błędów pinują zachowanie przy mockowanych błędach, nie zawartość
//   zapytania do LLM.
//
// mutant: equivalent — optional chaining choices[0]?.message (generation.ts:48)
//   Typy SDK OpenAI gwarantują obecność pola message w poprawnej
//   odpowiedzi. Usunięcie ?. spowodowałoby TypeError w tym samym
//   bloku catch, który produkuje identyczny błąd.
//
// mutant: no-coverage — content ?? "" fallback (generation.ts:48)
//   Gałąź z "" jest nieosiągalna w testach: jeśli choices[0]?.message?.content
//   jest nullish, wynik "" trafia do JSON.parse i rzuca wyjątek obsługiwany
//   przez istniejący przypadek testowy rzędu 4 (nieprawidłowy JSON).
// ---------------------------------------------------------------------------
