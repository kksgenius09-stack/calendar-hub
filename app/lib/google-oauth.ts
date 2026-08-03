const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = process.env.CALENDAR_CREDENTIAL_SECRET || process.env.GOOGLE_TOKEN_SECRET;
  if (!secret) throw new Error("GOOGLE_TOKEN_SECRET is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealTokens(tokens: GoogleTokens) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(JSON.stringify(tokens)),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function openTokens(value: string): Promise<GoogleTokens> {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Invalid token payload");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(payload),
  );
  return JSON.parse(decoder.decode(decrypted)) as GoogleTokens;
}

export function googleConfig(origin: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  const publicOrigin = (process.env.PUBLIC_APP_URL || origin).replace(/\/$/, "");
  return {
    clientId,
    clientSecret,
    redirectUri: `${publicOrigin}/api/google/callback`,
  };
}

export const googleCookie = {
  name: "oncal_google",
  options: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};
