"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import KoreanLunarCalendar from "korean-lunar-calendar";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/client";
import { connectionAction, connectionRedirectPath, defaultCalendarState, eventOccursOnDate, inclusiveEventEndDate, monthEventSegments, moveCursorToMonth, moveCursorToYear, orderedDateRange, surroundingYears } from "@/app/lib/calendar-ui";
import { attachLunarSeriesMetadata, eventManipulationState, eventResizeEdges, isDragGesture, moveEventToDate, persistCompletedEventGesture, resolveCalendarDropDate, resizeEventToDate, updateEventGesture, type EventDateDraft, type LunarEventInstanceMetadata } from "@/app/lib/event-manipulation";
import { expandSearchYears, normalizeExpandedSources, searchCalendarEvents } from "@/app/lib/calendar-search";
import { mapConnectionError, type ConnectionErrorPayload } from "@/app/lib/connection-errors";
import { mergeProviderResults, type ProviderState } from "@/app/lib/provider-loading";
import { ConnectionErrorPanel } from "@/app/components/connection-error-panel";
import { LegalLinks } from "@/app/components/legal-links";

type Source = "icloud" | "google" | "daou";
type View = "day" | "week" | "month";
type CalendarItem = { id: string; name: string; color: string; primary?: boolean; selected?: boolean; source: Source };
type EventItem = { id: string; providerEventId?: string; repeatSeriesId?:string; resourceUrl?: string; calendarId: string; calendarName?: string; calendarColor?: string; title: string; start: string; end: string; allDay: boolean; recurrence?: string; source: Source };
type EventForm = { title: string; startDate: string; endDate: string; startTime: string; endTime: string; allDay: boolean; recurrence: string; calendarKey: string };
type LunarSeries = { id:string; source:Source; calendar_id:string; title:string; instances:Array<{provider_event_id?:string;resource_url?:string;solar_date:string}> };
type EventDragState = { event:EventItem; mode:"move"|"resize-start"|"resize-end"; origin:{x:number;y:number}; targetDate:string; pointerId:number; dragging:boolean };

const sourceLabel: Record<Source, string> = { icloud: "iCloud", google: "Google", daou: "CalDAV" };
const sourcePath: Record<Source, string> = { icloud: "/api/icloud/events", google: "/api/google/events", daou: "/api/caldav/events" };
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const parseEventDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
const isPersonalCompanyCalendar = (name?: string) => (name || "").replaceAll(" ", "").toLowerCase() === "내일정";
const isCalendarWritable = (calendar: CalendarItem) => calendar.source !== "daou" || isPersonalCompanyCalendar(calendar.name);
const enableEventDrag = false;

function lunarLabel(d: Date) { const lunar = new KoreanLunarCalendar(); if (!lunar.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) return ""; const v = lunar.getLunarCalendar(); return `음 ${v.intercalation ? "윤" : ""}${v.month}.${v.day}`; }
function lunarParts(d: Date) { const lunar=new KoreanLunarCalendar(); if(!lunar.setSolarDate(d.getFullYear(),d.getMonth()+1,d.getDate())) throw new Error("음력 변환 범위를 벗어났습니다."); return lunar.getLunarCalendar(); }
function lunarSolarDate(year:number,month:number,day:number,isLeap=false) { const lunar=new KoreanLunarCalendar(); let appliedDay=day; if(!lunar.setLunarDate(year,month,appliedDay,isLeap)){if(day!==30||!lunar.setLunarDate(year,month,29,isLeap))return null;appliedDay=29;} const solar=lunar.getSolarCalendar(); const verified=lunar.getLunarCalendar(); if(verified.year!==year||verified.month!==month||verified.day!==appliedDay||Boolean(verified.intercalation)!==isLeap)return null; return {lunarYear:year,solarDate:`${solar.year}-${pad(solar.month)}-${pad(solar.day)}`,adjusted:appliedDay!==day}; }
function nextLunarOccurrences(date:Date,count=3) { const base=lunarParts(date); const occurrences=[]; for(let year=base.year;occurrences.length<count&&year<=base.year+8;year++){const value=lunarSolarDate(year,base.month,base.day,false);if(value)occurrences.push(value);} return {base,occurrences}; }
const holidayCache = new Map<number, Map<string, string>>();
function solarFromLunar(year: number, month: number, day: number) { const lunar = new KoreanLunarCalendar(); if (!lunar.setLunarDate(year, month, day, false)) return null; const value = lunar.getSolarCalendar(); return new Date(value.year, value.month - 1, value.day); }
function koreanHolidays(year: number) {
  const cached = holidayCache.get(year); if (cached) return cached;
  const holidays = new Map<string, string>();
  const add = (date: Date, name: string) => holidays.set(dateKey(date), name);
  const fixed: Array<[number, number, string]> = [[1,1,"신정"],[3,1,"삼일절"],[5,5,"어린이날"],[6,6,"현충일"],[8,15,"광복절"],[10,3,"개천절"],[10,9,"한글날"],[12,25,"성탄절"]];
  if (year >= 2026) fixed.push([7,17,"제헌절"]);
  fixed.forEach(([month,day,name])=>add(new Date(year,month-1,day),name));
  const seollal=solarFromLunar(year,1,1), buddha=solarFromLunar(year,4,8), chuseok=solarFromLunar(year,8,15);
  if(seollal) [-1,0,1].forEach((offset,index)=>add(addDays(seollal,offset),["설날 연휴","설날","설날 연휴"][index]));
  if(buddha) add(buddha,"부처님오신날");
  if(chuseok) [-1,0,1].forEach((offset,index)=>add(addDays(chuseok,offset),["추석 연휴","추석","추석 연휴"][index]));
  const reserveSubstitute = (date: Date, name: string) => { let substitute=addDays(date,1); while(substitute.getDay()===0||substitute.getDay()===6||holidays.has(dateKey(substitute))) substitute=addDays(substitute,1); add(substitute,`대체공휴일(${name})`); };
  fixed.filter(([month,day])=>!(month===1&&day===1)&&!(month===6&&day===6)&&!(month===7&&day===17)).forEach(([month,day,name])=>{const date=new Date(year,month-1,day);if(date.getDay()===0||date.getDay()===6)reserveSubstitute(date,name);});
  if(buddha&&(buddha.getDay()===0||buddha.getDay()===6)) reserveSubstitute(buddha,"부처님오신날");
  if(seollal){const period=[addDays(seollal,-1),seollal,addDays(seollal,1)];if(period.some(date=>date.getDay()===0))reserveSubstitute(period[2],"설날");}
  if(chuseok){const period=[addDays(chuseok,-1),chuseok,addDays(chuseok,1)];if(period.some(date=>date.getDay()===0))reserveSubstitute(period[2],"추석");}
  if(year===2026) add(new Date(2026,5,3),"지방선거일");
  holidayCache.set(year,holidays); return holidays;
}
const holidayLabel = (date: Date) => koreanHolidays(date.getFullYear()).get(dateKey(date)) || "";
function rangeFor(cursor: Date, view: View) { if (view === "month") { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = addDays(first, -first.getDay()); return { start, end: addDays(start, 42) }; } if (view === "week") { const start = addDays(startOfDay(cursor), -cursor.getDay()); return { start, end: addDays(start, 7) }; } return { start: startOfDay(cursor), end: addDays(startOfDay(cursor), 1) }; }
function defaultForm(date: Date, calendarKey = "") : EventForm { const dateValue=dateKey(date); return { title: "", startDate: dateValue, endDate: dateValue, startTime: "09:00", endTime: "10:00", allDay: false, recurrence: "", calendarKey }; }
async function beginGoogleConnection(setBusy:(busy:boolean)=>void,setMessage:(message:string)=>void,intent:Source="google") { setBusy(true); setMessage(""); const supabase=getSupabaseBrowserClient(); const next=encodeURIComponent(connectionRedirectPath(intent)); const {error}=await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:`${location.origin}/auth/callback?next=${next}`, scopes:"https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events", queryParams:{ access_type:"offline", prompt:"consent", include_granted_scopes:"true" } } }); if(error){setMessage(error.message.includes("provider is not enabled")?"Google 로그인을 사용하려면 관리자 설정이 필요합니다.":"Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");setBusy(false);} }

export default function Home() {
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<Source>("google");
  const pendingConnection = useRef<Source | null>(null);
  const [guestEntered, setGuestEntered] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<View>("month");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [connected, setConnected] = useState<Record<Source, boolean>>({ icloud: false, google: false, daou: false });
  const providerState = useRef<ProviderState>({
    connected: { icloud: false, google: false, daou: false },
    configured: { icloud: false, google: false, daou: true },
    calendars: [],
    events: [],
  });
  const [sourceVisible, setSourceVisible] = useState<Record<Source, boolean>>({ icloud: true, google: true, daou: true });
  const [calendarVisible, setCalendarVisible] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const visitTracked = useRef(false);
  const track = useCallback((eventName: string, provider?: string, success = true) => { void fetch("/api/analytics/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventName, provider, success }) }).catch(() => {}); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const [showLunar, setShowLunar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState(1);
  const [defaultCalendarKey, setDefaultCalendarKey] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [overflowPopup, setOverflowPopup] = useState<{date:Date;left:number;top:number} | null>(null);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [form, setForm] = useState<EventForm>(() => defaultForm(new Date()));
  const [saving, setSaving] = useState(false);
  const [calDavModal, setCalDavModal] = useState(false);
  const [calDavForm, setCalDavForm] = useState({ serverUrl: "", email: "", password: "" });
  const [showCalDavPassword, setShowCalDavPassword] = useState(false);
  const [calDavConnecting, setCalDavConnecting] = useState(false);
  const [calDavError, setCalDavError] = useState<ConnectionErrorPayload | null>(null);
  const [iCloudModal, setICloudModal] = useState(false);
  const [iCloudForm, setICloudForm] = useState({ email: "", password: "" });
  const [showICloudPassword, setShowICloudPassword] = useState(false);
  const [iCloudConnecting, setICloudConnecting] = useState(false);
  const [iCloudError, setICloudError] = useState<ConnectionErrorPayload | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState<Record<Source, boolean>>({ icloud: true, google: true, daou: true });
  const [sourceMenu, setSourceMenu] = useState<Source|null>(null);
  const [dateJump, setDateJump] = useState<"year"|"month"|null>(null);
  const [yearPage, setYearPage] = useState(() => new Date().getFullYear());
  const [deletePrompt, setDeletePrompt] = useState<{event:EventItem;series?:LunarSeries}|null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchYears, setSearchYears] = useState<number[]>([new Date().getFullYear()]);
  const [searchResults, setSearchResults] = useState<EventItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchLimit, setSearchLimit] = useState(50);
  const hasLoadedCalendar = useRef(false);

  useEffect(()=>{const closeMenus=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest(".source-manage, .date-jump")){setSourceMenu(null);setDateJump(null);}};const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setSourceMenu(null);setDateJump(null);}};document.addEventListener("pointerdown",closeMenus);document.addEventListener("keydown",closeOnEscape);return()=>{document.removeEventListener("pointerdown",closeMenus);document.removeEventListener("keydown",closeOnEscape);};},[]);
  const searchEventCache = useRef(new Map<number, EventItem[]>());
  const visibleRange = useMemo(() => rangeFor(cursor, view), [cursor, view]);
  const visibleRangeStart = visibleRange.start.getTime();
  const visibleRangeEnd = visibleRange.end.getTime();

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const query = `?from=${encodeURIComponent(visibleRange.start.toISOString())}&to=${encodeURIComponent(visibleRange.end.toISOString())}`;
      const sources: Source[] = ["icloud", "google", "daou"];
      const [results, lunarSeries] = await Promise.all([
        Promise.all(sources.map(async source => {
          try {
            const response = await fetch(sourcePath[source] + query, { signal: AbortSignal.timeout(12_000) });
            const data = await response.json();
            if (!response.ok && data.connected !== false) return { source, kind: "failure" as const };
            return { source, kind: "success" as const, data };
          } catch {
            return { source, kind: "failure" as const };
          }
        })),
        fetch("/api/lunar/series", { signal: AbortSignal.timeout(12_000) }).then(async response => response.ok ? await response.json() : { instances:[] }).catch(() => ({ instances:[] })),
      ]);
      const next = mergeProviderResults(providerState.current, results);
      providerState.current = next;
      let savedVisibility: Record<string, boolean> = {}; try { savedVisibility = JSON.parse(localStorage.getItem("oncal-calendar-visibility") || "{}"); } catch { savedVisibility = {}; }
      const visibility: Record<string, boolean> = {};
      for (const calendar of next.calendars) visibility[`${calendar.source}:${calendar.id}`] = savedVisibility[`${calendar.source}:${calendar.id}`] ?? calendar.selected !== false;
      setConnected(next.connected); setCalendars(next.calendars); setCalendarVisible(visibility);
      setEvents(attachLunarSeriesMetadata(next.events as EventItem[], lunarSeries.instances as LunarEventInstanceMetadata[] || []));
      hasLoadedCalendar.current = true;
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRangeStart, visibleRangeEnd]);

  useEffect(() => { const openPending=()=>{const intent=pendingConnection.current;if(intent==="icloud")setICloudModal(true);if(intent==="daou")setCalDavModal(true);pendingConnection.current=null;}; const supabase = getSupabaseBrowserClient(); supabase.auth.getUser().then(({ data }) => { const email=data.user?.email||null; setUserEmail(email); setAuthReady(true); if(email)openPending(); }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { const email=session?.user.email||null; setUserEmail(email); setAuthReady(true); if(email)openPending(); }); return () => listener.subscription.unsubscribe(); }, []);
  // Initial browser settings must be read after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setShowLunar(localStorage.getItem("oncal-show-lunar") === "true"); setAutoSyncMinutes(Number(localStorage.getItem("oncal-auto-sync") || "1")); setDefaultCalendarKey(localStorage.getItem("oncal-default-calendar") || ""); try{setSourceExpanded(normalizeExpandedSources(JSON.parse(localStorage.getItem("oncal-source-expanded")||"null")));}catch{setSourceExpanded(normalizeExpandedSources(null));} const params = new URLSearchParams(location.search); const result = params.get("google") || params.get("icloud") || params.get("caldav"); const connect=params.get("connect"); if(connect==="icloud"||connect==="daou")pendingConnection.current=connect; if (result === "connected") setNotice("캘린더가 연결됐어요."); if (result === "failed") setNotice("연결에 실패했어요. 로그인 정보를 확인해 주세요."); if (result === "setup-required") setNotice("연동 설정이 아직 완료되지 않았어요."); if (result||connect) history.replaceState({}, "", location.pathname); }, []);
  // Calendar loading synchronizes React state with the connected providers.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (userEmail) { if (!visitTracked.current) { visitTracked.current = true; track("visit", "app"); } loadEvents(); } else { visitTracked.current = false; providerState.current = { connected:{ icloud:false, google:false, daou:false }, configured:{ icloud:false, google:false, daou:true }, calendars:[], events:[] }; setLoading(false); setEvents([]); setCalendars([]); setConnected({ icloud:false, google:false, daou:false }); } }, [loadEvents, userEmail, track]);
  useEffect(() => { if (!autoSyncMinutes || !userEmail) return; const timer = window.setInterval(loadEvents, autoSyncMinutes * 60_000); return () => window.clearInterval(timer); }, [autoSyncMinutes, loadEvents, userEmail]);
  useEffect(() => { if(!searchOpen||!userEmail||searchQuery.trim().length<2)return; let active=true; const timer=window.setTimeout(async()=>{setSearchLoading(true);setSearchError("");try{const yearlyEvents=await Promise.all(searchYears.map(async year=>{const cached=searchEventCache.current.get(year);if(cached)return cached;const from=new Date(year,0,1).toISOString();const to=new Date(year+1,0,1).toISOString();const query=`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;const sourceResults=await Promise.all((["icloud","google","daou"] as Source[]).map(async source=>{try{const response=await fetch(sourcePath[source]+query);if(!response.ok)return[];const data=await response.json();return(data.events??[]).filter((event:EventItem)=>event.start).map((event:EventItem)=>({...event,source}));}catch{return[];}}));const combined=sourceResults.flat();searchEventCache.current.set(year,combined);return combined;}));if(active){setSearchResults(searchCalendarEvents(yearlyEvents.flat(),searchQuery));setSearchLimit(50);}}catch{if(active){setSearchResults([]);setSearchError("일정을 검색하지 못했어요. 잠시 후 다시 시도해 주세요.");}}finally{if(active)setSearchLoading(false);}},400);return()=>{active=false;window.clearTimeout(timer);};},[searchOpen,userEmail,searchQuery,searchYears]);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (editorOpen && !saving) setEditorOpen(false); else if (overflowPopup) setOverflowPopup(null); else if (searchOpen) setSearchOpen(false); else if (iCloudModal && !iCloudConnecting) setICloudModal(false); else if (calDavModal && !calDavConnecting) setCalDavModal(false); else if (settingsOpen) setSettingsOpen(false); else if (authOpen) setAuthOpen(false); else setAccountOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [editorOpen, saving, overflowPopup, searchOpen, iCloudModal, iCloudConnecting, calDavModal, calDavConnecting, settingsOpen, authOpen]);

  const filtered = useMemo(() => events.filter(e => sourceVisible[e.source] && calendarVisible[`${e.source}:${e.calendarId}`] !== false), [events, sourceVisible, calendarVisible]);
  const step = (direction: number) => setCursor(d => view === "month" ? new Date(d.getFullYear(), d.getMonth() + direction, 1) : addDays(d, direction * (view === "week" ? 7 : 1)));
  const writableCalendars = calendars.filter(isCalendarWritable);
  const defaultState = defaultCalendarState(writableCalendars, defaultCalendarKey);
  const firstCalendarKey = defaultState.selectedKey;

  const openCreate = (date = cursor, title = "") => { if (!userEmail) { setAuthOpen(true); return; } setEditing(null); setForm({ ...defaultForm(date, firstCalendarKey), title }); setEditorOpen(true); };
  const openCreateRange = (startDate: Date, endDate: Date) => { if (!userEmail) { setAuthOpen(true); return; } const range=orderedDateRange(dateKey(startDate),dateKey(endDate)); setEditing(null); setForm({ ...defaultForm(startDate,firstCalendarKey),...range,allDay:true }); setEditorOpen(true); };
  const openEdit = (event: EventItem) => { const start = parseEventDate(event.start); const end = parseEventDate(event.end || event.start); setEditing(event); setForm({ title: event.title, startDate: dateKey(start), endDate: inclusiveEventEndDate(event), startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`, endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`, allDay: event.allDay, recurrence: event.recurrence || "", calendarKey: `${event.source}:${event.calendarId}` }); setEditorOpen(true); };

  const payload = () => { const [source, ...calendarParts] = form.calendarKey.split(":"); const calendarId = calendarParts.join(":"); const start = form.allDay ? form.startDate : new Date(`${form.startDate}T${form.startTime}`).toISOString(); const end = form.allDay ? dateKey(addDays(new Date(`${form.endDate}T00:00:00`), 1)) : new Date(`${form.endDate}T${form.endTime}`).toISOString(); return { source: source as Source, calendarId, title: form.title.trim(), start, end, allDay: form.allDay, recurrence: form.recurrence, providerEventId: editing?.providerEventId, resourceUrl: editing?.resourceUrl }; };
  const saveEvent = async () => {
    if (editing?.source === "daou" && !isPersonalCompanyCalendar(editing.calendarName)) { setNotice("이 CalDAV 일정은 읽기 전용입니다."); return; }
    if (!form.title.trim() || !form.calendarKey) { setNotice("제목과 저장할 캘린더를 선택해 주세요."); return; }
    if (form.endDate < form.startDate) { window.alert("종료일은 시작일보다 빠를 수 없습니다."); return; }
    if (!form.allDay && `${form.endDate}T${form.endTime}` <= `${form.startDate}T${form.startTime}`) { window.alert("종료 날짜와 시간은 시작보다 늦어야 합니다."); return; }
    if (form.recurrence === "LUNAR_YEARLY" && form.startDate !== form.endDate) { window.alert("음력 반복 일정은 하루 일정으로 등록해 주세요."); return; }
    setSaving(true);
    try {
      if (!editing && form.recurrence === "LUNAR_YEARLY") {
        const [source,...calendarParts]=form.calendarKey.split(":"); const calendarId=calendarParts.join(":"); const seriesId=crypto.randomUUID();
        const selectedDate=new Date(`${form.startDate}T00:00:00`); const {base,occurrences}=nextLunarOccurrences(selectedDate,3);
        if(occurrences.length<3) throw new Error("향후 음력 날짜를 계산하지 못했습니다.");
        const durationMinutes=form.allDay?null:(Number(form.endTime.slice(0,2))*60+Number(form.endTime.slice(3)))-(Number(form.startTime.slice(0,2))*60+Number(form.startTime.slice(3)));
        const created:Array<{lunarYear:number;solarDate:string;providerEventId?:string;resourceUrl?:string}>=[];
        for(const occurrence of occurrences){const start=form.allDay?occurrence.solarDate:new Date(`${occurrence.solarDate}T${form.startTime}`).toISOString();const end=form.allDay?dateKey(addDays(new Date(`${occurrence.solarDate}T00:00:00`),1)):new Date(new Date(`${occurrence.solarDate}T${form.startTime}`).getTime()+(durationMinutes||0)*60000).toISOString();const response=await fetch(sourcePath[source as Source],{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({calendarId,title:form.title.trim(),start,end,allDay:form.allDay,recurrence:"",description:"온달력 음력 반복"})});const data=await response.json();if(!response.ok)throw new Error(data.error==="read_only_calendar"?"‘내 일정’ 외 CalDAV 캘린더는 읽기 전용입니다.":"음력 반복 일정을 외부 캘린더에 저장하지 못했습니다.");created.push({lunarYear:occurrence.lunarYear,solarDate:occurrence.solarDate,providerEventId:data.providerEventId,resourceUrl:data.resourceUrl});}
        const seriesResponse=await fetch("/api/lunar/series",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:seriesId,source,calendarId,title:form.title.trim(),lunarMonth:base.month,lunarDay:base.day,isLeapMonth:false,allDay:form.allDay,startTime:form.allDay?null:form.startTime,durationMinutes,instances:created})});
        if(!seriesResponse.ok)throw new Error("일정은 생성됐지만 음력 반복 정보를 저장하지 못했습니다.");
        setEditorOpen(false); track("event_create", source); setNotice(`매년 음력 ${base.month}월 ${base.day}일 일정 3년 치를 저장했어요.`); void loadEvents(); return;
      }
      const body=payload(); const movingAcrossSources=Boolean(editing&&body.source!==editing.source); let response:Response; let data:Record<string,unknown>; let moveWarning=false;
      if(movingAcrossSources){response=await fetch(sourcePath[body.source],{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,providerEventId:undefined,resourceUrl:undefined})});data=await response.json();if(response.ok&&editing){const remove=await fetch(sourcePath[editing.source],{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({...editing,scope:"single"})});moveWarning=!remove.ok;}}else{response=await fetch(sourcePath[body.source],{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});data=await response.json();}
      if(!response.ok){if(data.error==="google_reconnect_required")throw new Error("Google 쓰기 권한이 필요합니다. Google 연결을 해제한 뒤 다시 연결해 주세요.");if(data.error==="read_only_calendar")throw new Error("‘내 일정’ 외 CalDAV 캘린더는 읽기 전용입니다.");throw new Error("일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");}
      setEditorOpen(false);track(editing?"event_update":"event_create", body.source);setNotice(moveWarning?"새 캘린더에 저장했지만 기존 일정은 삭제하지 못했어요.":editing?"일정을 수정했어요.":"새 일정을 저장했어요.");void loadEvents();
    } catch(e){setNotice(e instanceof Error?e.message:"저장에 실패했어요.");} finally {setSaving(false);}
  };
  const saveDraggedEvent = useCallback((event:EventItem, mode:EventDragState["mode"], targetDate:string|null, gesture:{dragging:boolean;cancelled?:boolean}, onDraft:(draft:EventDateDraft)=>void) => persistCompletedEventGesture(event,mode,targetDate,gesture,{
    sourcePath, fetcher:(url,options)=>fetch(url,options), loadEvents, setSaving, onDraft, setNotice,
  }), [loadEvents]);
  const deleteExternalEvent = async (event:EventItem,scope:"single"|"all") => {
    if(scope==="single"&&event.recurrence&&event.source!=="google") return fetch(sourcePath[event.source],{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...event,exclusionDate:event.start})});
    return fetch(sourcePath[event.source],{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({...event,scope})});
  };
  const finishDelete = async (scope:"single"|"all", prompt=deletePrompt) => { if(!prompt)return; setSaving(true); try { const {event,series}=prompt; if(series){const targets=scope==="all"?series.instances:[{provider_event_id:event.providerEventId,resource_url:event.resourceUrl,solar_date:event.start}];for(const item of targets){const response=await deleteExternalEvent({...event,providerEventId:item.provider_event_id,resourceUrl:item.resource_url,start:item.solar_date},"single");if(!response.ok)throw new Error();}const metadata=await fetch("/api/lunar/series",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({seriesId:series.id,scope,providerEventId:event.providerEventId,resourceUrl:event.resourceUrl})});if(!metadata.ok)throw new Error();}else{const response=await deleteExternalEvent(event,scope);if(!response.ok)throw new Error();}track("event_delete", event.source);setDeletePrompt(null);setEditorOpen(false);setNotice(scope==="all"?"반복 일정을 모두 삭제했어요.":"선택한 일정만 삭제했어요.");void loadEvents();}catch{setNotice("일정을 삭제하지 못했어요.");}finally{setSaving(false);} };
  const deleteEvent = async () => { if(!editing)return;setSaving(true);try{const params=new URLSearchParams();if(editing.providerEventId)params.set("providerEventId",editing.providerEventId);if(editing.resourceUrl)params.set("resourceUrl",editing.resourceUrl);const lookup=await fetch(`/api/lunar/series?${params}`);const data=lookup.ok?await lookup.json():{series:null};if(data.series||editing.recurrence||editing.repeatSeriesId){setDeletePrompt({event:editing,series:data.series||undefined});return;}if(confirm("이 일정을 삭제할까요?"))await finishDelete("single",{event:editing});}finally{setSaving(false);} };

  const toggleCalendar = (key: string) => { const next = { ...calendarVisible, [key]: calendarVisible[key] === false }; setCalendarVisible(next); localStorage.setItem("oncal-calendar-visibility", JSON.stringify(next)); };
  const toggleLunar = () => { const next = !showLunar; setShowLunar(next); localStorage.setItem("oncal-show-lunar", String(next)); };
  const changeAutoSync = (minutes: number) => { setAutoSyncMinutes(minutes); localStorage.setItem("oncal-auto-sync", String(minutes)); };
  const changeDefaultCalendar = (key: string) => { setDefaultCalendarKey(key); localStorage.setItem("oncal-default-calendar", key); };
  const toggleSourceExpanded = (source: Source) => { const next={...sourceExpanded,[source]:!sourceExpanded[source]};setSourceExpanded(next);localStorage.setItem("oncal-source-expanded",JSON.stringify(next)); };
  const openSearch = () => { searchEventCache.current.clear();setSearchQuery("");setSearchYears([new Date().getFullYear()]);setSearchResults([]);setSearchError("");setSearchLimit(50);setSearchOpen(true); };
  const selectSearchResult = (event: EventItem) => { const date=startOfDay(parseEventDate(event.start));setSearchOpen(false);setCursor(date);setView("day");openEdit(event); };
  const requestConnection = (intent: Source) => { const action=connectionAction(intent,Boolean(userEmail)); if(action.kind==="connect"){if(intent==="google"){beginGoogleConnection(()=>{},setNotice,"google");}else if(intent==="icloud")setICloudModal(true);else setCalDavModal(true);return;} if(intent==="google"){beginGoogleConnection(()=>{},setNotice,"google");return;} setAuthIntent(intent);setAuthOpen(true); };
  const connectICloud = async () => { setICloudError(null); setICloudConnecting(true); try { const response = await fetch("/api/icloud/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(iCloudForm) }); const data = await response.json() as { connected?: boolean; error?: ConnectionErrorPayload }; if (!response.ok || !data.connected) { setICloudError(data.error ?? mapConnectionError("icloud", "authenticate", new Error("CONNECTION_FAILED"))); return; } setICloudError(null); setICloudModal(false); setNotice("iCloud 캘린더가 온달력 계정에 안전하게 저장됐어요."); void loadEvents(); } catch (error) { setICloudError(mapConnectionError("icloud", "authenticate", error)); } finally { setICloudConnecting(false); } };
  const connectCalDav = async () => { setCalDavError(null); setCalDavConnecting(true); try { const response = await fetch("/api/caldav/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calDavForm) }); const data = await response.json() as { connected?: boolean; error?: ConnectionErrorPayload }; if (!response.ok || !data.connected) { setCalDavError(data.error ?? mapConnectionError("caldav", "authenticate", new Error("CONNECTION_FAILED"))); return; } setCalDavError(null); setCalDavModal(false); setNotice("CalDAV 일정이 연결됐어요."); void loadEvents(); } catch (error) { setCalDavError(mapConnectionError("caldav", "authenticate", error)); } finally { setCalDavConnecting(false); } };
  const disconnectSource = async (source: Source) => { const path = source === "icloud" ? "/api/icloud/disconnect" : source === "google" ? "/api/google/disconnect" : "/api/caldav/disconnect"; const response = await fetch(path, { method: "POST", redirect: "follow" }); if (response.ok) { setNotice(`${sourceLabel[source]} 연결을 해제했어요.`); await loadEvents(); } else setNotice("연결을 해제하지 못했어요."); };
  const signOut = async () => { await getSupabaseBrowserClient().auth.signOut(); setEvents([]); setCalendars([]); setConnected({ icloud:false, google:false, daou:false }); setAccountOpen(false); setGuestEntered(false); };
  const quickAdd = () => { if (!quickInput.trim()) return; openCreate(cursor, quickInput.trim()); setQuickInput(""); };

  if (!authReady) return <div className="auth-loading"><span className="brand-mark">온</span><p>온달력을 준비하고 있어요…</p></div>;
  if (!userEmail && !guestEntered) return <LandingScreen onExplore={()=>setGuestEntered(true)}/>;

  return <main className="app-shell">
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="메뉴 열기"><span/><span/></button>
      <a className="brand" href="#"><span className="brand-mark">온</span><span>온달력</span></a>
      <div className="date-nav"><button onClick={() => step(-1)} aria-label="이전">‹</button><button className="today-button" onClick={() => setCursor(startOfDay(new Date()))}>오늘</button><button onClick={() => step(1)} aria-label="다음">›</button><div className="date-title date-jump"><h1><button onClick={()=>{setYearPage(cursor.getFullYear());setDateJump(dateJump==="year"?null:"year");}} aria-label="연도 선택">{cursor.getFullYear()}년</button><button onClick={()=>setDateJump(dateJump==="month"?null:"month")} aria-label="월 선택">{cursor.getMonth()+1}월</button>{view==="day"&&<em>{cursor.getDate()}일</em>}{view==="week"&&<em>주</em>}</h1>{dateJump==="year"&&<div className="date-jump-popover year-picker"><header><button onClick={()=>setYearPage(year=>year-12)}>‹</button><b>{yearPage-5}–{yearPage+6}</b><button onClick={()=>setYearPage(year=>year+12)}>›</button></header><div>{surroundingYears(yearPage).map(year=><button key={year} className={year===cursor.getFullYear()?"selected":""} onClick={()=>{setCursor(value=>moveCursorToYear(value,year));setDateJump(null);}}>{year}</button>)}</div></div>}{dateJump==="month"&&<div className="date-jump-popover month-picker"><b>월 선택</b><div>{Array.from({length:12},(_,month)=><button key={month} className={month===cursor.getMonth()?"selected":""} onClick={()=>{setCursor(value=>moveCursorToMonth(value,month));setDateJump(null);}}>{month+1}월</button>)}</div></div>}<span>오늘 · {new Date().toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric", weekday:"long" })}</span></div></div>
      <div className="header-actions"><button className="search-button" onClick={openSearch} aria-label="전체 일정 검색"><span aria-hidden="true">⌕</span></button><div className="view-switch">{(["day","week","month"] as View[]).map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "day" ? "일" : v === "week" ? "주" : "월"}</button>)}</div>{userEmail?<div className="account-menu"><button className="avatar" onClick={() => setAccountOpen(!accountOpen)}>{userEmail.slice(0,2).toUpperCase()}</button>{accountOpen&&<div className="account-popover"><b>{userEmail}</b><small>캘린더 연결이 모든 기기에 동기화됩니다.</small><button onClick={signOut}>로그아웃</button></div>}</div>:<button className="guest-connect" onClick={()=>setAuthOpen(true)}>캘린더 연결</button>}</div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button className="new-event" onClick={() => openCreate()}><span>+</span> 새 일정</button>
        <MiniCalendar cursor={cursor} onSelect={d => { setCursor(d); setView("day"); }} />
        <section className="calendar-list"><div className="section-heading"><b>내 캘린더</b><button onClick={() => setSettingsOpen(true)} aria-label="설정 열기">···</button></div>
          {(["icloud","google","daou"] as Source[]).map(source => { const sourceCalendars=calendars.filter(c=>c.source===source);const isConnected=connected[source]; return <Fragment key={source}><div className={`calendar-row calendar-source-row ${isConnected?"connected":"disconnected"}`}><label className="source-visibility"><input type="checkbox" checked={sourceVisible[source]} onChange={() => setSourceVisible({ ...sourceVisible, [source]: !sourceVisible[source] })}/><span className={`checkmark ${source}`}>✓</span><span>{sourceLabel[source]}</span></label><span className={`source-status ${isConnected?"connected":""}`}><i/>{isConnected?"연결됨":source==="google"?"재연결 필요":"미연결"}</span>{isConnected&&sourceCalendars.length>0&&<button className={`source-fold ${sourceExpanded[source]?"open":""}`} onClick={()=>toggleSourceExpanded(source)} aria-label={`${sourceLabel[source]} ${sourceExpanded[source]?"접기":"펼치기"}`} aria-expanded={sourceExpanded[source]}>⌄</button>}{isConnected?<div className="source-manage"><button onClick={()=>setSourceMenu(sourceMenu===source?null:source)} aria-label={`${sourceLabel[source]} 관리`}>···</button>{sourceMenu===source&&<div><button onClick={()=>{setSourceMenu(null);disconnectSource(source);}}>연결 해제</button></div>}</div>:<button className="source-connect-inline" onClick={()=>requestConnection(source)}>{source==="google"?"다시 연결":"연결"}</button>}</div>{isConnected && sourceVisible[source] && sourceExpanded[source] && <div className="google-calendar-children">{sourceCalendars.map(c => { const key = `${source}:${c.id}`; return <label className="calendar-row calendar-child" key={key}><input type="checkbox" checked={calendarVisible[key] !== false} onChange={() => toggleCalendar(key)}/><span className="checkmark google-child" style={{backgroundColor:c.color}}>✓</span><span className="calendar-child-name">{c.name}</span>{c.primary && <em>기본</em>}</label>; })}</div>}</Fragment>; })}
        </section>
        <div className={`sync-card ${userEmail?"":"guest"}`}><span className="sync-icon">⇅</span><div><b>{!userEmail?"둘러보기 중":loading ? "동기화 중" : "모두 동기화됨"}</b><small>{!userEmail?"연결하면 내 일정이 표시돼요":loading ? "일정을 불러오고 있어요" : "최신 일정 표시 중"}</small></div><span className="status-dot"/></div><p className="privacy-note">{userEmail?"연결된 캘린더에 직접 저장됩니다.":"로그인 없이 달력을 자유롭게 둘러보세요."}</p><LegalLinks compact/>
      </aside>
      <section className="calendar-area"><div className="quick-add"><span className="spark">✦</span><input value={quickInput} onChange={e => setQuickInput(e.target.value)} onKeyDown={e => e.key === "Enter" && quickAdd()} placeholder="일정 제목을 입력하고 날짜·시간을 선택하세요"/><span className="shortcut">Enter</span><button onClick={quickAdd}>일정 추가</button></div>
        <CalendarView key={view} view={view} cursor={cursor} range={visibleRange} events={filtered} loading={loading} showLunar={showLunar} saving={saving} saveDraggedEvent={saveDraggedEvent} onCreate={openCreate} onCreateRange={openCreateRange} onEdit={openEdit} onShowMore={(date,anchor)=>setOverflowPopup({date,left:Math.max(10,Math.min(anchor.left,window.innerWidth-330)),top:Math.max(10,Math.min(anchor.bottom+5,window.innerHeight-380))})}/>{loading&&userEmail&&!hasLoadedCalendar.current&&<div className="calendar-loading-overlay" role="status"><span className="loading-orb">온</span><b>캘린더를 준비하고 있어요</b><small>연결된 일정을 불러오는 중입니다</small></div>}
      </section>
    </div>
    {editorOpen && <EventEditor form={form} setForm={setForm} calendars={calendars} editing={editing} saving={saving} onClose={() => setEditorOpen(false)} onSave={saveEvent} onDelete={deleteEvent}/>} 
    {overflowPopup && <EventOverflowPopup {...overflowPopup} events={filtered} onEdit={event=>{setOverflowPopup(null);openEdit(event);}} onClose={()=>setOverflowPopup(null)}/>}
    {searchOpen && <SearchModal authenticated={Boolean(userEmail)} query={searchQuery} onQuery={setSearchQuery} years={searchYears} results={searchResults} loading={searchLoading} error={searchError} limit={searchLimit} onMore={()=>setSearchLimit(limit=>limit+50)} onPast={()=>setSearchYears(years=>expandSearchYears(years,"past"))} onFuture={()=>setSearchYears(years=>expandSearchYears(years,"future"))} onSelect={selectSearchResult} onClose={()=>setSearchOpen(false)}/>}
    {authOpen && <AccountConnectModal intent={authIntent} onClose={()=>setAuthOpen(false)}/>}
    {settingsOpen && <SettingsModal calendars={writableCalendars} defaultCalendarKey={defaultCalendarKey || firstCalendarKey} autoSyncMinutes={autoSyncMinutes} showLunar={showLunar} onDefaultCalendar={changeDefaultCalendar} onAutoSync={changeAutoSync} onToggleLunar={toggleLunar} onClose={() => setSettingsOpen(false)}/>} 
    {deletePrompt&&<div className="modal-backdrop" onMouseDown={()=>!saving&&setDeletePrompt(null)}><section className="delete-scope-modal" onMouseDown={event=>event.stopPropagation()}><span>반복 일정 삭제</span><h2>어느 일정을 삭제할까요?</h2><p>선택한 일정만 삭제하거나 같은 반복 일정 전체를 삭제할 수 있어요.</p><button onClick={()=>finishDelete("single")} disabled={saving}>이 일정만 삭제</button><button className="delete-all" onClick={()=>finishDelete("all")} disabled={saving}>반복 일정 모두 삭제</button><button className="delete-cancel" onClick={()=>setDeletePrompt(null)} disabled={saving}>취소</button></section></div>}
    {iCloudModal && <div className="modal-backdrop" onMouseDown={() => !iCloudConnecting && setICloudModal(false)}><section className="connect-modal icloud-connect-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={() => setICloudModal(false)}>×</button><span className="modal-icon icloud-connect-icon">●</span><h2>iCloud 캘린더 연결</h2><p>Apple 계정과 앱 전용 암호를 입력하세요. 암호화된 연결정보만 온달력 계정에 저장됩니다.</p><label><span>Apple 계정</span><input type="email" autoComplete="username" placeholder="name@example.com" value={iCloudForm.email} onChange={e=>setICloudForm({...iCloudForm,email:e.target.value})}/></label><label><span>앱 전용 암호</span><div className="password-input"><input type={showICloudPassword ? "text" : "password"} autoComplete="current-password" placeholder="xxxx-xxxx-xxxx-xxxx" value={iCloudForm.password} onChange={e=>setICloudForm({...iCloudForm,password:e.target.value})}/><button type="button" className="password-visibility" aria-label={showICloudPassword ? "암호 숨기기" : "암호 보기"} aria-pressed={showICloudPassword} onClick={()=>setShowICloudPassword(value => !value)}>{showICloudPassword ? "숨기기" : "보기"}</button></div></label><ICloudPasswordGuide/>{iCloudError && <ConnectionErrorPanel error={iCloudError} retrying={iCloudConnecting} onRetry={connectICloud}/>}<button className="modal-connect" disabled={iCloudConnecting||!iCloudForm.email||!iCloudForm.password} onClick={connectICloud}>{iCloudConnecting?"연결 확인 중…":"안전하게 연결"}</button></section></div>}
    {calDavModal && <div className="modal-backdrop" onMouseDown={() => !calDavConnecting && setCalDavModal(false)}><section className="connect-modal" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setCalDavModal(false)}>×</button><span className="modal-icon">↻</span><h2>CalDAV 연결</h2><p>회사에서 안내받은 CalDAV 정보를 입력하세요.</p><label><span>CalDAV 서버</span><input placeholder="예: gw.company.co.kr" value={calDavForm.serverUrl} onChange={e => setCalDavForm({...calDavForm,serverUrl:e.target.value})}/></label><label><span>아이디 또는 이메일</span><input value={calDavForm.email} onChange={e => setCalDavForm({...calDavForm,email:e.target.value})}/></label><label><span>비밀번호 또는 앱 암호</span><div className="password-input"><input type={showCalDavPassword ? "text" : "password"} value={calDavForm.password} onChange={e => setCalDavForm({...calDavForm,password:e.target.value})}/><button type="button" className="password-visibility" aria-label={showCalDavPassword ? "암호 숨기기" : "암호 보기"} aria-pressed={showCalDavPassword} onClick={()=>setShowCalDavPassword(value => !value)}>{showCalDavPassword ? "숨기기" : "보기"}</button></div></label><small>가능하면 앱 전용 암호를 사용하세요.</small>{calDavError && <ConnectionErrorPanel error={calDavError} retrying={calDavConnecting} onRetry={connectCalDav}/>}<button className="modal-connect" disabled={calDavConnecting || !calDavForm.serverUrl || !calDavForm.email || !calDavForm.password} onClick={connectCalDav}>{calDavConnecting ? "연결 확인 중…" : "연결하기"}</button></section></div>}
    {notice && <div className="toast"><span>✓</span>{notice}</div>}
  </main>;
}

function ICloudPasswordGuide() {
  return <aside className="icloud-password-guide" aria-label="앱 전용 암호 발급 안내">
    <b>앱 전용 암호가 필요한 이유</b>
    <p>일반 Apple 계정 암호가 아니라, 온달력 연결용으로 별도 발급한 암호를 입력해야 합니다.</p>
    <ol><li>Apple 계정 페이지에 로그인</li><li><strong>로그인 및 보안 → 앱 암호</strong> 선택</li><li><strong>앱 암호 생성</strong> 후 발급된 암호 입력</li></ol>
    <p className="icloud-password-note">앱 암호를 만들려면 Apple 계정에 이중 인증이 설정되어 있어야 합니다.</p>
    <div><a href="https://account.apple.com/" target="_blank" rel="noreferrer">앱 전용 암호 만들기 ↗</a><a href="https://support.apple.com/ko-kr/102654" target="_blank" rel="noreferrer">Apple 공식 안내 보기 ↗</a></div>
  </aside>;
}

function MiniCalendar({ cursor, onSelect }: { cursor: Date; onSelect: (d: Date) => void }) { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = addDays(first, -first.getDay()); const cells = Array.from({length:42},(_,i)=>addDays(start,i)); const today = dateKey(new Date()); return <section className="mini-calendar"><div className="mini-title"><b>{cursor.getFullYear()}년 {cursor.getMonth()+1}월</b></div><div className="mini-grid mini-week">{weekdays.map((d,i)=><span key={d} className={i===0?"sunday":i===6?"saturday":""}>{d}</span>)}</div><div className="mini-grid">{cells.map(d=><button key={dateKey(d)} onClick={()=>onSelect(d)} className={`${d.getMonth()!==cursor.getMonth()?"muted":""} ${dateKey(d)===today?"selected":""} ${d.getDay()===0||holidayLabel(d)?"sunday":d.getDay()===6?"saturday":""}`}>{d.getDate()}</button>)}</div></section>; }

function CalendarView({ view, cursor, range, events, loading, showLunar, saving, saveDraggedEvent, onCreate, onCreateRange, onEdit, onShowMore }: { view: View; cursor: Date; range:{start:Date;end:Date}; events:EventItem[]; loading:boolean; showLunar:boolean; saving:boolean; saveDraggedEvent:(event:EventItem,mode:EventDragState["mode"],targetDate:string|null,gesture:{dragging:boolean;cancelled?:boolean},onDraft:(draft:EventDateDraft)=>void)=>Promise<boolean>; onCreate:(d:Date)=>void; onCreateRange:(start:Date,end:Date)=>void; onEdit:(e:EventItem)=>void; onShowMore:(d:Date,anchor:DOMRect)=>void }) {
  const [dragRange,setDragRange]=useState<{start:string;end:string}|null>(null);
  const [eventDrag,setEventDrag]=useState<EventDragState|null>(null);
  const [maxEventLanes,setMaxEventLanes]=useState(4);
  useEffect(()=>{
    const query=window.matchMedia("(max-width: 1800px)");
    const update=()=>setMaxEventLanes(query.matches?2:4);
    update();
    query.addEventListener("change",update);
    return ()=>query.removeEventListener("change",update);
  },[]);
  const eventDragRef=useRef<EventDragState|null>(null);
  const suppressEventClick=useRef(false);
  const suppressClickTimer=useRef<number|null>(null);
  const cancelledPointerId=useRef<number|null>(null);
  const lastPointerType=useRef("");
  const setEventGesture=useCallback((next:EventDragState|null)=>{eventDragRef.current=next;setEventDrag(next);},[]);
  const clearEventGesture=useCallback(()=>setEventGesture(null),[setEventGesture]);
  const suppressClickOnce=useCallback(()=>{
    suppressEventClick.current=true;
    if(suppressClickTimer.current!==null)window.clearTimeout(suppressClickTimer.current);
    suppressClickTimer.current=window.setTimeout(()=>{suppressEventClick.current=false;suppressClickTimer.current=null;},0);
  },[]);
  const startEventGesture=(item:EventItem, event:React.PointerEvent<HTMLButtonElement|HTMLSpanElement>, mode:EventDragState["mode"])=>{
    event.stopPropagation();
    if(!enableEventDrag)return;
    if(saving||event.pointerType!=="mouse"||event.button!==0||!eventManipulationState(item).allowed)return;
    event.preventDefault();
    suppressEventClick.current=false;
    cancelledPointerId.current=null;
    const startDate=dateKey(parseEventDate(item.start));
    setEventGesture({event:item,mode,origin:{x:event.clientX,y:event.clientY},targetDate:startDate,pointerId:event.pointerId,dragging:false});
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updateEventTarget=useCallback((targetDate:string)=>{
    const current=eventDragRef.current;
    if(current)setEventGesture(updateEventGesture(current,targetDate,saving));
  },[saving,setEventGesture]);
  const monthGridDropDate=useCallback((clientX:number,clientY:number)=>{
    const pointTarget=document.elementFromPoint(clientX,clientY);
    const targetDate=pointTarget?.closest<HTMLElement>(".month-grid .day-cell[data-date]")?.dataset.date;
    const grid=pointTarget?.closest<HTMLElement>(".month-grid");
    const cells=Array.from(grid?.querySelectorAll<HTMLElement>(".day-cell[data-date]")||[]).map(cell=>{
      const rect=cell.getBoundingClientRect();
      return {date:cell.dataset.date||"",left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    });
    return resolveCalendarDropDate(targetDate,clientX,clientY,cells);
  },[]);
  const eventGesturePointerMove=useCallback((event:PointerEvent)=>{
    const current=eventDragRef.current;
    if(!current||event.pointerId!==current.pointerId)return;
    const dragging=current.dragging||isDragGesture(current.origin,{x:event.clientX,y:event.clientY});
    if(!dragging)return;
    const targetDate=monthGridDropDate(event.clientX,event.clientY);
    setEventGesture(updateEventGesture(current,targetDate||current.targetDate,saving,true));
  },[monthGridDropDate,saving,setEventGesture]);
  const finishEventGesture=useCallback((event:PointerEvent)=>{
    const active=eventDragRef.current;
    if(!active){
      if(cancelledPointerId.current===event.pointerId){cancelledPointerId.current=null;suppressClickOnce();event.stopPropagation();}
      return;
    }
    if(event.pointerId!==active.pointerId)return;
    event.stopPropagation();
    if(!active.dragging){clearEventGesture();return;}
    suppressClickOnce();
    const targetDate=monthGridDropDate(event.clientX,event.clientY);
    if(!targetDate){clearEventGesture();return;}
    void saveDraggedEvent(active.event,active.mode,targetDate,{dragging:active.dragging},()=>setEventGesture({...active,targetDate,dragging:true})).then(()=>clearEventGesture());
  },[clearEventGesture,monthGridDropDate,saveDraggedEvent,setEventGesture,suppressClickOnce]);
  const cancelEventGesture=useCallback((event:PointerEvent)=>{
    const active=eventDragRef.current;
    if(saving||!active||event.pointerId!==active.pointerId)return;
    event.stopPropagation();
    clearEventGesture();
  },[clearEventGesture,saving]);
  const cancelEventGestureOnEscape=useCallback((event:KeyboardEvent)=>{
    if(event.key!=="Escape")return;
    const active=eventDragRef.current;
    if(saving||!active)return;
    cancelledPointerId.current=active.pointerId;
    event.preventDefault();
    event.stopPropagation();
    clearEventGesture();
  },[clearEventGesture,saving]);
  useEffect(()=>{
    window.addEventListener("pointermove",eventGesturePointerMove,true);
    window.addEventListener("pointerup",finishEventGesture,true);
    window.addEventListener("pointercancel",cancelEventGesture,true);
    window.addEventListener("keydown",cancelEventGestureOnEscape,true);
    return()=>{
      window.removeEventListener("pointermove",eventGesturePointerMove,true);
      window.removeEventListener("pointerup",finishEventGesture,true);
      window.removeEventListener("pointercancel",cancelEventGesture,true);
      window.removeEventListener("keydown",cancelEventGestureOnEscape,true);
      if(suppressClickTimer.current!==null)window.clearTimeout(suppressClickTimer.current);
    };
  },[cancelEventGesture,cancelEventGestureOnEscape,eventGesturePointerMove,finishEventGesture]);
  const today = dateKey(new Date());
  if (view === "month") {
    const cells=Array.from({length:42},(_,i)=>addDays(range.start,i));
    const selected=dragRange?orderedDateRange(dragRange.start,dragRange.end):null;
    const previewDraft:EventDateDraft|null=eventDrag?.dragging
      ? eventDrag.mode==="move" ? moveEventToDate(eventDrag.event,eventDrag.targetDate)
        : resizeEventToDate(eventDrag.event,eventDrag.mode==="resize-start"?"start":"end",eventDrag.targetDate)
      : null;
    const previewEvent:EventItem|undefined=eventDrag&&previewDraft?{
      ...eventDrag.event,
      start:previewDateValue(previewDraft.startDate,previewDraft.startTime,previewDraft.allDay),
      end:previewDateValue(previewDraft.endDate,previewDraft.endTime,previewDraft.allDay,true),
    }:undefined;
    const eventByLayoutId=new Map<string,EventItem>();
    const holidayEvents:EventItem[]=[];
    let holidayStart:Date|null=null;
    for(let index=0;index<=cells.length;index+=1){
      const current=index<cells.length&&holidayLabel(cells[index])?cells[index]:null;
      if(current&&!holidayStart)holidayStart=current;
      const next=index+1<cells.length&&holidayLabel(cells[index+1])?cells[index+1]:null;
      if(holidayStart&&(!current||!next)){const end=current?addDays(current,1):holidayStart;const holidayTitle=Array.from({length:Math.max(1,Math.round((end.getTime()-holidayStart.getTime())/86400000))},(_,offset)=>holidayLabel(addDays(holidayStart,offset))).find(label=>label&&!label.includes("연휴"))||holidayLabel(holidayStart);holidayEvents.push({id:`holiday:${dateKey(holidayStart)}`,calendarId:"holiday",calendarName:"공휴일",calendarColor:"#d95768",title:holidayTitle,start:dateKey(holidayStart),end:dateKey(end),allDay:true,source:"daou"});holidayStart=null;}
    }
    const layoutSource=holidayEvents.concat(previewEvent?events.map(event=>event===eventDrag?.event?previewEvent:event):events);
    const layoutEvents=layoutSource.map(event=>{const id=`${event.source}:${event.calendarId}:${event.id}`;eventByLayoutId.set(id,event);return{id,start:event.start,end:event.end,allDay:event.allDay};});
    const segments=monthEventSegments(layoutEvents,dateKey(range.start),42,maxEventLanes);
    return <div className="calendar-card"><div className="week-header">{weekdays.map((d,i)=><div key={d} className={i===0?"sunday":i===6?"saturday":""}>{d}</div>)}</div><div className="month-grid" onPointerLeave={()=>setDragRange(null)}>{cells.map((d,index)=>{const key=dateKey(d);const holiday=holidayLabel(d);const inDrag=Boolean(selected&&key>=selected.startDate&&key<=selected.endDate);const week=Math.floor(index/7);const column=index%7;const shown=new Set(segments.filter(segment=>segment.week===week&&column>=segment.startColumn&&column<segment.startColumn+segment.span).map(segment=>segment.id));const hidden=Math.max(0,events.filter(event=>eventOccursOnDate(event,key)).length-shown.size);return <div key={key} data-date={key} className={`day-cell ${d.getMonth()!==cursor.getMonth()?"muted":""} ${key===today?"today":""} ${holiday?"holiday":""} ${inDrag?"range-selecting":""}`} onClick={()=>{if(lastPointerType.current!=="mouse")onCreate(d);}} onPointerDown={event=>{lastPointerType.current=event.pointerType;if(eventDragRef.current)return;if(event.pointerType!=="mouse"||event.button!==0)return;event.preventDefault();setDragRange({start:key,end:key});}} onPointerEnter={()=>{updateEventTarget(key);setDragRange(current=>current?{start:current.start,end:key}:null);}} onPointerUp={event=>{if(eventDragRef.current)return;if(event.pointerType!=="mouse"||!dragRange)return;event.preventDefault();const chosen=orderedDateRange(dragRange.start,key);setDragRange(null);if(chosen.startDate===chosen.endDate)onCreate(d);else onCreateRange(new Date(`${chosen.startDate}T00:00:00`),new Date(`${chosen.endDate}T00:00:00`));}}><div className="day-label"><span className="day-number">{d.getDate()}</span>{holiday&&<span className="holiday-name">{holiday}</span>}{showLunar&&<span className="lunar-date">{lunarLabel(d)}</span>}</div>{hidden>0&&<button className="cell-more-events" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onShowMore(d,event.currentTarget.getBoundingClientRect());}}>+{hidden}개 더보기</button>}</div>})}<div className="month-events-layer">{segments.map((segment,index)=>{const event=eventByLayoutId.get(segment.id);if(!event)return null;const start=parseEventDate(event.start);const prefix=!event.allDay&&segment.startsHere?`${pad(start.getHours())}:${pad(start.getMinutes())} `:"";const style={gridColumn:`${segment.startColumn+1} / span ${segment.span}`,gridRow:segment.week+1,"--event-lane":segment.lane,...(event.calendarColor?{backgroundColor:event.calendarColor}: {})} as CSSProperties;const manipulation=eventManipulationState(event);const isActiveGesture=eventDrag?.event.id===event.id&&eventDrag.event.source===event.source&&eventDrag.event.calendarId===event.calendarId;return <button key={`${segment.id}:${segment.week}:${index}`} className={`month-event-bar ${event.source} ${segment.startsHere?"starts-here":"continues-before"} ${segment.endsHere?"ends-here":"continues-after"} ${manipulation.allowed?"draggable":"manipulation-blocked"} ${saving&&isActiveGesture?"saving":""} ${previewEvent===event?"event-drag-preview":""}`} style={style} onPointerDown={pointer=>startEventGesture(event,pointer,"move")} onClick={click=>{click.stopPropagation();if(suppressEventClick.current){suppressEventClick.current=false;if(suppressClickTimer.current!==null)window.clearTimeout(suppressClickTimer.current);suppressClickTimer.current=null;return;}onEdit(event);}} title={manipulation.allowed?event.title:manipulation.reason} aria-label={manipulation.allowed?event.title:`${event.title} · ${manipulation.reason}`}>
      {eventResizeEdges(event,segment).includes("start")&&<span role="button" tabIndex={-1} className="month-event-resize-handle event-resize-handle resize-start start" aria-label="일정 시작일 조절" onPointerDown={pointer=>startEventGesture(event,pointer,"resize-start")}/>}
      <span>{prefix}{event.title}</span>
      {eventResizeEdges(event,segment).includes("end")&&<span role="button" tabIndex={-1} className="month-event-resize-handle event-resize-handle resize-end end" aria-label="일정 종료일 조절" onPointerDown={pointer=>startEventGesture(event,pointer,"resize-end")}/>}
    </button>;})}</div></div></div>;
  }
  const dates = view === "week" ? Array.from({length:7},(_,i)=>addDays(range.start,i)) : [cursor]; return <div className={`calendar-card agenda-card ${view}`}><div className="agenda-columns">{dates.map(d=>{const holiday=holidayLabel(d);return <section className={`agenda-day ${dateKey(d)===today?"today":""} ${holiday?"holiday":""} ${d.getDay()===6?"saturday":""}`} key={dateKey(d)} onClick={()=>onCreate(d)}><header><b>{d.getDate()}</b><span>{weekdays[d.getDay()]}요일{holiday&&<> · <strong>{holiday}</strong></>}</span></header><EventList date={d} events={events} onEdit={onEdit} agenda/></section>})}</div>{loading&&<div className="calendar-loading">일정을 불러오는 중…</div>}</div>;
}

function EventList({ date, events, onEdit, agenda=false, max, onMore }: { date:Date; events:EventItem[]; onEdit:(e:EventItem)=>void; agenda?:boolean; max?:number; onMore?:(anchor:DOMRect)=>void }) { const currentDate=dateKey(date);const list=events.filter(e=>eventOccursOnDate(e,currentDate)).sort((a,b)=>a.start.localeCompare(b.start)); const visible=typeof max==="number"?list.slice(0,max):list; return <div className={`events ${agenda?"agenda-events":""}`}>{visible.map(e=>{const start=parseEventDate(e.start);const isFirstDay=dateKey(start)===currentDate; return <button className={`event ${e.source}`} key={e.id} onPointerDown={x=>x.stopPropagation()} onPointerUp={x=>x.stopPropagation()} onClick={x=>{x.stopPropagation();onEdit(e);}} style={e.calendarColor?{borderLeftColor:e.calendarColor,backgroundColor:`${e.calendarColor}20`}:undefined}><span>{e.allDay?"종일":isFirstDay?`${pad(start.getHours())}:${pad(start.getMinutes())}`:"계속"}</span>{e.title}</button>;})}{typeof max==="number"&&list.length>max&&<button className="more-events" onPointerDown={x=>x.stopPropagation()} onPointerUp={x=>x.stopPropagation()} onClick={x=>{x.stopPropagation();onMore?.(x.currentTarget.getBoundingClientRect());}}>+{list.length-max}개 더보기</button>}{agenda&&list.length===0&&<button className="empty-day" onPointerUp={x=>x.stopPropagation()} onClick={x=>x.stopPropagation()}>등록된 일정이 없습니다</button>}</div>; }

function EventEditor({ form,setForm,calendars,editing,saving,onClose,onSave,onDelete }:{form:EventForm;setForm:(f:EventForm)=>void;calendars:CalendarItem[];editing:EventItem|null;saving:boolean;onClose:()=>void;onSave:()=>void;onDelete:()=>void}) { const readOnly = Boolean(editing?.source === "daou" && !isPersonalCompanyCalendar(editing.calendarName)); const multiDay=form.startDate!==form.endDate; return <div className="modal-backdrop" onMouseDown={()=>!saving&&onClose()}><section className="connect-modal event-editor" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="editor-title"><span>{readOnly?"읽기 전용":editing?"편집":"추가"}</span><h2>{readOnly?"일정 상세":editing?"일정 수정":"새 일정"}</h2>{editing&&<p>{readOnly?"CalDAV 공용 일정은 확인만 할 수 있습니다.":"내용을 바꾼 뒤 아래의 ‘수정 완료’를 눌러주세요."}</p>}</div><fieldset className="editor-fields" disabled={readOnly}><label><span>일정 제목</span><input autoFocus={!readOnly} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="무엇을 할 예정인가요?"/></label><div className="form-row date-range-row"><label><span>시작일</span><input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value,endDate:form.endDate<e.target.value?e.target.value:form.endDate})}/></label><label><span>종료일</span><input type="date" min={form.startDate} value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label><label className="all-day"><span>시간</span><button type="button" className={`toggle-switch ${form.allDay?"on":""}`} onClick={()=>setForm({...form,allDay:!form.allDay})}><i/></button><small>종일</small></label></div>{!form.allDay&&<div className="form-row time-row"><label><span>시작 시간</span><TimePicker value={form.startTime} onChange={startTime=>setForm({...form,startTime})}/></label><label><span>종료 시간</span><TimePicker value={form.endTime} onChange={endTime=>setForm({...form,endTime})}/></label></div>}<label><span>반복</span><select value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}><option value="">반복 안 함</option><option value="FREQ=DAILY">매일</option><option value="FREQ=WEEKLY">매주</option><option value="FREQ=MONTHLY">매월</option><option value="FREQ=YEARLY">매년 양력</option><option value="LUNAR_YEARLY" disabled={multiDay}>매년 음력{multiDay?" · 하루 일정만 가능":""}</option></select>{form.recurrence==="LUNAR_YEARLY"&&<small className="lunar-repeat-guide">{lunarLabel(new Date(`${form.startDate}T00:00:00`))} 기준 · 향후 3년 자동 생성 · 음력 30일이 없는 해는 29일</small>}</label><label><span>저장할 캘린더</span><select value={form.calendarKey} disabled={Boolean(editing && !calendars.some(calendar => calendar.source === editing.source && calendar.id === editing.calendarId && isCalendarWritable(calendar)))} onChange={e=>setForm({...form,calendarKey:e.target.value})}><option value="">캘린더 선택</option>{(["icloud","google","daou"] as Source[]).map(s=><optgroup key={s} label={sourceLabel[s]}>{calendars.filter(c=>c.source===s&&isCalendarWritable(c)).map(c=><option value={`${s}:${c.id}`} key={`${s}:${c.id}`}>{c.name}</option>)}</optgroup>)}</select></label></fieldset><div className="editor-actions">{editing&&!readOnly&&<button className="delete-event" onClick={onDelete} disabled={saving}>삭제</button>}<button className="cancel-event" onClick={onClose}>{readOnly?"닫기":"취소"}</button>{!readOnly&&<button className="modal-connect" onClick={onSave} disabled={saving}>{saving?"저장 중…":editing?"수정 완료":"일정 저장"}</button>}</div></section></div>; }

function EventOverflowPopup({ date, left, top, events, onEdit, onClose }: { date:Date; left:number; top:number; events:EventItem[]; onEdit:(event:EventItem)=>void; onClose:()=>void }) { const holiday=holidayLabel(date); return <div className="modal-backdrop overflow-backdrop" onMouseDown={onClose}><section className="event-overflow-popup" style={{left,top}} role="dialog" aria-modal="true" aria-label={`${date.getMonth()+1}월 ${date.getDate()}일 일정`} onMouseDown={event=>event.stopPropagation()}><header><div><span>{date.getFullYear()}년 {date.getMonth()+1}월</span><h2>{date.getDate()}일 {weekdays[date.getDay()]}요일</h2>{holiday&&<small>{holiday}</small>}</div><button className="modal-close" onClick={onClose} aria-label="닫기">×</button></header><EventList date={date} events={events} onEdit={onEdit} agenda/></section></div>; }

function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hourValue, minuteValue] = value.split(":").map(Number);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour12 = hourValue % 12 || 12;
  const update = (nextPeriod: string, nextHour: number, nextMinute: number) => { const hour24 = nextHour % 12 + (nextPeriod === "PM" ? 12 : 0); onChange(`${pad(hour24)}:${pad(nextMinute)}`); };
  const minutes = [...new Set([...Array.from({length:12},(_,i)=>i*5), minuteValue])].sort((a,b)=>a-b);
  return <div className="time-picker" aria-label="시간 선택"><select aria-label="오전 오후" value={period} onChange={e=>update(e.target.value,hour12,minuteValue)}><option value="AM">오전</option><option value="PM">오후</option></select><select aria-label="시" value={hour12} onChange={e=>update(period,Number(e.target.value),minuteValue)}>{Array.from({length:12},(_,i)=>i+1).map(h=><option key={h} value={h}>{pad(h)}시</option>)}</select><select aria-label="분" value={minuteValue} onChange={e=>update(period,hour12,Number(e.target.value))}>{minutes.map(m=><option key={m} value={m}>{pad(m)}분</option>)}</select></div>;
}

function SearchModal({ authenticated, query, onQuery, years, results, loading, error, limit, onMore, onPast, onFuture, onSelect, onClose }: { authenticated:boolean; query:string; onQuery:(query:string)=>void; years:number[]; results:EventItem[]; loading:boolean; error:string; limit:number; onMore:()=>void; onPast:()=>void; onFuture:()=>void; onSelect:(event:EventItem)=>void; onClose:()=>void }) {
  const sortedYears=[...years].sort((a,b)=>a-b); const firstYear=sortedYears[0]??new Date().getFullYear(); const lastYear=sortedYears.at(-1)??firstYear; const visible=results.slice(0,limit);
  const formatResultDate=(event:EventItem)=>{const date=parseEventDate(event.start);const day=date.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"short"});return event.allDay?`${day} · 종일`:`${day} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;};
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="connect-modal search-modal" role="dialog" aria-modal="true" aria-labelledby="search-title" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="닫기">×</button><div className="search-heading"><span aria-hidden="true">⌕</span><div><h2 id="search-title">전체 일정 검색</h2><p>{firstYear===lastYear?`${firstYear}년 일정에서 검색합니다.`:`${firstYear}년부터 ${lastYear}년까지 검색합니다.`}</p></div></div>{!authenticated?<div className="search-empty"><b>캘린더 연결이 필요해요</b><span>연결한 Google·iCloud·CalDAV 일정 전체를 한곳에서 검색할 수 있습니다.</span></div>:<><label className="search-field"><span className="sr-only">일정 검색어</span><input autoFocus value={query} onChange={event=>onQuery(event.target.value)} placeholder="일정 제목이나 캘린더 이름 검색"/><i aria-hidden="true">⌕</i></label><div className="search-year-controls"><button onClick={onPast}>← {firstYear-1}년 추가</button><span>{sortedYears.join(" · ")}</span><button onClick={onFuture}>{lastYear+1}년 추가 →</button></div><div className="search-results" aria-live="polite">{query.trim().length<2?<div className="search-empty"><b>두 글자 이상 입력해 주세요</b><span>연결된 모든 캘린더의 일정 제목과 캘린더 이름을 검색합니다.</span></div>:loading?<div className="search-empty"><span className="search-spinner"/><b>일정을 찾고 있어요</b></div>:error?<div className="search-empty search-error"><b>{error}</b></div>:results.length===0?<div className="search-empty"><b>검색 결과가 없어요</b><span>다른 검색어를 입력하거나 검색 연도를 넓혀 보세요.</span></div>:<>{visible.map(event=><button className="search-result" key={`${event.source}:${event.calendarId}:${event.id}:${event.start}`} onClick={()=>onSelect(event)}><span className={`search-source-dot ${event.source}`} style={event.calendarColor?{backgroundColor:event.calendarColor}:undefined}/><span className="search-result-copy"><b>{event.title}</b><small>{formatResultDate(event)}</small></span><em>{event.calendarName||sourceLabel[event.source]}</em></button>)}{results.length>limit&&<button className="search-more" onClick={onMore}>결과 {Math.min(50,results.length-limit)}개 더보기</button>}</>}</div></>}</section></div>;
}

function AccountConnectModal({intent,onClose}:{intent:Source;onClose:()=>void}) {
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const continueWithGoogle=()=>beginGoogleConnection(setBusy,setMessage,intent);
  const target=intent==="icloud"?"iCloud 캘린더":intent==="daou"?"CalDAV 캘린더":"Google 캘린더";
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="connect-modal account-connect-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="auth-brand"><span className="brand-mark">온</span><b>온달력</b></div><div className="auth-copy"><span>{target} 연결하기</span><h1>한 번 로그인하고<br/>{target}을 연결하세요</h1><p>연결정보를 사용자별로 안전하게 보관하려면 온달력 계정이 필요합니다. Google 로그인 후 선택한 연결 화면이 자동으로 열립니다.</p></div><button className="google-auth-button" disabled={busy} onClick={continueWithGoogle}><span className="google-g">G</span><b>{busy?"Google로 이동 중…":"Google로 간편 로그인"}</b></button>{message&&<p className="auth-message">{message}</p>}<small className="auth-security">로그인 후 {target} 연결을 바로 이어서 진행합니다.</small></section></div>;
}

function LandingScreen({onExplore}:{onExplore:()=>void}) {
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  return <main className="auth-page landing-page"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">온</span><b>온달력</b></div><div className="auth-copy"><span>모든 달력을 한곳에</span><h1>내 모든 일정을<br/>하나의 달력으로</h1><p>Google·iCloud·CalDAV 일정을 한눈에 확인하고 PC와 모바일에서 그대로 이어서 사용하세요.</p></div><div className="landing-actions"><button className="google-auth-button" disabled={busy} onClick={()=>beginGoogleConnection(setBusy,setMessage)}><span className="google-g">G</span><b>{busy?"Google로 이동 중…":"Google로 시작하기"}</b></button><button className="explore-button" onClick={onExplore}>로그인 없이 둘러보기</button></div>{message&&<p className="auth-message">{message}</p>}<div className="icloud-support"><span className="iphone-mark">i</span><div><b>iPhone · iCloud 캘린더 지원</b><small>둘러보기 후 Apple 계정의 앱 전용 암호로 연결할 수 있어요.</small></div><em>지원 중</em></div><div className="auth-benefits"><span><i>✓</i> 회원가입과 Google 연결을 한 번에</span><span><i>✓</i> 달력은 로그인 없이 먼저 체험</span><span><i>✓</i> 연결정보는 암호화해 안전하게 보관</span></div><p className="service-plan-note">Google·iCloud·CalDAV 연결과 기본 일정 관리는 계속 무료로 제공합니다.<br/>향후 추가되는 일부 고급 기능은 온달력 Plus로 제공될 수 있습니다.</p><LegalLinks/></section><aside className="auth-visual"><div><span>Google</span><span>iPhone · iCloud</span><span>CalDAV</span></div><h2>연결은 한 번,<br/>일정은 모든 기기에서.</h2><p>업무와 개인 일정을 오가느라 여러 화면을 열 필요 없이 온달력 한곳에서 관리하세요.</p></aside></main>;
}

function SettingsModal({ calendars, defaultCalendarKey, autoSyncMinutes, showLunar, onDefaultCalendar, onAutoSync, onToggleLunar, onClose }: { calendars: CalendarItem[]; defaultCalendarKey: string; autoSyncMinutes: number; showLunar: boolean; onDefaultCalendar: (key:string)=>void; onAutoSync:(minutes:number)=>void; onToggleLunar:()=>void; onClose:()=>void }) {
  const state=defaultCalendarState(calendars,defaultCalendarKey);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="connect-modal settings-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="settings-heading"><span>⚙</span><div><h2>캘린더 설정</h2><p>내 사용 방식에 맞게 온달력을 설정하세요.</p></div></div><div className="settings-group"><label><span><b>자동 동기화</b><small>다른 앱에서 변경된 일정을 자동으로 불러옵니다.</small></span><select value={autoSyncMinutes} onChange={e=>onAutoSync(Number(e.target.value))}><option value={0}>자동 동기화 끄기</option><option value={1}>1분마다</option><option value={5}>5분마다</option><option value={15}>15분마다</option></select></label><label><span><b>기본 저장 캘린더</b><small>새 일정을 만들 때 처음 선택되는 캘린더입니다.</small></span><select value={state.selectedKey} disabled={!state.available} onChange={e=>onDefaultCalendar(e.target.value)}>{!state.available?<option value="">{state.message}</option>:(["icloud","google","daou"] as Source[]).map(source=>{const choices=calendars.filter(c=>c.source===source);return choices.length?<optgroup label={sourceLabel[source]} key={source}>{choices.map(c=><option key={`${source}:${c.id}`} value={`${source}:${c.id}`}>{c.name}</option>)}</optgroup>:null})}</select></label><div className="settings-line"><span><b>대한민국 음력</b><small>월간 달력 날짜에 음력 월·일을 표시합니다.</small></span><button className={`toggle-switch ${showLunar?"on":""}`} role="switch" aria-checked={showLunar} onClick={onToggleLunar}><i/></button></div></div><div className="settings-footer"><small>설정은 이 기기에 자동 저장됩니다.</small><button className="modal-connect" onClick={onClose}>완료</button></div></section></div>;
}
