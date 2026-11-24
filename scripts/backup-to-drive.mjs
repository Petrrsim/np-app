// Scheduled backup: signs in as the diary user, loads the full decrypted history (same path as the
// app's useEntries), and merges it into ONE cumulative file on Google Drive: "np-diary-backup.json".
// Notes are re-encrypted with the backup passphrase (see backup-crypto.mjs); metrics/tags stay readable.
// Logs are never dropped: new logs are added, edited logs updated, and logs deleted in the app stay
// in the file marked `removed_from_app`. Drive's own revision history keeps earlier versions of the file.
// Read it with: node scripts/decrypt-backup.mjs np-diary-backup.json
//
// Run by .github/workflows/backup.yml (nightly). Locally: node --env-file=.env.backup scripts/backup-to-drive.mjs
// Env: NP_EMAIL, NP_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY, BACKUP_PASSPHRASE,
//      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN  (refresh token: scripts/google-auth.mjs)
// Optional: DRIVE_FOLDER (default "NP Diary backups").
import { toRecord } from "../src/lib/export.ts";
import { decrypt, deriveKey, encrypt, makeCheck, newKdf, verifyKey } from "./backup-crypto.mjs";
import { connect, env, loadHistory } from "./np-history.mjs";

const FOLDER = env("DRIVE_FOLDER", "NP Diary backups");
const FILE = "np-diary-backup.json";
const PASSPHRASE = env("BACKUP_PASSPHRASE");

// ---------- Google Drive (drive.file scope: only sees files this script created) ----------

let accessToken;

async function googleToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${body.error} ${body.error_description ?? ""}`);
  return body.access_token;
}

async function drive(path, init = {}) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`Drive ${init.method ?? "GET"} ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  return res;
}

const q = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function listFiles(query) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ q: query, fields: "nextPageToken, files(id, name)", pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const body = await (await drive(`/drive/v3/files?${params}`)).json();
    files.push(...body.files);
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

async function ensureFolder() {
  const [found] = await listFiles(
    `name = '${q(FOLDER)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  if (found) return found.id;
  const res = await drive("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }),
  });
  return (await res.json()).id;
}

async function findFile(folderId) {
  const [file] = await listFiles(`name = '${q(FILE)}' and '${folderId}' in parents and trashed = false`);
  if (!file) return null;
  const res = await drive(`/drive/v3/files/${file.id}?alt=media`);
  return { id: file.id, backup: JSON.parse(await res.text()) };
}

/** Resumable upload (the file is several MB — over the 5 MB multipart limit). Updates in place if `fileId`. */
async function upload(folderId, fileId, content) {
  const mimeType = "application/json";
  const start = await drive(
    fileId
      ? `/upload/drive/v3/files/${fileId}?uploadType=resumable&fields=id`
      : "/upload/drive/v3/files?uploadType=resumable&fields=id",
    {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType },
      body: JSON.stringify(fileId ? {} : { name: FILE, parents: [folderId], mimeType }),
    },
  );
  const res = await fetch(start.headers.get("location"), {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: content,
  });
  if (!res.ok) throw new Error(`Upload ${FILE}: ${res.status} ${await res.text()}`);
}

// ---------- merge ----------

/** Merges the app's current history into the previous backup; nothing already backed up is dropped. */
function merge(previous, entries, names, today) {
  const kdf = previous?.kdf ?? newKdf();
  const key = deriveKey(PASSPHRASE, kdf);
  if (previous && !verifyKey(key, previous.check)) {
    throw new Error("BACKUP_PASSPHRASE doesn't match the existing backup on Drive — refusing to overwrite it");
  }

  const byId = new Map((previous?.logs ?? []).map((l) => [l.id, l]));
  const seen = new Set();
  let added = 0;
  let updated = 0;
  for (const e of entries) {
    const { note, ...rest } = toRecord(e, names);
    const old = byId.get(e.id);
    // Reuse the old ciphertext when the note is unchanged, so unchanged logs stay byte-identical.
    const sameNote = old?.note_encrypted ? decrypt(key, old.note_encrypted) === note : !old?.note_encrypted && !note;
    const next = { ...rest, note_encrypted: sameNote && old ? old.note_encrypted : note ? encrypt(key, note) : null };
    if (!old) added++;
    else if (JSON.stringify(old) !== JSON.stringify(next)) updated++;
    byId.set(e.id, next);
    seen.add(e.id);
  }
  let removed = 0;
  for (const [id, log] of byId) {
    if (!seen.has(id) && !log.removed_from_app) {
      byId.set(id, { ...log, removed_from_app: today });
      removed++;
    }
  }

  const logs = [...byId.values()].sort((a, b) =>
    a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date),
  );
  const backup = {
    format: "np-diary-backup",
    version: 1,
    updated_at: new Date().toISOString(),
    note_encryption: "AES-256-GCM, base64(iv|ciphertext|tag), key = scrypt(passphrase, kdf)",
    kdf,
    check: previous?.check ?? makeCheck(key),
    logs,
  };
  return { backup, added, updated, removed };
}

// ---------- main ----------

const { entries, names } = await loadHistory(await connect());
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());

accessToken = await googleToken();
const folderId = await ensureFolder();
const existing = await findFile(folderId);
const { backup, added, updated, removed } = merge(existing?.backup, entries, names, today);
const content = JSON.stringify(backup, null, 2);
await upload(folderId, existing?.id, content);

console.log(
  `${existing ? "Updated" : "Created"} ${FOLDER}/${FILE}: ${backup.logs.length} logs ` +
    `(+${added} new, ${updated} edited, ${removed} newly removed from app), ${(Buffer.byteLength(content) / 1e6).toFixed(1)} MB.`,
);
