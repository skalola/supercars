import { readFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

async function source(path: string) {
  return readFile(join(root, path), "utf8");
}

async function main() {
  const [authSource, layoutSource, loginSource] = await Promise.all([
    source("auth.ts"),
    source("app/layout.tsx"),
    source("app/login/page.tsx"),
  ]);

  assert.match(authSource, /id:\s*"admin-test"/, "admin credentials login must remain available");
  assert.match(authSource, /id:\s*"user-test"/, "regular test credentials login must be available");
  assert.match(authSource, /USER_TEST_EMAIL/, "regular test login should support env-configured email");
  assert.match(authSource, /USER_TEST_PASSWORD/, "regular test login should support env-configured password");
  assert.match(authSource, /role:\s*"USER"/, "regular test login should create a USER role");
  assert.match(authSource, /role:\s*"ADMIN"/, "admin test login should create an ADMIN role");

  assert.match(layoutSource, /await auth\(\)/, "root layout should read the active session");
  assert.match(layoutSource, /signOut/, "root layout should expose server-controlled logout");
  assert.match(layoutSource, /href="\/login"/, "logged-out navigation should expose sign in");
  assert.match(layoutSource, /href="\/transactions"/, "signed-in navigation should expose transactions");
  assert.match(layoutSource, /role === "ADMIN"/, "admin navigation must remain role-scoped");

  assert.match(loginSource, /await auth\(\)/, "login page should show current session state");
  assert.match(loginSource, /signIn\("admin-test"/, "login page should support admin test login");
  assert.match(loginSource, /signIn\("user-test"/, "login page should support regular user test login");
  assert.match(loginSource, /user@supercars\.test/, "login page should show regular test credentials");
  assert.match(loginSource, /admin@supercars\.test/, "login page should show admin test credentials");

  console.log("Sprint 9A session navigation checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
