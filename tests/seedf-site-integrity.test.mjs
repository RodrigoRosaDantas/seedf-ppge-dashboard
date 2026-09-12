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
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(registration, /serviceWorker\.register/);
  assert.match(layout, /sw-register\.js/);
});

test("the Pages workflow runs tests before publishing", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");
  assert.match(workflow, /npm test/);
});
