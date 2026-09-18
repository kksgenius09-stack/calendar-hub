import assert from "node:assert/strict";
import test from "node:test";

import {
  connectionAction,
  connectionRedirectPath,
  defaultCalendarState,
} from "../app/lib/calendar-ui.ts";

test("로그아웃 상태에서 선택한 캘린더 종류를 로그인 뒤까지 유지한다", () => {
  assert.deepEqual(connectionAction("google", false), {
    kind: "authenticate",
    intent: "google",
  });
  assert.deepEqual(connectionAction("icloud", false), {
    kind: "authenticate",
    intent: "icloud",
  });
  assert.deepEqual(connectionAction("daou", false), {
    kind: "authenticate",
    intent: "daou",
  });
  assert.equal(connectionRedirectPath("icloud"), "/?google=connected&connect=icloud");
  assert.equal(connectionRedirectPath("daou"), "/?google=connected&connect=daou");
});

test("로그인 상태에서는 선택한 캘린더 연결 화면으로 바로 이동한다", () => {
  assert.deepEqual(connectionAction("google", true), { kind: "connect", intent: "google" });
  assert.deepEqual(connectionAction("icloud", true), { kind: "connect", intent: "icloud" });
  assert.deepEqual(connectionAction("daou", true), { kind: "connect", intent: "daou" });
});

test("쓰기 가능한 캘린더가 없으면 빈 선택 상자 대신 안내 상태를 반환한다", () => {
  assert.deepEqual(defaultCalendarState([], ""), {
    available: false,
    selectedKey: "",
    message: "먼저 캘린더를 연결해 주세요.",
  });
});

test("저장한 기본 캘린더가 유효하면 유지하고 아니면 첫 캘린더를 선택한다", () => {
  const calendars = [
    { source: "google", id: "personal", name: "개인" },
    { source: "icloud", id: "home", name: "가족" },
  ];

  assert.equal(defaultCalendarState(calendars, "icloud:home").selectedKey, "icloud:home");
  assert.equal(defaultCalendarState(calendars, "missing:value").selectedKey, "google:personal");
});
