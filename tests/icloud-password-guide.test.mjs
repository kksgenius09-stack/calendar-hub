import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("iCloud와 CalDAV 연결 오류는 정규화된 모달 로컬 상태로 보관한다", () => {
  assert.match(page, /useState<ConnectionErrorPayload\s*\|\s*null>\(null\)/);
  assert.match(page, /const \[iCloudError,\s*setICloudError\]/);
  assert.match(page, /const \[calDavError,\s*setCalDavError\]/);
  assert.match(page, /import \{[^}]*type ConnectionErrorPayload[^}]*\} from "@\/app\/lib\/connection-errors"/);
});

test("새 iCloud 시도는 오류를 먼저 지우고 실패해도 입력과 모달 상태를 유지한다", () => {
  const submit = page.match(/const connectICloud = async \(\) => \{([\s\S]*?)\n  const connectCalDav/);
  assert.ok(submit, "iCloud submit handler exists");
  assert.ok(submit[1].indexOf("setICloudError(null)") < submit[1].indexOf("fetch("));
  assert.match(submit[1], /error\?: ConnectionErrorPayload/);
  assert.match(submit[1], /setICloudError\(data\.error\s*\?\?/);
  assert.match(submit[1], /setICloudError\(/);
  assert.doesNotMatch(submit[1], /setICloudForm\(/);
  assert.match(submit[1], /setICloudModal\(false\)/);
});

test("새 회사 일정 시도는 해당 오류만 지우고 실패 시 입력값을 보존한다", () => {
  const submit = page.match(/const connectCalDav = async \(\) => \{([\s\S]*?)\n  const disconnectSource/);
  assert.ok(submit, "CalDAV submit handler exists");
  assert.ok(submit[1].indexOf("setCalDavError(null)") < submit[1].indexOf("fetch("));
  assert.match(submit[1], /error\?: ConnectionErrorPayload/);
  assert.match(submit[1], /setCalDavError\(data\.error\s*\?\?/);
  assert.match(submit[1], /setCalDavError\(/);
  assert.doesNotMatch(submit[1], /setCalDavForm\(/);
  const failureBranch = submit[1].match(/if\s*\(!response\.ok\s*\|\|\s*!data\.connected\)\s*\{([^}]+)\}/);
  assert.ok(failureBranch, "failed connection branch exists");
  assert.doesNotMatch(failureBranch[1], /setCalDavModal\(false\)/);
});
