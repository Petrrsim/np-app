// Turns a Drive backup (np-diary-backup.json, notes encrypted) back into readable JSON + CSV.
// Run:  node scripts/decrypt-backup.mjs path/to/np-diary-backup.json
// Asks for the backup passphrase (or reads BACKUP_PASSPHRASE). Writes <name>.decrypted.json/.csv
// next to the input — those files contain your notes in plain text, so delete them when done.
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { recordsToCsv } from "../src/lib/export.ts";
import { decrypt, deriveKey, verifyKey } from "./backup-crypto.mjs";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/decrypt-backup.mjs path/to/np-diary-backup.json");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(input, "utf8"));
let passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  passphrase = await rl.question("Backup passphrase: ");
  rl.close();
}

const key = deriveKey(passphrase, backup.kdf);
if (!verifyKey(key, backup.check)) {
  console.error("Wrong passphrase.");
  process.exit(1);
}

const logs = backup.logs.map(({ note_encrypted, ...r }) => ({
  ...r,
  note: note_encrypted ? decrypt(key, note_encrypted) : "",
}));

const base = input.replace(/\.json$/, "");
writeFileSync(`${base}.decrypted.json`, JSON.stringify(logs, null, 2));
writeFileSync(`${base}.decrypted.csv`, recordsToCsv(logs));
const removed = logs.filter((l) => l.removed_from_app).length;
console.log(
  `Decrypted ${logs.length} logs${removed ? ` (${removed} no longer in the app)` : ""} → ${base}.decrypted.json / .csv`,
);
