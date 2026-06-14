import { test, expect } from "@playwright/test";

// Risk #5: After an API error, the generation UI still displays the original
// pasted text and a retry option — user must not lose their input.
test("pasted text is preserved and retry is available after a generation API error", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Generuj fiszki z AI" }).click();
  await expect(page.getByRole("heading", { name: "Generuj fiszki z AI", level: 2 })).toBeVisible();

  const originalText = `Polska polityka w XIV wieku była okresem intensywnych przemian, odbudowy państwowości oraz stopniowego wzmacniania pozycji międzynarodowej po okresie rozbicia dzielnicowego. Kluczowym momentem było zjednoczenie ziem polskich pod panowaniem Władysław I Łokietek, który w 1320 roku koronował się na króla w Krakowie, symbolicznie kończąc epokę rozbicia dzielnicowego. Jego rządy nie były jednak łatwe – państwo było osłabione wewnętrznie, a także narażone na naciski ze strony sąsiadów, zwłaszcza Zakon Krzyżacki oraz Królestwo Czech.
        Jednym z głównych problemów politycznych była kwestia Pomorza Gdańskiego, które zostało zajęte przez Krzyżaków na początku XIV wieku. Konflikt z zakonem miał charakter zarówno militarny, jak i dyplomatyczny. Władysław I Łokietek podejmował próby odzyskania tych ziem poprzez procesy sądowe, m.in. przed sądami papieskimi, jednak nie przyniosły one oczekiwanych rezultatów. Mimo to jego działania stworzyły fundament dla późniejszych sukcesów jego następcy.
        Po śmierci Łokietka w 1333 roku władzę objął jego syn, Kazimierz III Wielki, którego panowanie uznawane jest za okres stabilizacji i rozwoju. Kazimierz Wielki prowadził politykę bardziej pragmatyczną niż jego ojciec – zamiast otwartych konfliktów militarnych często wybierał dyplomację i kompromis. Przykładem jest zawarcie pokoju kaliskiego w 1343 roku z Zakon Krzyżacki, na mocy którego Polska odzyskała Kujawy i ziemię dobrzyńską, choć Pomorze Gdańskie pozostało pod kontrolą zakonu.
    `;
  await page.getByPlaceholder("Wklej tutaj tekst (do 10 000 znaków)…").fill(originalText);

  // Intercept the generate API before the click that triggers it
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) }),
  );

  const generateResponsePromise = page.waitForResponse("**/api/generate");
  await page.getByTestId("btn-generate").click();
  await generateResponsePromise;

  // Risk #5: text must survive the error — user should not need to re-paste
  await expect(page.getByPlaceholder("Wklej tutaj tekst (do 10 000 znaków)…")).toHaveValue(originalText);
  // Retry affordance must be present — same button re-enables after error
  await expect(page.getByTestId("btn-generate")).toBeEnabled();
});
