import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { providerEventFailure } from "../app/lib/provider-event-failures.ts";

test("explicit missing or invalid credentials mark only that provider disconnected", () => {
  for (const provider of ["google", "icloud", "daou"]) {
    for (const code of ["NOT_CONNECTED", "INVALID_CREDENTIALS", "CALDAV_HTTP_401"]) {
      const result = providerEventFailure(provider, true, new Error(code));
      assert.equal(result.status, 401, `${provider}:${code}`);
      assert.equal(result.body.connected, false, `${provider}:${code}`);
      assert.equal(result.body.error, "reconnect_required", `${provider}:${code}`);
    }
  }
  assert.equal(providerEventFailure("icloud", true, new Error("AUTH_REQUIRED")).body.error, "auth_required");
  assert.equal(providerEventFailure("google", false, new Error("CALDAV_HTTP_401")).body.configured, false);
});

test("transient upstream and network failures return a non-fatal response per provider", () => {
  for (const provider of ["google", "icloud", "daou"]) {
    for (const error of [new Error("CALDAV_HTTP_503"), new Error("GOOGLE_LIST_TEMPORARY"), new Error("GOOGLE_EVENTS_TEMPORARY"), new TypeError("fetch failed")]) {
      const result = providerEventFailure(provider, true, error);
      assert.equal(result.status, 503, `${provider}:${error.message}`);
      assert.equal(result.body.connected, true, `${provider}:${error.message}`);
      assert.equal(result.body.error, "temporarily_unavailable", `${provider}:${error.message}`);
      assert.deepEqual(result.body.calendars, []);
      assert.deepEqual(result.body.events, []);
    }
  }
});

test("all event routes classify failures and do not swallow per-calendar fetch errors", async () => {
  const root = new URL("../", import.meta.url);
  const routes = [
    ["app/api/google/events/route.ts", "google"],
    ["app/api/icloud/events/route.ts", "icloud"],
    ["app/api/caldav/events/route.ts", "daou"],
  ];
  for (const [path, provider] of routes) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /providerEventFailure\(/, path);
    assert.match(source, new RegExp(`providerEventFailure\\("${provider}"`), path);
    assert.doesNotMatch(source, /fetchICloudEvents\([^\n]*\.catch\(\(\)\s*=>\s*\[\]\)/, path);
  }
  const google = await readFile(new URL("app/api/google/events/route.ts", root), "utf8");
  assert.match(google, /data\.error\s*===\s*["']invalid_grant["'][\s\S]{0,60}NOT_CONNECTED/);
  assert.match(google, /response\.status\s*===\s*401/);
});

test("a 503 provider result is treated as a preserve-state failure by the page loader", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if\s*\(!response\.ok\s*&&\s*data\.connected\s*!==\s*false\)\s*return\s*\{\s*source,\s*kind:\s*"failure"/);
});
