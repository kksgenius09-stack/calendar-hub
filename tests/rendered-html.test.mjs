import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("production build contains the 온달력 worker and assets", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/client/.vite/manifest.json", import.meta.url));
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /온달력 — 모든 달력을 한곳에/);
  assert.match(layout, /<html lang="ko">/);
});
