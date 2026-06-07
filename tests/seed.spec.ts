import { test, expect } from '@playwright/test';

test('Tsts AI generation flow with saving', async ({ page }) => {
    const text = `
        Polska polityka w XIV wieku była okresem intensywnych przemian, odbudowy państwowości oraz stopniowego wzmacniania pozycji międzynarodowej po okresie rozbicia dzielnicowego. Kluczowym momentem było zjednoczenie ziem polskich pod panowaniem Władysław I Łokietek, który w 1320 roku koronował się na króla w Krakowie, symbolicznie kończąc epokę rozbicia dzielnicowego. Jego rządy nie były jednak łatwe – państwo było osłabione wewnętrznie, a także narażone na naciski ze strony sąsiadów, zwłaszcza Zakon Krzyżacki oraz Królestwo Czech.
        Jednym z głównych problemów politycznych była kwestia Pomorza Gdańskiego, które zostało zajęte przez Krzyżaków na początku XIV wieku. Konflikt z zakonem miał charakter zarówno militarny, jak i dyplomatyczny. Władysław I Łokietek podejmował próby odzyskania tych ziem poprzez procesy sądowe, m.in. przed sądami papieskimi, jednak nie przyniosły one oczekiwanych rezultatów. Mimo to jego działania stworzyły fundament dla późniejszych sukcesów jego następcy.
        Po śmierci Łokietka w 1333 roku władzę objął jego syn, Kazimierz III Wielki, którego panowanie uznawane jest za okres stabilizacji i rozwoju. Kazimierz Wielki prowadził politykę bardziej pragmatyczną niż jego ojciec – zamiast otwartych konfliktów militarnych często wybierał dyplomację i kompromis. Przykładem jest zawarcie pokoju kaliskiego w 1343 roku z Zakon Krzyżacki, na mocy którego Polska odzyskała Kujawy i ziemię dobrzyńską, choć Pomorze Gdańskie pozostało pod kontrolą zakonu.
    `
    await page.goto('http://localhost:8080/dashboard');
    await expect(page.getByRole('button', { name: 'Generuj fiszki z AI' })).toBeVisible();
    await page.getByRole('button', { name: 'Generuj fiszki z AI' }).click();
    await expect(page.getByRole('heading', { name: 'Generuj fiszki z AI', level: 2 })).toBeVisible();
    await page.getByPlaceholder('Wklej tutaj tekst (do 10 000 znaków)…').fill(text);
    const generateResponseawait = page.waitForResponse('**/api/generate');
    await page.getByRole('button', { name: 'Generuj fiszki z AI' }).click();
    await generateResponseawait;
    await expect(page.getByRole('heading', { name: 'Propozycje fiszek', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Akceptuj pozostałe.*/gi })).toBeVisible();
    await page.getByRole('button', { name: /Akceptuj pozostałe.*/gi }).click()
    const deckName = `Test Zestaw ${Date.now()}`;
    await page.getByPlaceholder('Nazwa zestawu').fill(deckName);
    const saveResponse = await page.waitForResponse('**/api/decks');
    await page.getByRole('button', { name: 'Zapisz zestaw' }).click();
    await saveResponse
    await expect(page.getByText(deckName)).toBeVisible();
});