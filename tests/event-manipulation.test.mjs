import assert from "node:assert/strict";
import test from "node:test";

import { eventManipulationState } from "../app/lib/event-manipulation.ts";
import * as manipulation from "../app/lib/event-manipulation.ts";

test("반복 규칙과 반복 시리즈는 날짜 직접 조작을 막는다", () => {
  for (const event of [
    { source: "google", recurrence: "FREQ=WEEKLY", start: "2026-09-22" },
    { source: "icloud", repeatSeriesId: "lunar-1", start: "2026-09-22" },
  ]) {
    assert.deepEqual(eventManipulationState(event), {
      allowed: false,
      reason: "반복 일정은 편집창에서 변경해 주세요.",
    });
  }
});

test("회사 공용 캘린더는 읽기 전용이고 공백을 제거한 내일정만 허용한다", () => {
  assert.deepEqual(eventManipulationState({ source: "daou", calendarName: "전사일정", start: "2026-09-22" }), {
    allowed: false,
    reason: "읽기 전용 일정은 이동할 수 없어요.",
  });
  assert.deepEqual(eventManipulationState({ source: "daou", calendarName: " 내\t일 정 ", start: "2026-09-22" }), {
    allowed: true,
    reason: "",
  });
});

test("시작일이 없으면 이유를 알리고 일반 일정은 허용한다", () => {
  assert.deepEqual(eventManipulationState({ source: "google" }), {
    allowed: false,
    reason: "일정 날짜를 확인할 수 없어요.",
  });
  assert.deepEqual(eventManipulationState({ source: "icloud", start: "2026-09-22" }), {
    allowed: true,
    reason: "",
  });
});

test("시간 일정 이동은 날짜 기간과 현지 시작·종료 시각을 유지한다", () => {
  assert.deepEqual(manipulation.moveEventToDate({
    source: "google", start: "2026-09-22T09:00:00+09:00", end: "2026-09-24T10:30:00+09:00", allDay: false,
  }, "2026-10-02"), {
    startDate: "2026-10-02", endDate: "2026-10-04", startTime: "09:00", endTime: "10:30", allDay: false,
  });
});

test("종일 일정 이동은 공급자의 제외 종료일을 보이는 마지막 날짜로 환산한다", () => {
  assert.deepEqual(manipulation.moveEventToDate({
    source: "icloud", start: "2026-09-29", end: "2026-10-02", allDay: true,
  }, "2026-10-30"), {
    startDate: "2026-10-30", endDate: "2026-11-01", startTime: "00:00", endTime: "00:00", allDay: true,
  });
});

test("윤일과 월 경계를 넘는 이동도 같은 날짜 길이를 유지한다", () => {
  assert.deepEqual(manipulation.moveEventToDate({
    source: "icloud", start: "2024-02-28", end: "2024-03-02", allDay: true,
  }, "2026-12-30"), {
    startDate: "2026-12-30", endDate: "2027-01-01", startTime: "00:00", endTime: "00:00", allDay: true,
  });
});

test("시작과 종료 기간 조절은 반대 경계를 넘지 않고 한쪽 날짜만 바꾼다", () => {
  const event = { source: "google", start: "2026-09-10", end: "2026-09-13", allDay: true };
  assert.equal(manipulation.resizeEventToDate(event, "start", "2026-09-14"), null);
  assert.equal(manipulation.resizeEventToDate(event, "end", "2026-09-09"), null);
  assert.deepEqual(manipulation.resizeEventToDate(event, "end", "2026-09-15"), {
    startDate: "2026-09-10", endDate: "2026-09-15", startTime: "00:00", endTime: "00:00", allDay: true,
  });
  assert.deepEqual(manipulation.resizeEventToDate(event, "start", "2026-09-12"), {
    startDate: "2026-09-12", endDate: "2026-09-12", startTime: "00:00", endTime: "00:00", allDay: true,
  });
});

test("시간 일정 기간 조절은 원래 현지 시각을 변경하지 않는다", () => {
  assert.deepEqual(manipulation.resizeEventToDate({
    source: "google", start: "2026-09-10T09:15:00+09:00", end: "2026-09-11T17:45:00+09:00", allDay: false,
  }, "end", "2026-09-13"), {
    startDate: "2026-09-10", endDate: "2026-09-13", startTime: "09:15", endTime: "17:45", allDay: false,
  });
});

test("시간 일정의 종료일을 시작일로 당겨 시각이 역전되면 거부한다", () => {
  const event = {
    source: "google", start: "2026-09-10T17:00:00+09:00", end: "2026-09-11T09:00:00+09:00", allDay: false,
  };
  assert.equal(manipulation.resizeEventToDate(event, "end", "2026-09-10"), null);
});

test("시간 일정의 시작일을 종료일로 밀어 시각이 역전되면 거부한다", () => {
  const event = {
    source: "google", start: "2026-09-10T17:00:00+09:00", end: "2026-09-11T09:00:00+09:00", allDay: false,
  };
  assert.equal(manipulation.resizeEventToDate(event, "start", "2026-09-11"), null);
});

test("금지된 일정이나 시작일 없는 일정은 날짜 초안을 만들지 않는다", () => {
  assert.equal(manipulation.moveEventToDate({
    source: "google", start: "2026-09-10", recurrence: "FREQ=WEEKLY", allDay: true,
  }, "2026-09-15"), null);
  assert.equal(manipulation.resizeEventToDate({
    source: "daou", calendarName: "전사일정", start: "2026-09-10", allDay: true,
  }, "end", "2026-09-15"), null);
  assert.equal(manipulation.moveEventToDate({ source: "icloud" }, "2026-09-15"), null);
});
