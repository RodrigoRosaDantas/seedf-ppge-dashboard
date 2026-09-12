import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildLeisCockpit } from "./build-leis-cockpit.mjs";

const outputDirectory = path.resolve("dist/client");
await mkdir(outputDirectory, { recursive: true });

function rewriteAssets(content, prefix) {
  return content.replaceAll("/assets/", `${prefix}assets/`);
}

async function rewriteIfPresent(filename, prefix = "./") {
  const filePath = path.join(outputDirectory, filename);
  try { await access(filePath); } catch { return false; }
  const content = await readFile(filePath, "utf8");
  await writeFile(filePath, rewriteAssets(content, prefix), "utf8");
  return true;
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function compactPriority(value = "") { return value.replace(" - ", " · ") || "Sem prioridade"; }
function priorityClass(value = "") { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function formatDate(value) {
  if (!value) return "aguardando sincronização";
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
  catch { return "aguardando sincronização"; }
}
function lawSlug(law) { return String(law.code || "").toLowerCase(); }

function buildLawCard(law) {
  const searchText = [law.code, law.title, law.group, law.priority, law.action, law.cut, law.alert, law.block, law.observations, ...(law.cargos || [])].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
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
  const shared = law.shared_block ? `<div class="law-shared-note">⚠ L30 + L31 + L32 compartilham a meta operacional consolidada do bloco M5.</div>` : "";
  const actions = [
    `<a class="law-study-link" href="./${escapeHtml(lawSlug(law))}/">Estudar no site →</a>`,
    law.official_url ? `<a href="${escapeHtml(law.official_url)}" target="_blank" rel="noreferrer">Fonte oficial ↗</a>` : "",
    law.notion_url ? `<a href="${escapeHtml(law.notion_url)}" target="_blank" rel="noreferrer">Notion ↗</a>` : "",
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

function extractStylesheetLinks(source, prefix = "../") {
  const matches = [...source.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];
  const seen = new Set();
  return matches.map((match) => match[1]).map((href) => href.replace(/^\.\.\//, "").replace(/^\.\//, "").replace(/^\//, "")).filter((normalized) => {
    if (!normalized.startsWith("assets/") || seen.has(normalized)) return false;
    seen.add(normalized); return true;
  }).map((normalized) => `${prefix}${normalized}`);
}

function studyStates(law) {
  const state = (label, done) => `<span class="study-state ${done ? "is-done" : ""}">${done ? "✓" : "○"} ${label}</span>`;
  return `${state("Orientação", law.orientation_read)}${state("D0", law.d0)}${state("D7", law.d7)}${state("D20", law.d20)}`;
}

function buildLawStandalone(law, laws, snapshot, stylesheetLinks) {
  const index = laws.findIndex((item) => item.code === law.code);
  const previous = index > 0 ? laws[index - 1] : null;
  const next = index >= 0 && index < laws.length - 1 ? laws[index + 1] : null;
  const styles = stylesheetLinks.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("");
  const cargos = (law.cargos || []).map((cargo) => `<span>${escapeHtml(cargo)}</span>`).join("");
  const content = law.content_html || `<aside class="study-callout">⏳ O conteúdo completo desta norma ainda está sendo sincronizado do Notion. Os dados operacionais abaixo já estão disponíveis.</aside>`;
  const prevLink = previous ? `<a class="study-nav-card" href="../${lawSlug(previous)}/"><small>← ANTERIOR</small><strong>${escapeHtml(previous.code)}</strong><span>${escapeHtml(previous.title)}</span></a>` : `<span class="study-nav-card is-disabled"><small>← ANTERIOR</small><strong>Início</strong></span>`;
  const nextLink = next ? `<a class="study-nav-card is-next" href="../${lawSlug(next)}/"><small>PRÓXIMA →</small><strong>${escapeHtml(next.code)}</strong><span>${escapeHtml(next.title)}</span></a>` : `<a class="study-nav-card is-next" href="../"><small>CONCLUIR →</small><strong>Leis Primeiro</strong><span>Voltar à trilha</span></a>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(law.code)} · ${escapeHtml(law.title)} | SEEDF</title><meta name="description" content="Material interno de estudo ${escapeHtml(law.code)} — SEEDF PPGE"><link rel="icon" href="../../favicon.svg"><link rel="manifest" href="../../manifest.webmanifest">${styles}<style>
html,body{margin:0;min-height:100%;background:#07111f;color:#dbe8f5}body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.study-page{max-width:1050px;margin:0 auto;padding:14px 18px 70px}.study-topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0 18px;font-size:12px}.study-topbar a{color:#a9c0d7;text-decoration:none}.study-progress{color:#7890a8}.study-hero{padding:25px;border:1px solid rgba(148,163,184,.16);border-radius:22px;background:linear-gradient(145deg,rgba(16,38,62,.94),rgba(9,24,42,.96));box-shadow:0 18px 50px rgba(0,0,0,.18)}.study-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;color:#7fc9ef;margin:0 0 10px}.study-hero h1{font-size:clamp(24px,5vw,40px);line-height:1.1;margin:0 0 13px;color:#f2f7fb}.study-meta{display:flex;gap:8px;flex-wrap:wrap}.study-chip,.study-state{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 9px;font-size:10px;color:#9eb4ca;background:rgba(255,255,255,.035)}.study-state.is-done{color:#83e7c2;border-color:rgba(94,224,184,.25);background:rgba(94,224,184,.08)}.study-states{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}.study-cargos{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.study-cargos span{font-size:9px;padding:5px 7px;border-radius:7px;background:rgba(125,211,252,.07);color:#9dc5dd}.study-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.study-summary-card{padding:14px;border:1px solid rgba(148,163,184,.14);background:rgba(12,29,48,.72);border-radius:14px}.study-summary-card strong{display:block;color:#e5f1fb;font-size:11px;margin-bottom:5px}.study-summary-card p{margin:0;color:#9eb1c5;font-size:11px;line-height:1.55}.study-alert{border-color:rgba(245,191,74,.3);background:rgba(245,191,74,.06)}.study-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 22px}.study-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 13px;border-radius:10px;border:1px solid rgba(125,211,252,.22);color:#bce5fa;text-decoration:none;font-size:11px;font-weight:700;background:rgba(125,211,252,.06)}.study-actions a.primary{color:#082031;background:#8bd6f7;border-color:#8bd6f7}.study-content{padding:24px 26px;border:1px solid rgba(148,163,184,.14);background:rgba(9,23,39,.88);border-radius:18px;line-height:1.7;color:#cbd9e7;overflow-wrap:anywhere}.study-content h2{color:#edf6fd;font-size:22px;line-height:1.25;margin:32px 0 12px;padding-top:6px;border-top:1px solid rgba(148,163,184,.11)}.study-content h2:first-child{margin-top:0;border-top:0}.study-content h3{color:#dcecf8;font-size:17px;margin:24px 0 9px}.study-content p{margin:9px 0;font-size:14px}.study-content ul,.study-content ol{padding-left:22px;margin:10px 0}.study-content li{margin:7px 0;font-size:14px}.study-content strong{color:#f1f6fa}.study-content a{color:#7dd3fc;text-decoration:underline;text-underline-offset:3px}.study-content code{padding:2px 5px;border-radius:5px;background:rgba(148,163,184,.12);color:#f1ca75}.study-content blockquote{margin:14px 0;padding:11px 14px;border-left:3px solid #55b8e8;background:rgba(85,184,232,.06);color:#b9cedf}.study-callout{display:block;margin:13px 0;padding:13px 15px;border:1px solid rgba(90,190,238,.22);border-radius:11px;background:rgba(90,190,238,.07);font-size:13px}.study-toggle{margin:10px 0;padding:10px 12px;border:1px solid rgba(148,163,184,.14);border-radius:10px}.study-toggle summary{cursor:pointer;font-weight:700;color:#e3edf5}.study-todo{display:flex;gap:8px;margin:8px 0}.study-content hr{border:0;border-top:1px solid rgba(148,163,184,.15);margin:24px 0}.study-content pre{overflow:auto;padding:14px;border-radius:10px;background:#040b13;font-size:12px}.study-table-wrap{overflow-x:auto;margin:15px 0}.study-content table{width:100%;min-width:520px;border-collapse:collapse;font-size:12px}.study-content th,.study-content td{padding:9px 10px;border:1px solid rgba(148,163,184,.17);text-align:left;vertical-align:top}.study-content th{color:#edf5fb;background:rgba(125,211,252,.08)}.study-content figure{margin:16px 0}.study-content img{display:block;max-width:100%;height:auto;border-radius:10px}.study-media-note{margin:12px 0;padding:12px;border-radius:10px;background:rgba(245,191,74,.07);color:#d8c48e}.study-nav{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.study-nav-card{display:flex;flex-direction:column;gap:4px;padding:14px;border:1px solid rgba(148,163,184,.15);border-radius:13px;background:rgba(12,29,48,.68);text-decoration:none;color:#dceaf5;min-width:0}.study-nav-card small{font-size:9px;color:#7c95ac;font-weight:800;letter-spacing:.09em}.study-nav-card strong{font-size:13px}.study-nav-card span{font-size:10px;color:#91a9bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.study-nav-card.is-next{text-align:right}.study-nav-card.is-disabled{opacity:.45}.study-footer{margin-top:25px;text-align:center;color:#667e95;font-size:10px}@media(max-width:720px){.study-page{padding:8px 11px 55px}.study-topbar{font-size:10px}.study-hero{padding:18px 16px;border-radius:16px}.study-summary-grid{grid-template-columns:1fr}.study-actions a{width:100%}.study-content{padding:18px 15px;border-radius:14px}.study-content h2{font-size:19px}.study-content h3{font-size:16px}.study-content p,.study-content li{font-size:13px}.study-nav{grid-template-columns:1fr}.study-nav-card.is-next{text-align:left}}
</style></head><body><main class="study-page">
<header class="study-topbar"><a href="../">← Leis Primeiro</a><span class="study-progress">${escapeHtml(law.code)} · ${index + 1} de ${laws.length}</span></header>
<section class="study-hero"><p class="study-kicker">⚖️ ${escapeHtml(law.group)} · ${escapeHtml(compactPriority(law.priority))}</p><h1>${escapeHtml(law.code)} — ${escapeHtml(law.title)}</h1><div class="study-meta"><span class="study-chip">🎯 ${Number(law.question_target || 0)} questões-meta</span><span class="study-chip">Ordem ${escapeHtml(law.operational_order ?? "—")}</span><span class="study-chip">${escapeHtml(law.status || law.action || "")}</span></div><div class="study-cargos">${cargos}</div><div class="study-states">${studyStates(law)}</div></section>
<section class="study-summary-grid">${law.cut ? `<article class="study-summary-card"><strong>Recorte prioritário</strong><p>${escapeHtml(law.cut)}</p></article>` : ""}${law.alert ? `<article class="study-summary-card study-alert"><strong>Vigência / alerta</strong><p>${escapeHtml(law.alert)}</p></article>` : ""}${law.block ? `<article class="study-summary-card"><strong>Bloco sugerido</strong><p>${escapeHtml(law.block)}</p></article>` : ""}</section>
<div class="study-actions"><a class="primary" href="${escapeHtml(law.official_url || "#")}" target="_blank" rel="noreferrer">📖 Abrir fonte oficial</a>${law.notion_url ? `<a href="${escapeHtml(law.notion_url)}" target="_blank" rel="noreferrer">Abrir original no Notion ↗</a>` : ""}${law.bank_record_url ? `<a href="${escapeHtml(law.bank_record_url)}" target="_blank" rel="noreferrer">Registro operacional ↗</a>` : ""}</div>
<article class="study-content">${content}</article>
<nav class="study-nav" aria-label="Navegação entre leis">${prevLink}${nextLink}</nav>
<footer class="study-footer">SEEDF PPGE · conteúdo sincronizado do Notion em ${escapeHtml(formatDate(snapshot.source?.synced_at))}</footer>
</main></body></html>`;
}

async function writeInternalLawPages(sourceHtml, snapshot, laws) {
  const stylesheetLinks = extractStylesheetLinks(sourceHtml, "../../");
  const leisDirectory = path.join(outputDirectory, "leis");
  for (const law of laws) {
    const routeDirectory = path.join(leisDirectory, lawSlug(law));
    await mkdir(routeDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "index.html"), buildLawStandalone(law, laws, snapshot, stylesheetLinks), "utf8");
  }
  console.log(`Leis Primeiro: ${laws.length} páginas internas L01–L34 publicadas.`);
}

async function buildLeisStandalone(sourceHtml) {
  const snapshotPath = path.resolve("public/data/leis-primeiro.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const styles = extractStylesheetLinks(sourceHtml, "../").map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("");
  const laws = Array.isArray(snapshot.laws) ? snapshot.laws : [];
  const radars = Array.isArray(snapshot.radars) ? snapshot.radars : [];
  const groups = ["Núcleo comum", "Gestor — Administração", "Apoio Administrativo", "Monitor"];
  const totalQuestions = laws.reduce((sum, law) => sum + Number(law.question_target || 0), 0);
  const mapped = snapshot.summary?.mapped_law_records ?? snapshot.summary?.mapped_operational_records ?? 32;
  const radarCount = snapshot.summary?.radar_records ?? radars.length ?? 1;
  await writeInternalLawPages(sourceHtml, snapshot, laws);
  const groupMarkup = groups.map((group) => { const items = laws.filter((law) => law.group === group); return `<section class="law-group-block" data-law-group><div class="laws-group-title"><h3>${escapeHtml(group)}</h3><span data-group-count>${items.length} normas</span></div><div class="laws-grid">${items.map(buildLawCard).join("")}</div></section>`; }).join("");
  const auditNotes = (snapshot.audit_notes || ["34 páginas L01–L34 usam 32 registros diretamente mapeados; L30 + L31 + L32 compartilham o registro M5 de acessibilidade.","O 33º registro do banco é o Radar 901 do novo PDE/DF, fora da numeração L01–L34.","L11 tem meta operacional 0 enquanto o edital não fechar cargos e escolaridade.","L33 é Radar forte com 10 questões de familiarização.","L34 permanece com meta 0 durante a vacatio legis; vigência em 28/12/2026."]).map((note) => `<div><span>✓</span><span>${escapeHtml(note)}</span></div>`).join("");
  const steps = (snapshot.study_sequence || []).map((step, index) => `<article class="laws-step"><span>${index + 1}</span><p>${escapeHtml(step)}</p></article>`).join("");
  const radarMarkup = radars.map((radar) => `<article><div><strong>${escapeHtml(radar.title)}</strong><span>${escapeHtml(radar.priority)} · ${Number(radar.question_target || 0)} questões</span></div><a href="${escapeHtml(radar.official_url || radar.url || "#")}" target="_blank" rel="noreferrer">Fonte oficial ↗</a></article>`).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leis Primeiro | SEEDF PPGE</title><meta name="description" content="Trilha operacional de legislação do SEEDF"><link rel="icon" href="../favicon.svg"><link rel="manifest" href="../manifest.webmanifest">${styles}<style>
html,body{margin:0;min-height:100%;background:#07111f}body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.law-state-row{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 12px}.law-state{font-size:9.5px;padding:5px 7px;border:1px solid rgba(148,163,184,.18);border-radius:999px;color:#91a6bc;background:rgba(255,255,255,.025)}.law-state.is-done{color:#8ff0cf;border-color:rgba(94,224,184,.25);background:rgba(94,224,184,.08)}.law-static-details{margin-top:auto}.law-static-details summary{list-style:none}.law-static-details summary::-webkit-details-marker{display:none}.law-static-details[open] .law-details-button{color:#d8e8fa}.laws-empty{display:none;padding:18px;border:1px solid rgba(148,163,184,.18);border-radius:14px;color:#aebfd2}.static-note{max-width:1440px;margin:0 auto 18px;color:#8ea5bd;font-size:10px;text-align:right}.law-study-link{background:rgba(125,211,252,.13)!important;border-color:rgba(125,211,252,.38)!important;color:#bfe9fb!important;font-weight:800!important}@media(max-width:700px){.law-actions a{width:100%;justify-content:center}.static-note{text-align:left}}
</style></head><body><main class="laws-page">
<header class="laws-topbar"><a class="laws-back" href="../">← Dashboard SEEDF</a><div class="laws-sync"><span class="laws-live-dot"></span> Notion → GitHub · ${escapeHtml(formatDate(snapshot.source?.synced_at))}</div></header>
<section class="laws-hero"><div class="laws-hero-copy"><p class="laws-kicker">⚖️ TRILHA OPERACIONAL · SEEDF PPGE</p><h1>Leis Primeiro</h1><p class="laws-lead">Agora as páginas L01–L34 abrem e podem ser estudadas dentro do próprio site. O Notion continua como fonte operacional e sincronização; o texto oficial continua prevalecendo juridicamente.</p><div class="laws-hero-actions"><a class="laws-primary" href="#leis">Abrir primeira lei no site ↓</a><a class="laws-secondary" href="${escapeHtml(snapshot.source?.page_url || "#")}" target="_blank" rel="noreferrer">Notion ↗</a></div></div><div class="laws-hero-card"><div class="laws-seal">✓</div><div><span>Páginas internas</span><strong>${laws.length} leis</strong><small>L01–L34 · navegação anterior/próxima</small></div></div></section>
<section class="laws-stats" aria-label="Resumo da trilha"><article><span>📄</span><span>Páginas internas L01–L34</span><strong>${laws.length}</strong></article><article><span>🗂️</span><span>Registros no banco · ${mapped} mapeados + ${radarCount} radar</span><strong>${snapshot.summary?.bank_records ?? 33}</strong></article><article><span>🎯</span><span>Questões-meta mapeadas</span><strong>${totalQuestions}</strong></article><article><span>✨</span><span>Regra de avanço</span><strong>D0 fecha o bloco</strong></article></section>
<section class="laws-panel laws-method"><div class="laws-heading"><div><p class="laws-kicker">SEQUÊNCIA OBRIGATÓRIA</p><h2>Como executar cada norma</h2></div><span class="laws-chip laws-chip-green">✓ sem esperar D7/D20</span></div><div class="laws-steps">${steps}</div><div class="laws-rule"><strong>Critério para avançar:</strong><span>${escapeHtml(snapshot.advance_rule || "orientação + 1ª leitura + questões + flashcards + D0; D7/D20 seguem em paralelo.")}</span></div></section>
<section class="laws-panel laws-audit"><div class="laws-heading"><div><p class="laws-kicker">AUDITORIA INTEGRAL</p><h2>Pontos que não podem ser perdidos</h2></div><span>⚠</span></div><div class="laws-audit-grid">${auditNotes}</div></section>
<section class="laws-panel" id="leis"><div class="laws-heading laws-list-heading"><div><p class="laws-kicker">ORDEM REAL DE ESTUDO</p><h2>L01–L34</h2><p>Use “Estudar no site” para abrir o conteúdo completo sem sair do dashboard.</p></div><span class="laws-result-count"><span id="result-count">${laws.length}</span> de ${laws.length}</span></div><div class="laws-toolbar"><label class="laws-search">⌕ <input id="law-search" placeholder="Buscar LDB, ECA, LRF, LAI..." aria-label="Buscar legislação"></label><label class="laws-select">☷ <select id="group-filter" aria-label="Filtrar por trilha"><option value="">Todos</option>${groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}</select></label><label class="laws-select">◈ <select id="priority-filter" aria-label="Filtrar por prioridade"><option value="">Todas</option><option>P0 - Nuclear</option><option>P1 - Alta</option><option>P2 - Complementar</option><option>Radar forte</option><option>Radar</option></select></label></div><div id="laws-empty" class="laws-empty">Nenhuma norma corresponde aos filtros.</div><div class="laws-groups">${groupMarkup}</div></section>
${radars.length ? `<section class="laws-panel laws-radar"><div class="laws-heading"><div><p class="laws-kicker">RADAR NORMATIVO</p><h2>Monitoramento fora da L01–L34</h2></div></div>${radarMarkup}</section>` : ""}
<div class="static-note">L01–L34 publicadas como páginas internas estáticas, compatíveis com Android e GitHub Pages.</div><footer class="laws-footer"><span>SEEDF PPGE · Leis Primeiro</span><span>Fonte operacional: Notion · Fonte jurídica: texto oficial vigente</span></footer></main>
<script>(function(){const q=document.getElementById('law-search'),g=document.getElementById('group-filter'),p=document.getElementById('priority-filter'),cards=[...document.querySelectorAll('[data-law-card]')],groups=[...document.querySelectorAll('[data-law-group]')],count=document.getElementById('result-count'),empty=document.getElementById('laws-empty');function apply(){const needle=(q.value||'').trim().toLocaleLowerCase('pt-BR');let visible=0;cards.forEach(card=>{const ok=(!needle||card.dataset.search.includes(needle))&&(!g.value||card.dataset.group===g.value)&&(!p.value||card.dataset.priority===p.value);card.style.display=ok?'':'none';if(ok)visible++});groups.forEach(group=>{const shown=[...group.querySelectorAll('[data-law-card]')].some(card=>card.style.display!=='none');group.style.display=shown?'':'none'});count.textContent=String(visible);empty.style.display=visible?'none':'block'};q.addEventListener('input',apply);g.addEventListener('change',apply);p.addEventListener('change',apply);apply()})();</script></body></html>`;
}

for (const filename of ["index.html", "index.rsc", "404.html"]) await rewriteIfPresent(filename, "./");

const entries = await readdir(outputDirectory, { withFileTypes: true });
const routeHtmlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html") && !["index.html", "404.html"].includes(entry.name)).map((entry) => entry.name);

for (const filename of routeHtmlFiles) {
  const routeName = filename.slice(0, -".html".length);
  const sourcePath = path.join(outputDirectory, filename);
  const routeDirectory = path.join(outputDirectory, routeName);
  const nestedIndexPath = path.join(routeDirectory, "index.html");
  const source = await readFile(sourcePath, "utf8");
  await mkdir(routeDirectory, { recursive: true });
  if (routeName === "leis") {
    await buildLeisStandalone(source);
    await writeFile(nestedIndexPath, await buildLeisCockpit(source), "utf8");
  }
  else await writeFile(nestedIndexPath, rewriteAssets(source, "../"), "utf8");

  const matchingRsc = `${routeName}.rsc`;
  const matchingRscPath = path.join(outputDirectory, matchingRsc);
  try {
    const rsc = await readFile(matchingRscPath, "utf8");
    await writeFile(path.join(routeDirectory, "index.rsc"), rewriteAssets(rsc, "../"), "utf8");
    await writeFile(matchingRscPath, rewriteAssets(rsc, "./"), "utf8");
  } catch {}

  const redirect = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./${routeName}/"><script>location.replace("./${routeName}/" + location.search + location.hash)</script></head><body><a href="./${routeName}/">Abrir ${routeName}</a></body></html>`;
  await writeFile(sourcePath, redirect, "utf8");
  console.log(`GitHub Pages route prepared: /${routeName}/ -> ${routeName}/index.html`);
}

if (routeHtmlFiles.includes("leis.html")) {
  const expectedRoute = path.join(outputDirectory, "leis", "index.html");
  await access(expectedRoute);
  const published = await readFile(expectedRoute, "utf8");
  if (published.includes("__VINEXT_RSC_") || published.includes('import("../assets/')) throw new Error("Leis Primeiro still depends on the Vinext hydration runtime.");
  if (!published.includes("L01") || !published.includes("L34")) throw new Error("Leis Primeiro static publication is missing L01–L34.");
  for (let number = 1; number <= 34; number += 1) {
    const code = `L${String(number).padStart(2, "0")}`;
    const internalPath = path.join(outputDirectory, "leis", code.toLowerCase(), "index.html");
    await access(internalPath);
    const internal = await readFile(internalPath, "utf8");
    if (!internal.includes(code) || !internal.includes("study-content")) throw new Error(`Internal study page ${code} failed publication validation.`);
  }
}

await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
