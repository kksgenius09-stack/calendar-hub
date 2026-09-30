# 온달력 모바일 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared iOS·Android mobile app with the current web calendar experience, widget foundations, advertising for free users, and a future-ready premium entitlement boundary.

**Architecture:** Create a separate `mobile/` React Native project that uses the existing Supabase account and calendar API. The full calendar app is the primary product; required iOS and Android widgets are companion surfaces. Keep premium entitlement and ad visibility behind a shared client capability interface; implement native widget targets after the core app shell is verified.

**Tech Stack:** React Native, Expo with native prebuild/config plugins, TypeScript, Supabase Auth, existing Ondal Calendar APIs, iOS WidgetKit, Android App Widget.

**Spec:** `docs/superpowers/specs/2026-09-29-mobile-app-design.md`

## Global Constraints

- iOS and Android must share the same account and calendar behavior.
- Initial release has no purchase UI, but all feature gates use an account entitlement (`free` or `premium`).
- Free users may see ads; premium entitlement disables all app ad slots.
- Ads must never receive event titles, event descriptions, tokens, or calendar credentials.
- Full iOS and Android apps are required; iOS and Android widget extensions are also required companion features, with final layouts defined later.
- Event content and credentials must not be written to analytics logs.

## Review Focus

- Expired or revoked provider sessions: show the same reconnect guidance as web.
- Cross-platform timezone/date handling: preserve all-day and lunar dates.
- Offline or slow network during writes: prevent duplicate submissions and show retry state.
- Premium state unavailable: fail closed to free/ad-supported behavior without blocking calendar use.
- Widget data unavailable or stale: show a safe empty/loading state without exposing credentials.

### Task 1: Mobile project scaffold

**Files:**
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`
- Create: `mobile/src/app/App.tsx`, `mobile/src/config/env.ts`
- Test: `mobile/src/app/App.test.tsx`

**Interfaces:**
- Produces `App` root and typed environment configuration for later tasks.

- [ ] Create the Expo/React Native TypeScript project with iOS and Android targets.
- [ ] Add a smoke test asserting the app shell renders a loading state and calendar navigation placeholder.
- [ ] Run the mobile test command and verify the shell passes.

### Task 2: Shared authentication and calendar API client

**Files:**
- Create: `mobile/src/auth/session.ts`, `mobile/src/api/calendar-client.ts`
- Modify: `mobile/src/app/App.tsx`
- Test: `mobile/src/auth/session.test.ts`, `mobile/src/api/calendar-client.test.ts`

**Interfaces:**
- Produces `getSession()`, `signInWithGoogle()`, and typed calendar read/write methods matching the web API payloads.

- [ ] Add Supabase session bootstrap and Google sign-in callback handling.
- [ ] Add calendar list, event list, create, update, delete, and reconnect error mapping.
- [ ] Test successful session bootstrap, `401` reconnect mapping, and duplicate-write prevention.

### Task 3: Calendar UI parity

**Files:**
- Create: `mobile/src/calendar/CalendarScreen.tsx`, `mobile/src/calendar/EventEditor.tsx`, `mobile/src/calendar/calendar-state.ts`
- Modify: `mobile/src/app/App.tsx`
- Test: `mobile/src/calendar/calendar-state.test.tsx`

**Interfaces:**
- Consumes the API client from Task 2 and exposes month/week/day navigation plus event CRUD callbacks.

- [ ] Implement calendar source toggles, date navigation, loading, empty, and reconnect states.
- [ ] Implement event editor with all-day, time range, recurrence, lunar repeat, and writable-calendar selection.
- [ ] Test date rendering, lunar repeat form constraints, and provider error messaging.

### Task 4: Entitlement and advertising boundary

**Files:**
- Create: `mobile/src/premium/entitlement.ts`, `mobile/src/ads/AdSlot.tsx`
- Modify: `mobile/src/app/App.tsx`
- Test: `mobile/src/premium/entitlement.test.tsx`

**Interfaces:**
- Produces `getEntitlement()` returning `free | premium` and an `AdSlot` that renders only for `free`.

- [ ] Add a server-backed entitlement interface with a safe free fallback.
- [ ] Add ad slots without passing event or credential data to the SDK.
- [ ] Test free rendering, premium suppression, and unavailable-entitlement fallback.

### Task 5: Required companion widget foundations

**Files:**
- Create: `mobile/widgets/ios/`, `mobile/widgets/android/`, `mobile/src/widgets/widget-store.ts`
- Test: `mobile/src/widgets/widget-store.test.ts`

**Interfaces:**
- Produces sanitized widget snapshot data containing only date labels and safe event summaries.

- [ ] Add iOS WidgetKit and Android App Widget targets as companion features alongside the full app; the app remains usable independently.
- [ ] Add shared widget snapshot persistence and refresh triggers after calendar load/write.
- [ ] Test empty, stale, and populated snapshots without credentials or analytics payloads.

### Task 6: Device verification and release builds

**Files:**
- Modify: `mobile/app.json`, `mobile/eas.json`, `mobile/README.md`
- Test: iOS simulator and Android emulator smoke checks

- [ ] Verify Google login, calendar read/write, reconnect flow, and logout on both platforms.
- [ ] Verify free ads and premium suppression with mocked entitlement values.
- [ ] Verify widget extensions load and show safe empty/populated states.
- [ ] Produce TestFlight and Android internal-test builds; do not submit to stores until widget layouts are finalized.
