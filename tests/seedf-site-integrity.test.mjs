import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as vm from "node:vm";

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

test("keeps local law reading payload with Notion as the canonical operational source", async () => {
  const [snapshot, publisher, cockpit, enhancer, appPage] = await Promise.all([
    read("public/data/leis-primeiro.json"),
    read("scripts/prepare-github-pages.mjs"),
    read("scripts/build-leis-cockpit.mjs"),
    read("scripts/enhance-leis-pages.mjs"),
    read("app/leis/page.tsx"),
  ]);
  const dataset = JSON.parse(snapshot);
  assert.equal(dataset.laws.length, 34);
  assert.equal(
    dataset.laws.filter((law) => typeof law.content_html === "string" && law.content_html.trim()).length,
    34,
  );
  assert.match(publisher, /const content = law\.content_html/);
  assert.match(publisher, /Ler no site/);
  assert.match(publisher, /Registro vivo · Notion/);
  assert.match(cockpit, /Fonte canônica: Notion/);
  assert.match(cockpit, /Camada de execução: site/);
  assert.match(enhancer, /fonte operacional: Notion/i);
  assert.match(appPage, /Fonte canônica: Notion/);
});
test("keeps every Leis Primeiro page aligned with the operational method", async () => {
  const dataset = JSON.parse(await read("public/data/leis-primeiro.json"));
  assert.equal(dataset.laws.length, 34);

  for (const law of dataset.laws) {
    const html = law.content_html || "";
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    assert.match(plain, /Estudei o resumo\/material desta página/i, `${law.code}: resumo/material ausente do fechamento`);
    assert.match(plain, /orienta/i, `${law.code}: orientação ausente do fechamento`);
    assert.doesNotMatch(plain, /concluir leitura \+ questões \+ flashcards \+ D0/i, `${law.code}: regra antiga de avanço`);
    assert.doesNotMatch(plain, /\d+\s*\/\s*\d+\s*flashcards|meta numérica de \d+\s*flashcards/i, `${law.code}: meta quantitativa de flashcards`);

    const radar = /radar/i.test(`${law.action || ""} ${law.priority || ""}`);
    if (radar) {
      assert.match(plain, /D0 não é requisito para avanço/i, `${law.code}: Radar voltou a exigir D0`);
    }
  }

  const l01 = dataset.laws.find((law) => law.code === "L01");
  assert.equal(l01?.summaries_done, 1);
  assert.equal(l01?.summary_number, 1);
  assert.equal(l01?.readings_done, 0);
  assert.equal(l01?.reading_number, null);
  assert.equal(l01?.questions_done, 40);
  assert.equal(l01?.operational_target_total, 40);
  assert.equal(l01?.flashcards_done, true);
  assert.equal(l01?.d0, false);
  assert.equal(l01?.next_step, "3 · Ler lei seca");
});

test("keeps Leis Primeiro execution semantics separated by Dia ID", async () => {
  const [syncMain, syncLaws, liveNotion, appPage, cockpit, enhancer, lawCss] = await Promise.all([
    read("scripts/sync-notion.mjs"),
    read("scripts/sync-leis-primeiro.mjs"),
    read("supabase/functions/seedf-notion/index.ts"),
    read("app/leis/page.tsx"),
    read("scripts/build-leis-cockpit.mjs"),
    read("scripts/enhance-leis-pages.mjs"),
    read("public/leis-enhanced.css"),
  ]);
  assert.match(syncMain, /Origem \/ Dia ID/);
  assert.match(syncMain, /const currentErrorPages = errorPages/);
  assert.match(syncMain, /error_count: currentErrors\.length/);
  assert.match(syncMain, /errors: currentErrors/);
  assert.doesNotMatch(syncMain, /!lawErrorIds\.has/);
  assert.match(syncMain, /errors: lawErrors/);
  assert.match(liveNotion, /const currentErrorPages = errorPages/);
  assert.match(liveNotion, /Origem \/ Dia ID/);
  assert.match(liveNotion, /error_count: currentErrorPages\.length/);
  assert.match(liveNotion, /trail && trail !== "Ciclo principal"/);
  assert.doesNotMatch(liveNotion, /error_count: errorPages\.length/);
  assert.match(syncMain, /sort\(compareLeisPrimeiroDays\)/);
  assert.match(syncMain, /left\.page_code === right\.page_code/);
  assert.match(syncMain, /leisPrimeiroSequence\(right\.day_id\) - leisPrimeiroSequence\(left\.day_id\)/);
  assert.match(syncMain, /right\.created_at/);
  assert.match(syncMain, /function parseLeisPrimeiroDay[\s\S]*created_at: page\.created_time/);
  assert.match(syncLaws, /dashboardSnapshot\?\.execution\?\.leis_primeiro/);
  assert.match(syncLaws, /Flashcards feitos\?/);
  assert.match(syncLaws, /propertyRollupNullableNumber\(properties, "Resumo nº atual"\)/);
  assert.match(syncLaws, /propertyRollupNullableNumber\(properties, "Leitura nº atual"\)/);
  assert.match(syncLaws, /meta operacional da Lxx \(base \+ adicional quando aplicável\)/);
  assert.match(syncLaws, /schema_version: 8/);
  assert.match(syncLaws, /individualProgressForSharedLaw/);
  assert.match(syncLaws, /session\.page_code === code/);
  assert.match(syncLaws, /flashcards_scope: "Bloco M5"/);
  assert.match(syncLaws, /laws: lawsWithIndividualProgress/);
  assert.doesNotMatch(syncLaws, /Flashcards-meta|propertyNumber\(properties, "Flashcards feitos"\)/);
  assert.match(syncLaws, /a etapa é binária e não possui meta numérica/);
  assert.match(appPage, /flashcards_done\?: boolean/);
  assert.doesNotMatch(appPage, /flashcardsTarget|flashcards_meta/);
  assert.match(appPage, /Resumo e leitura de lei seca são eventos distintos/);
  assert.match(appPage, /const hasSummary = summariesDone !== null && summariesDone > 0/);
  assert.match(appPage, /const hasReading = readingsDone !== null && readingsDone > 0/);
  assert.match(appPage, /const questionsComplete = questionTarget !== null && questionsDone !== null/);
  assert.doesNotMatch(appPage, /!summariesDone && !readingsDone/);
  assert.match(appPage, /CADERNO DE ERROS/);
  assert.doesNotMatch(appPage, /com flashcard · vínculo por Dia ID/);
  assert.doesNotMatch(cockpit, /com flashcard · vínculo por Dia ID/);
  assert.match(appPage, /latestErrors[\s\S]*item\.day_id === latestExecution\.day_id/);
  assert.match(appPage, /currentState\?\.hasSummary/);
  assert.match(appPage, /currentState\?\.hasReading/);
  assert.match(appPage, /currentState\?\.questionsComplete/);
  assert.match(appPage, /D0 DA NORMA/);
  assert.match(appPage, /currentLaw\?\.d7 && currentLaw\?\.d20/);
  assert.match(appPage, /M5: questões, Flashcards feitos\?, D0, D7 e D20 são do bloco/);
  assert.match(cockpit, /HISTÓRICO REAL · LEIS PRIMEIRO/);
  assert.match(cockpit, /latestErrors[\s\S]*item\.day_id === latestExecution\.day_id/);
  assert.match(cockpit, /currentState\.hasSummary/);
  assert.match(cockpit, /currentState\.questionsComplete/);
  assert.match(cockpit, /currentState\.d7 && currentState\.d20/);
  assert.match(cockpit, /D0 DA NORMA/);
  assert.match(cockpit, /law\.shared_block \? law\.summaries_done/);
  assert.match(cockpit, /Flashcards M5/);
  assert.doesNotMatch(cockpit, /flashcardsTarget|flashcards_meta/);
  assert.match(enhancer, /Ver erros desta execução/);
  assert.match(enhancer, /dayErrors[\s\S]*item\.day_id === latestDay\.day_id/);
  assert.match(enhancer, /const radar = \/radar\/i/);
  assert.match(enhancer, /Unidade de monitoramento; o fluxo normal de fechamento não se aplica/);
  assert.match(enhancer, /M5: resumo e leitura são individuais por Lxx/);
  assert.match(enhancer, /law\.shared_block \? law\.readings_done/);
  assert.doesNotMatch(enhancer, /flashTarget|flashcards_meta|flashcards_status/);
  assert.doesNotMatch(lawCss, /laws-flow-steps\s*\{[^}]*grid-template-columns:\s*repeat\(5/);
  assert.match(lawCss, /laws-flow-steps\s*\{[^}]*grid-template-columns:\s*repeat\(6/);
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

test("shares local reading comfort settings across the SEEDF readers", async () => {
  const [layout, dashboard, appPage, cockpit, enhancer, preferences, preferencesCss, flashcards] = await Promise.all([
    read("app/layout.tsx"),
    read("app/dashboard-client.tsx"),
    read("app/leis/page.tsx"),
    read("scripts/build-leis-cockpit.mjs"),
    read("scripts/enhance-leis-pages.mjs"),
    read("public/reading-preferences.js"),
    read("public/reading-preferences.css"),
    read("public/leis/flashcards/index.html"),
  ]);
  assert.match(layout, /reading-preferences\.js/);
  assert.match(dashboard, /function ReadingSettings/);
  assert.match(appPage, /data-reading-settings/);
  assert.match(cockpit, /data-reading-settings/);
  assert.match(enhancer, /reading-preferences\.css/);
  assert.match(enhancer, /reading-preferences\.js/);
  assert.match(preferences, /seedf-ppge-dashboard:reading-preferences:v1/);
  assert.match(preferences, /localStorage/);
  assert.match(preferences, /data-reading-settings/);
  assert.match(preferencesCss, /data-color-mode="dark"/);
  assert.match(preferencesCss, /data-reading-mode="true"/);
  assert.match(preferencesCss, /data-text-scale="large"/);
  assert.match(flashcards, /reading-preferences\.js/);
  assert.match(flashcards, /data-reading-settings/);
});

test("keeps reading comfort settings in memory when browser storage is unavailable", async () => {
  const source = await read("public/reading-preferences.js");
  const documentElement = { dataset: {}, style: {} };
  const window = {
    localStorage: {
      getItem() { throw new Error("storage blocked"); },
      setItem() { throw new Error("storage blocked"); },
    },
    addEventListener() {},
    dispatchEvent() {},
  };
  const document = {
    documentElement,
    readyState: "complete",
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  vm.runInNewContext(source, { window, document, CustomEvent, Element: class {} });
  assert.equal(window.SEEDFReadingPreferences.read().appearance, "light");
  assert.doesNotThrow(() => window.SEEDFReadingPreferences.write({ appearance: "dark" }));
  assert.equal(window.SEEDFReadingPreferences.read().appearance, "dark");
  assert.equal(documentElement.dataset.colorMode, "dark");
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
  assert.match(serviceWorker, /seedf-pages-v5/);
  assert.match(serviceWorker, /reading-preferences\.js/);
  assert.match(serviceWorker, /reading-preferences\.css/);
  assert.match(serviceWorker, /function networkFirst/);
  assert.match(serviceWorker, /isDataSnapshot/);
  assert.match(serviceWorker, /isStableStudyAsset/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(serviceWorker, /cache\.put\(request, copy\)\)\.catch/);
  assert.match(registration, /serviceWorker[\s\S]*\.register/);
  assert.match(registration, /updateViaCache: "none"/);
  assert.match(registration, /registration\.update\(\)/);
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

test("the Pages workflow runs source tests before build and rendered tests after build", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");
  assert.match(workflow, /npm run test:source/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run test:rendered/);
});

test("the Notion workflow reacts to every snapshot synchronizer", async () => {
  const workflow = await read(".github/workflows/sync-notion.yml");
  assert.match(workflow, /"scripts\/sync-notion\.mjs"/);
  assert.match(workflow, /"scripts\/sync-leis-primeiro\.mjs"/);
  assert.match(workflow, /"scripts\/sync-legislation-bank\.mjs"/);
});
