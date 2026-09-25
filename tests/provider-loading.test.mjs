import assert from "node:assert/strict";
import test from "node:test";

import { mergeProviderResults } from "../app/lib/provider-loading.ts";

const prior = {
  connected: { icloud: true, google: true, daou: true },
  configured: { icloud: true, google: true, daou: true },
  calendars: [
    { id: "home", name: "집", color: "blue", source: "icloud" },
    { id: "main", name: "기본", color: "red", source: "google", primary: true },
    { id: "work", name: "회사", color: "green", source: "daou" },
  ],
  events: [
    { id: "home-1", calendarId: "home", source: "icloud", start: "2026-09-25" },
    { id: "google-1", calendarId: "main", source: "google", start: "2026-09-25" },
    { id: "work-1", calendarId: "work", source: "daou", start: "2026-09-25" },
  ],
};

test("Google reconnect-required only changes Google status and retains other providers' data", () => {
  const next = mergeProviderResults(prior, [
    { source: "google", kind: "success", data: { connected: false } },
  ]);

  assert.deepEqual(next.connected, { icloud: true, google: false, daou: true });
  assert.deepEqual(next.calendars, prior.calendars);
  assert.deepEqual(next.events, prior.events);
});

test("a transport failure preserves that provider while successful results refresh independently", () => {
  const next = mergeProviderResults(prior, [
    { source: "icloud", kind: "failure" },
    { source: "google", kind: "success", data: {
      connected: true,
      calendars: [{ id: "main", name: "기본 변경", color: "purple", primary: true }],
      events: [{ id: "google-2", calendarId: "main", start: "2026-09-26" }],
    } },
    { source: "daou", kind: "success", data: { connected: true, calendars: [], events: [] } },
  ]);

  assert.deepEqual(next.connected, prior.connected);
  assert.deepEqual(next.calendars.map(({ source, id }) => `${source}:${id}`), ["icloud:home", "google:main"]);
  assert.deepEqual(next.events.map(({ source, id }) => `${source}:${id}`), ["icloud:home-1", "google:google-2"]);
});

test("Google event requests skip unselected calendars and retain the selected primary calendar", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/google/events/route.ts", import.meta.url), "utf8");
  assert.match(route, /calendars\.filter\(calendar\s*=>\s*calendar\.selected\s*!==\s*false\s*\|\|\s*calendar\.primary\)/);
  assert.match(route, /maxResults:\s*"500"/);
});

test("event loading records per-provider failures and always clears its loading state", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /kind:\s*"failure"/);
  assert.match(page, /if\s*\(!response\.ok\s*&&\s*data\.connected\s*!==\s*false\)/);
  assert.match(page, /finally\s*\{\s*setLoading\(false\)/);
  assert.match(page, /AbortSignal\.timeout\(12_000\)/);
  assert.match(page, /mergeProviderResults\(/);
});
