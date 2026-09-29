import React from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { env } from "../config/env";
import { getSession, handleAuthCallback, onSessionChange, signInWithGoogle } from "../auth/session";
import { CalendarScreen } from "../calendar/CalendarScreen";

export function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => { try { const state = await getSession(); if (mounted) setSignedIn(Boolean(state.session)); } catch { if (mounted) setSignedIn(false); } finally { if (mounted) setCheckingSession(false); } };
    const consume = async (url: string | null) => { if (!url) return; try { await handleAuthCallback(url); } catch { /* keep signed-out state */ } finally { await refresh(); } };
    void Linking.getInitialURL().then(consume);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => { void consume(url); });
    const authSubscription = onSessionChange((session) => setSignedIn(Boolean(session)));
    const appStateSubscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    void refresh();
    return () => { mounted = false; linkSubscription.remove(); authSubscription.unsubscribe(); appStateSubscription.remove(); };
  }, []);
  if (signedIn) return <View style={styles.screen} testID="mobile-app-shell"><CalendarScreen /></View>;
  const startGoogleSignIn = async () => {
    if (signingIn || checkingSession) return;
    setSigningIn(true); setAuthError(null);
    try {
      const { url } = await signInWithGoogle();
      const result = await WebBrowser.openAuthSessionAsync(url, env.authRedirectUrl);
      if (result.type === "success") await handleAuthCallback(result.url);
      else if (result.type === "cancel" || result.type === "dismiss") setAuthError("로그인을 취소했어요.");
      else setAuthError("Google 로그인을 완료하지 못했어요.");
      const state = await getSession(); setSignedIn(Boolean(state.session));
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Google 로그인을 시작하지 못했어요."); }
    finally { setSigningIn(false); }
  };
  return <View style={styles.screen} testID="mobile-app-shell">
    <View style={styles.brandMark} accessibilityLabel="온달력"><View style={[styles.markBar, styles.markShort]} /><View style={[styles.markBar, styles.markMedium]} /><View style={[styles.markBar, styles.markTall]} /></View>
    <Text style={styles.eyebrow}>온달력</Text>
    <Text style={styles.title}>모든 일정을{`\n`}한곳에서</Text>
    <Text style={styles.description}>{checkingSession ? "로그인 상태를 확인하고 있어요. 캘린더를 불러오는 중이에요." : "안전하게 로그인하고 일정을 한곳에서 관리해요."}</Text>
    {checkingSession ? <ActivityIndicator color={COLORS.accent} accessibilityLabel="로그인 상태 확인 중" /> : <Pressable accessibilityRole="button" accessibilityLabel="Google로 로그인" accessibilityState={{ disabled: signingIn }} disabled={signingIn} onPress={() => void startGoogleSignIn()} style={styles.googleButton}><Text style={styles.googleLogo}>G</Text><Text style={styles.googleLabel}>{signingIn ? "로그인 중…" : "Google로 계속하기"}</Text>{signingIn && <ActivityIndicator color="#FFFFFF" size="small" />}</Pressable>}
    {authError ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{authError}</Text><Pressable accessibilityRole="button" onPress={() => { setAuthError(null); void startGoogleSignIn(); }} disabled={signingIn} style={styles.retryButton}><Text style={styles.retryLabel}>다시 시도</Text></Pressable></View> : null}
    <Pressable accessibilityRole="button" style={styles.navigationPlaceholder}><Text style={styles.navigationLabel}>달력 보기</Text><Text style={styles.navigationHint}>월간 · 주간 · 일간 탐색</Text></Pressable>
  </View>;
}

const COLORS = { background: "#FAF9FD", ink: "#242337", muted: "#858298", accent: "#7065D8", soft: "#F0EEFA" };
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: COLORS.background },
  brandMark: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 28, marginBottom: 20 }, markBar: { width: 7, borderRadius: 4, backgroundColor: COLORS.accent }, markShort: { height: 11, opacity: 0.6 }, markMedium: { height: 18, opacity: 0.8 }, markTall: { height: 25 },
  eyebrow: { color: COLORS.accent, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 }, title: { marginTop: 14, color: COLORS.ink, fontSize: 36, lineHeight: 45, fontWeight: "800", textAlign: "center", letterSpacing: -1 }, description: { marginTop: 16, marginBottom: 18, color: COLORS.muted, fontSize: 15 }, googleButton: { width: "100%", maxWidth: 560, minHeight: 54, marginTop: 26, paddingHorizontal: 20, borderRadius: 16, backgroundColor: COLORS.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, googleLogo: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" }, googleLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, errorBox: { width: "100%", maxWidth: 560, marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: "#FCEDEF", alignItems: "center" }, errorText: { color: "#A13E52", fontSize: 14, textAlign: "center" }, retryButton: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8 }, retryLabel: { color: COLORS.accent, fontWeight: "700" }, navigationPlaceholder: { width: "100%", maxWidth: 560, marginTop: 24, padding: 18, borderRadius: 18, backgroundColor: COLORS.soft }, navigationLabel: { color: COLORS.ink, fontSize: 16, fontWeight: "700" }, navigationHint: { marginTop: 5, color: COLORS.muted, fontSize: 13 },
});
export default App;
