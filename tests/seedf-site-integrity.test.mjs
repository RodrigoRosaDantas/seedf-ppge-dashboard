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
  assert.match(cockpit, /Camada de leitura: site/);
  assert.match(enhancer, /Painel operacional sincronizado do Notion/);
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

    const radar = /radar|suspenso|fora do escopo/i.test(`${law.strategic_status || ""} ${law.action || ""} ${law.priority || ""}`);
    if (radar) {
      assert.equal(law.operational_target_total, 0, `${law.code}: Radar voltou a gerar meta obrigatória`);
      assert.ok((law.questions_optional ?? 0) >= 0, `${law.code}: acervo opcional inválido`);
    }
  }

  const l01 = dataset.laws.find((law) => law.code === "L01");
  assert.equal(l01?.summaries_done, 1);
  assert.equal(l01?.summary_number, 1);
  assert.equal(l01?.readings_done, 0);
  assert.equal(l01?.reading_number, null);
  assert.ok(typeof l01?.questions_done === "number");
  assert.ok(typeof l01?.operational_target_total === "number");
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
  assert.match(syncLaws, /Questões-meta \+ Questões adicionais definem a carga obrigatória/);
  assert.match(syncLaws, /schema_version: 9/);
  assert.match(syncLaws, /individualProgressForSharedLaw/);
  assert.match(syncLaws, /session\.page_code === code/);
  assert.match(syncLaws, /flashcards_scope: "Bloco M5"/);
  assert.match(syncLaws, /laws: lawsWithIndividualProgress/);
  assert.match(syncLaws, /activeQuestionProgress/);
  assert.match(syncLaws, /strategicallyInactive/);
  assert.doesNotMatch(syncLaws, /sharedBlock \? 10/);
  assert.match(syncMain, /strategic_use: propertyText\(properties, "Uso estratégico pós-TR"\)/);
  assert.match(syncMain, /question_records: lawQuestionPages/);
  assert.match(appPage, /strategic_status\?: string \| null/);
  assert.match(cockpit, /radar\|suspenso\|fora do escopo/);
  assert.doesNotMatch(syncLaws, /Flashcards-meta|propertyNumber\(properties, "Flashcards feitos"\)/);
  assert.match(syncLaws, /a etapa é binária e não possui meta numérica/);
  assert.match(appPage, /flashcards_done\?: boolean/);
  assert.doesNotMatch(appPage, /flashcardsTarget|flashcards_meta/);
  assert.match(appPage, /Resumo e leitura de lei seca são eventos distintos/);
  assert.match(appPage, /const hasSummary = summariesDone !== null && summariesDone > 0/);
  assert.match(appPage, /const hasReading = readingsDone !== null && readingsDone > 0/);
  assert.match(appPage, /const questionsComplete = questionTarget === 0 \|\|/);
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
  assert.match(syncLaws, /meta obrigatória do bloco é 0 e as 10 questões antigas permanecem opcionais/);
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
  assert.match(enhancer, /radar\|suspenso\|fora do escopo/i);
  assert.match(enhancer, /Unidade de monitoramento; o fluxo normal de fechamento não se aplica/);
  assert.match(enhancer, /M5: resumo e leitura são individuais por Lxx; pós-TR/);
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
  assert.match(serviceWorker, /cache\.addAll\(CORE_ASSETS\)/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\(CORE_ASSETS\)\.catch/);
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

test("the Pages workflow validates the exact final artifact before publishing", async () => {
  const [workflow, serviceWorker] = await Promise.all([
    read(".github/workflows/deploy-pages.yml"),
    read("public/sw.js"),
  ]);
  const sourceIndex = workflow.indexOf("npm run test:source");
  const buildIndex = workflow.indexOf("npm run build");
  const prepareIndex = workflow.indexOf("node scripts/prepare-github-pages.mjs");
  const enhanceIndex = workflow.indexOf("node scripts/enhance-leis-pages.mjs");
  const renderedIndex = workflow.indexOf("npm run test:rendered");
  const uploadIndex = workflow.indexOf("actions/upload-pages-artifact@");
  assert.ok(sourceIndex >= 0 && sourceIndex < buildIndex);
  assert.ok(buildIndex < prepareIndex && prepareIndex < enhanceIndex);
  assert.ok(enhanceIndex < renderedIndex && renderedIndex < uploadIndex);

  const coreAssetsMatch = serviceWorker.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(coreAssetsMatch, "service worker must expose CORE_ASSETS");
  const coreAssets = [...coreAssetsMatch[1].matchAll(/"\.\/([^"]*)"/g)].map((match) => match[1]);
  for (const asset of coreAssets) {
    const publishedPath = asset === "" ? '""' : '"' + asset + '"';
    assert.ok(workflow.includes(publishedPath), "published smoke must cover core asset: " + (asset || "/"));
  }
});

test("the Notion workflow reacts to every snapshot synchronizer", async () => {
  const workflow = await read(".github/workflows/sync-notion.yml");
  assert.match(workflow, /"scripts\/sync-notion\.mjs"/);
  assert.match(workflow, /"scripts\/sync-leis-primeiro\.mjs"/);
  assert.match(workflow, /"scripts\/sync-legislation-bank\.mjs"/);
});


test("Visual QA tolerates transient Chrome startup without weakening layout assertions", async () => {
  const source = await read("scripts/chrome-cdp.mjs");
  assert.match(source, /launchAttempt<=3/);
  assert.match(source, /poll<150/);
  assert.match(source, /stdio:\["ignore","ignore","pipe"\]/);
  assert.match(source, /Chrome DevTools não iniciou após 3 tentativas/);
});


test("stable snapshot timestamps are presented as data-version timestamps", async () => {
  const [lawsPage, cockpit, enhancer, studyOs] = await Promise.all([
    read("app/leis/page.tsx"),
    read("scripts/build-leis-cockpit.mjs"),
    read("scripts/enhance-leis-pages.mjs"),
    read("app/study-os-client.tsx"),
  ]);
  assert.match(lawsPage, /Versão dos dados/);
  assert.match(cockpit, /Versão dos dados/);
  assert.match(enhancer, /Versão dos dados/);
  assert.match(studyOs, /Versão dos dados/);
  assert.doesNotMatch(lawsPage, /Notion → GitHub · \{formatDate\(snapshot\?\.source\.synced_at\)\}/);
});


test("Pages push deployments checkout the exact triggering SHA", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'push' && github\.sha \|\| 'main' \}\}/);
});


test("unchanged projected edital snapshots keep a stable generatedAt version", async () => {
  const source = await read("scripts/export-edital-verticalizado.mjs");
  assert.match(source, /readPreviousSnapshot\(outputPath\)/);
  assert.match(source, /snapshotContent\(previousSnapshot\)===snapshotContent\(snapshot\)/);
  assert.match(source, /key==='generatedAt'\?undefined:nested/);
  assert.match(source, /snapshot\.generatedAt=previousSnapshot\.generatedAt/);
});


test("GitHub Actions use current Node 24-compatible action majors", async () => {
  const workflows = await Promise.all([
    read(".github/workflows/quality.yml"),
    read(".github/workflows/deploy-pages.yml"),
    read(".github/workflows/sync-notion.yml"),
  ]);
  const joined = workflows.join("\n");
  assert.doesNotMatch(joined, /actions\/(?:checkout|setup-node|upload-artifact)@v4/);
  assert.match(joined, /actions\/checkout@v7/);
  assert.match(joined, /actions\/setup-node@v7/);
  assert.match(joined, /actions\/upload-artifact@v7/);
  assert.match(joined, /actions\/upload-pages-artifact@v5/);
  assert.match(joined, /actions\/deploy-pages@v5/);
});


test("Pages deploys only from real pushes or explicit manual dispatch", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /workflow_run:/);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run/);
});
