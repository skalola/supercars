import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("maker subdomains redirect garage routes to the shared production garage", () => {
  const request = new NextRequest("https://honda.supercardash.com/garage/alex?tab=claimed", {
    headers: { host: "honda.supercardash.com" },
  });

  const response = proxy(request);

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://supercardash.com/garage/alex?tab=claimed",
  );
});

test("local maker hosts redirect garage routes to the shared local app", () => {
  const request = new NextRequest("http://honda.localhost:3010/garage?tab=dream", {
    headers: { host: "honda.localhost:3010" },
  });

  const response = proxy(request);

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3010/garage?tab=dream");
});

test("maker subdomains centralize login and preserve the requested return path", () => {
  const request = new NextRequest(
    "https://honda.supercardash.com/login?returnTo=%2Fclubs%2Finvite%2Fabc",
    { headers: { host: "honda.supercardash.com" } },
  );

  const response = proxy(request);

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://supercardash.com/login?returnTo=%2Fclubs%2Finvite%2Fabc",
  );
});

test("maker auth endpoints cannot start an OAuth flow outside the main domain", () => {
  const request = new NextRequest("https://ferrari.supercardash.com/api/auth/signin/google", {
    headers: { host: "ferrari.supercardash.com" },
  });

  const response = proxy(request);

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://supercardash.com/api/auth/signin/google",
  );
});
