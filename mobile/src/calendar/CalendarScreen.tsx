import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { calendarClient, CalendarApiError, type CalendarEvent, type Source } from "../api/calendar-client";
import { dayKey, eventsForDay, monthDays, monthLabel } from "./calendar-grid";

const COLORS = { bg: "#FAF9FD", ink: "#272536", muted: "#8A8798", line: "#E9E7EF", accent: "#7166D8", today: "#7166D8", google: "#4E7BEA", icloud: "#63A0D9", daou: "#54B88D" };
const sourceLabel: Record<Source, string> = { google: "Google", icloud: "iCloud", daou: "CalDAV" };
const sourceColor: Record<Source, string> = { google: COLORS.google, icloud: COLORS.icloud, daou: COLORS.daou };

export function CalendarScreen() {
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialFailure, setPartialFailure] = useState<Source[]>([]);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current; setLoading(true); setError(null); setPartialFailure([]);
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0, 23, 59, 59, 999).toISOString();
    const sources = ["google", "icloud", "daou"] as Source[];
    const results = await Promise.allSettled(sources.map((source) => calendarClient.list(source, { from, to })));
    if (generation !== requestGeneration.current) return;
    const loaded = results.flatMap((result) => result.status === "fulfilled" ? result.value.events : []);
    setEvents(loaded); setPartialFailure(results.flatMap((result, index) => result.status === "rejected" ? [sources[index]] : []));
    if (!loaded.length && results.every((result) => result.status === "rejected")) { const first = results[0]; setError(first.status === "rejected" && first.reason instanceof CalendarApiError ? first.reason.message : "캘린더를 불러오지 못했어요."); }
    setLoading(false);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => monthDays(month, events), [month, events]);
  const selectedEvents = useMemo(() => eventsForDay(events, selected), [events, selected]);
  const moveMonth = (delta: number) => { const next = new Date(month.getFullYear(), month.getMonth() + delta, 1); setMonth(next); setSelected(dayKey(next)); };
  return <View style={styles.screen}>
    <View style={[styles.content, tablet && styles.tabletContent]}>
      <View style={styles.header}><View><Text style={styles.kicker}>온달력</Text><Text style={styles.title}>{monthLabel(month)}</Text></View><Pressable accessibilityRole="button" onPress={() => { const today = new Date(); setMonth(today); setSelected(dayKey(today)); }} style={styles.todayButton}><Text style={styles.todayText}>오늘</Text></Pressable></View>
      <View style={styles.toolbar}><Pressable accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable><Text style={styles.weekLabel}>일　 월　 화　 수　 목　 금　 토</Text><Pressable accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable></View>
      {loading ? <View style={styles.state}><ActivityIndicator color={COLORS.accent} /><Text style={styles.stateText}>캘린더를 불러오는 중이에요.</Text></View> : error ? <View style={styles.state}><Text style={styles.stateText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>다시 시도</Text></Pressable></View> : <><View style={styles.calendar}>{days.map((day) => <Pressable key={day.key} accessibilityLabel={`${day.key} 일정 ${day.events.length}개`} onPress={() => setSelected(day.key)} style={[styles.day, !day.currentMonth && styles.outside, day.key === selected && styles.selectedDay]}><Text style={[styles.dayNumber, day.today && styles.todayNumber, !day.currentMonth && styles.outsideText]}>{day.date.getDate()}</Text><View style={styles.dots}>{day.events.slice(0, tablet ? 3 : 2).map((event) => <View key={event.id} style={[styles.eventDot, { backgroundColor: sourceColor[event.source] }]} />)}</View></Pressable>)}</View>{partialFailure.length > 0 && <Text style={styles.stateText}>일부 캘린더 연결이 필요해요: {partialFailure.map((source) => sourceLabel[source]).join(", ")}</Text>}</>}
      <View style={styles.detail}><View style={styles.detailHeader}><Text style={styles.detailDate}>{selected.slice(5).replace("-", ".")}</Text><Text style={styles.detailCount}>{selectedEvents.length ? `${selectedEvents.length}개 일정` : "일정 없음"}</Text></View>{selectedEvents.length ? <ScrollView horizontal={tablet} contentContainerStyle={tablet ? styles.eventRow : undefined} showsHorizontalScrollIndicator={false}>{selectedEvents.map((event) => <View key={event.id} style={[styles.eventCard, tablet && styles.tabletEventCard, { borderLeftColor: sourceColor[event.source] }]}><Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{event.allDay ? "종일" : new Date(event.start).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })} · {sourceLabel[event.source]}</Text></View>)}</ScrollView> : <Text style={styles.empty}>선택한 날짜에 등록된 일정이 없어요.</Text>}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: COLORS.bg }, content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 }, tabletContent: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 40 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, kicker: { color: COLORS.accent, fontSize: 14, fontWeight: "700", letterSpacing: 0.4 }, title: { color: COLORS.ink, fontSize: 28, fontWeight: "800", marginTop: 5, letterSpacing: -0.7 }, todayButton: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: "#FFF", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 9 }, todayText: { color: COLORS.ink, fontWeight: "700" }, toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 30, marginBottom: 8 }, weekLabel: { flex: 1, textAlign: "center", color: COLORS.muted, fontSize: 12, letterSpacing: 1 }, arrow: { width: 34, height: 34, alignItems: "center", justifyContent: "center" }, arrowText: { color: COLORS.ink, fontSize: 30, lineHeight: 32, fontWeight: "300" }, calendar: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: COLORS.line, borderRadius: 14, overflow: "hidden", backgroundColor: "#FFF" }, day: { width: "14.2857%", height: 68, padding: 8, borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line }, outside: { backgroundColor: "#FCFBFD" }, selectedDay: { backgroundColor: "#F1EFFF" }, dayNumber: { color: COLORS.ink, fontSize: 13, fontWeight: "600" }, outsideText: { color: "#C1BFCA" }, todayNumber: { color: "#FFF", backgroundColor: COLORS.today, overflow: "hidden", width: 24, height: 24, borderRadius: 12, textAlign: "center", paddingTop: 4 }, dots: { flexDirection: "row", gap: 3, marginTop: 12 }, eventDot: { width: 6, height: 6, borderRadius: 3 }, state: { height: 420, justifyContent: "center", alignItems: "center", gap: 12 }, stateText: { color: COLORS.muted, fontSize: 14 }, retry: { color: COLORS.accent, fontWeight: "700" }, detail: { marginTop: 22, paddingBottom: 24 }, detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, detailDate: { color: COLORS.ink, fontSize: 19, fontWeight: "800" }, detailCount: { color: COLORS.muted, fontSize: 12 }, eventCard: { backgroundColor: "#FFF", borderRadius: 13, borderLeftWidth: 4, padding: 13, marginBottom: 9, shadowColor: "#352A75", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }, tabletEventCard: { width: 250, marginRight: 10 }, eventRow: { paddingBottom: 4 }, eventTitle: { color: COLORS.ink, fontWeight: "700", fontSize: 14 }, eventMeta: { color: COLORS.muted, fontSize: 12, marginTop: 6 }, empty: { color: COLORS.muted, fontSize: 14, paddingVertical: 12 } });

