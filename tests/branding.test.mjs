import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("presents the 온달력 brand without legacy product names", async () => {
  const [page, layout, caldavConnect, icloudConnect] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/api/caldav/connect/route.ts", root), "utf8"),
    readFile(new URL("app/api/icloud/connect/route.ts", root), "utf8"),
  ]);

  const publicCopy = [page, layout, caldavConnect, icloudConnect].join("\n");
  assert.match(publicCopy, /온달력/);
  assert.match(layout, /온달력 — 모든 달력을 한곳에/);
  assert.doesNotMatch(publicCopy, /OnCal|OneCalendar|원캘린더/);
});
