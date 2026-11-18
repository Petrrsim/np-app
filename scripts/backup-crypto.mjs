// Note encryption for the Drive backup: AES-256-GCM per note, key = scrypt(passphrase, file salt).
// Independent of the app's server-side encryption, so a backup can be read without Supabase.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const CHECK = "np-diary-backup";

export function newKdf() {
  return { name: "scrypt", salt: randomBytes(16).toString("base64"), N: 2 ** 17, r: 8, p: 1 };
}

export function deriveKey(passphrase, kdf) {
  if (kdf.name !== "scrypt") throw new Error(`Unknown KDF ${kdf.name}`);
  return scryptSync(passphrase, Buffer.from(kdf.salt, "base64"), 32, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: 256 * 1024 * 1024,
  });
}

/** "base64(iv | ciphertext | tag)" */
export function encrypt(key, text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

export function decrypt(key, b64) {
  const buf = Buffer.from(b64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([decipher.update(buf.subarray(12, buf.length - 16)), decipher.final()]).toString("utf8");
}

/** Stored in the file so a wrong passphrase is caught before anything is merged or written. */
export const makeCheck = (key) => encrypt(key, CHECK);

export function verifyKey(key, check) {
  try {
    return decrypt(key, check) === CHECK;
  } catch {
    return false;
  }
}
