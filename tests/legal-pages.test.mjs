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

test("privacy policy describes every stored credential and user right", async () => {
  const privacy = await read("app/privacy/page.tsx");
  for (const phrase of [
    "Google 사용자 식별값", "이메일 주소", "Google OAuth 토큰",
    "iCloud", "앱 전용 암호", "CalDAV", "음력 반복",
    "AES-GCM", "일정 원문을 별도로 복제", "7일 이내",
    "kksgenius2@gmail.com", "온달력 운영자",
  ]) assert.match(privacy, new RegExp(phrase));
});

test("terms explain connected services and user responsibilities", async () => {
  const terms = await read("app/terms/page.tsx");
  for (const phrase of [
    "Google", "Apple", "회사 그룹웨어", "앱 전용 암호", "백업", "대한민국 법령",
  ]) assert.match(terms, new RegExp(phrase));
});

test("support explains identity verification and complete deletion scope", async () => {
  const support = await read("app/support/page.tsx");
  for (const phrase of [
    "kksgenius2@gmail.com", "본인 확인", "7일 이내", "Supabase 사용자",
    "연결정보", "음력 반복정보", "외부 캘린더에 이미 생성된 일정",
  ]) assert.match(support, new RegExp(phrase));
});
