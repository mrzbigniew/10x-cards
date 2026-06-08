import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("http://localhost:8080/auth/signin");
  await page.getByRole("textbox", { name: "email" }).fill("e2e@local.pl");
  await page.getByRole("textbox", { name: "password" }).fill("E2eUser123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://localhost:8080/dashboard");
  await expect(page.getByRole("button", { name: "Wyloguj" })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
