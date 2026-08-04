import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import KoreanLunarCalendar from "korean-lunar-calendar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

type Source = "google" | "icloud" | "daou";
type Tab = "calendar" | "agenda" | "settings";
type CalendarItem = { id: string; name: string; color: string; source: Source; primary?: boolean };
type EventItem = { id: string; title: string; start: string; end?: string; allDay: boolean; calendarId: string; calendarColor?: string; source: Source };

const COLORS = { purple: "#5B4CF2", ink: "#17182A", muted: "#85889C", line: "#E8E8F1", bg: "#F7F7FC", card: "#FFFFFF" };
const apiUrl = process.env.EXPO_PUBLIC_API_URL || "https://oncal-calendar-hub.racing-lemur-4380.chatgpt.site";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseKey || "placeholder", {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

const pad = (value: number) => String(value).padStart(2, "0");
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const sourceName: Record<Source, string> = { google: "Google", icloud: "iCloud", daou: "회사 일정" };
const sourcePath: Record<Source, string> = { google: "/api/google/events", icloud: "/api/icloud/events", daou: "/api/caldav/events" };

function lunarText(date: Date) {
  const lunar = new KoreanLunarCalendar();
  if (!lunar.setSolarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())) return "";
  const value = lunar.getLunarCalendar();
  return `${value.intercalation ? "윤" : ""}${value.month}.${value.day}`;
}

function monthCells(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

async function authenticatedFetch(path: string, session: Session, init?: RequestInit) {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(init?.headers || {}) },
  });
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [exploring, setExploring] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [showLunar, setShowLunar] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [connected, setConnected] = useState<Record<Source, boolean>>({ google: false, icloud: false, daou: false });
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [calendarKey, setCalendarKey] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    AsyncStorage.getItem("onecalendar-show-lunar").then(value => value !== null && setShowLunar(value === "true"));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!session) { setEvents([]); setCalendars([]); return; }
    setLoading(true);
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const from = addDays(first, -7).toISOString();
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 7).toISOString();
    const nextEvents: EventItem[] = [];
    const nextCalendars: CalendarItem[] = [];
    const nextConnected = { google: false, icloud: false, daou: false };
    await Promise.all((Object.keys(sourcePath) as Source[]).map(async source => {
      try {
        const response = await authenticatedFetch(`${sourcePath[source]}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, session);
        const data = await response.json();
        nextConnected[source] = Boolean(data.connected);
        for (const calendar of data.calendars || []) nextCalendars.push({ ...calendar, source });
        for (const event of data.events || []) if (event.start) nextEvents.push({ ...event, source });
      } catch { /* 연결되지 않은 공급자는 빈 상태로 유지 */ }
    }));
    nextEvents.sort((a, b) => a.start.localeCompare(b.start));
    setEvents(nextEvents); setCalendars(nextCalendars); setConnected(nextConnected);
    if (!calendarKey && nextCalendars[0]) setCalendarKey(`${nextCalendars[0].source}:${nextCalendars[0].id}`);
    setLoading(false);
  }, [session, cursor, calendarKey]);

  useEffect(() => { load(); }, [load]);

  const loginWithGoogle = async () => {
    if (!supabaseUrl || !supabaseKey) return Alert.alert("앱 설정 필요", "mobile/.env에 Supabase 주소와 Publishable Key를 입력해 주세요.");
    const redirectTo = AuthSession.makeRedirectUri({ scheme: "onecalendar", path: "auth/callback" });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true, scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events", queryParams: { access_type: "offline", prompt: "consent" } },
    });
    if (error || !data.url) return Alert.alert("로그인 실패", error?.message || "로그인을 시작하지 못했습니다.");
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return;
    const params = new URLSearchParams(result.url.split("#")[1] || result.url.split("?")[1] || "");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const providerToken = params.get("provider_token");
    const providerRefreshToken = params.get("provider_refresh_token");
    if (accessToken && refreshToken) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (sessionError) Alert.alert("로그인 실패", sessionError.message);
      else if (providerToken && sessionData.session) {
        const response = await authenticatedFetch("/api/mobile/google/link", sessionData.session, {
          method: "POST",
          body: JSON.stringify({ providerToken, providerRefreshToken, email: sessionData.user?.email }),
        });
        if (!response.ok) Alert.alert("캘린더 연결 안내", "로그인은 완료됐지만 Google 캘린더 연결을 마치지 못했습니다. 다시 연결해 주세요.");
      }
    }
  };

  const saveEvent = async () => {
    if (!session) return Alert.alert("로그인이 필요해요", "일정을 저장하려면 Google로 시작해 주세요.", [{ text: "취소" }, { text: "로그인", onPress: loginWithGoogle }]);
    if (!title.trim() || !calendarKey) return Alert.alert("입력 확인", "제목과 저장할 캘린더를 선택해 주세요.");
    if (!allDay && endTime <= startTime) return Alert.alert("시간 확인", "종료 시간은 시작 시간보다 늦어야 합니다.");
    const [source, ...idParts] = calendarKey.split(":") as [Source, ...string[]];
    const calendarId = idParts.join(":");
    const date = keyOf(selected);
    const body = {
      calendarId,
      title: title.trim(),
      allDay,
      recurrence: "",
      start: allDay ? date : new Date(`${date}T${startTime}`).toISOString(),
      end: allDay ? keyOf(addDays(selected, 1)) : new Date(`${date}T${endTime}`).toISOString(),
    };
    setLoading(true);
    try {
      const response = await authenticatedFetch(sourcePath[source], session, { method: "POST", body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      setEditorOpen(false); setTitle(""); await load();
    } catch { Alert.alert("저장 실패", "캘린더 연결 상태를 확인하고 다시 시도해 주세요."); }
    finally { setLoading(false); }
  };

  if (!ready) return <View style={styles.loading}><Logo/><ActivityIndicator color={COLORS.purple}/></View>;
  if (!session && !exploring) return <Landing onLogin={loginWithGoogle} onExplore={() => setExploring(true)}/>;

  const days = monthCells(cursor);
  const selectedEvents = events.filter(event => keyOf(new Date(event.start)) === keyOf(selected));
  const upcoming = events.filter(event => new Date(event.start) >= startOfDay(new Date())).slice(0, 30);

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark"/>
    <View style={styles.header}>
      <Logo compact/>
      <View style={styles.headerActions}>
        <Pressable style={styles.today} onPress={() => { const now = startOfDay(new Date()); setCursor(now); setSelected(now); }}><Text style={styles.todayText}>오늘</Text></Pressable>
        <Pressable style={styles.avatar} onPress={() => setTab("settings")}><Text style={styles.avatarText}>{session?.user.email?.slice(0, 1).toUpperCase() || "둘"}</Text></Pressable>
      </View>
    </View>
    {tab === "calendar" && <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} contentContainerStyle={styles.content}>
      <View style={styles.monthNav}>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Text style={styles.navArrow}>‹</Text></Pressable>
        <Text style={styles.monthTitle}>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</Text>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Text style={styles.navArrow}>›</Text></Pressable>
      </View>
      <View style={styles.weekRow}>{["일","월","화","수","목","금","토"].map((day, index) => <Text key={day} style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>)}</View>
      <View style={styles.grid}>{days.map(date => <DayCell key={keyOf(date)} date={date} cursor={cursor} selected={selected} events={events} showLunar={showLunar} onPress={() => setSelected(date)}/>)}</View>
      <View style={styles.agendaHeader}><View><Text style={styles.sectionTitle}>{selected.getMonth() + 1}월 {selected.getDate()}일</Text><Text style={styles.sectionSub}>{selected.toLocaleDateString("ko-KR", { weekday: "long" })}{showLunar ? ` · 음력 ${lunarText(selected)}` : ""}</Text></View><Pressable style={styles.addSmall} onPress={() => setEditorOpen(true)}><Text style={styles.addSmallText}>＋ 일정</Text></Pressable></View>
      {selectedEvents.length ? selectedEvents.map(event => <EventCard key={`${event.source}:${event.id}`} event={event}/>) : <Empty text={session ? "등록된 일정이 없어요" : "로그인하면 모든 캘린더 일정을 볼 수 있어요"}/>} 
    </ScrollView>}
    {tab === "agenda" && <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} contentContainerStyle={styles.content}><Text style={styles.pageTitle}>다가오는 일정</Text><Text style={styles.pageLead}>여러 캘린더의 일정을 시간순으로 모았어요.</Text>{upcoming.length ? upcoming.map(event => <View key={`${event.source}:${event.id}`}><Text style={styles.agendaDate}>{new Date(event.start).toLocaleDateString("ko-KR", { month:"long", day:"numeric", weekday:"short" })}</Text><EventCard event={event}/></View>) : <Empty text="다가오는 일정이 없어요"/>}</ScrollView>}
    {tab === "settings" && <Settings session={session} connected={connected} showLunar={showLunar} onToggleLunar={async value => { setShowLunar(value); await AsyncStorage.setItem("onecalendar-show-lunar", String(value)); }} onLogin={loginWithGoogle} onLogout={async () => { await supabase.auth.signOut(); setExploring(false); setTab("calendar"); }}/>} 
    <View style={styles.tabbar}>{([['calendar','달력','▦'],['agenda','일정','≡'],['settings','설정','⚙']] as const).map(([value,label,icon]) => <Pressable key={value} style={styles.tab} onPress={() => setTab(value)}><Text style={[styles.tabIcon,tab===value&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===value&&styles.tabActive]}>{label}</Text></Pressable>)}<Pressable style={styles.fab} onPress={() => setEditorOpen(true)}><Text style={styles.fabText}>＋</Text></Pressable></View>
    <EventEditor open={editorOpen} onClose={() => setEditorOpen(false)} date={selected} title={title} setTitle={setTitle} startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime} allDay={allDay} setAllDay={setAllDay} calendars={calendars} calendarKey={calendarKey} setCalendarKey={setCalendarKey} onSave={saveEvent} loading={loading}/>
  </SafeAreaView>;
}

function Logo({ compact = false }: { compact?: boolean }) { return <View style={styles.logoRow}><View style={styles.logoMark}><View style={[styles.logoBar,{height:10}]}/><View style={[styles.logoBar,{height:17}]}/><View style={[styles.logoBar,{height:24}]}/></View>{!compact && <Text style={styles.logoText}>OneCalendar</Text>}{compact && <Text style={styles.logoTextSmall}>OneCalendar</Text>}</View>; }

function Landing({ onLogin, onExplore }: { onLogin: () => void; onExplore: () => void }) { return <SafeAreaView style={styles.landing}><StatusBar style="dark"/><Logo/><View style={styles.hero}><Text style={styles.eyebrow}>모든 캘린더를 한곳에서</Text><Text style={styles.heroTitle}>내 모든 일정을{`\n`}하나의 달력으로</Text><Text style={styles.heroCopy}>Google·iCloud·회사 일정을 한눈에 확인하고 PC와 모바일에서 그대로 이어서 사용하세요.</Text></View><View style={styles.preview}><View style={styles.previewTop}><Text style={styles.previewMonth}>8월</Text><Text style={styles.previewPill}>오늘 4</Text></View>{["가족과 저녁 약속","프로젝트 주간회의","음력 생일"].map((item,index)=><View key={item} style={styles.previewEvent}><View style={[styles.previewDot,{backgroundColor:["#F3AC31","#26A47C","#735BF2"][index]}]}/><Text style={styles.previewText}>{item}</Text><Text style={styles.previewTime}>{["18:30","10:00","종일"][index]}</Text></View>)}</View><View style={styles.landingActions}><Pressable style={styles.googleButton} onPress={onLogin}><Text style={styles.googleG}>G</Text><Text style={styles.googleButtonText}>Google로 시작하기</Text></Pressable><Pressable style={styles.exploreButton} onPress={onExplore}><Text style={styles.exploreText}>로그인 없이 둘러보기</Text></Pressable><Text style={styles.landingNote}>한 번 연결하면 PC와 모바일에서 같은 일정을 사용해요.</Text></View></SafeAreaView>; }

function DayCell({ date, cursor, selected, events, showLunar, onPress }: { date: Date; cursor: Date; selected: Date; events: EventItem[]; showLunar: boolean; onPress: () => void }) {
  const key = keyOf(date); const today = key === keyOf(new Date()); const active = key === keyOf(selected); const inMonth = date.getMonth() === cursor.getMonth(); const daily = events.filter(event => keyOf(new Date(event.start)) === key).slice(0,3);
  return <Pressable style={[styles.dayCell,active&&styles.daySelected]} onPress={onPress}><View style={[styles.dayNumberWrap,today&&styles.todayCircle]}><Text style={[styles.dayNumber,!inMonth&&styles.outside,date.getDay()===0&&styles.sunday,date.getDay()===6&&styles.saturday,today&&styles.todayNumber]}>{date.getDate()}</Text></View>{showLunar&&inMonth&&<Text style={styles.lunar}>{lunarText(date)}</Text>}<View style={styles.dots}>{daily.map((event,index)=><View key={index} style={[styles.dot,{backgroundColor:event.calendarColor||"#5B4CF2"}]}/>)}</View></Pressable>;
}

function EventCard({ event }: { event: EventItem }) { const start = new Date(event.start); return <View style={styles.eventCard}><View style={[styles.eventStripe,{backgroundColor:event.calendarColor||COLORS.purple}]}/><View style={styles.eventBody}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{event.allDay ? "종일" : start.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} · {sourceName[event.source]}</Text></View></View>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>○</Text><Text style={styles.emptyText}>{text}</Text></View>; }

function Settings({ session, connected, showLunar, onToggleLunar, onLogin, onLogout }: { session: Session|null; connected: Record<Source,boolean>; showLunar:boolean; onToggleLunar:(value:boolean)=>void; onLogin:()=>void; onLogout:()=>void }) { return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>설정</Text><Text style={styles.pageLead}>OneCalendar를 내 생활에 맞게 설정하세요.</Text><View style={styles.settingCard}><Text style={styles.settingGroup}>내 계정</Text>{session?<><Text style={styles.accountEmail}>{session.user.email}</Text><Text style={styles.settingHint}>PC와 모바일의 연결정보가 안전하게 동기화됩니다.</Text></>:<Pressable style={styles.loginInline} onPress={onLogin}><Text style={styles.loginInlineText}>Google 계정 연결</Text></Pressable>}</View><View style={styles.settingCard}><Text style={styles.settingGroup}>캘린더 연결</Text>{(Object.keys(connected) as Source[]).map(source=><View key={source} style={styles.settingRow}><View style={[styles.sourceIcon,{backgroundColor:source==="google"?"#F3AC31":source==="icloud"?"#6A54F5":"#24A57E"}]}><Text style={styles.sourceIconText}>✓</Text></View><Text style={styles.settingLabel}>{sourceName[source]}</Text><Text style={[styles.connectionState,connected[source]&&styles.connected]}>{connected[source]?"연결됨":"미연결"}</Text></View>)}<Text style={styles.settingHint}>새 캘린더 연결과 암호 변경은 현재 웹 설정에서 할 수 있어요.</Text></View><View style={styles.settingCard}><View style={styles.settingRow}><View><Text style={styles.settingLabel}>대한민국 음력 표시</Text><Text style={styles.settingHint}>날짜 아래에 음력 날짜를 표시합니다.</Text></View><Switch value={showLunar} onValueChange={onToggleLunar} trackColor={{true:COLORS.purple}}/></View></View>{session&&<Pressable style={styles.logout} onPress={onLogout}><Text style={styles.logoutText}>로그아웃</Text></Pressable>}</ScrollView>; }

function EventEditor(props: { open:boolean; onClose:()=>void; date:Date; title:string; setTitle:(v:string)=>void; startTime:string; setStartTime:(v:string)=>void; endTime:string; setEndTime:(v:string)=>void; allDay:boolean; setAllDay:(v:boolean)=>void; calendars:CalendarItem[]; calendarKey:string; setCalendarKey:(v:string)=>void; onSave:()=>void; loading:boolean }) { return <Modal visible={props.open} animationType="slide" transparent onRequestClose={props.onClose}><Pressable style={styles.modalBackdrop} onPress={props.onClose}/><View style={styles.sheet}><View style={styles.sheetHandle}/><View style={styles.sheetHeader}><Pressable onPress={props.onClose}><Text style={styles.cancel}>취소</Text></Pressable><Text style={styles.sheetTitle}>새 일정</Text><Pressable onPress={props.onSave} disabled={props.loading}><Text style={styles.save}>저장</Text></Pressable></View><TextInput style={styles.titleInput} value={props.title} onChangeText={props.setTitle} placeholder="일정 제목" placeholderTextColor="#A3A5B4"/><View style={styles.formRow}><Text style={styles.formLabel}>날짜</Text><Text style={styles.formValue}>{props.date.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"short"})}</Text></View><View style={styles.formRow}><Text style={styles.formLabel}>하루 종일</Text><Switch value={props.allDay} onValueChange={props.setAllDay} trackColor={{true:COLORS.purple}}/></View>{!props.allDay&&<View style={styles.timeRow}><View style={styles.timeField}><Text style={styles.timeLabel}>시작</Text><TextInput style={styles.timeInput} value={props.startTime} onChangeText={props.setStartTime} placeholder="09:00" keyboardType="numbers-and-punctuation"/></View><Text style={styles.timeDash}>—</Text><View style={styles.timeField}><Text style={styles.timeLabel}>종료</Text><TextInput style={styles.timeInput} value={props.endTime} onChangeText={props.setEndTime} placeholder="10:00" keyboardType="numbers-and-punctuation"/></View></View>}<Text style={styles.pickerLabel}>저장할 캘린더</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{props.calendars.map(calendar=>{const key=`${calendar.source}:${calendar.id}`;return <Pressable key={key} style={[styles.calendarChip,props.calendarKey===key&&styles.calendarChipActive]} onPress={()=>props.setCalendarKey(key)}><View style={[styles.chipDot,{backgroundColor:calendar.color}]}/><Text style={[styles.chipText,props.calendarKey===key&&styles.chipTextActive]}>{calendar.name}</Text></Pressable>})}</ScrollView>{!props.calendars.length&&<Text style={styles.noCalendar}>먼저 로그인하고 웹에서 캘린더를 연결해 주세요.</Text>}</View></Modal>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},loading:{flex:1,alignItems:"center",justifyContent:"center",gap:28,backgroundColor:COLORS.bg},header:{height:68,paddingHorizontal:20,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:"white",borderBottomWidth:1,borderBottomColor:COLORS.line},headerActions:{flexDirection:"row",alignItems:"center",gap:10},logoRow:{flexDirection:"row",alignItems:"center",gap:12},logoMark:{width:38,height:38,borderRadius:12,backgroundColor:COLORS.purple,flexDirection:"row",alignItems:"flex-end",justifyContent:"center",gap:3,paddingBottom:8,transform:[{rotate:"-4deg"}]},logoBar:{width:4,borderRadius:3,backgroundColor:"white"},logoText:{fontSize:23,fontWeight:"800",color:COLORS.ink},logoTextSmall:{fontSize:18,fontWeight:"800",color:COLORS.ink},today:{paddingHorizontal:14,paddingVertical:8,borderRadius:12,backgroundColor:"#F0EEFF"},todayText:{color:COLORS.purple,fontWeight:"700"},avatar:{width:36,height:36,borderRadius:18,backgroundColor:COLORS.ink,alignItems:"center",justifyContent:"center"},avatarText:{color:"white",fontWeight:"800"},content:{padding:20,paddingBottom:120},monthNav:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:10},monthTitle:{fontSize:25,fontWeight:"800",color:COLORS.ink},navArrow:{fontSize:38,color:COLORS.ink,paddingHorizontal:15},weekRow:{flexDirection:"row",marginTop:8},weekday:{width:"14.285%",textAlign:"center",fontSize:12,fontWeight:"700",color:COLORS.muted,paddingVertical:8},sunday:{color:"#EF5D69"},saturday:{color:"#3D7BEA"},grid:{flexDirection:"row",flexWrap:"wrap",backgroundColor:"white",borderRadius:20,paddingVertical:8,shadowColor:"#25204F",shadowOpacity:.06,shadowRadius:16,elevation:2},dayCell:{width:"14.285%",height:66,alignItems:"center",paddingTop:5,borderRadius:12},daySelected:{backgroundColor:"#F1EFFF"},dayNumberWrap:{width:27,height:27,borderRadius:14,alignItems:"center",justifyContent:"center"},todayCircle:{backgroundColor:COLORS.purple},dayNumber:{fontSize:14,fontWeight:"650",color:COLORS.ink},todayNumber:{color:"white"},outside:{opacity:.25},lunar:{fontSize:9,color:"#A5A6B1",marginTop:1},dots:{flexDirection:"row",gap:2,marginTop:3},dot:{width:4,height:4,borderRadius:2},agendaHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:26,marginBottom:12},sectionTitle:{fontSize:20,fontWeight:"800",color:COLORS.ink},sectionSub:{fontSize:12,color:COLORS.muted,marginTop:4},addSmall:{backgroundColor:COLORS.purple,paddingHorizontal:15,paddingVertical:10,borderRadius:13},addSmallText:{color:"white",fontWeight:"800"},eventCard:{backgroundColor:"white",borderRadius:16,marginBottom:10,flexDirection:"row",overflow:"hidden",minHeight:72,shadowColor:"#25204F",shadowOpacity:.04,shadowRadius:12,elevation:1},eventStripe:{width:5},eventBody:{padding:14,justifyContent:"center"},eventTitle:{fontSize:15,fontWeight:"750",color:COLORS.ink},eventMeta:{fontSize:12,color:COLORS.muted,marginTop:6},empty:{alignItems:"center",paddingVertical:34,backgroundColor:"white",borderRadius:16},emptyIcon:{fontSize:30,color:"#C7C8D4"},emptyText:{fontSize:13,color:COLORS.muted,marginTop:8},tabbar:{position:"absolute",bottom:0,left:0,right:0,height:82,backgroundColor:"white",borderTopWidth:1,borderTopColor:COLORS.line,flexDirection:"row",paddingBottom:15},tab:{flex:1,alignItems:"center",justifyContent:"center",gap:2},tabIcon:{fontSize:20,color:"#A1A3B1"},tabLabel:{fontSize:11,color:"#A1A3B1",fontWeight:"650"},tabActive:{color:COLORS.purple},fab:{position:"absolute",right:22,top:-26,width:56,height:56,borderRadius:28,backgroundColor:COLORS.purple,alignItems:"center",justifyContent:"center",shadowColor:COLORS.purple,shadowOpacity:.35,shadowRadius:12,elevation:8},fabText:{fontSize:30,color:"white",fontWeight:"300",marginTop:-2},pageTitle:{fontSize:30,fontWeight:"850",color:COLORS.ink,marginTop:12},pageLead:{fontSize:14,color:COLORS.muted,marginTop:7,marginBottom:24},agendaDate:{fontSize:13,fontWeight:"800",color:COLORS.muted,marginTop:13,marginBottom:7},settingCard:{backgroundColor:"white",borderRadius:18,padding:18,marginBottom:14},settingGroup:{fontSize:13,fontWeight:"800",color:COLORS.purple,marginBottom:15},settingRow:{flexDirection:"row",alignItems:"center",gap:12,minHeight:48},settingLabel:{fontSize:15,fontWeight:"700",color:COLORS.ink,flex:1},settingHint:{fontSize:12,lineHeight:18,color:COLORS.muted,marginTop:6},accountEmail:{fontSize:16,fontWeight:"750",color:COLORS.ink},sourceIcon:{width:28,height:28,borderRadius:8,alignItems:"center",justifyContent:"center"},sourceIconText:{color:"white",fontWeight:"900"},connectionState:{fontSize:12,color:COLORS.muted},connected:{color:"#20A47A",fontWeight:"700"},loginInline:{backgroundColor:COLORS.purple,borderRadius:12,padding:14,alignItems:"center"},loginInlineText:{color:"white",fontWeight:"800"},logout:{padding:16,alignItems:"center"},logoutText:{color:"#E05260",fontWeight:"700"},landing:{flex:1,backgroundColor:"white",paddingHorizontal:26,paddingTop:26},hero:{marginTop:55},eyebrow:{fontSize:14,color:COLORS.purple,fontWeight:"800",marginBottom:16},heroTitle:{fontSize:38,lineHeight:50,fontWeight:"850",letterSpacing:-1.3,color:COLORS.ink},heroCopy:{fontSize:15,lineHeight:24,color:COLORS.muted,marginTop:16},preview:{backgroundColor:"#F7F6FD",borderRadius:22,padding:18,marginTop:30},previewTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:10},previewMonth:{fontSize:20,fontWeight:"850",color:COLORS.ink},previewPill:{fontSize:11,color:COLORS.purple,backgroundColor:"#E8E4FF",paddingHorizontal:10,paddingVertical:6,borderRadius:10,fontWeight:"700"},previewEvent:{height:42,backgroundColor:"white",borderRadius:11,marginTop:8,flexDirection:"row",alignItems:"center",paddingHorizontal:12},previewDot:{width:7,height:7,borderRadius:4,marginRight:9},previewText:{fontSize:13,fontWeight:"650",color:COLORS.ink,flex:1},previewTime:{fontSize:11,color:COLORS.muted},landingActions:{marginTop:"auto",paddingBottom:22,gap:11},googleButton:{height:58,borderWidth:1,borderColor:"#DCDDE6",borderRadius:17,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:12},googleG:{fontSize:20,fontWeight:"900",color:"#4285F4"},googleButtonText:{fontSize:16,fontWeight:"800",color:COLORS.ink},exploreButton:{height:56,borderRadius:17,backgroundColor:"#F4F4F8",alignItems:"center",justifyContent:"center"},exploreText:{fontSize:15,fontWeight:"700",color:"#4B4D5F"},landingNote:{fontSize:11,textAlign:"center",color:"#A1A3B1",marginTop:4},modalBackdrop:{flex:1,backgroundColor:"rgba(20,20,35,.32)"},sheet:{backgroundColor:"white",borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:20,paddingBottom:36,minHeight:480},sheetHandle:{width:42,height:5,borderRadius:3,backgroundColor:"#D9DAE3",alignSelf:"center",marginTop:10,marginBottom:14},sheetHeader:{height:46,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sheetTitle:{fontSize:17,fontWeight:"800",color:COLORS.ink},cancel:{fontSize:15,color:COLORS.muted},save:{fontSize:15,color:COLORS.purple,fontWeight:"800"},titleInput:{fontSize:22,fontWeight:"750",color:COLORS.ink,borderBottomWidth:1,borderBottomColor:COLORS.line,paddingVertical:18,marginBottom:5},formRow:{minHeight:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:COLORS.line},formLabel:{fontSize:14,color:COLORS.muted},formValue:{fontSize:14,fontWeight:"650",color:COLORS.ink},timeRow:{flexDirection:"row",alignItems:"flex-end",gap:12,paddingVertical:15},timeField:{flex:1},timeLabel:{fontSize:12,color:COLORS.muted,marginBottom:7},timeInput:{height:48,borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:14,fontSize:17,fontWeight:"700",color:COLORS.ink},timeDash:{fontSize:18,color:COLORS.muted,paddingBottom:13},pickerLabel:{fontSize:12,color:COLORS.muted,marginTop:12,marginBottom:10},calendarChip:{height:40,borderRadius:13,borderWidth:1,borderColor:COLORS.line,flexDirection:"row",alignItems:"center",paddingHorizontal:13,marginRight:8},calendarChipActive:{borderColor:COLORS.purple,backgroundColor:"#F0EEFF"},chipDot:{width:8,height:8,borderRadius:4,marginRight:7},chipText:{fontSize:13,color:COLORS.ink},chipTextActive:{color:COLORS.purple,fontWeight:"750"},noCalendar:{fontSize:13,color:COLORS.muted,paddingVertical:14},
});
