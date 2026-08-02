"use client";

import { useMemo, useState } from "react";

type Source = "icloud" | "google" | "daou";
type EventItem = {
  day: number;
  title: string;
  time: string;
  source: Source;
  span?: number;
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
  daou: "다우오피스",
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

  const filteredEvents = useMemo(
    () => events.filter((event) => visible[event.source]),
    [visible],
  );

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
              <label className="calendar-row" key={source}>
                <input
                  type="checkbox"
                  checked={visible[source]}
                  onChange={() => setVisible({ ...visible, [source]: !visible[source] })}
                />
                <span className={`checkmark ${source}`}>✓</span>
                <span>{sourceLabel[source]}</span>
                <em>{source === "icloud" ? "개인" : source === "google" ? "공유" : "업무"}</em>
              </label>
            ))}
            <button className="connect-calendar">+ &nbsp;캘린더 연결</button>
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
          <button className={`event ${event.source}`} key={`${event.title}-${event.time}`} title={`${sourceLabel[event.source]} · ${event.title}`}>
            <span>{event.time}</span>{event.title}
          </button>
        ))}
      </div>
    </div>
  );
}
