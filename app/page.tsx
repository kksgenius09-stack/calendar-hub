"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Source = "icloud" | "google" | "daou";
type EventItem = {
  id?: string;
  day: number;
  title: string;
  time: string;
  source: Source;
  calendarId?: string;
  color?: string;
  span?: number;
};

type GoogleCalendarItem = {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  selected: boolean;
};

const events: EventItem[] = [
  { day: 3, title: "8월 월간 회의", time: "10:00", source: "daou" },
  { day: 4, title: "민준이 태권도 상담", time: "19:00", source: "icloud" },
  { day: 5, title: "프로젝트 킥오프", time: "14:00", source: "google" },
  { day: 7, title: "부서 주간 보고", time: "09:30", source: "daou" },
  { day: 10, title: "여름휴가", time: "종일", source: "icloud", span: 3 },
  { day: 14, title: "건강검진", time: "08:30", source: "icloud" },
  { day: 18, title: "고객사 미팅", time: "15:00", source: "daou" },
  { day: 21, title: "학부모 상담", time: "16:30", source: "google" },
  { day: 24, title: "팀 저녁식사", time: "18:30", source: "daou" },
  { day: 28, title: "치과 예약", time: "11:00", source: "icloud" },
];

const sourceLabel: Record<Source, string> = {
  icloud: "iCloud",
  google: "Google",
  daou: "회사 일정",
};

const days = ["일", "월", "화", "수", "목", "금", "토"];
const leadingDays = [27, 28, 29, 30, 31];

export default function Home() {
  const [visible, setVisible] = useState<Record<Source, boolean>>({
    icloud: true,
    google: true,
    daou: true,
  });
  const [quickInput, setQuickInput] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<EventItem[]>([]);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarItem[]>([]);
  const [visibleGoogleCalendars, setVisibleGoogleCalendars] = useState<Record<string, boolean>>({});
  const [iCloudConnected, setICloudConnected] = useState(false);
  const [iCloudReady, setICloudReady] = useState(false);
  const [iCloudEvents, setICloudEvents] = useState<EventItem[]>([]);
  const [iCloudCalendars, setICloudCalendars] = useState<GoogleCalendarItem[]>([]);
  const [visibleICloudCalendars, setVisibleICloudCalendars] = useState<Record<string, boolean>>({});
  const [companyConnected, setCompanyConnected] = useState(false);
  const [companyEvents, setCompanyEvents] = useState<EventItem[]>([]);
  const [companyCalendars, setCompanyCalendars] = useState<GoogleCalendarItem[]>([]);
  const [visibleCompanyCalendars, setVisibleCompanyCalendars] = useState<Record<string, boolean>>({});
  const [calDavModal, setCalDavModal] = useState(false);
  const [calDavForm, setCalDavForm] = useState({ serverUrl: "", email: "", password: "" });
  const [calDavConnecting, setCalDavConnecting] = useState(false);

  useEffect(() => {
    fetch("/api/google/events")
      .then((response) => response.json())
      .then((data: { connected?: boolean; configured?: boolean; calendars?: GoogleCalendarItem[]; events?: Array<{ id: string; calendarId: string; calendarColor?: string; title: string; start?: string; allDay?: boolean }> }) => {
        setGoogleConnected(Boolean(data.connected));
        setGoogleReady(Boolean(data.configured));
        const calendars = data.calendars ?? [];
        setGoogleCalendars(calendars);
        let saved: Record<string, boolean> = {};
        try { saved = JSON.parse(localStorage.getItem("oncal-google-calendars") || "{}"); } catch { saved = {}; }
        setVisibleGoogleCalendars(Object.fromEntries(calendars.map((calendar) => [
          calendar.id,
          saved[calendar.id] ?? calendar.selected,
        ])));
        const liveEvents = (data.events ?? []).flatMap((event) => {
          if (!event.start) return [];
          const start = new Date(event.start);
          if (Number.isNaN(start.getTime()) || start.getFullYear() !== 2026 || start.getMonth() !== 7) return [];
          return [{
            id: event.id,
            day: start.getDate(),
            title: event.title,
            time: event.allDay ? "종일" : start.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
            source: "google" as const,
            calendarId: event.calendarId,
            color: event.calendarColor,
          }];
        });
        setGoogleEvents(liveEvents);
      })
      .catch(() => setGoogleConnected(false));

    fetch("/api/icloud/events")
      .then((response) => response.json())
      .then((data: { connected?: boolean; configured?: boolean; calendars?: Array<{ id: string; name: string; color: string }>; events?: Array<{ id: string; calendarId: string; calendarColor?: string; title: string; start?: string; allDay?: boolean }> }) => {
        setICloudConnected(Boolean(data.connected));
        setICloudReady(Boolean(data.configured));
        const calendars = (data.calendars ?? []).map((calendar) => ({ ...calendar, primary: false, selected: true }));
        setICloudCalendars(calendars);
        let saved: Record<string, boolean> = {};
        try { saved = JSON.parse(localStorage.getItem("oncal-icloud-calendars") || "{}"); } catch { saved = {}; }
        setVisibleICloudCalendars(Object.fromEntries(calendars.map((calendar) => [calendar.id, saved[calendar.id] ?? true])));
        setICloudEvents((data.events ?? []).flatMap((event) => {
          if (!event.start) return [];
          const start = new Date(event.start);
          if (Number.isNaN(start.getTime()) || start.getFullYear() !== 2026 || start.getMonth() !== 7) return [];
          return [{
            id: event.id,
            day: start.getDate(),
            title: event.title,
            time: event.allDay ? "종일" : start.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
            source: "icloud" as const,
            calendarId: event.calendarId,
            color: event.calendarColor,
          }];
        }));
      })
      .catch(() => setICloudConnected(false));

    fetch("/api/caldav/events")
      .then((response) => response.json())
      .then((data: { connected?: boolean; calendars?: Array<{ id: string; name: string; color: string }>; events?: Array<{ id: string; calendarId: string; calendarColor?: string; title: string; start?: string; allDay?: boolean }> }) => {
        setCompanyConnected(Boolean(data.connected));
        const calendars = (data.calendars ?? []).map((calendar) => ({ ...calendar, primary: false, selected: true }));
        setCompanyCalendars(calendars);
        let saved: Record<string, boolean> = {};
        try { saved = JSON.parse(localStorage.getItem("oncal-company-calendars") || "{}"); } catch { saved = {}; }
        setVisibleCompanyCalendars(Object.fromEntries(calendars.map((calendar) => [calendar.id, saved[calendar.id] ?? true])));
        setCompanyEvents((data.events ?? []).flatMap((event) => {
          if (!event.start) return [];
          const start = new Date(event.start);
          if (Number.isNaN(start.getTime()) || start.getFullYear() !== 2026 || start.getMonth() !== 7) return [];
          return [{
            id: event.id, day: start.getDate(), title: event.title,
            time: event.allDay ? "종일" : start.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
            source: "daou" as const, calendarId: event.calendarId, color: event.calendarColor,
          }];
        }));
      })
      .catch(() => setCompanyConnected(false));

    const googleResult = new URLSearchParams(window.location.search).get("google");
    if (googleResult === "setup-required") setNotice("Google 연동 설정이 아직 완료되지 않았어요. OAuth 인증정보를 연결해야 합니다.");
    if (googleResult === "failed") setNotice("Google 연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    if (googleResult === "connected") setNotice("Google 캘린더가 연결됐어요.");
    if (googleResult) window.history.replaceState({}, "", window.location.pathname);
    const iCloudResult = new URLSearchParams(window.location.search).get("icloud");
    if (iCloudResult === "setup-required") setNotice("iCloud 연결 정보가 아직 설정되지 않았어요.");
    if (iCloudResult === "failed") setNotice("iCloud 연결에 실패했어요. Apple 계정과 앱 전용 암호를 확인해 주세요.");
    if (iCloudResult === "connected") setNotice("iCloud 캘린더가 연결됐어요.");
    if (iCloudResult === "disconnected") setNotice("iCloud 연결을 해제했어요.");
    if (iCloudResult) window.history.replaceState({}, "", window.location.pathname);
    if (new URLSearchParams(window.location.search).get("caldav") === "disconnected") {
      setNotice("회사 일정 연결을 해제했어요.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const filteredEvents = useMemo(
    () => [
      ...(companyConnected ? companyEvents : events.filter((event) => event.source === "daou")),
      ...(googleConnected ? googleEvents : events.filter((event) => event.source === "google")),
      ...(iCloudConnected ? iCloudEvents : events.filter((event) => event.source === "icloud")),
    ]
      .filter((event) => visible[event.source])
      .filter((event) => event.source !== "google" || !googleConnected || !event.calendarId || visibleGoogleCalendars[event.calendarId])
      .filter((event) => event.source !== "icloud" || !iCloudConnected || !event.calendarId || visibleICloudCalendars[event.calendarId])
      .filter((event) => event.source !== "daou" || !companyConnected || !event.calendarId || visibleCompanyCalendars[event.calendarId]),
    [visible, visibleGoogleCalendars, visibleICloudCalendars, visibleCompanyCalendars, googleConnected, googleEvents, iCloudConnected, iCloudEvents, companyConnected, companyEvents],
  );

  const toggleGoogleCalendar = (calendarId: string) => {
    const next = { ...visibleGoogleCalendars, [calendarId]: !visibleGoogleCalendars[calendarId] };
    setVisibleGoogleCalendars(next);
    localStorage.setItem("oncal-google-calendars", JSON.stringify(next));
  };

  const toggleICloudCalendar = (calendarId: string) => {
    const next = { ...visibleICloudCalendars, [calendarId]: !visibleICloudCalendars[calendarId] };
    setVisibleICloudCalendars(next);
    localStorage.setItem("oncal-icloud-calendars", JSON.stringify(next));
  };

  const toggleCompanyCalendar = (calendarId: string) => {
    const next = { ...visibleCompanyCalendars, [calendarId]: !visibleCompanyCalendars[calendarId] };
    setVisibleCompanyCalendars(next);
    localStorage.setItem("oncal-company-calendars", JSON.stringify(next));
  };

  const connectCalDav = async () => {
    setCalDavConnecting(true);
    try {
      const response = await fetch("/api/caldav/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(calDavForm),
      });
      const data = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !data.connected) throw new Error(data.error || "연결에 실패했습니다.");
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "연결에 실패했습니다.");
      setCalDavConnecting(false);
    }
  };

  const submitQuick = () => {
    if (!quickInput.trim()) return;
    setNotice(`“${quickInput}” 일정을 파악했어요. 저장 위치만 선택하면 됩니다.`);
    setQuickInput("");
    window.setTimeout(() => setNotice(""), 4500);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="메뉴 열기">
          <span /> <span />
        </button>
        <a className="brand" href="#" aria-label="온캘 홈">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>OnCal</span>
        </a>
        <div className="date-nav">
          <button aria-label="이전 달">‹</button>
          <button className="today-button">오늘</button>
          <button aria-label="다음 달">›</button>
          <h1>2026년 8월</h1>
        </div>
        <div className="header-actions">
          <button className="search-button" aria-label="일정 검색">⌕</button>
          <div className="view-switch" aria-label="캘린더 보기 선택">
            <button>일</button><button>주</button><button className="active">월</button>
          </div>
          <button className="avatar" aria-label="내 계정">KS</button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
          <button className="new-event"><span>+</span> 새 일정</button>

          <section className="mini-calendar">
            <div className="mini-title"><b>2026년 8월</b><span>‹&nbsp;&nbsp; ›</span></div>
            <div className="mini-grid mini-week">{days.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="mini-grid">
              {[27,28,29,30,31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,1,2,3,4,5,6].map((d, i) => (
                <span key={`${d}-${i}`} className={`${i < 5 || i > 35 ? "muted" : ""} ${d === 2 && i < 10 ? "selected" : ""}`}>{d}</span>
              ))}
            </div>
          </section>

          <section className="calendar-list">
            <div className="section-heading"><b>내 캘린더</b><button>···</button></div>
            {(["icloud", "google", "daou"] as Source[]).map((source) => (
              <Fragment key={source}>
                <label className="calendar-row">
                  <input
                    type="checkbox"
                    checked={visible[source]}
                    onChange={() => setVisible({ ...visible, [source]: !visible[source] })}
                  />
                  <span className={`checkmark ${source}`}>✓</span>
                  <span>{sourceLabel[source]}</span>
                  <em>{source === "icloud" ? (iCloudConnected ? "연결됨" : iCloudReady ? "미연결" : "설정 필요") : source === "google" ? (googleConnected ? "연결됨" : googleReady ? "미연결" : "설정 필요") : companyConnected ? "연결됨" : "미연결"}</em>
                </label>
                {source === "icloud" && iCloudConnected && visible.icloud && (
                  <div className="google-calendar-children" aria-label="연결된 iCloud 캘린더">
                    {iCloudCalendars.map((calendar) => (
                      <label className="calendar-row calendar-child" key={calendar.id}>
                        <input
                          type="checkbox"
                          checked={visibleICloudCalendars[calendar.id] ?? true}
                          onChange={() => toggleICloudCalendar(calendar.id)}
                        />
                        <span className="checkmark google-child" style={{ backgroundColor: calendar.color }}>✓</span>
                        <span className="calendar-child-name">{calendar.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {source === "google" && googleConnected && visible.google && (
                  <div className="google-calendar-children" aria-label="연결된 Google 캘린더">
                    {googleCalendars.map((calendar) => (
                      <label className="calendar-row calendar-child" key={calendar.id}>
                        <input
                          type="checkbox"
                          checked={visibleGoogleCalendars[calendar.id] ?? true}
                          onChange={() => toggleGoogleCalendar(calendar.id)}
                        />
                        <span className="checkmark google-child" style={{ backgroundColor: calendar.color }}>✓</span>
                        <span className="calendar-child-name">{calendar.name}</span>
                        {calendar.primary && <em>기본</em>}
                      </label>
                    ))}
                  </div>
                )}
                {source === "daou" && companyConnected && visible.daou && (
                  <div className="google-calendar-children" aria-label="연결된 회사 캘린더">
                    {companyCalendars.map((calendar) => (
                      <label className="calendar-row calendar-child" key={calendar.id}>
                        <input
                          type="checkbox"
                          checked={visibleCompanyCalendars[calendar.id] ?? true}
                          onChange={() => toggleCompanyCalendar(calendar.id)}
                        />
                        <span className="checkmark google-child" style={{ backgroundColor: calendar.color }}>✓</span>
                        <span className="calendar-child-name">{calendar.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Fragment>
            ))}
            {iCloudConnected ? (
              <form action="/api/icloud/disconnect" method="post"><button className="connect-calendar" type="submit">iCloud 연결 해제</button></form>
            ) : (
              <form action="/api/icloud/connect" method="post">
                <button
                  className="connect-calendar"
                  type="submit"
                  disabled={!iCloudReady}
                  onClick={(event) => {
                    if (iCloudReady) return;
                    event.preventDefault();
                    setNotice("iCloud 연결 정보가 아직 설정되지 않았어요.");
                  }}
                >+ &nbsp;iCloud 캘린더 연결</button>
              </form>
            )}
            {googleConnected ? (
              <form action="/api/google/disconnect" method="post"><button className="connect-calendar" type="submit">Google 연결 해제</button></form>
            ) : (
              <a
                className="connect-calendar"
                href={googleReady ? "/api/google/connect" : "#"}
                onClick={(event) => {
                  if (googleReady) return;
                  event.preventDefault();
                  setNotice("Google OAuth 인증정보가 아직 설정되지 않았어요. 인증정보를 추가한 후 연결할 수 있어요.");
                }}
              >+ &nbsp;Google 캘린더 연결</a>
            )}
            {companyConnected ? (
              <form action="/api/caldav/disconnect" method="post"><button className="connect-calendar" type="submit">회사 일정 연결 해제</button></form>
            ) : (
              <button className="connect-calendar" type="button" onClick={() => setCalDavModal(true)}>+ &nbsp;회사 일정 연결</button>
            )}
          </section>

          <div className="sync-card">
            <span className="sync-icon">⇅</span>
            <div><b>모두 동기화됨</b><small>방금 전 업데이트</small></div>
            <span className="status-dot" />
          </div>
          <p className="privacy-note">현재 캘린더 상태는 로컬 데모입니다.</p>
        </aside>

        <section className="calendar-area">
          <div className="quick-add">
            <span className="spark">✦</span>
            <input
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitQuick()}
              placeholder="예: 내일 오후 3시 치과 예약"
              aria-label="빠른 일정 입력"
            />
            <span className="shortcut">Enter</span>
            <button onClick={submitQuick}>일정 추가</button>
          </div>

          <div className="calendar-card">
            <div className="week-header">
              {days.map((day, i) => <div key={day} className={i === 0 || i === 6 ? "weekend" : ""}>{day}</div>)}
            </div>
            <div className="month-grid">
              {leadingDays.map((day) => <DayCell key={`prev-${day}`} day={day} muted events={[]} />)}
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <DayCell key={day} day={day} today={day === 2} events={filteredEvents.filter((e) => e.day === day)} />
              ))}
              {Array.from({ length: 6 }, (_, i) => i + 1).map((day) => <DayCell key={`next-${day}`} day={day} muted events={[]} />)}
            </div>
          </div>
        </section>
      </div>

      {calDavModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !calDavConnecting && setCalDavModal(false)}>
          <section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="caldav-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="닫기" onClick={() => setCalDavModal(false)}>×</button>
            <span className="modal-icon">↻</span>
            <h2 id="caldav-title">회사 일정 연결</h2>
            <p>회사에서 안내받은 CalDAV 정보를 입력하세요. 입력한 비밀번호는 암호화되어 저장됩니다.</p>
            <label><span>회사 일정 서버</span><input type="text" placeholder="예: gw.company.co.kr" value={calDavForm.serverUrl} onChange={(event) => setCalDavForm({ ...calDavForm, serverUrl: event.target.value })} /></label>
            <label><span>아이디 또는 이메일</span><input type="text" autoComplete="username" placeholder="name@company.com" value={calDavForm.email} onChange={(event) => setCalDavForm({ ...calDavForm, email: event.target.value })} /></label>
            <label><span>비밀번호 또는 앱 암호</span><input type="password" autoComplete="current-password" placeholder="회사에서 발급받은 암호" value={calDavForm.password} onChange={(event) => setCalDavForm({ ...calDavForm, password: event.target.value })} onKeyDown={(event) => event.key === "Enter" && connectCalDav()} /></label>
            <small>일반 계정 비밀번호 대신 앱 전용 암호를 지원한다면 앱 암호 사용을 권장합니다.</small>
            <button className="modal-connect" type="button" disabled={calDavConnecting || !calDavForm.serverUrl || !calDavForm.email || !calDavForm.password} onClick={connectCalDav}>{calDavConnecting ? "연결 확인 중…" : "연결하기"}</button>
          </section>
        </div>
      )}

      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </main>
  );
}

function DayCell({ day, events, muted, today }: { day: number; events: EventItem[]; muted?: boolean; today?: boolean }) {
  return (
    <div className={`day-cell ${muted ? "muted" : ""} ${today ? "today" : ""}`}>
      <span className="day-number">{day}</span>
      <div className="events">
        {events.map((event) => (
          <button
            className={`event ${event.source}`}
            key={event.id || `${event.title}-${event.time}`}
            title={`${sourceLabel[event.source]} · ${event.title}`}
            style={event.color ? { borderLeftColor: event.color, backgroundColor: `${event.color}20` } : undefined}
          >
            <span>{event.time}</span>{event.title}
          </button>
        ))}
      </div>
    </div>
  );
}
