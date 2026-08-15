import crypto from "node:crypto";

export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const actualBytes = Buffer.from(authorization);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}
