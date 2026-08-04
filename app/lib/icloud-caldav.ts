import { runtimeEnv } from "@/app/lib/runtime-env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type ICloudCredentials = { email: string; password: string };
export type ICloudCalendar = { id: string; name: string; color: string; url: string };

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesToStandardBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = runtimeEnv("CALENDAR_CREDENTIAL_SECRET");
  if (!secret) throw new Error("iCloud encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealICloudCredentials(credentials: ICloudCredentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(JSON.stringify(credentials)),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function openICloudCredentials(value: string): Promise<ICloudCredentials> {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Invalid iCloud credential payload");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(payload),
  );
  return JSON.parse(decoder.decode(decrypted)) as ICloudCredentials;
}

function basicAuth(credentials: ICloudCredentials) {
  return `Basic ${bytesToStandardBase64(encoder.encode(`${credentials.email}:${credentials.password}`))}`;
}

function decodeXml(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

function tagValue(xml: string, localName: string) {
  const match = xml.match(new RegExp(`<[^>]*${localName}[^>]*>(?:\\s*<[^>]*href[^>]*>)?([^<]+)`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

async function davRequest(url: string, credentials: ICloudCredentials, method: "PROPFIND" | "REPORT", body: string, depth: string) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: basicAuth(credentials),
      "content-type": "application/xml; charset=utf-8",
      depth,
    },
    body,
  });
  if (!response.ok) throw new Error(`CALDAV_HTTP_${response.status}`);
  return response.text();
}

async function davWrite(url: string, credentials: ICloudCredentials, method: "PUT" | "DELETE", body?: string) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: basicAuth(credentials),
      ...(body ? { "content-type": "text/calendar; charset=utf-8" } : {}),
    },
    body,
  });
  if (!response.ok) throw new Error(`CALDAV_HTTP_${response.status}`);
}

export async function discoverICloudCalendars(credentials: ICloudCredentials, serverUrl = "https://caldav.icloud.com/") {
  const root = serverUrl.endsWith("/") ? serverUrl : `${serverUrl}/`;
  const suppliedUrl = new URL(root);
  let principalUrl = root;
  if (!suppliedUrl.pathname.includes("/principals/")) {
    const principalXml = await davRequest(root, credentials, "PROPFIND", `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`, "0");
    const principalHref = tagValue(principalXml, "current-user-principal");
    if (!principalHref) throw new Error("CALDAV_PRINCIPAL_NOT_FOUND");
    principalUrl = new URL(principalHref, root).toString();
  }
  const homeXml = await davRequest(principalUrl, credentials, "PROPFIND", `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`, "0");
  const homeHref = tagValue(homeXml, "calendar-home-set");
  if (!homeHref) throw new Error("CALDAV_HOME_NOT_FOUND");
  const homeUrl = new URL(homeHref, principalUrl).toString();
  const listXml = await davRequest(homeUrl, credentials, "PROPFIND", `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:apple="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><apple:calendar-color/></d:prop></d:propfind>`, "1");
  const blocks = listXml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) ?? [];
  return blocks.flatMap((block, index): ICloudCalendar[] => {
    if (!/<[^>]*calendar(?:\s[^>]*)?\s*\/?>/i.test(block)) return [];
    const href = tagValue(block, "href");
    if (!href) return [];
    return [{
      id: href,
      name: tagValue(block, "displayname") || `iCloud 캘린더 ${index + 1}`,
      color: tagValue(block, "calendar-color").slice(0, 7) || "#5b53e9",
      url: new URL(href, homeUrl).toString(),
    }];
  });
}

function parseIcsDate(value: string) {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return value;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7]}`;
}

export async function fetchICloudEvents(credentials: ICloudCredentials, calendar: ICloudCalendar, start: Date, end: Date) {
  const compact = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const xml = await davRequest(calendar.url, credentials, "REPORT", `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${compact(start)}" end="${compact(end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`, "1");
  const blocks = xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) ?? [];
  return blocks.flatMap((block) => {
    const dataMatch = block.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/i);
    if (!dataMatch) return [];
    const ics = decodeXml(dataMatch[1]);
    const resourceUrl = new URL(tagValue(block, "href"), calendar.url).toString();
    const unfolded = ics.replace(/\r?\n[ \t]/g, "");
    const items = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
    return items.flatMap((item) => {
      const line = (name: string) => item.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "mi"))?.[1]?.trim() || "";
      const startValue = line("DTSTART");
      if (!startValue) return [];
      return [{
        id: `${calendar.id}:${line("UID") || startValue}`,
        providerEventId: line("UID") || startValue,
        resourceUrl,
        calendarId: calendar.id,
        calendarName: calendar.name,
        calendarColor: calendar.color,
        title: (line("SUMMARY") || "제목 없는 일정").replaceAll("\\n", " ").replaceAll("\\,", ","),
        start: parseIcsDate(startValue),
        end: parseIcsDate(line("DTEND")),
        allDay: /^\d{8}$/.test(startValue),
        recurrence: line("RRULE"),
      }];
    });
  });
}

function icsEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function compactDate(value: string, allDay: boolean) {
  if (allDay) return value.slice(0, 10).replaceAll("-", "");
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type CalDavEventInput = { uid?: string; title: string; start: string; end: string; allDay: boolean; recurrence?: string };

function eventIcs(input: CalDavEventInput) {
  const uid = input.uid || `${crypto.randomUUID()}@oncal`;
  const dateType = input.allDay ? ";VALUE=DATE" : "";
  const recurrence = input.recurrence ? `\r\nRRULE:${input.recurrence}` : "";
  return { uid, body: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OnCal//Calendar//KO\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${compactDate(new Date().toISOString(), false)}\r\nDTSTART${dateType}:${compactDate(input.start, input.allDay)}\r\nDTEND${dateType}:${compactDate(input.end, input.allDay)}\r\nSUMMARY:${icsEscape(input.title)}${recurrence}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n` };
}

export async function createCalDavEvent(credentials: ICloudCredentials, calendar: ICloudCalendar, input: CalDavEventInput) {
  const event = eventIcs(input);
  const url = new URL(`${encodeURIComponent(event.uid)}.ics`, calendar.url.endsWith("/") ? calendar.url : `${calendar.url}/`).toString();
  await davWrite(url, credentials, "PUT", event.body);
  return { uid: event.uid, resourceUrl: url };
}

export async function updateCalDavEvent(credentials: ICloudCredentials, resourceUrl: string, input: CalDavEventInput) {
  const event = eventIcs(input);
  await davWrite(resourceUrl, credentials, "PUT", event.body);
}

export async function deleteCalDavEvent(credentials: ICloudCredentials, resourceUrl: string) {
  await davWrite(resourceUrl, credentials, "DELETE");
}
