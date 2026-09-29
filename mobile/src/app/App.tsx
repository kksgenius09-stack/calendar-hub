import React from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { getSession, handleAuthCallback, onSessionChange } from "../auth/session";
import { CalendarScreen } from "../calendar/CalendarScreen";

export function App() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => { try { const state = await getSession(); if (mounted) setSignedIn(Boolean(state.session)); } catch { if (mounted) setSignedIn(false); } };
    const consume = async (url: string | null) => { if (!url) return; try { await handleAuthCallback(url); } catch { /* keep signed-out state */ } finally { await refresh(); } };
    void Linking.getInitialURL().then(consume);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => { void consume(url); });
    const authSubscription = onSessionChange((session) => setSignedIn(Boolean(session)));
    const appStateSubscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    void refresh();
    return () => { mounted = false; linkSubscription.remove(); authSubscription.unsubscribe(); appStateSubscription.remove(); };
  }, []);
  if (signedIn) return <View style={styles.screen} testID="mobile-app-shell"><CalendarScreen /></View>;
  return <View style={styles.screen} testID="mobile-app-shell">
    <View style={styles.brandMark} accessibilityLabel="온달력"><View style={[styles.markBar, styles.markShort]} /><View style={[styles.markBar, styles.markMedium]} /><View style={[styles.markBar, styles.markTall]} /></View>
    <Text style={styles.eyebrow}>온달력</Text>
    <Text style={styles.title}>모든 일정을{`\n`}한곳에서</Text>
    <Text style={styles.description}>{signedIn ? "캘린더를 불러오는 중이에요." : "안전하게 로그인하고 일정을 한곳에서 관리해요."}</Text>
    <ActivityIndicator color={COLORS.accent} accessibilityLabel="캘린더 불러오는 중" />
    <Pressable accessibilityRole="button" style={styles.navigationPlaceholder}><Text style={styles.navigationLabel}>달력 보기</Text><Text style={styles.navigationHint}>월간 · 주간 · 일간 탐색</Text></Pressable>
  </View>;
}

const COLORS = { background: "#FAF9FD", ink: "#242337", muted: "#858298", accent: "#7065D8", soft: "#F0EEFA" };
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: COLORS.background },
  brandMark: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 28, marginBottom: 20 }, markBar: { width: 7, borderRadius: 4, backgroundColor: COLORS.accent }, markShort: { height: 11, opacity: 0.6 }, markMedium: { height: 18, opacity: 0.8 }, markTall: { height: 25 },
  eyebrow: { color: COLORS.accent, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 }, title: { marginTop: 14, color: COLORS.ink, fontSize: 36, lineHeight: 45, fontWeight: "800", textAlign: "center", letterSpacing: -1 }, description: { marginTop: 16, marginBottom: 18, color: COLORS.muted, fontSize: 15 }, navigationPlaceholder: { width: "100%", maxWidth: 560, marginTop: 42, padding: 18, borderRadius: 18, backgroundColor: COLORS.soft }, navigationLabel: { color: COLORS.ink, fontSize: 16, fontWeight: "700" }, navigationHint: { marginTop: 5, color: COLORS.muted, fontSize: 13 },
});
export default App;
