"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import KoreanLunarCalendar from "korean-lunar-calendar";

type Source = "icloud" | "google" | "daou";
type View = "day" | "week" | "month";
type CalendarItem = { id: string; name: string; color: string; primary?: boolean; selected?: boolean; source: Source };
type EventItem = { id: string; providerEventId?: string; resourceUrl?: string; calendarId: string; calendarName?: string; calendarColor?: string; title: string; start: string; end: string; allDay: boolean; recurrence?: string; source: Source };
type EventForm = { title: string; date: string; startTime: string; endTime: string; allDay: boolean; recurrence: string; calendarKey: string };

const sourceLabel: Record<Source, string> = { icloud: "iCloud", google: "Google", daou: "회사 일정" };
const sourcePath: Record<Source, string> = { icloud: "/api/icloud/events", google: "/api/google/events", daou: "/api/caldav/events" };
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const parseEventDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
const isPersonalCompanyCalendar = (name?: string) => (name || "").replaceAll(" ", "").toLowerCase() === "내일정";
const isCalendarWritable = (calendar: CalendarItem) => calendar.source !== "daou" || isPersonalCompanyCalendar(calendar.name);

function lunarLabel(d: Date) { const lunar = new KoreanLunarCalendar(); if (!lunar.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) return ""; const v = lunar.getLunarCalendar(); return `음 ${v.intercalation ? "윤" : ""}${v.month}.${v.day}`; }
function rangeFor(cursor: Date, view: View) { if (view === "month") { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = addDays(first, -first.getDay()); return { start, end: addDays(start, 42) }; } if (view === "week") { const start = addDays(startOfDay(cursor), -cursor.getDay()); return { start, end: addDays(start, 7) }; } return { start: startOfDay(cursor), end: addDays(startOfDay(cursor), 1) }; }
function defaultForm(date: Date, calendarKey = "") : EventForm { return { title: "", date: dateKey(date), startTime: "09:00", endTime: "10:00", allDay: false, recurrence: "", calendarKey }; }

export default function Home() {
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<View>("month");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [connected, setConnected] = useState<Record<Source, boolean>>({ icloud: false, google: false, daou: false });
  const [configured, setConfigured] = useState<Record<Source, boolean>>({ icloud: false, google: false, daou: true });
  const [sourceVisible, setSourceVisible] = useState<Record<Source, boolean>>({ icloud: true, google: true, daou: true });
  const [calendarVisible, setCalendarVisible] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const [showLunar, setShowLunar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState(1);
  const [defaultCalendarKey, setDefaultCalendarKey] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [form, setForm] = useState<EventForm>(() => defaultForm(new Date()));
  const [saving, setSaving] = useState(false);
  const [calDavModal, setCalDavModal] = useState(false);
  const [calDavForm, setCalDavForm] = useState({ serverUrl: "", email: "", password: "" });
  const [calDavConnecting, setCalDavConnecting] = useState(false);
  const visibleRange = useMemo(() => rangeFor(cursor, view), [cursor, view]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const query = `?from=${encodeURIComponent(visibleRange.start.toISOString())}&to=${encodeURIComponent(visibleRange.end.toISOString())}`;
    const sources: Source[] = ["icloud", "google", "daou"];
    const results = await Promise.all(sources.map(async source => { try { const response = await fetch(sourcePath[source] + query); const data = await response.json(); return { source, data }; } catch { return { source, data: { connected: false, events: [], calendars: [] } }; } }));
    const nextEvents: EventItem[] = []; const nextCalendars: CalendarItem[] = []; const nextConnected = { ...connected }; const nextConfigured = { ...configured };
    let savedVisibility: Record<string, boolean> = {}; try { savedVisibility = JSON.parse(localStorage.getItem("oncal-calendar-visibility") || "{}"); } catch { savedVisibility = {}; }
    const visibility: Record<string, boolean> = {};
    for (const { source, data } of results) { nextConnected[source] = Boolean(data.connected); if (typeof data.configured === "boolean") nextConfigured[source] = data.configured; for (const c of data.calendars ?? []) { nextCalendars.push({ ...c, source }); visibility[`${source}:${c.id}`] = savedVisibility[`${source}:${c.id}`] ?? c.selected !== false; } for (const e of data.events ?? []) if (e.start) nextEvents.push({ ...e, source }); }
    setConnected(nextConnected); setConfigured(nextConfigured); setCalendars(nextCalendars); setCalendarVisible(visibility); setEvents(nextEvents); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRange.start.getTime(), visibleRange.end.getTime()]);

  useEffect(() => { setShowLunar(localStorage.getItem("oncal-show-lunar") === "true"); setAutoSyncMinutes(Number(localStorage.getItem("oncal-auto-sync") || "1")); setDefaultCalendarKey(localStorage.getItem("oncal-default-calendar") || ""); const params = new URLSearchParams(location.search); const result = params.get("google") || params.get("icloud") || params.get("caldav"); if (result === "connected") setNotice("캘린더가 연결됐어요."); if (result === "failed") setNotice("연결에 실패했어요. 로그인 정보를 확인해 주세요."); if (result === "setup-required") setNotice("연동 설정이 아직 완료되지 않았어요."); if (result) history.replaceState({}, "", location.pathname); }, []);
  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { if (!autoSyncMinutes) return; const timer = window.setInterval(loadEvents, autoSyncMinutes * 60_000); return () => window.clearInterval(timer); }, [autoSyncMinutes, loadEvents]);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (editorOpen && !saving) setEditorOpen(false); else if (calDavModal && !calDavConnecting) setCalDavModal(false); else if (settingsOpen) setSettingsOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [editorOpen, saving, calDavModal, calDavConnecting, settingsOpen]);

  const filtered = useMemo(() => events.filter(e => sourceVisible[e.source] && calendarVisible[`${e.source}:${e.calendarId}`] !== false), [events, sourceVisible, calendarVisible]);
  const title = view === "day" ? cursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : view === "week" ? `${visibleRange.start.getFullYear()}년 ${visibleRange.start.getMonth() + 1}월 ${visibleRange.start.getDate()}일 주` : `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
  const step = (direction: number) => setCursor(d => view === "month" ? new Date(d.getFullYear(), d.getMonth() + direction, 1) : addDays(d, direction * (view === "week" ? 7 : 1)));
  const writableCalendars = calendars.filter(isCalendarWritable);
  const savedDefault = writableCalendars.find(c => `${c.source}:${c.id}` === defaultCalendarKey);
  const firstWritableCalendar = savedDefault || writableCalendars[0];
  const firstCalendarKey = firstWritableCalendar ? `${firstWritableCalendar.source}:${firstWritableCalendar.id}` : "";

  const openCreate = (date = cursor, title = "") => { setEditing(null); setForm({ ...defaultForm(date, firstCalendarKey), title }); setEditorOpen(true); };
  const openEdit = (event: EventItem) => { const start = parseEventDate(event.start); const end = parseEventDate(event.end || event.start); setEditing(event); setForm({ title: event.title, date: dateKey(start), startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`, endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`, allDay: event.allDay, recurrence: event.recurrence || "", calendarKey: `${event.source}:${event.calendarId}` }); setEditorOpen(true); };

  const payload = () => { const [source, ...calendarParts] = form.calendarKey.split(":"); const calendarId = calendarParts.join(":"); const start = form.allDay ? form.date : new Date(`${form.date}T${form.startTime}`).toISOString(); const endDate = form.allDay ? dateKey(addDays(new Date(`${form.date}T00:00:00`), 1)) : new Date(`${form.date}T${form.endTime}`).toISOString(); return { source: source as Source, calendarId, title: form.title.trim(), start, end: endDate, allDay: form.allDay, recurrence: form.recurrence, providerEventId: editing?.providerEventId, resourceUrl: editing?.resourceUrl }; };
  const saveEvent = async () => { if (editing?.source === "daou" && !isPersonalCompanyCalendar(editing.calendarName)) { setNotice("이 회사 일정은 읽기 전용입니다."); return; } if (!form.title.trim() || !form.calendarKey) { setNotice("제목과 저장할 캘린더를 선택해 주세요."); return; } if (!form.allDay && form.endTime <= form.startTime) { window.alert("종료 시간은 시작 시간보다 늦어야 합니다."); return; } setSaving(true); const body = payload(); try { const response = await fetch(sourcePath[body.source], { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) { if (data.error === "google_reconnect_required") throw new Error("Google 쓰기 권한이 필요합니다. Google 연결을 해제한 뒤 다시 연결해 주세요."); if (data.error === "read_only_calendar") throw new Error("‘내 일정’ 외 회사 캘린더는 읽기 전용입니다."); throw new Error("일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."); } setEditorOpen(false); setNotice(editing ? "일정을 수정했어요." : "새 일정을 저장했어요."); await loadEvents(); } catch (e) { setNotice(e instanceof Error ? e.message : "저장에 실패했어요."); } finally { setSaving(false); } };
  const deleteEvent = async () => { if (!editing || !confirm("이 일정을 삭제할까요?")) return; setSaving(true); try { const response = await fetch(sourcePath[editing.source], { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(editing) }); if (!response.ok) throw new Error(); setEditorOpen(false); setNotice("일정을 삭제했어요."); await loadEvents(); } catch { setNotice("일정을 삭제하지 못했어요."); } finally { setSaving(false); } };

  const toggleCalendar = (key: string) => { const next = { ...calendarVisible, [key]: calendarVisible[key] === false }; setCalendarVisible(next); localStorage.setItem("oncal-calendar-visibility", JSON.stringify(next)); };
  const toggleLunar = () => { const next = !showLunar; setShowLunar(next); localStorage.setItem("oncal-show-lunar", String(next)); };
  const changeAutoSync = (minutes: number) => { setAutoSyncMinutes(minutes); localStorage.setItem("oncal-auto-sync", String(minutes)); };
  const changeDefaultCalendar = (key: string) => { setDefaultCalendarKey(key); localStorage.setItem("oncal-default-calendar", key); };
  const connectCalDav = async () => { setCalDavConnecting(true); try { const response = await fetch("/api/caldav/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calDavForm) }); const data = await response.json(); if (!response.ok || !data.connected) throw new Error(data.error || "연결에 실패했습니다."); location.reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "연결에 실패했습니다."); setCalDavConnecting(false); } };
  const quickAdd = () => { if (!quickInput.trim()) return; openCreate(cursor, quickInput.trim()); setQuickInput(""); };

  return <main className="app-shell">
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="메뉴 열기"><span/><span/></button>
      <a className="brand" href="#"><span className="brand-mark"><i/><i/><i/></span><span>OnCal</span></a>
      <div className="date-nav"><button onClick={() => step(-1)} aria-label="이전">‹</button><button className="today-button" onClick={() => setCursor(startOfDay(new Date()))}>오늘</button><button onClick={() => step(1)} aria-label="다음">›</button><div className="date-title"><h1>{title}</h1><span>오늘 · {new Date().toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric", weekday:"long" })}</span></div></div>
      <div className="header-actions"><div className="view-switch">{(["day","week","month"] as View[]).map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "day" ? "일" : v === "week" ? "주" : "월"}</button>)}</div><button className="avatar">KS</button></div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button className="new-event" onClick={() => openCreate()}><span>+</span> 새 일정</button>
        <MiniCalendar cursor={cursor} onSelect={d => { setCursor(d); setView("day"); }} />
        <section className="calendar-list"><div className="section-heading"><b>내 캘린더</b><button onClick={() => setSettingsOpen(true)} aria-label="설정 열기">···</button></div>
          {(["icloud","google","daou"] as Source[]).map(source => <Fragment key={source}><label className="calendar-row"><input type="checkbox" checked={sourceVisible[source]} onChange={() => setSourceVisible({ ...sourceVisible, [source]: !sourceVisible[source] })}/><span className={`checkmark ${source}`}>✓</span><span>{sourceLabel[source]}</span><em>{connected[source] ? "연결됨" : configured[source] ? "미연결" : "설정 필요"}</em></label>{connected[source] && sourceVisible[source] && <div className="google-calendar-children">{calendars.filter(c => c.source === source).map(c => { const key = `${source}:${c.id}`; return <label className="calendar-row calendar-child" key={key}><input type="checkbox" checked={calendarVisible[key] !== false} onChange={() => toggleCalendar(key)}/><span className="checkmark google-child" style={{backgroundColor:c.color}}>✓</span><span className="calendar-child-name">{c.name}</span>{c.primary && <em>기본</em>}</label>; })}</div>}</Fragment>)}
          {connected.icloud ? <form action="/api/icloud/disconnect" method="post"><button className="connect-calendar">iCloud 연결 해제</button></form> : <form action="/api/icloud/connect" method="post"><button className="connect-calendar">+ &nbsp;iCloud 캘린더 연결</button></form>}
          {connected.google ? <form action="/api/google/disconnect" method="post"><button className="connect-calendar">Google 연결 해제</button></form> : <a className="connect-calendar" href={configured.google ? "/api/google/connect" : "#"}>+ &nbsp;Google 캘린더 연결</a>}
          {connected.daou ? <form action="/api/caldav/disconnect" method="post"><button className="connect-calendar">회사 일정 연결 해제</button></form> : <button className="connect-calendar" onClick={() => setCalDavModal(true)}>+ &nbsp;회사 일정 연결</button>}
        </section>
        <div className="sync-card"><span className="sync-icon">⇅</span><div><b>{loading ? "동기화 중" : "모두 동기화됨"}</b><small>{loading ? "일정을 불러오고 있어요" : "최신 일정 표시 중"}</small></div><span className="status-dot"/></div><p className="privacy-note">연결된 캘린더에 직접 저장됩니다.</p>
      </aside>
      <section className="calendar-area"><div className="quick-add"><span className="spark">✦</span><input value={quickInput} onChange={e => setQuickInput(e.target.value)} onKeyDown={e => e.key === "Enter" && quickAdd()} placeholder="일정 제목을 입력하고 날짜·시간을 선택하세요"/><span className="shortcut">Enter</span><button onClick={quickAdd}>일정 추가</button></div>
        <CalendarView view={view} cursor={cursor} range={visibleRange} events={filtered} loading={loading} showLunar={showLunar} onCreate={openCreate} onEdit={openEdit}/>
      </section>
    </div>
    {editorOpen && <EventEditor form={form} setForm={setForm} calendars={calendars} editing={editing} saving={saving} onClose={() => setEditorOpen(false)} onSave={saveEvent} onDelete={deleteEvent}/>} 
    {settingsOpen && <SettingsModal calendars={writableCalendars} defaultCalendarKey={defaultCalendarKey || firstCalendarKey} autoSyncMinutes={autoSyncMinutes} showLunar={showLunar} onDefaultCalendar={changeDefaultCalendar} onAutoSync={changeAutoSync} onToggleLunar={toggleLunar} onClose={() => setSettingsOpen(false)}/>} 
    {calDavModal && <div className="modal-backdrop" onMouseDown={() => !calDavConnecting && setCalDavModal(false)}><section className="connect-modal" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setCalDavModal(false)}>×</button><span className="modal-icon">↻</span><h2>회사 일정 연결</h2><p>회사에서 안내받은 CalDAV 정보를 입력하세요.</p><label><span>회사 일정 서버</span><input placeholder="예: gw.company.co.kr" value={calDavForm.serverUrl} onChange={e => setCalDavForm({...calDavForm,serverUrl:e.target.value})}/></label><label><span>아이디 또는 이메일</span><input value={calDavForm.email} onChange={e => setCalDavForm({...calDavForm,email:e.target.value})}/></label><label><span>비밀번호 또는 앱 암호</span><input type="password" value={calDavForm.password} onChange={e => setCalDavForm({...calDavForm,password:e.target.value})}/></label><small>가능하면 앱 전용 암호를 사용하세요.</small><button className="modal-connect" disabled={calDavConnecting || !calDavForm.serverUrl || !calDavForm.email || !calDavForm.password} onClick={connectCalDav}>{calDavConnecting ? "연결 확인 중…" : "연결하기"}</button></section></div>}
    {notice && <div className="toast"><span>✓</span>{notice}</div>}
  </main>;
}

function MiniCalendar({ cursor, onSelect }: { cursor: Date; onSelect: (d: Date) => void }) { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = addDays(first, -first.getDay()); const cells = Array.from({length:42},(_,i)=>addDays(start,i)); const today = dateKey(new Date()); return <section className="mini-calendar"><div className="mini-title"><b>{cursor.getFullYear()}년 {cursor.getMonth()+1}월</b></div><div className="mini-grid mini-week">{weekdays.map(d=><span key={d}>{d}</span>)}</div><div className="mini-grid">{cells.map(d=><button key={dateKey(d)} onClick={()=>onSelect(d)} className={`${d.getMonth()!==cursor.getMonth()?"muted":""} ${dateKey(d)===today?"selected":""}`}>{d.getDate()}</button>)}</div></section>; }

function CalendarView({ view, cursor, range, events, loading, showLunar, onCreate, onEdit }: { view: View; cursor: Date; range:{start:Date;end:Date}; events:EventItem[]; loading:boolean; showLunar:boolean; onCreate:(d:Date)=>void; onEdit:(e:EventItem)=>void }) {
  const today = dateKey(new Date()); if (view === "month") { const cells=Array.from({length:42},(_,i)=>addDays(range.start,i)); return <div className="calendar-card"><div className="week-header">{weekdays.map((d,i)=><div key={d} className={i===0||i===6?"weekend":""}>{d}</div>)}</div><div className="month-grid">{cells.map(d=><div key={dateKey(d)} className={`day-cell ${d.getMonth()!==cursor.getMonth()?"muted":""} ${dateKey(d)===today?"today":""}`} onClick={()=>onCreate(d)}><div className="day-label"><span className="day-number">{d.getDate()}</span>{showLunar&&<span className="lunar-date">{lunarLabel(d)}</span>}</div><EventList date={d} events={events} onEdit={onEdit}/></div>)}</div></div>; }
  const dates = view === "week" ? Array.from({length:7},(_,i)=>addDays(range.start,i)) : [cursor]; return <div className={`calendar-card agenda-card ${view}`}><div className="agenda-columns">{dates.map(d=><section className={`agenda-day ${dateKey(d)===today?"today":""}`} key={dateKey(d)} onClick={()=>onCreate(d)}><header><b>{d.getDate()}</b><span>{weekdays[d.getDay()]}요일</span></header><EventList date={d} events={events} onEdit={onEdit} agenda/></section>)}</div>{loading&&<div className="calendar-loading">일정을 불러오는 중…</div>}</div>;
}

function EventList({ date, events, onEdit, agenda=false }: { date:Date; events:EventItem[]; onEdit:(e:EventItem)=>void; agenda?:boolean }) { const list=events.filter(e=>dateKey(parseEventDate(e.start))===dateKey(date)).sort((a,b)=>a.start.localeCompare(b.start)); return <div className={`events ${agenda?"agenda-events":""}`}>{list.map(e=>{const start=parseEventDate(e.start); return <button className={`event ${e.source}`} key={e.id} onClick={x=>{x.stopPropagation();onEdit(e);}} style={e.calendarColor?{borderLeftColor:e.calendarColor,backgroundColor:`${e.calendarColor}20`}:undefined}><span>{e.allDay?"종일":`${pad(start.getHours())}:${pad(start.getMinutes())}`}</span>{e.title}</button>;})}{agenda&&list.length===0&&<button className="empty-day" onClick={x=>x.stopPropagation()}>등록된 일정이 없습니다</button>}</div>; }

function EventEditor({ form,setForm,calendars,editing,saving,onClose,onSave,onDelete }:{form:EventForm;setForm:(f:EventForm)=>void;calendars:CalendarItem[];editing:EventItem|null;saving:boolean;onClose:()=>void;onSave:()=>void;onDelete:()=>void}) { const readOnly = Boolean(editing?.source === "daou" && !isPersonalCompanyCalendar(editing.calendarName)); return <div className="modal-backdrop" onMouseDown={()=>!saving&&onClose()}><section className="connect-modal event-editor" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="editor-title"><span>{readOnly?"읽기 전용":editing?"편집":"추가"}</span><h2>{readOnly?"일정 상세":editing?"일정 수정":"새 일정"}</h2>{editing&&<p>{readOnly?"회사 공용 일정은 확인만 할 수 있습니다.":"내용을 바꾼 뒤 아래의 ‘수정 완료’를 눌러주세요."}</p>}</div><fieldset className="editor-fields" disabled={readOnly}><label><span>일정 제목</span><input autoFocus={!readOnly} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="무엇을 할 예정인가요?"/></label><div className="form-row"><label><span>날짜</span><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label className="all-day"><span>시간</span><button className={`toggle-switch ${form.allDay?"on":""}`} onClick={()=>setForm({...form,allDay:!form.allDay})}><i/></button><small>종일</small></label></div>{!form.allDay&&<div className="form-row time-row"><label><span>시작 시간</span><TimePicker value={form.startTime} onChange={startTime=>setForm({...form,startTime})}/></label><label><span>종료 시간</span><TimePicker value={form.endTime} onChange={endTime=>setForm({...form,endTime})}/></label></div>}<label><span>반복</span><select value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}><option value="">반복 안 함</option><option value="FREQ=DAILY">매일</option><option value="FREQ=WEEKLY">매주</option><option value="FREQ=MONTHLY">매월</option><option value="FREQ=YEARLY">매년</option></select></label><label><span>저장할 캘린더</span><select value={form.calendarKey} disabled={Boolean(editing)} onChange={e=>setForm({...form,calendarKey:e.target.value})}><option value="">캘린더 선택</option>{(["icloud","google","daou"] as Source[]).map(s=><optgroup key={s} label={sourceLabel[s]}>{calendars.filter(c=>c.source===s&&isCalendarWritable(c)).map(c=><option value={`${s}:${c.id}`} key={`${s}:${c.id}`}>{c.name}</option>)}</optgroup>)}</select></label></fieldset><div className="editor-actions">{editing&&!readOnly&&<button className="delete-event" onClick={onDelete} disabled={saving}>삭제</button>}<button className="cancel-event" onClick={onClose}>{readOnly?"닫기":"취소"}</button>{!readOnly&&<button className="modal-connect" onClick={onSave} disabled={saving}>{saving?"저장 중…":editing?"수정 완료":"일정 저장"}</button>}</div></section></div>; }

function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hourValue, minuteValue] = value.split(":").map(Number);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour12 = hourValue % 12 || 12;
  const update = (nextPeriod: string, nextHour: number, nextMinute: number) => { const hour24 = nextHour % 12 + (nextPeriod === "PM" ? 12 : 0); onChange(`${pad(hour24)}:${pad(nextMinute)}`); };
  const minutes = [...new Set([...Array.from({length:12},(_,i)=>i*5), minuteValue])].sort((a,b)=>a-b);
  return <div className="time-picker" aria-label="시간 선택"><select aria-label="오전 오후" value={period} onChange={e=>update(e.target.value,hour12,minuteValue)}><option value="AM">오전</option><option value="PM">오후</option></select><select aria-label="시" value={hour12} onChange={e=>update(period,Number(e.target.value),minuteValue)}>{Array.from({length:12},(_,i)=>i+1).map(h=><option key={h} value={h}>{pad(h)}시</option>)}</select><select aria-label="분" value={minuteValue} onChange={e=>update(period,hour12,Number(e.target.value))}>{minutes.map(m=><option key={m} value={m}>{pad(m)}분</option>)}</select></div>;
}

function SettingsModal({ calendars, defaultCalendarKey, autoSyncMinutes, showLunar, onDefaultCalendar, onAutoSync, onToggleLunar, onClose }: { calendars: CalendarItem[]; defaultCalendarKey: string; autoSyncMinutes: number; showLunar: boolean; onDefaultCalendar: (key:string)=>void; onAutoSync:(minutes:number)=>void; onToggleLunar:()=>void; onClose:()=>void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="connect-modal settings-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="settings-heading"><span>⚙</span><div><h2>캘린더 설정</h2><p>내 사용 방식에 맞게 OnCal을 설정하세요.</p></div></div><div className="settings-group"><label><span><b>자동 동기화</b><small>다른 앱에서 변경된 일정을 자동으로 불러옵니다.</small></span><select value={autoSyncMinutes} onChange={e=>onAutoSync(Number(e.target.value))}><option value={0}>자동 동기화 끄기</option><option value={1}>1분마다</option><option value={5}>5분마다</option><option value={15}>15분마다</option></select></label><label><span><b>기본 저장 캘린더</b><small>새 일정을 만들 때 처음 선택되는 캘린더입니다.</small></span><select value={defaultCalendarKey} onChange={e=>onDefaultCalendar(e.target.value)}>{(["icloud","google","daou"] as Source[]).map(source=><optgroup label={sourceLabel[source]} key={source}>{calendars.filter(c=>c.source===source).map(c=><option key={`${source}:${c.id}`} value={`${source}:${c.id}`}>{c.name}</option>)}</optgroup>)}</select></label><div className="settings-line"><span><b>대한민국 음력</b><small>월간 달력 날짜에 음력 월·일을 표시합니다.</small></span><button className={`toggle-switch ${showLunar?"on":""}`} role="switch" aria-checked={showLunar} onClick={onToggleLunar}><i/></button></div></div><div className="settings-footer"><small>설정은 이 기기에 자동 저장됩니다.</small><button className="modal-connect" onClick={onClose}>완료</button></div></section></div>;
}
