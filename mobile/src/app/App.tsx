import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Calendar from "expo-calendar/legacy";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { env, getAuthRedirectUrl } from "../config/env";
import { getSession, handleAuthCallback, onSessionChange, signInWithGoogle } from "../auth/session";
import { CalendarScreen } from "../calendar/CalendarScreen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/colors";

WebBrowser.maybeCompleteAuthSession();

function AppContent() {
  const { colors, scheme } = useTheme();
  const logoSource = scheme === "dark" ? require("../../assets/ondalcalendar-logo-dark.png") : require("../../assets/ondalcalendar-logo.png");
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [signedIn, setSignedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => { try { const state = await getSession(); const permission = await Calendar.getCalendarPermissionsAsync(); if (mounted) { setSignedIn(Boolean(state.session)); setSetupDone(permission.status === "granted"); } } catch { if (mounted) { setSignedIn(false); setSetupDone(false); } } finally { if (mounted) setCheckingSession(false); } };
    const consume = async (url: string | null) => {
      if (!url) return;
      try {
        const callbackSession = await handleAuthCallback(url);
        if (mounted) setSignedIn(Boolean(callbackSession.session));
      } catch (error) {
        // Keep the message generic: callback URLs can contain one-time codes.
        if (mounted && !signedIn) setAuthError(error instanceof Error ? error.message : "Google 로그인을 완료하지 못했어요.");
      } finally { await refresh(); }
    };
    void Linking.getInitialURL().then(consume);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => { void consume(url); });
    const authSubscription = onSessionChange((session) => setSignedIn(Boolean(session)));
    const appStateSubscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    void refresh();
    return () => { mounted = false; linkSubscription.remove(); authSubscription.unsubscribe(); appStateSubscription.remove(); };
  }, []);
  const requestDeviceCalendars = async () => {
    try {
      const permission = await Calendar.requestCalendarPermissionsAsync();
      if (permission.status === "granted") {
        await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        setSetupDone(true);
      } else {
        setAuthError("캘린더 권한이 꺼져 있어요. 설정에서 온달력의 캘린더 접근을 허용해 주세요.");
        await Linking.openSettings();
      }
    } catch {
      setAuthError("캘린더 권한을 확인하지 못했어요. 설정에서 온달력의 캘린더 접근을 허용해 주세요.");
      await Linking.openSettings();
    }
  };
  const startGoogleSignIn = async () => {
    if (signingIn || checkingSession) return;
    setSigningIn(true); setAuthError(null);
    try {
      const { url } = await signInWithGoogle();
      const result = await WebBrowser.openAuthSessionAsync(url, getAuthRedirectUrl());
      if (result.type === "success") {
        const callbackSession = await handleAuthCallback(result.url);
        setSignedIn(Boolean(callbackSession.session));
      }
      else if (result.type === "cancel" || result.type === "dismiss") setAuthError("로그인을 취소했어요.");
      else setAuthError("Google 로그인을 완료하지 못했어요.");
      const state = await getSession(); setSignedIn(Boolean(state.session));
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Google 로그인을 시작하지 못했어요."); }
    finally { setSigningIn(false); }
  };
  if (!checkingSession && signedIn) {
    if (setupDone === null || !setupDone) return <View style={styles.screen}><Image source={logoSource} resizeMode="contain" style={styles.authLogo} /><Text style={styles.title}>휴대폰 캘린더 연결</Text><Text style={styles.description}>Google·iCloud·CalDAV 캘린더를 휴대폰에서 직접 불러오고 저장합니다.</Text><Pressable style={styles.googleButton} onPress={() => void requestDeviceCalendars()}><Text style={styles.googleLabel}>휴대폰 캘린더 접근 허용</Text></Pressable></View>;
    return <View style={styles.calendarShell} testID="mobile-app-shell"><CalendarScreen /></View>;
  }
  return <View style={styles.screen} testID="mobile-app-shell">
    <Image source={logoSource} accessibilityLabel="온달력" resizeMode="contain" style={styles.authLogo} />
    <Text style={styles.title}>모든 일정을{`
`}한곳에서</Text>
    <Text style={styles.description}>{checkingSession ? "로그인 상태를 확인하고 있어요. 캘린더를 불러오는 중이에요." : "안전하게 로그인하고 일정을 한곳에서 관리해요."}</Text>
    {checkingSession ? <ActivityIndicator color={colors.accent} accessibilityLabel="로그인 상태 확인 중" /> : <Pressable accessibilityRole="button" accessibilityLabel="Google로 로그인" accessibilityState={{ disabled: signingIn }} disabled={signingIn} onPress={() => void startGoogleSignIn()} style={styles.googleButton}><Text style={styles.googleLogo} accessibilityLabel="Google"><Text style={styles.googleBlue}>G</Text><Text style={styles.googleRed}>o</Text><Text style={styles.googleYellow}>o</Text><Text style={styles.googleBlue}>g</Text><Text style={styles.googleGreen}>l</Text><Text style={styles.googleRed}>e</Text></Text><Text style={styles.googleLabel}>{signingIn ? "로그인 중…" : "Google로 계속하기"}</Text>{signingIn && <ActivityIndicator color="#FFFFFF" size="small" />}</Pressable>}
    {authError ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{authError}</Text><Pressable accessibilityRole="button" onPress={() => { setAuthError(null); void startGoogleSignIn(); }} disabled={signingIn} style={styles.retryButton}><Text style={styles.retryLabel}>다시 시도</Text></Pressable></View> : null}
    <Pressable accessibilityRole="button" style={styles.navigationPlaceholder}><Text style={styles.navigationLabel}>달력 보기</Text><Text style={styles.navigationHint}>월간 · 주간 · 일간 탐색</Text></Pressable>
  </View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.bg },
    calendarShell: { flex: 1, width: "100%", alignItems: "stretch", backgroundColor: colors.bg },
    authLogo: { width: 190, height: 70, borderRadius: 14, marginBottom: 20 },
    eyebrow: { color: colors.accent, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 }, title: { marginTop: 14, color: colors.ink, fontSize: 36, lineHeight: 45, fontWeight: "800", textAlign: "center", letterSpacing: -1 }, description: { marginTop: 16, marginBottom: 18, color: colors.muted, fontSize: 15 }, googleButton: { width: "100%", maxWidth: 560, minHeight: 54, marginTop: 26, paddingHorizontal: 20, borderRadius: 16, backgroundColor: colors.primaryBg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, googleLogo: { fontSize: 20, fontWeight: "800", letterSpacing: -1 }, googleBlue: { color: "#4285F4" }, googleRed: { color: "#EA4335" }, googleYellow: { color: "#FBBC05" }, googleGreen: { color: "#34A853" }, googleLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, errorBox: { width: "100%", maxWidth: 560, marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: colors.dangerBg, alignItems: "center" }, errorText: { color: colors.dangerText, fontSize: 14, textAlign: "center" }, retryButton: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8 }, retryLabel: { color: colors.accent, fontWeight: "700" }, navigationPlaceholder: { width: "100%", maxWidth: 560, marginTop: 24, padding: 18, borderRadius: 18, backgroundColor: colors.soft }, navigationLabel: { color: colors.ink, fontSize: 16, fontWeight: "700" }, navigationHint: { marginTop: 5, color: colors.muted, fontSize: 13 },
  });
}

function AppShell() {
  const { scheme } = useTheme();
  return <>
    <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    <AppContent />
  </>;
}

export function App() {
  return <SafeAreaProvider><ThemeProvider><AppShell /></ThemeProvider></SafeAreaProvider>;
}

export default App;
