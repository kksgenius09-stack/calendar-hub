export type ManipulableEvent = {
  start?: string;
  end?: string;
  allDay?: boolean;
  recurrence?: string;
  repeatSeriesId?: string;
  resourceUrl?: string;
  source: "icloud" | "google" | "daou";
  calendarName?: string;
};

export type EventDateDraft = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
};

type PersistableEvent = ManipulableEvent & {
  calendarId: string;
  providerEventId?: string;
  resourceUrl?: string;
  title: string;
};

type GestureMode = "move" | "resize-start" | "resize-end";

type GesturePersistenceOptions = {
  sourcePath: Record<ManipulableEvent["source"], string>;
  fetcher: (url: string, options: RequestInit) => Promise<{ ok: boolean }>;
  loadEvents: () => Promise<void>;
  setSaving: (saving: boolean) => void;
  onDraft: (draft: EventDateDraft) => void;
  setNotice: (message: string) => void;
};

export function isDragGesture(start: { x: number; y: number }, current: { x: number; y: number }, threshold = 6) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function updateEventGesture<T extends { targetDate: string; dragging: boolean }>(
  current: T,
  targetDate: string,
  saving: boolean,
  dragging = current.dragging,
): T {
  if (saving) return current;
  return { ...current, targetDate, dragging };
}

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const timeKey = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const localDate = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
const dayOrdinal = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000);
};
const addCalendarDays = (key: string, days: number) => {
  const [year, month, day] = key.split("-").map(Number);
  return dateKey(new Date(year, month - 1, day + days));
};

function currentDraft(event: ManipulableEvent): EventDateDraft | null {
  if (!eventManipulationState(event).allowed || !event.start) return null;
  const start = localDate(event.start);
  const end = localDate(event.end || event.start);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startDate = dateKey(start);
  const providerEndDate = dateKey(end);
  return {
    startDate,
    endDate: event.allDay && providerEndDate > startDate
      ? addCalendarDays(providerEndDate, -1)
      : providerEndDate,
    startTime: event.allDay ? "00:00" : timeKey(start),
    endTime: event.allDay ? "00:00" : timeKey(end),
    allDay: Boolean(event.allDay),
  };
}

export function eventManipulationState(event: ManipulableEvent) {
  if (event.recurrence || event.repeatSeriesId) {
    return { allowed: false, reason: "반복 일정은 편집창에서 변경해 주세요." };
  }
  if (event.source === "daou" && (event.calendarName || "").replace(/\s/g, "").toLowerCase() !== "내일정") {
    return { allowed: false, reason: "읽기 전용 일정은 이동할 수 없어요." };
  }
  if (!event.start) return { allowed: false, reason: "일정 날짜를 확인할 수 없어요." };
  return { allowed: true, reason: "" };
}

export function moveEventToDate(event: ManipulableEvent, targetDate: string): EventDateDraft | null {
  const draft = currentDraft(event);
  if (!draft) return null;
  const span = dayOrdinal(draft.endDate) - dayOrdinal(draft.startDate);
  return { ...draft, startDate: targetDate, endDate: addCalendarDays(targetDate, span) };
}

export function resizeEventToDate(
  event: ManipulableEvent,
  edge: "start" | "end",
  targetDate: string,
): EventDateDraft | null {
  const draft = currentDraft(event);
  if (!draft) return null;
  const resized = edge === "start"
    ? { ...draft, startDate: targetDate }
    : { ...draft, endDate: targetDate };
  if (resized.startDate > resized.endDate) return null;
  if (!resized.allDay && resized.startDate === resized.endDate && resized.startTime >= resized.endTime) return null;
  return resized;
}

export async function persistCompletedEventGesture(
  event: PersistableEvent,
  mode: GestureMode,
  targetDate: string | null,
  gesture: { dragging: boolean; cancelled?: boolean },
  options: GesturePersistenceOptions,
): Promise<boolean> {
  if (!gesture.dragging || gesture.cancelled || !targetDate || !eventManipulationState(event).allowed) return false;
  const draft = mode === "move"
    ? moveEventToDate(event, targetDate)
    : resizeEventToDate(event, mode === "resize-start" ? "start" : "end", targetDate);
  if (!draft) return false;

  options.onDraft(draft);
  options.setSaving(true);
  try {
    const start = draft.allDay ? draft.startDate : new Date(`${draft.startDate}T${draft.startTime}`).toISOString();
    const end = draft.allDay ? addCalendarDays(draft.endDate, 1) : new Date(`${draft.endDate}T${draft.endTime}`).toISOString();
    const body = {
      calendarId: event.calendarId,
      title: event.title,
      start,
      end,
      allDay: draft.allDay,
      recurrence: event.recurrence || "",
      providerEventId: event.providerEventId,
      resourceUrl: event.resourceUrl,
    };
    const response = await options.fetcher(options.sourcePath[event.source], {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("일정 저장 실패");
    await options.loadEvents();
    options.setNotice(mode === "move" ? "일정을 이동했어요." : "기간을 변경했어요.");
    return true;
  } catch {
    options.setNotice("일정을 변경하지 못했어요. 원래 일정은 그대로 유지됩니다.");
    return false;
  } finally {
    options.setSaving(false);
  }
}
