# Desktop Event Drag and Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let desktop users move non-recurring writable events and resize their date range directly in the month grid.

**Architecture:** Add pure date-manipulation and eligibility functions in a focused library, then have the existing month view translate pointer gestures into those operations. Persist one completed gesture through the provider's existing `PATCH` route and reload events only after a successful response.

**Tech Stack:** React 19, TypeScript, Pointer Events, Node test runner, existing provider APIs and CSS.

**Spec:** `docs/superpowers/specs/2026-09-25-desktop-calendar-interactions-design.md`

## Global Constraints

- Do not add a drag-and-drop dependency or replace the current calendar.
- Do not change Google OAuth scopes, consent flow, redirect URLs, branding, or verification configuration.
- Recurring events and read-only company events must remain non-draggable and non-resizable.
- Preserve event times during date-only changes and preserve the exclusive end-date convention for all-day provider payloads.
- Desktop mouse/pointer interaction is in scope; mobile-specific behavior is not.

## Review Focus

- An all-day event crossing a month boundary keeps its inclusive visible duration and exclusive API end date.
- A timed event crossing daylight-saving or timezone boundaries keeps its displayed local start and end times.
- A pointer release outside a valid day cell cancels without issuing a request.
- A small pointer movement remains a click and opens the editor rather than moving the event.
- An event split into multiple weekly segments exposes resize handles only at its true start and true end.

---

### Task 1: Pure event date manipulation

**Files:**
- Create: `app/lib/event-manipulation.ts`
- Create: `tests/event-manipulation.test.mjs`

**Interfaces:**
- Consumes: event fields `start`, `end`, `allDay`, `recurrence`, `repeatSeriesId`, `source`, and `calendarName`.
- Produces: `eventManipulationState(event)`, `moveEventToDate(event, targetDate)`, and `resizeEventToDate(event, edge, targetDate)`.

- [ ] **Step 1: Write failing eligibility tests**

```js
import { eventManipulationState } from "../app/lib/event-manipulation.ts";

test("반복 일정과 읽기 전용 회사 일정은 직접 조작할 수 없다", () => {
  assert.deepEqual(eventManipulationState({ recurrence:"FREQ=WEEKLY", source:"google" }), {
    allowed:false, reason:"반복 일정은 편집창에서 변경해 주세요.",
  });
  assert.equal(eventManipulationState({ repeatSeriesId:"lunar-1", source:"icloud" }).allowed, false);
  assert.deepEqual(eventManipulationState({ source:"daou", calendarName:"전사일정" }), {
    allowed:false, reason:"읽기 전용 일정은 이동할 수 없어요.",
  });
  assert.equal(eventManipulationState({ source:"daou", calendarName:"내 일정" }).allowed, true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/event-manipulation.test.mjs`

Expected: FAIL because `app/lib/event-manipulation.ts` does not exist.

- [ ] **Step 3: Implement the eligibility function**

```ts
export type ManipulableEvent = {
  start?: string; end?: string; allDay?: boolean; recurrence?: string;
  repeatSeriesId?: string; source: "icloud" | "google" | "daou"; calendarName?: string;
};

export function eventManipulationState(event: ManipulableEvent) {
  if (event.recurrence || event.repeatSeriesId) return { allowed:false, reason:"반복 일정은 편집창에서 변경해 주세요." };
  if (event.source === "daou" && (event.calendarName || "").replaceAll(" ", "").toLowerCase() !== "내일정") {
    return { allowed:false, reason:"읽기 전용 일정은 이동할 수 없어요." };
  }
  if (!event.start) return { allowed:false, reason:"일정 날짜를 확인할 수 없어요." };
  return { allowed:true, reason:"" };
}
```

- [ ] **Step 4: Add failing move and resize tests**

```js
test("시간 일정 이동은 기간과 현지 시각을 유지한다", () => {
  assert.deepEqual(moveEventToDate({ source:"google", start:"2026-09-22T09:00:00+09:00", end:"2026-09-22T10:30:00+09:00", allDay:false }, "2026-10-02"), {
    startDate:"2026-10-02", endDate:"2026-10-02", startTime:"09:00", endTime:"10:30", allDay:false,
  });
});

test("종일 일정 이동은 보이는 기간을 유지한다", () => {
  assert.deepEqual(moveEventToDate({ source:"icloud", start:"2026-09-29", end:"2026-10-02", allDay:true }, "2026-10-30"), {
    startDate:"2026-10-30", endDate:"2026-11-01", startTime:"00:00", endTime:"00:00", allDay:true,
  });
});

test("기간 조절은 반대 경계를 넘어가지 않는다", () => {
  const event={ source:"google", start:"2026-09-10", end:"2026-09-13", allDay:true };
  assert.equal(resizeEventToDate(event,"start","2026-09-14"), null);
  assert.equal(resizeEventToDate(event,"end","2026-09-09"), null);
  assert.equal(resizeEventToDate(event,"end","2026-09-15")?.endDate, "2026-09-15");
});
```

- [ ] **Step 5: Run the focused test and verify RED for missing range functions**

Run: `node --test tests/event-manipulation.test.mjs`

Expected: eligibility passes; move/resize assertions fail because the exports are missing.

- [ ] **Step 6: Implement minimal date operations**

Implement local date parsing, inclusive all-day end conversion, day-difference calculation, and output as an `EventDateDraft`:

```ts
export type EventDateDraft = {
  startDate:string; endDate:string; startTime:string; endTime:string; allDay:boolean;
};
export function moveEventToDate(event: ManipulableEvent, targetDate:string): EventDateDraft | null;
export function resizeEventToDate(event: ManipulableEvent, edge:"start"|"end", targetDate:string): EventDateDraft | null;
```

Use local calendar arithmetic rather than adding `86_400_000` milliseconds. For all-day input, convert the provider's exclusive `end` to an inclusive editor date before calculating duration.

- [ ] **Step 7: Run focused and existing date tests**

Run: `node --test tests/event-manipulation.test.mjs tests/calendar-ui-flow.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add app/lib/event-manipulation.ts tests/event-manipulation.test.mjs
git commit -m "Add event date manipulation rules"
```

### Task 2: Pointer gesture classification and preview state

**Files:**
- Modify: `app/lib/event-manipulation.ts`
- Modify: `tests/event-manipulation.test.mjs`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: Task 1's `eventManipulationState`, `moveEventToDate`, and `resizeEventToDate`.
- Produces: `isDragGesture(start, current, threshold = 6)` and page-level `EventDragState`.

- [ ] **Step 1: Write the failing pointer threshold test**

```js
test("6픽셀 미만 이동은 클릭이고 그 이상은 드래그다", () => {
  assert.equal(isDragGesture({x:10,y:10},{x:14,y:13}), false);
  assert.equal(isDragGesture({x:10,y:10},{x:16,y:10}), true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/event-manipulation.test.mjs`

Expected: FAIL because `isDragGesture` is not exported.

- [ ] **Step 3: Implement the threshold helper and drag state type**

```ts
export function isDragGesture(start:{x:number;y:number}, current:{x:number;y:number}, threshold=6) {
  return Math.hypot(current.x-start.x,current.y-start.y) >= threshold;
}
```

In `app/page.tsx`, add:

```ts
type EventDragState = {
  event:EventItem; mode:"move"|"resize-start"|"resize-end";
  origin:{x:number;y:number}; targetDate:string; dragging:boolean;
};
```

Keep this state independent of the existing empty-cell `dragRange` used to create new events.

- [ ] **Step 4: Add source-level flow assertions before wiring UI**

Extend `tests/calendar-ui-flow.test.mjs` to assert that the month event bar exposes distinct move, resize-start, and resize-end pointer handlers; true-edge handles depend on `segment.startsHere` and `segment.endsHere`; repeated/read-only events use `eventManipulationState`.

Also assert that `pointercancel`, Escape, and a release without a valid day target clear the gesture without calling the save function. This pins the invalid-drop Review Focus case to the gesture owner.

- [ ] **Step 5: Run the flow test and verify RED**

Run: `node --test tests/calendar-ui-flow.test.mjs`

Expected: FAIL because pointer handlers and resize handles are absent.

- [ ] **Step 6: Wire pointer start, hover target, preview, cancel, and click suppression**

Modify the month grid so day cells report their date to an active event gesture without triggering empty-cell creation. On an allowed event bar, start `move`; on true-edge handles, start `resize-start` or `resize-end`. Use `setPointerCapture`, update `dragging` only after `isDragGesture`, and clear the gesture on `pointercancel`, Escape, invalid release, or unmount.

Compute the preview draft exclusively through Task 1 functions. Render preview segments by passing a synthetic preview event through `monthEventSegments`; do not mutate `events`.

- [ ] **Step 7: Run focused flow tests**

Run: `node --test tests/event-manipulation.test.mjs tests/calendar-ui-flow.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add app/lib/event-manipulation.ts app/page.tsx tests/event-manipulation.test.mjs tests/calendar-ui-flow.test.mjs
git commit -m "Add month event drag interactions"
```

### Task 3: Persist completed gestures

**Files:**
- Modify: `app/page.tsx`
- Modify: `tests/calendar-ui-flow.test.mjs`

**Interfaces:**
- Consumes: `EventDateDraft` produced by Task 1 and existing `sourcePath` provider routes.
- Produces: `saveDraggedEvent(event, draft, mode)` behavior in `Home`.

- [ ] **Step 1: Write failing flow assertions for persistence**

Assert that a completed gesture sends one `PATCH` request containing original provider identifiers and the new date draft, does not patch an invalid/cancelled gesture, reloads after success, and reports separate move/resize success messages.

```js
for (const phrase of [
  'method:"PATCH"', "providerEventId:event.providerEventId", "resourceUrl:event.resourceUrl",
  "일정을 이동했어요.", "기간을 변경했어요.", "일정을 변경하지 못했어요.",
]) assert.match(page, new RegExp(phrase.replaceAll(".","\\.")));
```

- [ ] **Step 2: Run flow test and verify RED**

Run: `node --test tests/calendar-ui-flow.test.mjs`

Expected: FAIL because drag persistence is absent.

- [ ] **Step 3: Implement the minimal save path**

Build a provider payload from the draft using the same exclusive all-day end conversion as the editor. Include `calendarId`, title, recurrence, provider event ID and resource URL. Set the active event to saving, call `PATCH`, retain the original rendered events until success, clear the gesture, show the mode-specific notice, and `await loadEvents()`. On error, clear saving/preview and show `일정을 변경하지 못했어요. 원래 일정은 그대로 유지됩니다.`

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/event-manipulation.test.mjs tests/calendar-ui-flow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add app/page.tsx tests/calendar-ui-flow.test.mjs
git commit -m "Persist dragged calendar changes"
```

### Task 4: Interaction styling and regression verification

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/calendar-ui-flow.test.mjs`

**Interfaces:**
- Consumes: CSS class names emitted by Task 2.
- Produces: visible resize affordances, preview bars, blocked/saving states, and desktop-only pointer cursors.

- [ ] **Step 1: Add failing CSS assertions**

Assert styles exist for `.month-event-bar.draggable`, `.event-resize-handle.start`, `.event-resize-handle.end`, `.event-drag-preview`, `.month-event-bar.manipulation-blocked`, and `.month-event-bar.saving`.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/calendar-ui-flow.test.mjs`

Expected: FAIL because the classes are unstyled.

- [ ] **Step 3: Add minimal styling**

Use `cursor: grab/grabbing`, 6–8px transparent hit areas for handles, a dashed or translucent preview, and reduced opacity for saving. Hide handles below the existing desktop breakpoint so touch behavior remains unchanged. Preserve current calendar colors and bar height.

- [ ] **Step 4: Run the full verification suite**

Run: `npm test`

Expected: build succeeds and all tests pass.

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 5: Manually verify the production build locally**

Run: `npm run dev`

Verify: single-day move, multi-day move across month boundary, left/right resize, click-to-edit, invalid drop cancellation, recurring event blocked, company read-only event blocked, and failed request preserving the original bar.

- [ ] **Step 6: Commit Task 4**

```bash
git add app/globals.css tests/calendar-ui-flow.test.mjs
git commit -m "Style desktop event manipulation"
```
