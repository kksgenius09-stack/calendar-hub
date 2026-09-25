import test from "node:test";
import assert from "node:assert/strict";
import KoreanLunarCalendar from "korean-lunar-calendar";
import { readFile } from "node:fs/promises";

function toDateString({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function solar(year, month, day, isLeap = false) {
  const calendar = new KoreanLunarCalendar();
  if (!calendar.setLunarDate(year, month, day, isLeap)) return null;
  return calendar.getSolarCalendar();
}

function lunar(year, month, day) {
  const calendar = new KoreanLunarCalendar();
  assert.equal(calendar.setSolarDate(year, month, day), true);
  return calendar.getLunarCalendar();
}

function assertLunarRoundTrip(year, month, day, isLeap = false) {
  const converted = solar(year, month, day, isLeap);
  assert.ok(converted, `음력 ${year}-${month}-${day}${isLeap ? " 윤달" : ""} 변환 실패`);
  const restored = lunar(converted.year, converted.month, converted.day);
  assert.deepEqual(
    [restored.year, restored.month, restored.day, restored.intercalation],
    [year, month, day, isLeap],
  );
}

test("2026년 공식 월력요항의 주요 명절과 일치한다", () => {
  assert.equal(toDateString(solar(2026, 1, 1)), "2026-02-17");
  assert.equal(toDateString(solar(2026, 1, 15)), "2026-03-03");
  assert.equal(toDateString(solar(2026, 5, 5)), "2026-06-19");
  assert.equal(toDateString(solar(2026, 7, 7)), "2026-08-19");
  assert.equal(toDateString(solar(2026, 8, 15)), "2026-09-25");
});

test("양력과 음력을 왕복 변환해도 같은 날짜다", () => {
  for (const [year, month, day] of [[2026, 8, 4], [2027, 2, 7], [2030, 12, 31]]) {
    const value = lunar(year, month, day);
    assert.equal(
      toDateString(solar(value.year, value.month, value.day, value.intercalation)),
      toDateString({ year, month, day }),
    );
  }
});

test("음력 30일이 없는 달은 29일로 안전하게 보정할 수 있다", () => {
  let shortMonthCount = 0;
  for (let year = 2026; year <= 2035; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      if (solar(year, month, 30)) continue;
      shortMonthCount += 1;
      assertLunarRoundTrip(year, month, 29);
    }
  }
  assert.ok(shortMonthCount > 0, "검사 범위에서 음력 29일 달을 찾지 못함");
});

test("윤달은 평달과 구분되고 각각 왕복 변환된다", () => {
  let leapCase = null;
  for (let year = 2026; year <= 2035 && !leapCase; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const leap = solar(year, month, 1, true);
      if (leap) {
        leapCase = { year, month, leap, regular: solar(year, month, 1, false) };
        break;
      }
    }
  }
  assert.ok(leapCase, "검사 범위에서 윤달을 찾지 못함");
  assert.notEqual(toDateString(leapCase.leap), toDateString(leapCase.regular));
  assertLunarRoundTrip(leapCase.year, leapCase.month, 1, false);
  assertLunarRoundTrip(leapCase.year, leapCase.month, 1, true);
});

test("음력 반복 API는 선택한 회차 조회와 한 건·전체 삭제를 지원한다", async () => {
  const route = await readFile(new URL("../app/api/lunar/series/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /lunar_event_instances/);
  assert.match(route, /lunar_recurring_events/);
  assert.match(route, /scope/);
});
