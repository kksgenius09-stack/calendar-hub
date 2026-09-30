import { discoverICloudCalendars } from "@/app/lib/icloud-caldav";
import { runtimeEnv } from "@/app/lib/runtime-env";

function isPrivateOrLinkLocalIPv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateOrLinkLocalIPv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateOrLinkLocalIPv4(normalized.slice(7));
  return false;
}

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
  const secret = runtimeEnv("CALENDAR_CREDENTIAL_SECRET");
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

export async function validateCalDavServer(value: string) {
  let url: URL;
  try {
    const normalized = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    url = new URL(normalized);
  } catch {
    throw new Error("INVALID_SERVER_URL");
  }
  if (url.protocol !== "https:") throw new Error("INVALID_SERVER_URL");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("INVALID_SERVER_URL");
  const bareHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bareHost) && isPrivateOrLinkLocalIPv4(bareHost)) throw new Error("INVALID_SERVER_URL");
  if (bareHost.includes(":") && isPrivateOrLinkLocalIPv6(bareHost)) throw new Error("INVALID_SERVER_URL");
  url.username = "";
  url.password = "";
  return url.toString();
}

export async function discoverCompanyCalendars(credentials: CompanyCalDavCredentials, onAuthenticated?: () => void) {
  const server = new URL(credentials.serverUrl);
  const directFirst = server.pathname !== "/";
  const candidates = directFirst
    ? [credentials.serverUrl, new URL("/.well-known/caldav", server.origin).toString()]
    : [new URL("/.well-known/caldav", server.origin).toString(), credentials.serverUrl];
  let lastError: unknown;
  let discovered = false;
  const errorCodes: string[] = [];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const calendars = await discoverICloudCalendars(credentials, candidate, onAuthenticated);
      discovered = true;
      if (calendars.length) return calendars;
    } catch (error) {
      lastError = error;
      if (error instanceof Error) errorCodes.push(error.message);
    }
  }
  if (discovered) throw new Error("NO_CALENDARS");
  if (errorCodes.includes("CALDAV_HTTP_401")) throw new Error("CALDAV_HTTP_401");
  if (errorCodes.includes("CALDAV_HTTP_403")) throw new Error("CALDAV_HTTP_403");
  throw lastError instanceof Error ? lastError : new Error("CalDAV calendar discovery failed");
}
