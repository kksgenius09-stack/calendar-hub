import assert from "node:assert/strict";
import test from "node:test";
import { dayKey, monthDays } from "./calendar-grid";

test("month grid always has six weeks and marks today", () => { const now = new Date(2026, 8, 29); const days = monthDays(now, [], now); assert.equal(days.length, 42); assert.equal(days.find((day) => day.today)?.key, "2026-09-29"); });
test("month grid groups event dates without leaking titles", () => { const days = monthDays(new Date(2026, 8, 1), [{ id: "a", calendarId: "g", title: "회의", start: "2026-09-10T09:00:00Z", end: "2026-09-10T10:00:00Z", allDay: false, source: "google" }], new Date(2026, 8, 1)); assert.equal(days.find((day) => dayKey(day.date) === "2026-09-10")?.events.length, 1); });
