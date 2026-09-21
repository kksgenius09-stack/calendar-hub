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
