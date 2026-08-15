import "server-only";

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const DUMMY_SALT = "c3VwZXJjYXItZGFzaC1hdXRo";

function deriveKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 32 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(18).toString("base64url");
  const key = await deriveKey(password, salt);

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash?: string | null) {
  const segments = encodedHash?.split("$") || [];
  const isSupportedHash =
    segments.length === 6 &&
    segments[0] === "scrypt" &&
    Number(segments[1]) === SCRYPT_COST &&
    Number(segments[2]) === SCRYPT_BLOCK_SIZE &&
    Number(segments[3]) === SCRYPT_PARALLELIZATION;
  const salt = isSupportedHash ? segments[4] : DUMMY_SALT;
  const expected = isSupportedHash
    ? Buffer.from(segments[5], "base64url")
    : Buffer.alloc(KEY_LENGTH);
  const actual = await deriveKey(password, salt);

  return isSupportedHash && expected.length === actual.length && timingSafeEqual(expected, actual);
}
