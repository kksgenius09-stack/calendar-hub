import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("차분한 뉴트럴 색상과 라벤더 포인트를 사용한다", () => {
  assert.match(css, /--ink:\s*#20201e/);
  assert.match(css, /--canvas:\s*#f7f7f5/);
  assert.match(css, /--accent:\s*#77729a/);
  assert.doesNotMatch(css, /--accent:\s*#5b53e9/);
});

test("온달력 로고는 장식 막대 대신 간결한 한글 심볼을 사용한다", () => {
  assert.match(page, /className="brand-mark">온<\/span>/);
  assert.doesNotMatch(page, /className="brand-mark"><i\/><i\/><i\/><\/span>/);
});

test("달력과 주요 입력면은 과한 그림자 없이 얇은 구분선을 사용한다", () => {
  assert.match(css, /\.calendar-card\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.quick-add\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.new-event\s*\{[^}]*box-shadow:\s*none/s);
});
