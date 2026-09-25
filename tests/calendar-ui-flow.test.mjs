import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  connectionAction,
  connectionRedirectPath,
  defaultCalendarState,
  eventOccursOnDate,
  inclusiveEventEndDate,
  monthEventSegments,
  moveCursorToMonth,
  moveCursorToYear,
  orderedDateRange,
  surroundingYears,
} from "../app/lib/calendar-ui.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

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

test("Google 로그인 사용자는 별도 설정 없이 같은 OAuth 흐름으로 캘린더를 다시 연결한다", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /if\s*\(intent===["']google["']\)\s*\{?\s*beginGoogleConnection/);
  assert.doesNotMatch(page, /location\.href=configured\.google\?["']\/api\/google\/connect["']:["']#["']/);
  assert.match(page, /source===["']google["']\?["']다시 연결["']/);
  assert.doesNotMatch(page, /\+ &nbsp;Google 캘린더 연결/);
});

test("반복 일정 삭제는 한 건과 전체 삭제를 명확히 선택하게 한다", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /이 일정만 삭제/);
  assert.match(page, /반복 일정 모두 삭제/);
  assert.match(page, /반복 일정 삭제/);
  assert.match(page, /\/api\/lunar\/series/);
});

test("연결된 캘린더는 상태 배지와 행 내부 관리 메뉴로 구분한다", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /source-status/);
  assert.match(page, /source-manage/);
  assert.match(css, /\.calendar-source-row\.connected/);
  assert.match(css, /\.source-status\.connected/);
});

test("연도와 월을 선택하면 현재 날짜 범위 안에서 안전하게 이동한다", () => {
  const leapDay = new Date(2024, 1, 29);
  const nextYear=moveCursorToYear(leapDay, 2025);
  const nextMonth=moveCursorToMonth(new Date(2026, 0, 31), 1);
  assert.deepEqual([nextYear.getFullYear(),nextYear.getMonth(),nextYear.getDate()],[2025,1,28]);
  assert.deepEqual([nextMonth.getFullYear(),nextMonth.getMonth(),nextMonth.getDate()],[2026,1,28]);
  assert.deepEqual(surroundingYears(2026), [2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2031,2032]);
});

test("캘린더 관리 메뉴와 날짜 선택창은 바깥 클릭과 Escape로 닫힌다", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /closest\(["']\.source-manage, \.date-jump["']\)/);
  assert.match(page, /event\.key===["']Escape["']/);
  assert.match(page, /setSourceMenu\(null\)/);
  assert.match(page, /setDateJump\(null\)/);
  assert.match(page, /연도 선택/);
  assert.match(page, /월 선택/);
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

test("드래그 방향과 무관하게 앞 날짜부터 뒤 날짜까지 선택한다", () => {
  assert.deepEqual(orderedDateRange("2026-09-11", "2026-09-07"), {
    startDate: "2026-09-07",
    endDate: "2026-09-11",
  });
});

test("종일 일정의 API 종료일은 제외 날짜이므로 화면에서는 하루 전까지 표시한다", () => {
  const event = { start: "2026-09-07", end: "2026-09-12", allDay: true };
  assert.equal(inclusiveEventEndDate(event), "2026-09-11");
  assert.equal(eventOccursOnDate(event, "2026-09-07"), true);
  assert.equal(eventOccursOnDate(event, "2026-09-10"), true);
  assert.equal(eventOccursOnDate(event, "2026-09-11"), true);
  assert.equal(eventOccursOnDate(event, "2026-09-12"), false);
});

test("시간이 있는 기간 일정은 실제 종료 날짜까지 모든 날짜에 표시한다", () => {
  const event = {
    start: "2026-09-07T09:00:00+09:00",
    end: "2026-09-11T18:00:00+09:00",
    allDay: false,
  };
  assert.equal(inclusiveEventEndDate(event), "2026-09-11");
  assert.equal(eventOccursOnDate(event, "2026-09-09"), true);
  assert.equal(eventOccursOnDate(event, "2026-09-12"), false);
});

test("같은 주의 기간 일정은 날짜별 복제가 아니라 하나의 연결 막대로 배치한다", () => {
  const segments = monthEventSegments([
    { id: "trip", start: "2026-09-14", end: "2026-09-18", allDay: true },
  ], "2026-09-13");

  assert.deepEqual(segments, [{
    id: "trip", week: 0, startColumn: 1, span: 4, lane: 0,
    startsHere: true, endsHere: true,
  }]);
});

test("기간이 다음 주로 넘어가면 이어짐 모양을 유지한 두 막대로 나눈다", () => {
  const segments = monthEventSegments([
    { id: "vacation", start: "2026-09-18", end: "2026-09-23", allDay: true },
  ], "2026-09-13");

  assert.deepEqual(segments, [
    { id: "vacation", week: 0, startColumn: 5, span: 2, lane: 0, startsHere: true, endsHere: false },
    { id: "vacation", week: 1, startColumn: 0, span: 3, lane: 0, startsHere: false, endsHere: true },
  ]);
});

test("겹치는 일정은 서로 다른 줄에 배치한다", () => {
  const segments = monthEventSegments([
    { id: "a", start: "2026-09-14", end: "2026-09-17", allDay: true },
    { id: "b", start: "2026-09-15", end: "2026-09-18", allDay: true },
    { id: "c", start: "2026-09-16", end: "2026-09-19", allDay: true },
  ], "2026-09-13");

  assert.deepEqual(segments.map(segment => segment.lane), [0, 1, 2]);
});
test("월간 일정 바는 이동과 실제 양 끝 조절을 따로 시작한다", async () => {
  const page = await read("app/page.tsx");
  assert.ok(/onPointerDown=\{pointer=>startEventGesture\(event,pointer,"move"\)\}/.test(page));
  assert.ok(/segment\.startsHere&&<span[\s\S]{0,250}resize-start/.test(page));
  assert.ok(/segment\.endsHere&&<span[\s\S]{0,250}resize-end/.test(page));
  assert.ok(/eventManipulationState\(event\)/.test(page));
  assert.ok(/const startEventGesture=[\s\S]{0,350}event\.pointerType!=="mouse"/.test(page));
});

test("월간 일정 조작 상태와 양 끝 핸들은 시각적 스타일을 갖는다", async () => {
  const [css, page] = await Promise.all([read("app/globals.css"), read("app/page.tsx")]);
  for (const selector of [
    ".month-event-bar.draggable",
    ".event-resize-handle.start",
    ".event-resize-handle.end",
    ".event-drag-preview",
    ".month-event-bar.manipulation-blocked",
    ".month-event-bar.saving",
  ]) {
    assert.ok(css.includes(selector), `missing style selector ${selector}`);
  }
  assert.match(page, /manipulation\.allowed\?"draggable":"manipulation-blocked"/);
  assert.match(page, /saving&&isActiveGesture\?"saving"/);
  assert.match(page, /event-resize-handle resize-start start/);
  assert.match(page, /event-resize-handle resize-end end/);
  assert.match(css, /@media\s*\(min-width:\s*901px\)[\s\S]*?\.month-event-bar\.draggable\s*\{\s*cursor:\s*grab/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.event-resize-handle, \.month-event-resize-handle\s*\{\s*display:\s*none/);
});

test("월간 이벤트 포인터 취소와 잘못된 놓기는 저장 없이 제스처만 종료한다", async () => {
  const page = await read("app/page.tsx");
  assert.ok(/window\.addEventListener\("pointerup",[^;]+,true\)/.test(page));
  assert.ok(/window\.addEventListener\("pointercancel",[^;]+,true\)/.test(page));
  assert.ok(/event\.pointerId!==active\.pointerId/.test(page));
  assert.ok(/event\.key!=="Escape"[\s\S]{0,500}clearEventGesture\(\)/.test(page));
  assert.ok(/const targetDate=document\.elementFromPoint[\s\S]{0,180}if\(!targetDate\)\{clearEventGesture\(\);return;\}/.test(page));
  assert.ok(/window\.addEventListener\("pointermove",[^;]+,true\)/.test(page));
  assert.ok(/suppressEventClick\.current=true[\s\S]{0,180}setTimeout\(\(\)=>\{suppressEventClick\.current=false[\s\S]{0,80},0\)/.test(page));
  assert.ok(!/onPointerUp=\{[^}]*saveEvent|onPointerUp=\{[^}]*fetch\(/.test(page));
  assert.match(page, /const cancelEventGesture=useCallback\(\(event:PointerEvent\)=>\{[\s\S]{0,160}if\(saving\|\|!active/);
  assert.match(page, /const cancelEventGestureOnEscape=useCallback\(\(event:KeyboardEvent\)=>\{[\s\S]{0,170}if\(saving\|\|!active\)return/);
});

test("월간 일정 드래그는 유효한 완료만 저장하고 성공 뒤 새 일정을 불러온다", async () => {
  const [page, persistence] = await Promise.all([read("app/page.tsx"), read("app/lib/event-manipulation.ts")]);
  assert.match(page, /persistCompletedEventGesture/);
  assert.match(page, /saveDraggedEvent\(active\.event,active\.mode,targetDate,\{dragging:active\.dragging\}/);
  assert.match(page, /\)\.then\(\(\)=>clearEventGesture\(\)\)/);
  assert.ok((page.match(/updateEventGesture\(/g) || []).length >= 2);
  assert.match(page, /updateEventGesture\(current,targetDate,saving\)/);
  assert.match(page, /updateEventGesture\(current,targetDate\|\|current\.targetDate,saving,true\)/);
  assert.match(persistence, /await options\.loadEvents\(\)/);
  assert.match(persistence, /method: "PATCH"/);
});
