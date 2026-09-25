# Calendar Connection Error Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give iCloud and company CalDAV users a safe, actionable explanation when connection setup fails.

**Architecture:** Normalize provider failures into one serializable error model on the server, then render that model through one reusable client error panel. Raw provider messages stay server-side; only allow-listed provider, stage, and error codes can be copied.

**Tech Stack:** Next-compatible route handlers, TypeScript, React 19, existing CalDAV utilities, Node test runner and CSS.

**Spec:** `docs/superpowers/specs/2026-09-25-desktop-calendar-interactions-design.md`

## Global Constraints

- Do not return or render passwords, app-specific passwords, OAuth tokens, encrypted connection payloads, or raw provider response bodies.
- Do not change Google OAuth scopes, consent flow, redirect URLs, branding, or verification configuration.
- Preserve form values after a failed attempt and reuse the same submit action for retry.
- Keep current successful connection behavior and encrypted credential storage unchanged.
- Error codes must be stable and provider-neutral at the client boundary.

## Review Focus

- A network exception that contains a requested URL does not leak that URL's credentials or query string.
- An unknown thrown value maps to `TEMPORARY_ERROR` without exposing `String(error)`.
- A 401 response maps to invalid credentials except an explicit 온달력 session failure, which maps to `AUTH_REQUIRED`.
- Empty successful discovery maps to `NO_CALENDARS`, not invalid credentials.
- Copy details contain only provider, connection stage, and the allow-listed common code.

---

### Task 1: Common connection error model

**Files:**
- Create: `app/lib/connection-errors.ts`
- Create: `tests/connection-errors.test.mjs`

**Interfaces:**
- Consumes: provider `"icloud" | "caldav"`, stage `"validate" | "authenticate" | "discover" | "save"`, and an unknown failure.
- Produces: `ConnectionErrorCode`, `ConnectionErrorPayload`, `mapConnectionError`, and `connectionErrorGuidance`.

- [ ] **Step 1: Write failing mapping and redaction tests**

```js
test("공급자 오류를 공통 연결 오류로 변환한다", () => {
  assert.equal(mapConnectionError("icloud","authenticate",new Error("AUTH_REQUIRED")).code,"AUTH_REQUIRED");
  assert.equal(mapConnectionError("icloud","authenticate",new Error("CALDAV_HTTP_401")).code,"INVALID_CREDENTIALS");
  assert.equal(mapConnectionError("caldav","authenticate",new Error("CALDAV_HTTP_403")).code,"PERMISSION_DENIED");
  assert.equal(mapConnectionError("caldav","discover",new Error("CALDAV_HTTP_404")).code,"CALDAV_PATH_NOT_FOUND");
  assert.equal(mapConnectionError("caldav","discover",new Error("CALDAV_PRINCIPAL_NOT_FOUND")).code,"CALDAV_PATH_NOT_FOUND");
  assert.equal(mapConnectionError("icloud","discover",new Error("NO_CALENDARS")).code,"NO_CALENDARS");
  assert.equal(mapConnectionError("caldav","validate",new Error("INVALID_SERVER_URL")).code,"INVALID_SERVER_URL");
  assert.equal(mapConnectionError("caldav","authenticate",new TypeError("fetch failed")).code,"SERVER_UNREACHABLE");
});

test("알 수 없는 오류와 상세 정보에 비밀값을 포함하지 않는다", () => {
  const value=mapConnectionError("icloud","authenticate",new Error("password=secret-token"));
  assert.equal(value.code,"TEMPORARY_ERROR");
  assert.doesNotMatch(JSON.stringify(value),/secret-token|password=/);
  assert.deepEqual(value.detail,{provider:"icloud",stage:"authenticate",code:"TEMPORARY_ERROR"});
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/connection-errors.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the allow-listed model**

```ts
export type ConnectionErrorCode =
  | "AUTH_REQUIRED" | "INVALID_CREDENTIALS" | "PERMISSION_DENIED"
  | "INVALID_SERVER_URL" | "SERVER_UNREACHABLE" | "CALDAV_PATH_NOT_FOUND"
  | "NO_CALENDARS" | "TEMPORARY_ERROR";
export type ConnectionErrorPayload = {
  code:ConnectionErrorCode; title:string; message:string; action:string;
  detail:{provider:"icloud"|"caldav";stage:"validate"|"authenticate"|"discover"|"save";code:ConnectionErrorCode};
};
export function mapConnectionError(provider, stage, error): ConnectionErrorPayload;
export function connectionErrorGuidance(code:ConnectionErrorCode): Pick<ConnectionErrorPayload,"title"|"message"|"action">;
```

Map only known exact internal codes. Detect network failures by known fetch exception classes/codes without serializing their message. Unknown values always become `TEMPORARY_ERROR`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/connection-errors.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add app/lib/connection-errors.ts tests/connection-errors.test.mjs
git commit -m "Add safe calendar connection errors"
```

### Task 2: Return normalized errors from connection routes

**Files:**
- Modify: `app/api/icloud/connect/route.ts`
- Modify: `app/api/caldav/connect/route.ts`
- Modify: `app/lib/icloud-caldav.ts`
- Modify: `app/lib/company-caldav.ts`
- Modify: `tests/connection-errors.test.mjs`

**Interfaces:**
- Consumes: Task 1's `mapConnectionError`.
- Produces: failed route JSON shaped as `{ connected:false, error:ConnectionErrorPayload }`.

- [ ] **Step 1: Add failing route contract assertions**

Read both route sources and assert every failure branch returns `connected:false` plus a mapped payload; empty discovery throws `NO_CALENDARS`; missing input maps to `INVALID_CREDENTIALS` for credentials and `INVALID_SERVER_URL` for the company server URL.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/connection-errors.test.mjs`

Expected: FAIL because routes return free-form string errors.

- [ ] **Step 3: Preserve meaningful internal CalDAV failures**

Ensure discovery utilities distinguish `CALDAV_HTTP_401`, `CALDAV_HTTP_403`, `CALDAV_HTTP_404`, principal/home path failures, network failures, and empty calendar discovery. Do not attach request bodies, headers, credentials, or raw XML to thrown errors.

- [ ] **Step 4: Replace route catch responses with the common contract**

Use a stage variable advanced from `validate` to `authenticate`, `discover`, and `save`. Return:

```ts
const failure = mapConnectionError("icloud", stage, error);
return NextResponse.json({ connected:false, error:failure }, { status: failure.code === "AUTH_REQUIRED" ? 401 : 400 });
```

Use the corresponding `"caldav"` provider in the company route. Convert missing fields before network access; use `NO_CALENDARS` for an empty result.

- [ ] **Step 5: Run route/model and existing connection tests**

Run: `node --test tests/connection-errors.test.mjs tests/icloud-password-guide.test.mjs tests/branding.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add app/api/icloud/connect/route.ts app/api/caldav/connect/route.ts app/lib/icloud-caldav.ts app/lib/company-caldav.ts tests/connection-errors.test.mjs
git commit -m "Normalize calendar connection failures"
```

### Task 3: Reusable connection error panel

**Files:**
- Create: `app/components/connection-error-panel.tsx`
- Modify: `app/globals.css`
- Create: `tests/connection-error-panel.test.mjs`

**Interfaces:**
- Consumes: `ConnectionErrorPayload`, `retrying:boolean`, and `onRetry:()=>void`.
- Produces: `ConnectionErrorPanel` with guidance, retry, disclosure, and copy controls.

- [ ] **Step 1: Write failing component contract tests**

Assert source contains an alert region, title/message/action rendering, `다시 시도`, a native disclosure labelled `상세 정보`, `navigator.clipboard.writeText`, and a serializer that includes only `provider`, `stage`, and `code`. Assert it does not render form password props or raw error messages.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/connection-error-panel.test.mjs`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the error panel**

```tsx
export function ConnectionErrorPanel({ error, retrying, onRetry }:{
  error:ConnectionErrorPayload; retrying:boolean; onRetry:()=>void;
}) {
  const detail=`provider=${error.detail.provider}\nstage=${error.detail.stage}\ncode=${error.detail.code}`;
  return <section className="connection-error" role="alert">
    <strong>{error.title}</strong><p>{error.message}</p><small>{error.action}</small>
    <button type="button" onClick={onRetry} disabled={retrying}>{retrying?"다시 확인 중…":"다시 시도"}</button>
    <details><summary>상세 정보</summary><pre>{detail}</pre><button type="button" onClick={()=>navigator.clipboard.writeText(detail)}>복사</button></details>
  </section>;
}
```

Handle clipboard rejection by changing only local copy status; never include form state in `detail`.

- [ ] **Step 4: Add minimal CSS**

Style the panel within the existing modal language: pale error background, clear title, compact recovery text, bordered retry button, and subdued disclosure. Keep it readable at the existing narrow-screen breakpoint.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/connection-error-panel.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add app/components/connection-error-panel.tsx app/globals.css tests/connection-error-panel.test.mjs
git commit -m "Add calendar connection error guidance"
```

### Task 4: Integrate errors and retry into both connection modals

**Files:**
- Modify: `app/page.tsx`
- Modify: `tests/icloud-password-guide.test.mjs`
- Modify: `tests/connection-error-panel.test.mjs`

**Interfaces:**
- Consumes: Task 2's route contract and Task 3's `ConnectionErrorPanel`.
- Produces: modal-local `iCloudError` and `calDavError` state and retry behavior.

- [ ] **Step 1: Write failing integration assertions**

Assert each form clears its own error at a new attempt, parses `data.error` as `ConnectionErrorPayload`, keeps the modal and form open on failure, renders `ConnectionErrorPanel`, and passes the same `connectICloud`/`connectCalDav` function to `onRetry`. Assert global `notice` is no longer used for connection-detail failures.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/connection-error-panel.test.mjs tests/icloud-password-guide.test.mjs`

Expected: FAIL because modal error state and panel integration are absent.

- [ ] **Step 3: Add typed modal-local error state**

```ts
const [iCloudError,setICloudError]=useState<ConnectionErrorPayload|null>(null);
const [calDavError,setCalDavError]=useState<ConnectionErrorPayload|null>(null);
```

Before each submit, clear only that modal's error. On a failed response, assign the normalized payload and leave all fields untouched. On success, clear the error, close the modal, and retain the existing reload/notice behavior.

- [ ] **Step 4: Render both panels at the action area**

Place `ConnectionErrorPanel` immediately above each modal's primary connect button. Set `onRetry` to the same submit function and pass the matching connecting boolean.

- [ ] **Step 5: Run focused and full verification**

Run: `node --test tests/connection-errors.test.mjs tests/connection-error-panel.test.mjs tests/icloud-password-guide.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: build succeeds and all tests pass.

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 6: Manually verify locally**

Run: `npm run dev`

Verify: missing input, wrong iCloud app password, company 401/403/404 or safe simulated equivalents, network failure, retry with retained fields, details copy, and successful connection. Confirm copied details never contain any typed account secret.

- [ ] **Step 7: Commit Task 4**

```bash
git add app/page.tsx tests/icloud-password-guide.test.mjs tests/connection-error-panel.test.mjs
git commit -m "Show actionable calendar connection errors"
```
