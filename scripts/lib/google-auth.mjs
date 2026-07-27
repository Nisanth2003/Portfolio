/**
 * Service-account auth for the Sheets API, signed with node:crypto — zero deps.
 *
 * Shared by fetch-projects.mjs (read-only) and create-stack-tab.mjs (read-write),
 * which is why the scope is a parameter rather than a constant: the build must never
 * hold a token that can write to your data.
 */
import crypto from 'node:crypto';

export const SCOPE_READONLY = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const SCOPE_READWRITE = 'https://www.googleapis.com/auth/spreadsheets';

const b64url = (input) => Buffer.from(input).toString('base64url');

/** Reads GOOGLE_SERVICE_ACCOUNT_JSON, accepting raw JSON or base64 (both common in CI). */
export function readServiceAccount(rawKey) {
  const key = rawKey?.trim();
  if (!key) return null;
  try {
    return JSON.parse(key.startsWith('{') ? key : Buffer.from(key, 'base64').toString('utf8'));
  } catch (err) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON or base64 JSON: ${err.message}`);
  }
}

export async function getAccessToken(serviceAccount, scope = SCOPE_READONLY) {
  const { client_email: clientEmail, private_key: privateKey } = serviceAccount;
  if (!clientEmail || !privateKey) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key. ' +
        'Paste the whole JSON key file, not a fragment of it.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsigned =
    `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    // GitHub secrets often round-trip newlines as the two characters \ and n.
    .sign(privateKey.replace(/\\n/g, '\n'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${body}`);
  const { access_token: token } = JSON.parse(body);
  if (!token) throw new Error(`Google token response had no access_token: ${body}`);
  return token;
}
