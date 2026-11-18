// One-time helper: gets the Google refresh token the backup workflow uses.
// Run:  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.mjs
// Opens a consent link (scope drive.file = only files this app creates), catches the redirect on
// localhost, and prints the refresh token. Store it as the GOOGLE_REFRESH_TOKEN repo secret.
import { createServer } from "node:http";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (OAuth client of type 'Desktop app').");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  const code = url.searchParams.get("code");
  if (!code) {
    res.end(url.searchParams.get("error") ?? "No code");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = await tokenRes.json();
  res.end(body.refresh_token ? "Done — you can close this tab." : `Failed: ${JSON.stringify(body)}`);
  if (body.refresh_token) console.log(`\nGOOGLE_REFRESH_TOKEN=${body.refresh_token}\n`);
  else console.error("No refresh token returned:", body);
  server.close();
});

let redirectUri;
// Desktop-app clients accept any loopback port. Web-application clients need the exact URI
// registered — run with OAUTH_PORT=8085 and add http://127.0.0.1:8085 as an authorized redirect URI.
server.listen(Number(process.env.OAUTH_PORT ?? 0), "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  console.log(`Open this link and allow access:\n\n${auth}\n`);
});
