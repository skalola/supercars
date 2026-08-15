import crypto from "crypto";

const INVITE_VERSION = "v1";
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type ClubInvitePayload = {
  clubId: string;
  inviterId: string;
  expiresAt: number;
};

export type VerifiedClubInvite = ClubInvitePayload & {
  token: string;
};

export function createClubInviteToken({
  clubId,
  inviterId,
  ttlMs = DEFAULT_TTL_MS,
}: {
  clubId: string;
  inviterId: string;
  ttlMs?: number;
}) {
  const payload: ClubInvitePayload = {
    clubId,
    inviterId,
    expiresAt: Date.now() + ttlMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${INVITE_VERSION}.${encodedPayload}.${signature}`;
}

export function verifyClubInviteToken(token: string): VerifiedClubInvite | null {
  const [version, encodedPayload, signature] = token.split(".");
  if (version !== INVITE_VERSION || !encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as ClubInvitePayload;
    if (!payload.clubId || !payload.inviterId || !payload.expiresAt) return null;
    if (payload.expiresAt < Date.now()) return null;
    return { ...payload, token };
  } catch {
    return null;
  }
}

function sign(value: string) {
  return crypto
    .createHmac("sha256", getInviteSecret())
    .update(value)
    .digest("base64url");
}

function getInviteSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "supercar-dash-local-invite-secret";
  throw new Error("Club invites require AUTH_SECRET in production.");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
