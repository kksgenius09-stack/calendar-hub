export type ManipulableEvent = {
  start?: string;
  end?: string;
  allDay?: boolean;
  recurrence?: string;
  repeatSeriesId?: string;
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
  if (edge === "start") {
    return targetDate > draft.endDate ? null : { ...draft, startDate: targetDate };
  }
  return targetDate < draft.startDate ? null : { ...draft, endDate: targetDate };
}
