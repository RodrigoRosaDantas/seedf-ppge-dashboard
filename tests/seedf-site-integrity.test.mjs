import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("preserves the 34-day law flashcard catalog", async () => {
  const dataset = JSON.parse(await read("public/data/leis-primeiro-flashcards.json"));
  assert.equal(dataset.days.length, 34);
  assert.deepEqual(
    dataset.days.map((day) => day.code),
    Array.from({ length: 34 }, (_, index) => `L${String(index + 1).padStart(2, "0")}`),
  );
  const cards = dataset.days.flatMap((day) => day.cards);
  assert.equal(cards.length, 374);
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length);
  assert.equal(dataset.source.cards, cards.length);
  assert.doesNotMatch(JSON.stringify(dataset), /TJDFT|RICD|C01|TDAS|EDAS/i);
});

test("reader exposes resumable, portable study controls", async () => {
  const html = await read("public/leis/flashcards/index.html");
  assert.match(html, /id="day-select"/);
  assert.match(html, /id="mode-select"/);
  assert.match(html, /id="export-button"/);
  assert.match(html, /id="import-button"/);
  assert.match(html, /URLSearchParams/);
  assert.match(html, /localStorage/);
  assert.match(html, /data-rating="again"/);
  assert.match(html, /rel="icon" href="\.\.\/\.\.\/favicon\.svg"/);
  assert.match(html, /rel="manifest" href="\.\.\/\.\.\/manifest\.webmanifest"/);
  assert.match(html, /id="focus-timer"/);
  assert.match(html, /activeElapsedMs/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /pagehide/);
  assert.match(html, /id="focus-timer-25"/);
  assert.doesNotMatch(html, /rating === "again"\) queue\.push\(doneId\)/);
  assert.match(html, /dueAt: nextDueAt/);
});

test("keeps the active study focus timer local and resumable", async () => {
  const source = await read("app/dashboard-client.tsx");
  assert.match(source, /FOCUS_TIMER_STORAGE_KEY/);
  assert.match(source, /activeElapsedMs/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /pagehide/);
  assert.match(source, /function StudyFocusTimer/);
});

test("keeps dashboard deep links hydration-safe and dates deterministic", async () => {
  const source = await read("app/dashboard-client.tsx");
  assert.match(source, /useState<SectionId>\("inicio"\)/);
  assert.doesNotMatch(source, /useState<SectionId>\(\(\) => sectionFromLocation\(\)\)/);
  assert.match(source, /timeZone: "America\/Sao_Paulo"/);
});

test("keeps unchanged Notion sync snapshots stable", async () => {
  const source = await read("scripts/sync-notion.mjs");
  assert.match(source, /previous\?\.source\?\.content_hash === contentHash/);
  assert.match(source, /previous\.execution\?\.as_of/);
  assert.match(source, /snapshot\.execution\.as_of = previous\.execution\.as_of/);
});

test("published shell includes an offline registration path", async () => {
  const [manifest, serviceWorker, registration, layout] = await Promise.all([
    read("public/manifest.webmanifest"),
    read("public/sw.js"),
    read("public/sw-register.js"),
    read("app/layout.tsx"),
  ]);
  const manifestValue = JSON.parse(manifest);
  assert.equal(manifestValue.display, "standalone");
  assert.equal(manifestValue.orientation, "any");
  assert.match(serviceWorker, /seedf-pages-v3/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(serviceWorker, /cache\.put\(request, copy\)\)\.catch/);
  assert.match(registration, /serviceWorker\.register/);
  assert.match(layout, /sw-register\.js/);
  assert.match(layout, /theme-color/);
});

test("uses the SEEDF PPGE brand mark across the shell", async () => {
  const [favicon, dashboard, manifest] = await Promise.all([
    read("public/favicon.svg"),
    read("app/dashboard-client.tsx"),
    read("public/manifest.webmanifest"),
  ]);
  assert.match(favicon, /SEEDF PPGE/);
  assert.match(favicon, /id="panel"/);
  assert.match(dashboard, /className="brand-mark"><img src="\.\/favicon\.svg"/);
  assert.match(manifest, /favicon\.svg/);
});

test("law page enhancement keeps the brand theme metadata", async () => {
  const source = await read("scripts/enhance-leis-pages.mjs");
  assert.match(source, /function ensureThemeColor/);
  assert.match(source, /name="theme-color"/);
});

test("the Pages workflow runs tests before publishing", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");
  assert.match(workflow, /npm test/);
});

test("the Notion workflow reacts to every snapshot synchronizer", async () => {
  const workflow = await read(".github/workflows/sync-notion.yml");
  assert.match(workflow, /"scripts\/sync-notion\.mjs"/);
  assert.match(workflow, /"scripts\/sync-leis-primeiro\.mjs"/);
  assert.match(workflow, /"scripts\/sync-legislation-bank\.mjs"/);
});
