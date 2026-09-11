import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("dist/client");

await mkdir(outputDirectory, { recursive: true });

function rewriteAssets(content, prefix) {
  return content.replaceAll("/assets/", `${prefix}assets/`);
}

async function rewriteIfPresent(filename, prefix = "./") {
  const filePath = path.join(outputDirectory, filename);
  try {
    await access(filePath);
  } catch {
    return false;
  }
  const content = await readFile(filePath, "utf8");
  await writeFile(filePath, rewriteAssets(content, prefix), "utf8");
  return true;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactPriority(value = "") {
  return value.replace(" - ", " · ") || "Sem prioridade";
}

function priorityClass(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value) {
  if (!value) return "aguardando sincronização";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return "aguardando sincronização";
  }
}

function buildLawCard(law) {
  const searchText = [
    law.code,
    law.title,
    law.group,
    law.priority,
    law.action,
    law.cut,
    law.alert,
    law.block,
    law.observations,
    ...(law.cargos || []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
  const audit = law.last_audit ? String(law.last_audit).slice(0, 10).split("-").reverse().join("/") : "—";
  const state = (label, done) => `<span class="law-state ${done ? "is-done" : ""}">${done ? "✓" : "○"} ${label}</span>`;
  const cargos = (law.cargos || []).map((cargo) => `<span>${escapeHtml(cargo)}</span>`).join("");
  const details = [
    law.cut ? `<div><strong>Recorte prioritário</strong><p>${escapeHtml(law.cut)}</p></div>` : "",
    law.alert ? `<div class="law-alert"><strong>Vigência / alerta</strong><p>${escapeHtml(law.alert)}</p></div>` : "",
    law.block ? `<div><strong>Bloco sugerido</strong><p>${escapeHtml(law.block)}</p></div>` : "",
    law.observations ? `<div><strong>Observações</strong><p>${escapeHtml(law.observations)}</p></div>` : "",
    `<div><strong>Última auditoria</strong><p>${escapeHtml(audit)}</p></div>`,
  ].join("");
  const shared = law.shared_block
    ? `<div class="law-shared-note">⚠ L30 + L31 + L32 compartilham a meta operacional consolidada do bloco M5.</div>`
    : "";
  const actions = [
    law.notion_url ? `<a href="${escapeHtml(law.notion_url)}" target="_blank" rel="noreferrer">Página da lei ↗</a>` : "",
    law.bank_record_url ? `<a href="${escapeHtml(law.bank_record_url)}" target="_blank" rel="noreferrer">Registro operacional ↗</a>` : "",
    law.official_url ? `<a href="${escapeHtml(law.official_url)}" target="_blank" rel="noreferrer">Fonte oficial ↗</a>` : "",
  ].join("");

  return `<article class="law-card law-priority-${priorityClass(law.priority)}" data-law-card data-group="${escapeHtml(law.group)}" data-priority="${escapeHtml(law.priority || "")}" data-search="${escapeHtml(searchText)}">
    <div class="law-card-top"><span class="law-code">${escapeHtml(law.code)}</span><div class="law-badges"><span class="laws-chip priority-${priorityClass(law.priority)}">${escapeHtml(compactPriority(law.priority))}</span><span class="laws-chip laws-chip-meta">${Number(law.question_target || 0)} questões</span></div></div>
    <h4>${escapeHtml(law.title)}</h4>
    <div class="law-meta-row"><span>Ordem ${escapeHtml(law.operational_order ?? "—")}</span><span>•</span><span>${escapeHtml(law.action || law.status || "")}</span></div>
    <div class="law-cargos">${cargos}</div>
    <div class="law-state-row">${state("Orientação", law.orientation_read)}${state("D0", law.d0)}${state("D7", law.d7)}${state("D20", law.d20)}</div>
    ${shared}
    <details class="law-static-details"><summary class="law-details-button">Ver recorte, vigência e observações</summary><div class="law-details">${details}</div></details>
    <div class="law-actions">${actions}</div>
  </article>`;
}

function extractStylesheetLinks(source) {
  const matches = [...source.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];
  const seen = new Set();
  return matches.map((match) => match[1]).filter((href) => {
    const normalized = href.replace(/^\.\//, "").replace(/^\.\.\//, "").replace(/^\//, "");
    if (!normalized.startsWith("assets/") || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).map((href) => href.replace(/^\.\//, "../").replace(/^\/assets\//, "../assets/"));
}

async function buildLeisStandalone(sourceHtml) {
  const snapshotPath = path.resolve("public/data/leis-primeiro.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const styles = extractStylesheetLinks(sourceHtml)
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("");
  const laws = Array.isArray(snapshot.laws) ? snapshot.laws : [];
  const radars = Array.isArray(snapshot.radars) ? snapshot.radars : [];
  const groups = ["Núcleo comum", "Gestor — Administração", "Apoio Administrativo", "Monitor"];
  const totalQuestions = laws.reduce((sum, law) => sum + Number(law.question_target || 0), 0);
  const mapped = snapshot.summary?.mapped_law_records ?? snapshot.summary?.mapped_operational_records ?? 32;
  const radarCount = snapshot.summary?.radar_records ?? radars.length ?? 1;
  const groupMarkup = groups.map((group) => {
    const items = laws.filter((law) => law.group === group);
    return `<section class="law-group-block" data-law-group><div class="laws-group-title"><h3>${escapeHtml(group)}</h3><span data-group-count>${items.length} normas</span></div><div class="laws-grid">${items.map(buildLawCard).join("")}</div></section>`;
  }).join("");
  const auditNotes = (snapshot.audit_notes || [
    "34 páginas L01–L34 usam 32 registros diretamente mapeados; L30 + L31 + L32 compartilham o registro M5 de acessibilidade.",
    "O 33º registro do banco é o Radar 901 do novo PDE/DF, fora da numeração L01–L34.",
    "L11 tem meta operacional 0 enquanto o edital não fechar cargos e escolaridade.",
    "L33 é Radar forte com 10 questões de familiarização.",
    "L34 permanece com meta 0 durante a vacatio legis; vigência em 28/12/2026.",
  ]).map((note) => `<div><span>✓</span><span>${escapeHtml(note)}</span></div>`).join("");
  const steps = (snapshot.study_sequence || []).map((step, index) => `<article class="laws-step"><span>${index + 1}</span><p>${escapeHtml(step)}</p></article>`).join("");
  const radarMarkup = radars.map((radar) => `<article><div><strong>${escapeHtml(radar.title)}</strong><span>${escapeHtml(radar.priority)} · ${Number(radar.question_target || 0)} questões</span></div><a href="${escapeHtml(radar.official_url || radar.url || "#")}" target="_blank" rel="noreferrer">Fonte oficial ↗</a></article>`).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leis Primeiro | SEEDF PPGE</title><meta name="description" content="Trilha operacional de legislação do SEEDF"><link rel="icon" href="../favicon.svg"><link rel="manifest" href="../manifest.webmanifest">${styles}<style>
  html,body{margin:0;min-height:100%;background:#07111f}body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.law-state-row{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 12px}.law-state{font-size:9.5px;padding:5px 7px;border:1px solid rgba(148,163,184,.18);border-radius:999px;color:#91a6bc;background:rgba(255,255,255,.025)}.law-state.is-done{color:#8ff0cf;border-color:rgba(94,224,184,.25);background:rgba(94,224,184,.08)}.law-static-details{margin-top:auto}.law-static-details summary{list-style:none}.law-static-details summary::-webkit-details-marker{display:none}.law-static-details[open] .law-details-button{color:#d8e8fa}.laws-empty{display:none;padding:18px;border:1px solid rgba(148,163,184,.18);border-radius:14px;color:#aebfd2}.static-note{max-width:1440px;margin:0 auto 18px;color:#8ea5bd;font-size:10px;text-align:right}@media(max-width:700px){.law-actions a{width:100%;justify-content:center}.static-note{text-align:left}}
  </style></head><body><main class="laws-page">
  <header class="laws-topbar"><a class="laws-back" href="../">← Dashboard SEEDF</a><div class="laws-sync"><span class="laws-live-dot"></span> Notion → GitHub · ${escapeHtml(formatDate(snapshot.source?.synced_at))}</div></header>
  <section class="laws-hero"><div class="laws-hero-copy"><p class="laws-kicker">⚖️ TRILHA OPERACIONAL · SEEDF PPGE</p><h1>Leis Primeiro</h1><p class="laws-lead">Leitura + questões + flashcards em uma sequência única. O Notion continua sendo a fonte operacional; para conteúdo jurídico, prevalece sempre o texto oficial vigente.</p><div class="laws-hero-actions"><a class="laws-primary" href="${escapeHtml(snapshot.source?.page_url || "#")}" target="_blank" rel="noreferrer">Abrir trilha no Notion ↗</a><a class="laws-secondary" href="#leis">Ir para L01–L34 ↗</a></div></div><div class="laws-hero-card"><div class="laws-seal">✓</div><div><span>Auditoria jurídica</span><strong>11/09/2026</strong><small>${laws.length} páginas · ${snapshot.summary?.bank_records ?? 33} registros no banco</small></div></div></section>
  <section class="laws-stats" aria-label="Resumo da trilha"><article><span>📄</span><span>Páginas L01–L34</span><strong>${laws.length}</strong></article><article><span>🗂️</span><span>Registros no banco · ${mapped} mapeados + ${radarCount} radar</span><strong>${snapshot.summary?.bank_records ?? 33}</strong></article><article><span>🎯</span><span>Questões-meta mapeadas</span><strong>${totalQuestions}</strong></article><article><span>✨</span><span>Regra de avanço</span><strong>D0 fecha o bloco</strong></article></section>
  <section class="laws-panel laws-method"><div class="laws-heading"><div><p class="laws-kicker">SEQUÊNCIA OBRIGATÓRIA</p><h2>Como executar cada norma</h2></div><span class="laws-chip laws-chip-green">✓ sem esperar D7/D20</span></div><div class="laws-steps">${steps}</div><div class="laws-rule"><strong>Critério para avançar:</strong><span>${escapeHtml(snapshot.advance_rule || "orientação + 1ª leitura + questões + flashcards + D0; D7/D20 seguem em paralelo.")}</span></div></section>
  <section class="laws-panel laws-audit"><div class="laws-heading"><div><p class="laws-kicker">AUDITORIA INTEGRAL</p><h2>Pontos que não podem ser perdidos</h2></div><span>⚠</span></div><div class="laws-audit-grid">${auditNotes}</div></section>
  <section class="laws-panel" id="leis"><div class="laws-heading laws-list-heading"><div><p class="laws-kicker">ORDEM REAL DE ESTUDO</p><h2>L01–L34</h2><p>Busque por lei, tema, cargo ou alerta. Abra o cartão para ver recorte, vigência, observações e o estado das revisões.</p></div><span class="laws-result-count"><span id="result-count">${laws.length}</span> de ${laws.length}</span></div><div class="laws-toolbar"><label class="laws-search">⌕ <input id="law-search" placeholder="Buscar LDB, ECA, LRF, LAI..." aria-label="Buscar legislação"></label><label class="laws-select">☷ <select id="group-filter" aria-label="Filtrar por trilha"><option value="">Todos</option>${groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}</select></label><label class="laws-select">◈ <select id="priority-filter" aria-label="Filtrar por prioridade"><option value="">Todas</option><option>P0 - Nuclear</option><option>P1 - Alta</option><option>P2 - Complementar</option><option>Radar forte</option><option>Radar</option></select></label></div><div id="laws-empty" class="laws-empty">Nenhuma norma corresponde aos filtros.</div><div class="laws-groups">${groupMarkup}</div></section>
  ${radars.length ? `<section class="laws-panel laws-radar"><div class="laws-heading"><div><p class="laws-kicker">RADAR NORMATIVO</p><h2>Monitoramento fora da L01–L34</h2></div></div>${radarMarkup}</section>` : ""}
  <div class="static-note">Página publicada em modo estático compatível com GitHub Pages e Android.</div><footer class="laws-footer"><span>SEEDF PPGE · Leis Primeiro</span><span>Fonte operacional: Notion · Fonte jurídica: texto oficial vigente</span></footer></main>
  <script>(function(){const q=document.getElementById('law-search'),g=document.getElementById('group-filter'),p=document.getElementById('priority-filter'),cards=[...document.querySelectorAll('[data-law-card]')],groups=[...document.querySelectorAll('[data-law-group]')],count=document.getElementById('result-count'),empty=document.getElementById('laws-empty');function apply(){const needle=(q.value||'').trim().toLocaleLowerCase('pt-BR');let visible=0;cards.forEach(card=>{const ok=(!needle||card.dataset.search.includes(needle))&&(!g.value||card.dataset.group===g.value)&&(!p.value||card.dataset.priority===p.value);card.style.display=ok?'':'none';if(ok)visible++});groups.forEach(group=>{const shown=[...group.querySelectorAll('[data-law-card]')].some(card=>card.style.display!=='none');group.style.display=shown?'':'none'});count.textContent=String(visible);empty.style.display=visible?'none':'block'};q.addEventListener('input',apply);g.addEventListener('change',apply);p.addEventListener('change',apply);apply()})();</script></body></html>`;
}

for (const filename of ["index.html", "index.rsc", "404.html"]) {
  await rewriteIfPresent(filename, "./");
}

const entries = await readdir(outputDirectory, { withFileTypes: true });
const routeHtmlFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html") && !["index.html", "404.html"].includes(entry.name))
  .map((entry) => entry.name);

for (const filename of routeHtmlFiles) {
  const routeName = filename.slice(0, -".html".length);
  const sourcePath = path.join(outputDirectory, filename);
  const routeDirectory = path.join(outputDirectory, routeName);
  const nestedIndexPath = path.join(routeDirectory, "index.html");
  const source = await readFile(sourcePath, "utf8");

  await mkdir(routeDirectory, { recursive: true });
  if (routeName === "leis") {
    await writeFile(nestedIndexPath, await buildLeisStandalone(source), "utf8");
  } else {
    await writeFile(nestedIndexPath, rewriteAssets(source, "../"), "utf8");
  }

  const matchingRsc = `${routeName}.rsc`;
  const matchingRscPath = path.join(outputDirectory, matchingRsc);
  try {
    const rsc = await readFile(matchingRscPath, "utf8");
    await writeFile(path.join(routeDirectory, "index.rsc"), rewriteAssets(rsc, "../"), "utf8");
    await writeFile(matchingRscPath, rewriteAssets(rsc, "./"), "utf8");
  } catch {
    // RSC output is optional for a statically published route.
  }

  const redirect = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./${routeName}/"><script>location.replace("./${routeName}/" + location.search + location.hash)</script></head><body><a href="./${routeName}/">Abrir ${routeName}</a></body></html>`;
  await writeFile(sourcePath, redirect, "utf8");
  console.log(`GitHub Pages route prepared: /${routeName}/ -> ${routeName}/index.html`);
}

if (routeHtmlFiles.includes("leis.html")) {
  const expectedRoute = path.join(outputDirectory, "leis", "index.html");
  await access(expectedRoute);
  const published = await readFile(expectedRoute, "utf8");
  if (published.includes("__VINEXT_RSC_") || published.includes('import("../assets/')) {
    throw new Error("Leis Primeiro still depends on the Vinext hydration runtime.");
  }
  if (!published.includes("L01") || !published.includes("L34")) {
    throw new Error("Leis Primeiro static publication is missing the L01–L34 content.");
  }
}

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
