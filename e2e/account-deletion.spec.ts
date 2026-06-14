import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), "./.env") });

test.use({ storageState: { cookies: [], origins: [] } });

let disposableEmail = "";

test.afterAll(async () => {
  if (!disposableEmail) return;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;
  const admin = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await admin.auth.admin.listUsers();
  const zombie = data.users.find((u) => u.email === disposableEmail);
  if (zombie) {
    try {
      await admin.auth.admin.deleteUser(zombie.id);
    } catch {
      // best-effort cleanup — ignore failures
    }
  }
});

test("pełny przepływ usunięcia konta: rejestracja → usuń konto → zablokowanie", async ({ page }) => {
  await page.context().clearCookies();
  const baseEmail = String(process.env.PLAYWRIGHT_USER);
  const password = String(process.env.PLAYWRIGHT_USER_PASS);
  const [localPart, domain] = baseEmail.split("@");
  disposableEmail = `${localPart}+delete-${Date.now()}@${domain}`;

  // Rejestracja konta jednorazowego
  await page.goto("/auth/signup");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "email" }).fill(disposableEmail);
  await page.locator("input[name='password']").fill(password);
  await page.locator("input[name='confirmPassword']").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Logowanie (rejestracja przekierowuje na /auth/confirm-email, omijamy)
  await page.goto("/auth/signin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Email" }).fill(disposableEmail);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await page.waitForLoadState("networkidle");

  // Otwórz menu użytkownika
  await page.getByRole("button", { name: "Menu użytkownika" }).click();

  // Przejdź do ustawień
  await page.getByRole("menuitem", { name: "Ustawienia" }).click();
  await page.waitForURL("/settings");
  await page.waitForLoadState("networkidle");

  // Otwórz dialog usunięcia konta
  await page.getByRole("button", { name: "Usuń konto" }).click();

  // Poczekaj, aż dialog się otworzy
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  // Wpisz frazę potwierdzającą
  await dialog.getByPlaceholder("USUŃ KONTO").fill("USUŃ KONTO");

  // Potwierdź usunięcie
  await dialog.getByRole("button", { name: "Usuń konto" }).click();

  // Powinniśmy wylądować na stronie logowania z komunikatem
  await expect(page).toHaveURL(/\/auth\/signin\?notice=account-deleted/);
  await expect(page.getByText("Twoje konto zostało usunięte.")).toBeVisible();

  // Próba logowania usuniętymi danymi – powinna zakończyć się błędem
  // Wait for React to fully hydrate the sign-in form before filling it in.
  // Without this, Chromium can fill the inputs before the component mounts,
  // leaving React's controlled state empty; handleSubmit then calls
  // e.preventDefault() and the form never POSTs.
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Email" }).fill(disposableEmail);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/auth\/signin\?error=/);
});
