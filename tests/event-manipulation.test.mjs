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

test("불러온 음력 회차는 공급자 ID 또는 리소스 URL로 시리즈에 연결되고 조작이 차단된다", () => {
  const events = [
    {
      source: "icloud", calendarId: "home", resourceUrl: "https://icloud.test/lunar.ics",
      title: "음력 생일", start: "2026-09-25", allDay: true,
    },
    {
      source: "google", calendarId: "primary", providerEventId: "google-uid-2",
      title: "음력 기념일", start: "2026-10-03", allDay: true,
    },
    {
      source: "google", calendarId: "primary", providerEventId: "normal-uid",
      title: "일반 일정", start: "2026-10-04", allDay: true,
    },
    {
      source: "google", calendarId: "secondary", providerEventId: "uid-1",
      title: "중복 ID 일반 일정", start: "2026-10-05", allDay: true,
    },
  ];
  const instances = [
    { series_id: "lunar-icloud", source: "icloud", calendar_id: "home", provider_event_id: "uid-1", resource_url: "https://icloud.test/lunar.ics" },
    { series_id: "lunar-google", source: "google", calendar_id: "primary", provider_event_id: "google-uid-2", resource_url: null },
  ];

  const loaded = manipulation.attachLunarSeriesMetadata(events, instances);

  assert.equal(loaded[0].repeatSeriesId, "lunar-icloud");
  assert.equal(loaded[1].repeatSeriesId, "lunar-google");
  assert.deepEqual(manipulation.eventManipulationState(loaded[0]), {
    allowed: false,
    reason: "반복 일정은 편집창에서 변경해 주세요.",
  });
  assert.deepEqual(manipulation.eventManipulationState(loaded[1]), {
    allowed: false,
    reason: "반복 일정은 편집창에서 변경해 주세요.",
  });
  assert.equal(loaded[2].repeatSeriesId, undefined);
  assert.deepEqual(manipulation.eventManipulationState(loaded[2]), { allowed: true, reason: "" });
  assert.equal(loaded[3].repeatSeriesId, undefined, "source/calendar mismatch must not mark a normal event as lunar");
  assert.equal(loaded[2], events[2], "normal event object remains unchanged");
});

test("날짜 셀 기하 정보로 막대 오버레이 아래의 release 날짜를 찾는다", () => {
  const cells = [
    { date: "2026-09-24", left: 0, right: 100, top: 0, bottom: 80 },
    { date: "2026-09-25", left: 100, right: 200, top: 0, bottom: 80 },
  ];

  assert.equal(manipulation.resolveCalendarDropDate(null, 150, 40, cells), "2026-09-25");
  assert.equal(manipulation.resolveCalendarDropDate(null, 50, 40, cells), "2026-09-24");
  assert.equal(manipulation.resolveCalendarDropDate("2026-09-23", 150, 40, cells), "2026-09-23");
  assert.equal(manipulation.resolveCalendarDropDate(null, 250, 40, cells), null);
});

test("조작이 금지된 일정에는 resize handle 가장자리를 노출하지 않는다", () => {
  const edges = { startsHere: true, endsHere: true };
  assert.deepEqual(manipulation.eventResizeEdges({
    source: "icloud", repeatSeriesId: "lunar-1", start: "2026-09-25", allDay: true,
  }, edges), []);
  assert.deepEqual(manipulation.eventResizeEdges({
    source: "icloud", start: "2026-09-25", allDay: true,
  }, edges), ["start", "end"]);
});

test("6픽셀 미만 이동은 클릭이고 그 이상은 드래그다", () => {
  assert.equal(manipulation.isDragGesture({ x: 10, y: 10 }, { x: 14, y: 13 }), false);
  assert.equal(manipulation.isDragGesture({ x: 10, y: 10 }, { x: 16, y: 10 }), true);
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

test("유효한 완료 제스처는 미리보기를 유지한 채 정확히 한 번 PATCH하고 성공 뒤 다시 불러온다", async () => {
  assert.equal(typeof manipulation.persistCompletedEventGesture, "function");
  const event = {
    source: "google", calendarId: "primary", providerEventId: "provider-42", resourceUrl: "https://calendar.test/event/42",
    title: "여행", recurrence: "", start: "2026-09-22", end: "2026-09-25", allDay: true,
  };
  const events = [event];
  const order = [];
  const requests = [];
  const saved = await manipulation.persistCompletedEventGesture(event, "move", "2026-10-02", { dragging: true }, {
    sourcePath: { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" },
    fetcher: async (url, options) => { requests.push({ url, options }); order.push("PATCH"); return { ok: true }; },
    loadEvents: async () => { order.push("reload"); },
    setSaving: saving => order.push(saving ? "saving" : "idle"),
    onDraft: draft => { order.push("preview"); assert.deepEqual(draft, { startDate:"2026-10-02", endDate:"2026-10-04", startTime:"00:00", endTime:"00:00", allDay:true }); },
    setNotice: message => { order.push(message); },
  });

  assert.equal(saved, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/google/events");
  assert.equal(requests[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    calendarId: "primary", title: "여행", start: "2026-10-02", end: "2026-10-05", allDay: true,
    recurrence: "", providerEventId: "provider-42", resourceUrl: "https://calendar.test/event/42",
  });
  assert.deepEqual(order, ["preview", "saving", "PATCH", "reload", "일정을 이동했어요.", "idle"]);
  assert.equal(events[0], event);
});

test("successful desktop move drag calls the selected provider PATCH endpoint", async () => {
  const requests = [];
  const event = { source:"daou", calendarId:"내 일정", calendarName:"내 일정", title:"회의", start:"2026-09-22", end:"2026-09-22", allDay:true };
  const saved = await manipulation.persistCompletedEventGesture(event, "move", "2026-09-24", { dragging:true }, {
    sourcePath: { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" },
    fetcher: async (url, options) => { requests.push({ url, options }); return { ok:true }; },
    loadEvents: async () => {}, setSaving: () => {}, onDraft: () => {}, setNotice: () => {},
  });
  assert.equal(saved, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/caldav/events");
  assert.equal(requests[0].options.method, "PATCH");
});

test("취소되거나 유효하지 않은 release는 PATCH하지 않는다", async () => {
  assert.equal(typeof manipulation.persistCompletedEventGesture, "function");
  let patchCount = 0;
  const options = {
    sourcePath: { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" },
    fetcher: async () => { patchCount++; return { ok: true }; }, loadEvents: async () => {},
    setSaving: () => {}, onDraft: () => {}, setNotice: () => {},
  };
  const event = { source:"google", calendarId:"primary", providerEventId:"event-1", title:"일정", start:"2026-09-22", allDay:true };
  assert.equal(await manipulation.persistCompletedEventGesture(event, "move", "2026-09-25", { dragging:true, cancelled:true }, options), false);
  assert.equal(await manipulation.persistCompletedEventGesture(event, "move", null, { dragging:true }, options), false);
  assert.equal(await manipulation.persistCompletedEventGesture(event, "move", "2026-09-25", { dragging:false }, options), false);
  assert.equal(await manipulation.persistCompletedEventGesture(event, "resize-start", "2026-09-30", { dragging:true }, options), false);
  assert.equal(await manipulation.persistCompletedEventGesture({ ...event, source:"daou", calendarName:"전사일정" }, "move", "2026-09-25", { dragging:true }, options), false);
  assert.equal(patchCount, 0);
});

test("resize 성공은 기간 변경 안내를 따로 표시한다", async () => {
  assert.equal(typeof manipulation.persistCompletedEventGesture, "function");
  const notices = [];
  const event = { source:"icloud", calendarId:"home", providerEventId:"uid-1", resourceUrl:"/event/1.ics", title:"약속", start:"2026-09-22", end:"2026-09-23", allDay:true };
  const saved = await manipulation.persistCompletedEventGesture(event, "resize-end", "2026-09-25", { dragging:true }, {
    sourcePath: { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" },
    fetcher: async () => ({ ok:true }), loadEvents: async () => {}, setSaving: () => {}, onDraft: () => {},
    setNotice: message => notices.push(message),
  });
  assert.equal(saved, true);
  assert.deepEqual(notices, ["기간을 변경했어요."]);
});

test("PATCH 실패 시 미리보기와 저장 중 상태를 끝내고 원본 일정을 유지한다", async () => {
  assert.equal(typeof manipulation.persistCompletedEventGesture, "function");
  const event = { source:"icloud", calendarId:"home", providerEventId:"uid-1", resourceUrl:"/event/1.ics", title:"약속", start:"2026-09-22", end:"2026-09-23", allDay:true };
  const events = [event];
  const order = [];
  let reloadCount = 0;
  const saved = await manipulation.persistCompletedEventGesture(event, "resize-end", "2026-09-25", { dragging:true }, {
    sourcePath: { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" },
    fetcher: async () => { order.push("PATCH"); return { ok:false, json:async()=>({error:"read_only_calendar"}) }; },
    loadEvents: async () => { reloadCount++; },
    setSaving: saving => order.push(saving ? "saving" : "idle"),
    onDraft: () => order.push("preview"),
    setNotice: message => order.push(message),
  });

  assert.equal(saved, false);
  assert.deepEqual(order, ["preview", "saving", "PATCH", "이 CalDAV 캘린더는 읽기 전용이에요. ‘내 일정’에서만 수정할 수 있어요.", "idle"]);
  assert.equal(reloadCount, 0);
  assert.equal(events[0], event);
  assert.deepEqual(event, { source:"icloud", calendarId:"home", providerEventId:"uid-1", resourceUrl:"/event/1.ics", title:"약속", start:"2026-09-22", end:"2026-09-23", allDay:true });
});

test("Google drag PATCH 인증 실패는 재연결 원인을 짧게 알린다", async () => {
  const notices = [];
  const event = { source:"google", calendarId:"primary", title:"회의", start:"2026-09-22", end:"2026-09-22", allDay:true };
  const saved = await manipulation.persistCompletedEventGesture(event, "move", "2026-09-23", { dragging:true }, {
    sourcePath: { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" },
    fetcher: async () => ({ ok:false, status:401, json:async()=>({error:"reconnect_required"}) }),
    loadEvents: async () => {}, setSaving: () => {}, onDraft: () => {}, setNotice: notice => notices.push(notice),
  });
  assert.equal(saved, false);
  assert.deepEqual(notices, ["Google 연결이 만료됐어요. 다시 연결해 주세요."]);
});

test("저장 중인 제스처 미리보기는 포인터와 날짜 호버 업데이트로부터 고정된다", () => {
  assert.equal(typeof manipulation.updateEventGesture, "function");
  const submitted = { targetDate:"2026-10-02", dragging:true, eventId:"event-1" };
  assert.equal(manipulation.updateEventGesture(submitted, "2026-10-05", true), submitted);
  assert.deepEqual(manipulation.updateEventGesture(submitted, "2026-10-05", false), {
    targetDate:"2026-10-05", dragging:true, eventId:"event-1",
  });
});
