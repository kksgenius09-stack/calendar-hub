import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "App.tsx"), "utf8");
test("app shell includes loading state and calendar navigation placeholder", () => {
  assert.match(source, /캘린더를 불러오는 중이에요/);
  assert.match(source, /달력 보기/);
  assert.match(source, /월간 · 주간 · 일간 탐색/);
});
