import { discoverICloudCalendars } from "@/app/lib/icloud-caldav";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type CompanyCalDavCredentials = { serverUrl: string; email: string; password: string };

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
  const secret = process.env.CALDAV_CREDENTIAL_SECRET;
  if (!secret) throw new Error("CalDAV encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealCompanyCredentials(credentials: CompanyCalDavCredentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(JSON.stringify(credentials)));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function openCompanyCredentials(value: string): Promise<CompanyCalDavCredentials> {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Invalid CalDAV credential payload");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(payload));
  return JSON.parse(decoder.decode(decrypted)) as CompanyCalDavCredentials;
}

export function validateCalDavServer(value: string) {
  const normalized = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(normalized);
  if (url.protocol !== "https:") throw new Error("HTTPS 주소만 사용할 수 있습니다.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) throw new Error("외부에서 접속 가능한 서버 주소가 필요합니다.");
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("사설 네트워크 주소는 사용할 수 없습니다.");
  url.username = "";
  url.password = "";
  return url.toString();
}

export async function discoverCompanyCalendars(credentials: CompanyCalDavCredentials) {
  const server = new URL(credentials.serverUrl);
  const directFirst = server.pathname !== "/";
  const candidates = directFirst
    ? [credentials.serverUrl, new URL("/.well-known/caldav", server.origin).toString()]
    : [new URL("/.well-known/caldav", server.origin).toString(), credentials.serverUrl];
  let lastError: unknown;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const calendars = await discoverICloudCalendars(credentials, candidate);
      if (calendars.length) return calendars;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && (error.message === "CALDAV_HTTP_401" || error.message === "CALDAV_HTTP_403")) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("CalDAV calendar discovery failed");
}

export const companyCalDavCookie = {
  name: "oncal_company_caldav",
  options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 },
};
