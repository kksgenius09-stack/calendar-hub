import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

let source = "";
try {
  source = await readFile(new URL("../app/components/connection-error-panel.tsx", import.meta.url), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("연결 오류 패널은 정규화된 안내와 재시도 및 상세 정보 컨트롤을 제공한다", () => {
  assert.match(source, /role="alert"/);
  assert.match(source, /error\.title/);
  assert.match(source, /error\.message/);
  assert.match(source, /error\.action/);
  assert.match(source, /다시 시도/);
  assert.match(source, /<details/);
  assert.match(source, /<summary>상세 정보<\/summary>/);
  assert.match(source, /navigator\.clipboard\.writeText/);
});

test("복사할 진단 정보에는 provider, stage, code만 포함한다", () => {
  assert.match(source, /provider=\$\{error\.detail\.provider\}/);
  assert.match(source, /stage=\$\{error\.detail\.stage\}/);
  assert.match(source, /code=\$\{error\.detail\.code\}/);
  assert.doesNotMatch(source, /JSON\.stringify\(error|error\.stack|error\.cause/);
});

test("패널은 폼 암호나 원시 오류 메시지를 받거나 렌더링하지 않는다", () => {
  assert.match(source, /error:\s*ConnectionErrorPayload/);
  assert.doesNotMatch(source, /password|rawError|originalError|error\.stack|error\.cause/);
});

test("모달 내부 안내 문구는 모달 전역 small 여백을 재설정한다", () => {
  assert.match(styles, /\.connect-modal\s+\.connection-error-action\s*\{[^}]*margin:\s*0\s*;/);
});

test("두 연결 모달은 오류별 재시도를 동일한 submit handler로 연결한다", () => {
  assert.match(page, /\{iCloudError\s*&&\s*<ConnectionErrorPanel\s+error=\{iCloudError\}\s+retrying=\{iCloudConnecting\}\s+onRetry=\{connectICloud\}\s*\/>\}/);
  assert.match(page, /\{calDavError\s*&&\s*<ConnectionErrorPanel\s+error=\{calDavError\}\s+retrying=\{calDavConnecting\}\s+onRetry=\{connectCalDav\}\s*\/>\}/);
});

test("연결 상세 실패는 전역 notice에 노출하지 않고 각 모달에만 보관한다", () => {
  const iCloudSubmit = page.match(/const connectICloud = async \(\) => \{([\s\S]*?)\n  const connectCalDav/);
  const calDavSubmit = page.match(/const connectCalDav = async \(\) => \{([\s\S]*?)\n  const disconnectSource/);
  assert.ok(iCloudSubmit, "iCloud submit handler exists");
  assert.ok(calDavSubmit, "CalDAV submit handler exists");
  assert.match(iCloudSubmit[1], /error\?: ConnectionErrorPayload/);
  assert.match(calDavSubmit[1], /error\?: ConnectionErrorPayload/);
  assert.doesNotMatch(iCloudSubmit[1], /catch \(error\) \{[^}]*setNotice\(/);
  assert.doesNotMatch(calDavSubmit[1], /catch \(error\) \{[^}]*setNotice\(/);
});

test("회사 일정 연결 성공은 현재 화면을 유지한 채 모달을 닫고 일정을 다시 불러온다", () => {
  const submit = page.match(/const connectCalDav = async \(\) => \{([\s\S]*?)\n  const disconnectSource/);
  assert.ok(submit, "CalDAV submit handler exists");
  assert.match(submit[1], /setCalDavModal\(false\)/);
  assert.ok(submit[1].includes('setNotice("회사 일정이 연결됐어요.")'));
  assert.match(submit[1], /await loadEvents\(\)/);
  assert.doesNotMatch(submit[1], /location\.reload\(\)/);
});
