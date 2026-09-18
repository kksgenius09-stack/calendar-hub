export type CalendarSource = "icloud" | "google" | "daou";

export type ConnectionAction = {
  kind: "authenticate" | "connect";
  intent: CalendarSource;
};

type CalendarChoice = {
  source: CalendarSource;
  id: string;
};

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
