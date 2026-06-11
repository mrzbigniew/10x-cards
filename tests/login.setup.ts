import { test as setup, expect } from "@playwright/test";
import { config } from "dotenv";
import path from "path";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

config({ path: path.resolve(process.cwd(), "./.env") });

setup("Sign in", async ({ page }) => {
  const user = String(process.env.PLAYWRIGHT_USER);
  const password = String(process.env.PLAYWRIGHT_USER_PASS);
  await page.context().clearCookies();
  await page.goto("/auth/signin");
  await page.getByRole("textbox", { name: "Email" }).fill(user);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("button", { name: "Wyloguj" })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
