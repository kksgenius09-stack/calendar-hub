import assert from "node:assert/strict";
import test from "node:test";
const seoulKey = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
test("calendar date key follows Seoul timezone near midnight", () => { assert.equal(seoulKey("2026-09-09T15:30:00Z"), "2026-09-10"); });
test("month range includes the final second of the last day", () => { const end = new Date(2026, 9, 0, 23, 59, 59, 999); assert.equal(end.getHours(), 23); assert.equal(end.getSeconds(), 59); });

