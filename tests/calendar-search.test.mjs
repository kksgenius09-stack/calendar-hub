import assert from "node:assert/strict";
import test from "node:test";

import {
  expandSearchYears,
  normalizeExpandedSources,
  searchCalendarEvents,
} from "../app/lib/calendar-search.ts";

test("검색 연도는 한 번에 1년씩 과거와 미래로 확장한다", () => {
  assert.deepEqual(expandSearchYears([2026], "past"), [2025, 2026]);
  assert.deepEqual(expandSearchYears([2025, 2026], "future"), [2025, 2026, 2027]);
  assert.deepEqual(expandSearchYears([2025, 2026, 2027], "future"), [2025, 2026, 2027, 2028]);
});

test("일정 제목과 캘린더 이름을 대소문자 구분 없이 검색한다", () => {
  const events = [
    { id: "1", source: "google", calendarId: "work", calendarName: "업무", title: "Weekly Meeting", start: "2026-03-02T01:00:00.000Z" },
    { id: "2", source: "icloud", calendarId: "home", calendarName: "가족", title: "병원 예약", start: "2026-01-10T01:00:00.000Z" },
    { id: "3", source: "daou", calendarId: "mine", calendarName: "프로젝트 회의", title: "자료 정리", start: "2026-02-01T01:00:00.000Z" },
  ];

  assert.deepEqual(searchCalendarEvents(events, "meeting").map(event => event.id), ["1"]);
  assert.deepEqual(searchCalendarEvents(events, "회의").map(event => event.id), ["3"]);
});

test("공백과 특수문자가 달라도 검색어의 모든 조각이 포함되면 찾는다", () => {
  const events = [
    { id: "birthday", source: "google", calendarId: "family", calendarName: "가족일정", title: "윤별이생일", start: "2026-06-01T00:00:00.000Z" },
    { id: "other", source: "google", calendarId: "family", calendarName: "가족일정", title: "윤별이 병원", start: "2026-06-02T00:00:00.000Z" },
  ];

  assert.deepEqual(searchCalendarEvents(events, "윤별이 생일").map(event => event.id), ["birthday"]);
  assert.deepEqual(searchCalendarEvents(events, "생일 윤별이").map(event => event.id), ["birthday"]);
  assert.deepEqual(searchCalendarEvents(events, "윤별이-생일").map(event => event.id), ["birthday"]);
  assert.deepEqual(searchCalendarEvents(events, "윤별이 출장").map(event => event.id), []);
});

test("같은 일정은 한 번만 표시하고 날짜순으로 정렬한다", () => {
  const events = [
    { id: "later", source: "google", calendarId: "work", title: "출장", start: "2026-10-03T01:00:00.000Z" },
    { id: "early", source: "google", calendarId: "work", title: "출장 준비", start: "2026-01-05T01:00:00.000Z" },
    { id: "early", source: "google", calendarId: "work", title: "출장 준비", start: "2026-01-05T01:00:00.000Z" },
  ];

  assert.deepEqual(searchCalendarEvents(events, "출장").map(event => event.id), ["early", "later"]);
});

test("캘린더 접기 설정이 없거나 손상되면 모두 펼친 상태로 복구한다", () => {
  assert.deepEqual(normalizeExpandedSources(null), { icloud: true, google: true, daou: true });
  assert.deepEqual(normalizeExpandedSources({ google: false }), { icloud: true, google: false, daou: true });
  assert.deepEqual(normalizeExpandedSources("broken"), { icloud: true, google: true, daou: true });
});
