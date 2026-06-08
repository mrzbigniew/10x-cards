import { test, expect } from "@playwright/test";

// Risk #5: After an API error, the generation UI still displays the original
// pasted text and a retry option — user must not lose their input.
test("pasted text is preserved and retry is available after a generation API error", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Generuj fiszki z AI" }).click();
  await expect(page.getByRole("heading", { name: "Generuj fiszki z AI", level: 2 })).toBeVisible();

  const originalText = "Polska polityka w XIV wieku — tekst do odzyskania po błędzie.";
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
