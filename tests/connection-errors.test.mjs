import assert from "node:assert/strict";
import test from "node:test";

import { connectionErrorGuidance, mapConnectionError } from "../app/lib/connection-errors.ts";

test("공급자별 알려진 오류만 공통 연결 오류 코드로 변환한다", () => {
  const cases = [
    ["icloud", "authenticate", new Error("AUTH_REQUIRED"), "AUTH_REQUIRED"],
    ["icloud", "authenticate", new Error("CALDAV_HTTP_401"), "INVALID_CREDENTIALS"],
    ["caldav", "authenticate", new Error("CALDAV_HTTP_403"), "PERMISSION_DENIED"],
    ["caldav", "discover", new Error("CALDAV_HTTP_404"), "CALDAV_PATH_NOT_FOUND"],
    ["caldav", "discover", new Error("CALDAV_PRINCIPAL_NOT_FOUND"), "CALDAV_PATH_NOT_FOUND"],
    ["icloud", "discover", new Error("NO_CALENDARS"), "NO_CALENDARS"],
    ["caldav", "validate", new Error("INVALID_SERVER_URL"), "INVALID_SERVER_URL"],
    ["caldav", "authenticate", new TypeError("fetch failed"), "SERVER_UNREACHABLE"],
  ];

  for (const [provider, stage, error, expectedCode] of cases) {
    assert.equal(mapConnectionError(provider, stage, error).code, expectedCode);
  }
});

test("알 수 없는 오류와 상세 정보에 비밀값이나 원본 오류 메시지를 포함하지 않는다", () => {
  const value = mapConnectionError("icloud", "authenticate", new Error("password=secret-token"));

  assert.equal(value.code, "TEMPORARY_ERROR");
  assert.deepEqual(value.detail, { provider: "icloud", stage: "authenticate", code: "TEMPORARY_ERROR" });
  assert.doesNotMatch(JSON.stringify(value), /secret-token|password=/);
});

test("네트워크는 허용된 코드로만 판별하고 임의의 TypeError 메시지는 숨긴다", () => {
  assert.equal(mapConnectionError("caldav", "authenticate", Object.assign(new Error("opaque"), { code: "ECONNREFUSED" })).code, "SERVER_UNREACHABLE");
  assert.equal(mapConnectionError("caldav", "authenticate", new TypeError("secret-token fetch failed" )).code, "TEMPORARY_ERROR");
  assert.equal(mapConnectionError("caldav", "authenticate", { code: "PRIVATE_FAILURE", message: "secret-token" }).code, "TEMPORARY_ERROR");
  assert.equal(mapConnectionError("caldav", "authenticate", { code: "ECONNREFUSED", message: "secret-token" }).code, "TEMPORARY_ERROR");
});

test("오류 가이던스는 허용된 코드마다 사용자용 문구만 반환한다", () => {
  const guidance = connectionErrorGuidance("INVALID_CREDENTIALS");

  assert.equal(typeof guidance.title, "string");
  assert.equal(typeof guidance.message, "string");
  assert.equal(typeof guidance.action, "string");
  assert.deepEqual(Object.keys(guidance).sort(), ["action", "message", "title"]);
});
