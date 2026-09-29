import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CalendarApiError, createCalendarClient } from "./calendar-client";

describe("calendar client contract", () => {
  it("maps provider operations to the existing web routes", () => {
    const client = createCalendarClient();
    assert.ok(client);
    assert.equal(typeof client.list, "function");
    assert.equal(typeof client.create, "function");
    assert.equal(typeof client.update, "function");
    assert.equal(typeof client.remove, "function");
  });

  it("keeps provider errors safe and free of event content", () => {
    const error = new CalendarApiError(403, "google_reconnect_required");
    assert.equal(error.message, "다시 연결이 필요해요.");
    assert.equal(error.message.includes("제목"), false);
    assert.equal(error.status, 403);
  });
});
