import { test as setup } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "./.env") });
const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

setup("Sign up", async ({ page }) => {
  await page.context().clearCookies();
  const user = String(process.env.PLAYWRIGHT_USER);
  const password = String(process.env.PLAYWRIGHT_USER_PASS);
  await page.goto("/auth/signup");
  await page.getByRole("textbox", { name: "email" }).fill(user);
  await page.locator("input[name='password']").fill(password);
  await page.locator("input[name='confirmPassword']").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.goto("/auth/signin");
  await page.getByRole("textbox", { name: "Email" }).fill(user);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.context().storageState({ path: authFile });
});
