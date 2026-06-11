import { test as setup } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "./.env") });

setup("Sign up", async ({ page }) => {
  const user = String(process.env.PLAYWRIGHT_USER);
  const password = String(process.env.PLAYWRIGHT_USER_PASS);
  await page.goto("/auth/signup");
  await page.getByRole("textbox", { name: "email" }).fill(user);
  await page.locator("input[name='password']").fill(password);
  await page.locator("input[name='confirmPassword']").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
});
