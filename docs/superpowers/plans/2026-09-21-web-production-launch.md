# 온달력 웹 정식 출시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온달력에 정식 출시용 공개 정책·지원 페이지와 전역 접근 링크를 추가하고, Google OAuth 검증을 신청할 수 있는 배포 상태를 만든다.

**Architecture:** 법적 문서는 로그인과 무관한 정적 App Router 페이지로 제공하고, 공통 문서 셸과 링크 컴포넌트를 공유한다. 현재 캘린더 데이터 흐름은 변경하지 않으며, 소스 기반 계약 테스트와 프로덕션 빌드로 문서 내용·링크·반응형 스타일을 검증한 뒤 Cloudflare Worker에 배포한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vinext/Vite, Node test runner, Cloudflare Workers, Supabase Auth

**Spec:** `docs/superpowers/specs/2026-09-21-web-production-launch-design.md`

## Global Constraints

- 서비스명은 `온달력`, 운영 주체는 `온달력 운영자`로 표기한다.
- 고객지원 및 개인정보 문의 주소는 `kksgenius2@gmail.com`이다.
- 공개 기준 주소는 `https://ondalcalendar.kr`이다.
- 자동 회원탈퇴 기능, 유료 결제, 광고, 모바일 앱 출시는 이번 범위에 포함하지 않는다.
- 삭제 요청은 본인 확인 완료 후 7일 이내 처리한다고 명시한다.
- Google·iCloud·CalDAV 인증정보는 암호화 저장하고, 일반 일정 원문은 데이터베이스에 복제 저장하지 않는 현재 구조를 그대로 설명한다.
- 문구는 법률 자문을 가장하지 않고 실제 구현과 운영 절차만 기술한다.

## Review Focus

- 로그아웃 상태에서도 `/privacy`, `/terms`, `/support`가 인증 리디렉션 없이 열려야 한다. Task 1의 공개 경로 계약 테스트로 고정한다.
- 긴 이메일 주소와 문서 문장이 320px 모바일 화면에서 가로로 넘치지 않아야 한다. Task 1의 CSS 계약 테스트와 Task 4의 브라우저 확인으로 고정한다.
- 개인정보처리방침에 iCloud 앱 전용 암호와 회사 CalDAV 인증정보의 처리 사실이 빠지지 않아야 한다. Task 2의 필수 문구 테스트로 고정한다.
- 삭제 안내는 온달력 서버 데이터와 외부 캘린더에 이미 생성된 일정을 구분해야 한다. Task 3의 삭제 범위 테스트로 고정한다.
- 랜딩과 로그인 후 캘린더 양쪽에서 세 공개 페이지에 접근할 수 있어야 한다. Task 4의 링크 계약 테스트로 고정한다.

---

### Task 1: 공개 문서 셸과 테스트 기반 마련

**Files:**
- Create: `app/components/legal-page.tsx`
- Modify: `app/globals.css`
- Create: `tests/legal-pages.test.mjs`
- Modify: `package.json`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: 기존 `app/layout.tsx` 전역 메타데이터와 `app/globals.css` 디자인 토큰.
- Produces: `LegalPage({ eyebrow, title, description, updatedAt, children })`와 모든 법적 페이지가 공유할 `.legal-*` 스타일.

- [ ] **Step 1: 공개 문서 계약 테스트를 작성한다**

`tests/legal-pages.test.mjs`에 다음 테스트를 추가한다.

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legal routes use a shared public document shell", async () => {
  const [shell, privacy, terms, support] = await Promise.all([
    read("app/components/legal-page.tsx"),
    read("app/privacy/page.tsx"),
    read("app/terms/page.tsx"),
    read("app/support/page.tsx"),
  ]);
  assert.match(shell, /export function LegalPage/);
  for (const page of [privacy, terms, support]) assert.match(page, /<LegalPage/);
  assert.doesNotMatch([privacy, terms, support].join("\n"), /redirect\(|requireOnCalUser|auth\.getUser/);
});

test("legal layout is readable on narrow screens", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.legal-main\s*\{[^}]*max-width:/s);
  assert.match(css, /\.legal-page\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});
```

- [ ] **Step 2: 테스트를 실행해 새 파일이 없어 실패하는지 확인한다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: FAIL with `ENOENT` for `app/components/legal-page.tsx` or a legal route.

- [ ] **Step 3: 공통 문서 셸을 구현한다**

`app/components/legal-page.tsx`를 다음 인터페이스로 만든다.

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ eyebrow, title, description, updatedAt, children }: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return <main className="legal-main"><article className="legal-page">
    <header className="legal-header">
      <Link href="/" className="legal-brand"><span>온</span><b>온달력</b></Link>
      <p>{eyebrow}</p><h1>{title}</h1><em>{description}</em><small>최종 수정일 {updatedAt}</small>
    </header>
    <div className="legal-content">{children}</div>
    <footer className="legal-footer">
      <Link href="/privacy">개인정보처리방침</Link>
      <Link href="/terms">이용약관</Link>
      <Link href="/support">고객지원</Link>
      <Link href="/">온달력으로 돌아가기</Link>
    </footer>
  </article></main>;
}
```

`app/globals.css`에 최대 너비 760px, 본문 줄높이 1.75, `overflow-wrap:anywhere`, 표·목록·제목 간격, 640px 이하 패딩 축소 스타일을 추가한다. 기존 `--canvas`, `--ink`, `--accent`, `--line` 색상 토큰을 재사용하고 새 그림자나 고채도 색을 추가하지 않는다.

- [ ] **Step 4: 임시 페이지 세 개를 만들고 셸 테스트를 통과시킨다**

각 경로에 `LegalPage`를 사용한 최소 페이지를 만들되 Task 2와 Task 3에서 본문을 완성한다.

```tsx
import { LegalPage } from "@/app/components/legal-page";
export default function Page() {
  return <LegalPage eyebrow="온달력 안내" title="문서 제목" description="문서 설명" updatedAt="2026년 9월 21일"><section><h2>안내</h2><p>온달력 운영 정책을 안내합니다.</p></section></LegalPage>;
}
```

Run: `node --test tests/legal-pages.test.mjs`

Expected: PASS for shared shell and narrow-screen rules; later content assertions are not yet present.

- [ ] **Step 5: 오래된 Sites 미리보기 전용 테스트를 현재 앱 계약으로 교체한다**

`tests/rendered-html.test.mjs`에서 삭제된 starter skeleton, `react-loading-skeleton`, `codex-preview`를 요구하는 테스트를 제거한다. 대신 빌드 산출물 존재 여부와 현재 메타데이터를 검사한다.

```js
test("production build contains the 온달력 worker and assets", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/client/.vite/manifest.json", import.meta.url));
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /온달력 — 모든 달력을 한곳에/);
  assert.match(layout, /<html lang="ko">/);
});
```

`package.json`의 테스트 스크립트를 `npm run build && node --test tests/*.test.mjs`로 변경한다.

- [ ] **Step 6: 전체 테스트를 실행한다**

Run: `npm test`

Expected: 기존 검색·음력·브랜딩 테스트와 새 셸 테스트가 모두 PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add app/components/legal-page.tsx app/globals.css app/privacy/page.tsx app/terms/page.tsx app/support/page.tsx tests/legal-pages.test.mjs tests/rendered-html.test.mjs package.json
git commit -m "Add public legal page shell"
```

### Task 2: 개인정보처리방침 작성

**Files:**
- Modify: `app/privacy/page.tsx`
- Modify: `tests/legal-pages.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `LegalPage`.
- Produces: Google 검증에 등록할 공개 URL `https://ondalcalendar.kr/privacy`.

- [ ] **Step 1: 개인정보 필수 항목 테스트를 추가한다**

```js
test("privacy policy describes every stored credential and user right", async () => {
  const privacy = await read("app/privacy/page.tsx");
  for (const phrase of [
    "Google 사용자 식별값", "이메일 주소", "Google OAuth 토큰",
    "iCloud", "앱 전용 암호", "CalDAV", "음력 반복",
    "AES-GCM", "일정 원문을 별도로 복제", "7일 이내",
    "kksgenius2@gmail.com", "온달력 운영자",
  ]) assert.match(privacy, new RegExp(phrase));
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: FAIL because the placeholder privacy page lacks required phrases.

- [ ] **Step 3: `/privacy` 본문을 실제 처리 구조와 일치하게 작성한다**

다음 순서의 절을 모두 포함한다.

1. 총칙과 운영자 정보
2. 처리 항목과 수집 방법
3. 이용 목적
4. 보유 기간과 파기
5. 외부 서비스 이용 및 국외 처리 가능성
6. 개인정보 안전성 확보 조치
7. 이용자의 권리와 행사 방법
8. 개인정보 보호 담당자
9. 방침 변경 고지

본문에는 일반 일정 원문을 DB에 복제하지 않는다는 사실, 음력 반복에 필요한 최소 일정 정보는 저장한다는 예외, 연결 해제 시 해당 공급자의 암호화 인증정보를 삭제한다는 사실을 구분한다. Cloudflare와 Supabase는 서비스 제공을 위한 인프라 사업자로, Google·Apple·회사 그룹웨어는 사용자가 선택한 연결 대상 외부 서비스로 설명한다. 시행일은 `2026년 9월 21일`로 표기한다.

- [ ] **Step 4: 개인정보 테스트를 통과시킨다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: PASS including all credential, retention, contact, and encryption assertions.

- [ ] **Step 5: 커밋한다**

```bash
git add app/privacy/page.tsx tests/legal-pages.test.mjs
git commit -m "Add 온달력 privacy policy"
```

### Task 3: 이용약관과 데이터 삭제 안내 작성

**Files:**
- Modify: `app/terms/page.tsx`
- Modify: `app/support/page.tsx`
- Modify: `tests/legal-pages.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `LegalPage`.
- Produces: `https://ondalcalendar.kr/terms`, `https://ondalcalendar.kr/support`.

- [ ] **Step 1: 약관과 삭제 범위 테스트를 추가한다**

```js
test("terms explain external-service dependency and user responsibilities", async () => {
  const terms = await read("app/terms/page.tsx");
  for (const phrase of ["Google", "Apple", "회사 그룹웨어", "앱 전용 암호", "백업", "대한민국 법령"]) assert.match(terms, new RegExp(phrase));
});

test("support separates server deletion from external calendar deletion", async () => {
  const support = await read("app/support/page.tsx");
  for (const phrase of ["kksgenius2@gmail.com", "본인 확인", "7일 이내", "Supabase 사용자", "연결정보", "음력 반복정보", "외부 캘린더에 이미 생성된 일정"]) assert.match(support, new RegExp(phrase));
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: FAIL because terms and support placeholders lack required clauses.

- [ ] **Step 3: `/terms`를 완성한다**

서비스 목적, 외부 서비스 연결, 이용자의 인증정보 관리 책임, 금지 행위, 서비스 변경·중단, 일정 백업 권고, 책임 제한, 지식재산권, 이용 종료, 준거법을 순서대로 작성한다. 외부 제공자의 장애나 정책 변경으로 동기화가 지연될 수 있음을 알리되 운영자의 고의·중대한 과실에 대한 책임까지 배제하는 문구는 쓰지 않는다.

- [ ] **Step 4: `/support`를 완성한다**

문의 방법, 공급자별 연결 해제, 전체 데이터 삭제 요청 제목 예시(`[온달력 데이터 삭제 요청]`), 로그인 이메일을 통한 최소 본인 확인, 7일 이내 처리, 삭제 대상과 제외 대상을 명확히 작성한다. Google 계정의 제3자 접근 권한 철회 링크와 Apple 앱 전용 암호 폐기 방법도 안내한다.

- [ ] **Step 5: 약관과 지원 테스트를 통과시킨다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: PASS for external dependency, operator responsibility, deletion timing, and external-event distinction.

- [ ] **Step 6: 커밋한다**

```bash
git add app/terms/page.tsx app/support/page.tsx tests/legal-pages.test.mjs
git commit -m "Add terms and data deletion guide"
```

### Task 4: 랜딩과 캘린더에 공개 문서 링크 연결

**Files:**
- Create: `app/components/legal-links.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/legal-pages.test.mjs`

**Interfaces:**
- Consumes: `/privacy`, `/terms`, `/support` 공개 경로.
- Produces: `LegalLinks({ compact?: boolean })`와 랜딩·캘린더 양쪽의 접근 지점.

- [ ] **Step 1: 양쪽 화면 링크 테스트를 추가한다**

```js
test("landing and calendar both expose all public policy links", async () => {
  const [page, links] = await Promise.all([read("app/page.tsx"), read("app/components/legal-links.tsx")]);
  for (const href of ["/privacy", "/terms", "/support"]) assert.match(links, new RegExp(`href=[\\"']${href}[\\"']`));
  assert.ok((page.match(/<LegalLinks/g) ?? []).length >= 2);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: FAIL because `legal-links.tsx` does not exist.

- [ ] **Step 3: 링크 컴포넌트를 작성한다**

```tsx
import Link from "next/link";
export function LegalLinks({ compact = false }: { compact?: boolean }) {
  return <nav className={`legal-links ${compact ? "compact" : ""}`} aria-label="서비스 정책">
    <Link href="/privacy">개인정보처리방침</Link>
    <Link href="/terms">이용약관</Link>
    <Link href="/support">고객지원</Link>
  </nav>;
}
```

- [ ] **Step 4: 랜딩과 로그인 후 화면에 링크를 배치한다**

`LandingPage`의 액션 및 혜택 영역 아래에 기본 `LegalLinks`를 둔다. 메인 캘린더의 사이드바 하단에는 `compact` 링크를 둔다. 좁은 모바일 화면에서는 줄바꿈을 허용하고, 달력 하단 탐색이나 일정 추가 버튼을 가리지 않게 흐름 레이아웃으로 배치한다.

- [ ] **Step 5: 링크와 스타일 테스트를 통과시킨다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: PASS with at least two `LegalLinks` usages and all three routes.

- [ ] **Step 6: 전체 정적 검사와 빌드를 실행한다**

Run: `npm run lint`

Expected: exit 0.

Run: `npm test`

Expected: all tests PASS and Vinext production build completes.

- [ ] **Step 7: 커밋한다**

```bash
git add app/components/legal-links.tsx app/page.tsx app/globals.css tests/legal-pages.test.mjs
git commit -m "Link production policies across 온달력"
```

### Task 5: Google 검증 자료와 프로덕션 배포

**Files:**
- Create: `docs/google-oauth-verification.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: 공개된 홈페이지, `/privacy`, `/terms`, `/support`, Google Calendar 읽기·쓰기 기능.
- Produces: 운영자가 Google Verification Center에 그대로 옮길 수 있는 검증 체크리스트와 설명 초안.

- [ ] **Step 1: 검증 문서 계약 테스트를 추가한다**

`tests/legal-pages.test.mjs`에 다음을 추가한다.

```js
test("Google verification checklist uses production URLs and exact scopes", async () => {
  const guide = await read("docs/google-oauth-verification.md");
  for (const phrase of [
    "https://ondalcalendar.kr", "https://ondalcalendar.kr/privacy",
    "https://ondalcalendar.kr/terms", "https://ondalcalendar.kr/support",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "미등록",
  ]) assert.match(guide, new RegExp(phrase.replaceAll(".", "\\.")));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/legal-pages.test.mjs`

Expected: FAIL because `docs/google-oauth-verification.md` does not exist.

- [ ] **Step 3: Google 검증 제출 가이드를 작성한다**

문서에 다음 값을 정확히 적는다.

- 홈페이지: `https://ondalcalendar.kr`
- 개인정보처리방침: `https://ondalcalendar.kr/privacy`
- 이용약관: `https://ondalcalendar.kr/terms`
- 고객지원/삭제: `https://ondalcalendar.kr/support`
- 요청 범위: `calendar.readonly`, `calendar.events`
- 읽기 범위 설명: 연결된 캘린더와 일정을 월·주·일 화면 및 검색 결과에 표시하기 위함
- 쓰기 범위 설명: 사용자가 선택한 캘린더에 일정을 생성·수정·삭제하고 음력 반복 발생분을 생성하기 위함
- 시연 영상 순서: 비로그인 랜딩 → Google 로그인 → 동의 화면과 주소창 → 일정 조회 → 생성 → 수정 → 삭제 → 연결 해제 → 개인정보처리방침과 삭제 안내
- 영상 공개 범위: YouTube `미등록`
- Search Console 도메인 소유권 확인, 브랜딩·지원 이메일·개발자 연락처 확인, In production 전환, Prepare for verification 제출 체크박스

- [ ] **Step 4: `.env.example`의 운영 환경변수를 명확히 한다**

`PUBLIC_APP_URL=https://ondalcalendar.kr` 예시를 사용하고, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_CREDENTIAL_SECRET`은 Cloudflare Secret으로 등록하며 저장소에 실제 값을 넣지 말라는 주석을 추가한다.

- [ ] **Step 5: 최종 검증을 실행한다**

Run: `npm run lint`

Expected: exit 0.

Run: `npm test`

Expected: all tests PASS.

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 6: 커밋한다**

```bash
git add docs/google-oauth-verification.md .env.example tests/legal-pages.test.mjs
git commit -m "Document Google OAuth production verification"
```

- [ ] **Step 7: Cloudflare에 배포한다**

민감한 값은 출력하지 않고 기존 Cloudflare secrets를 유지한 채 프로덕션 빌드를 배포한다. 배포 명령은 `--keep-vars`를 사용하고 `PUBLIC_APP_URL=https://ondalcalendar.kr`, `ondalcalendar.kr`, `www.ondalcalendar.kr` 도메인을 유지한다.

Expected: Worker version upload and both custom-domain trigger updates succeed.

- [ ] **Step 8: 공개 URL을 검증한다**

다음 URL이 HTTPS에서 HTTP 200을 반환하는지 확인한다.

```text
https://ondalcalendar.kr/
https://ondalcalendar.kr/privacy
https://ondalcalendar.kr/terms
https://ondalcalendar.kr/support
https://www.ondalcalendar.kr/
```

로그아웃 상태에서 세 문서가 열리고, 320px 모바일과 데스크톱에서 가로 스크롤이 없으며, 랜딩과 캘린더에서 정책 링크가 보이는지 브라우저로 확인한다.
