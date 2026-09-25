export type CalendarSource = "icloud" | "google" | "daou";

export type ConnectionAction = {
  kind: "authenticate" | "connect";
  intent: CalendarSource;
};

type CalendarChoice = {
  source: CalendarSource;
  id: string;
};

type CalendarEventRange = {
  start: string;
  end?: string;
  allDay: boolean;
};

type MonthRangeEvent = CalendarEventRange & { id: string };

const pad = (value: number) => String(value).padStart(2, "0");
const localDateKey = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const previousDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const dayNumber = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const clampedDate = (year:number, month:number, day:number) => new Date(year,month,Math.min(day,new Date(year,month+1,0).getDate()));

export function moveCursorToYear(cursor:Date, year:number) {
  return clampedDate(year,cursor.getMonth(),cursor.getDate());
}

export function moveCursorToMonth(cursor:Date, month:number) {
  return clampedDate(cursor.getFullYear(),month,cursor.getDate());
}

export function surroundingYears(year:number) {
  return Array.from({length:12},(_,index)=>year-5+index);
}

export function connectionAction(intent: CalendarSource, authenticated: boolean): ConnectionAction {
  return { kind: authenticated ? "connect" : "authenticate", intent };
}

export function connectionRedirectPath(intent: CalendarSource) {
  const connect = intent === "google" ? "" : `&connect=${intent}`;
  return `/?google=connected${connect}`;
}

export function defaultCalendarState(calendars: CalendarChoice[], savedKey: string) {
  if (calendars.length === 0) {
    return {
      available: false,
      selectedKey: "",
      message: "먼저 캘린더를 연결해 주세요.",
    };
  }

  const saved = calendars.find(calendar => `${calendar.source}:${calendar.id}` === savedKey);
  const selected = saved ?? calendars[0];
  return {
    available: true,
    selectedKey: `${selected.source}:${selected.id}`,
    message: "",
  };
}

export function orderedDateRange(firstDate: string, secondDate: string) {
  return firstDate <= secondDate
    ? { startDate: firstDate, endDate: secondDate }
    : { startDate: secondDate, endDate: firstDate };
}

export function inclusiveEventEndDate(event: CalendarEventRange) {
  const endDate = localDateKey(event.end || event.start);
  return event.allDay && endDate > localDateKey(event.start) ? previousDate(endDate) : endDate;
}

export function eventOccursOnDate(event: CalendarEventRange, date: string) {
  const startDate = localDateKey(event.start);
  const endDate = inclusiveEventEndDate(event);
  return date >= startDate && date <= endDate;
}

export function monthEventSegments(events: MonthRangeEvent[], visibleStart: string, visibleDays = 42, maxLanes = 3) {
  const firstDay = dayNumber(visibleStart);
  const lastDay = firstDay + visibleDays - 1;
  const occupied = Array.from({ length: Math.ceil(visibleDays / 7) }, () =>
    Array.from({ length: maxLanes }, () => Array(7).fill(false)),
  );
  const segments: Array<{ id:string; week:number; startColumn:number; span:number; lane:number; startsHere:boolean; endsHere:boolean }> = [];
  const sorted = [...events].sort((a, b) => {
    const startDifference = dayNumber(localDateKey(a.start)) - dayNumber(localDateKey(b.start));
    if (startDifference) return startDifference;
    return dayNumber(inclusiveEventEndDate(b)) - dayNumber(inclusiveEventEndDate(a));
  });

  for (const event of sorted) {
    const eventStart = dayNumber(localDateKey(event.start));
    const eventEnd = dayNumber(inclusiveEventEndDate(event));
    const clampedStart = Math.max(firstDay, eventStart);
    const clampedEnd = Math.min(lastDay, eventEnd);
    if (clampedStart > clampedEnd) continue;
    const firstWeek = Math.floor((clampedStart - firstDay) / 7);
    const lastWeek = Math.floor((clampedEnd - firstDay) / 7);
    for (let week = firstWeek; week <= lastWeek; week += 1) {
      const weekStart = firstDay + week * 7;
      const segmentStart = Math.max(clampedStart, weekStart);
      const segmentEnd = Math.min(clampedEnd, weekStart + 6);
      const startColumn = segmentStart - weekStart;
      const span = segmentEnd - segmentStart + 1;
      const lane = occupied[week].findIndex(cells => cells.slice(startColumn, startColumn + span).every(value => !value));
      if (lane < 0) continue;
      for (let column = startColumn; column < startColumn + span; column += 1) occupied[week][lane][column] = true;
      segments.push({ id:event.id, week, startColumn, span, lane, startsHere:segmentStart===eventStart, endsHere:segmentEnd===eventEnd });
    }
  }
  return segments;
}
