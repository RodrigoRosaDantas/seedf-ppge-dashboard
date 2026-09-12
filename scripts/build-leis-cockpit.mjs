import { readFile } from "node:fs/promises";
import path from "node:path";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(done, total) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
}

function compactPriority(value = "") {
  return String(value).replace(" - ", " · ") || "Sem prioridade";
}

function priorityClass(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function lawSlug(law) {
  return String(law.code || "").toLowerCase();
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

function extractStylesheetLinks(source, prefix = "../") {
  const matches = [...source.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];
  const seen = new Set();
  return matches
    .map((match) => match[1])
    .map((href) => href.replace(/^\.\.\//, "").replace(/^\.\//, "").replace(/^\//, ""))
    .filter((href) => {
      if (!href.startsWith("assets/") || seen.has(href)) return false;
      seen.add(href);
      return true;
    })
    .map((href) => `${prefix}${href}`);
}

function radarLaw(law) {
  const action = String(law.action || "").toLocaleLowerCase("pt-BR");
  const priority = String(law.priority || "").toLocaleLowerCase("pt-BR");
  return action.includes("radar") || priority.includes("radar");
}

function operationalUnits(laws = []) {
  const seen = new Set();
  return laws.filter((law) => !radarLaw(law)).filter((law) => {
    const key = law.shared_block ? "M5" : law.code;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowForLaw(law, rowsByCode) {
  return rowsByCode.get(law.code) || null;
}

function stateFor(law, row) {
  const questionTarget = number(law.shared_block ? 10 : (row?.question_target ?? law.question_target));
  const questionsDone = number(row?.questions_done);
  const flashcardsTarget = number(row?.flashcards_meta);
  const flashcardsDone = number(row?.flashcards_done);
  const orientation = Boolean(row?.orientation_read ?? law.orientation_read);
  const d0 = Boolean(row?.d0 ?? law.d0);
  const complete = !radarLaw(law) && orientation && questionsDone >= questionTarget && (!flashcardsTarget || flashcardsDone >= flashcardsTarget) && d0;
  let nextStep = row?.next_step || "1 · Ler orientação";
  if (radarLaw(law)) nextStep = row?.action || law.action || "Radar / monitorar";
  else if (!orientation) nextStep = "1 · Ler orientação";
  else if (questionsDone < questionTarget) nextStep = `3 · Fazer questões (${questionsDone}/${questionTarget})`;
  else if (flashcardsTarget && flashcardsDone < flashcardsTarget) nextStep = `4 · Revisar flashcards (${flashcardsDone}/${flashcardsTarget})`;
  else if (!d0) nextStep = "5 · Fechar D0";
  else nextStep = "Bloco fechado · seguir para a próxima norma";
  return { complete, questionTarget, questionsDone, flashcardsTarget, flashcardsDone, orientation, d0, nextStep };
}

function checkpoint(label, done) {
  return `<span class="laws-checkpoint ${done ? "is-done" : ""}">${done ? "✓" : "○"} ${escapeHtml(label)}</span>`;
}

function studyStageNumber(state) {
  if (!state?.orientation) return 1;
  if (state.questionsDone < state.questionTarget) return 3;
  if (state.flashcardsTarget && state.flashcardsDone < state.flashcardsTarget) return 4;
  return 5;
}

function buildStudyFlow(state) {
  const steps = [
    ["Orientação", "entender o recorte"],
    ["Lei seca", "ler a fonte oficial"],
    ["Questões", "responder e registrar"],
    ["Flashcards", "recuperar o essencial"],
    ["D0", "fechar o bloco"],
  ];
  const active = studyStageNumber(state);
  return `<section class="laws-study-flow" aria-label="Fluxo para fechar uma norma">
    <div class="laws-flow-intro"><p class="laws-kicker">MÉTODO DE FECHAMENTO</p><h2>Uma norma, um bloco fechado.</h2><p>O caminho é fixo. A próxima ação muda conforme o que já foi registrado.</p><span class="laws-flow-now">Agora: <strong>${escapeHtml(state?.complete ? "bloco fechado · seguir para a próxima" : (state?.nextStep || "aguardando sincronização"))}</strong></span></div>
    <ol class="laws-flow-steps">${steps.map(([label, detail], index) => {
      const step = index + 1;
      const done = Boolean(state?.complete) || step < active;
      const current = !state?.complete && step === active;
      return `<li class="${done ? "is-done" : ""} ${current ? "is-current" : ""}"><span>${String(step).padStart(2, "0")}</span><div><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></div></li>`;
    }).join("")}</ol>
    <div class="laws-flow-review"><span>↗</span><div><small>EM PARALELO</small><b>D7 + D20</b><p>não bloqueiam a próxima norma</p></div></div>
  </section>`;
}

function buildTrackCard(group, index, laws, rowsByCode) {
  const groupLaws = laws.filter((law) => law.group === group);
  const executable = operationalUnits(groupLaws);
  const radars = groupLaws.filter(radarLaw);
  const completed = executable.filter((law) => stateFor(law, rowForLaw(law, rowsByCode)).complete).length;
  const pending = executable.find((law) => !stateFor(law, rowForLaw(law, rowsByCode)).complete);
  const headline = pending ? `${pending.code} · ${pending.title}` : (executable.length ? "Grupo concluído" : "Somente monitoramento");
  const href = pending ? `./${lawSlug(pending)}/` : "#mapa-detalhado";
  const action = pending ? `Abrir ${pending.code} →` : "Ver grupo →";
  const radarLabel = radars.length ? ` · ${radars.length} radar` : "";
  const range = groupLaws.length ? `${groupLaws[0].code}–${groupLaws[groupLaws.length - 1].code}` : "—";
  const completion = percent(completed, executable.length);
  const status = pending ? `Próxima: ${pending.code}` : (executable.length ? "Trilha concluída" : "Acompanhar");
  return `<article class="laws-track-card" data-track-group="${escapeHtml(group)}">
    <div class="laws-track-head"><div class="laws-track-head-main"><span class="laws-track-number">0${index + 1}</span><span>${escapeHtml(group)}</span></div><span class="laws-track-range">${escapeHtml(range)}</span></div>
    <div class="laws-track-status">${escapeHtml(status)}</div>
    <strong>${escapeHtml(headline)}</strong>
    <p>${completed}/${executable.length} blocos fechados por D0${radarLabel}.</p>
    <div class="laws-track-progress" aria-label="${completion}% concluído"><span style="width:${completion}%"></span></div>
    <div class="laws-track-foot"><small>${completion}% do grupo</small><a href="${escapeHtml(href)}"><span>${escapeHtml(action)}</span><span aria-hidden="true">↗</span></a></div>
  </article>`;
}

function buildMapRow(law, rowsByCode) {
  const row = rowForLaw(law, rowsByCode);
  const state = stateFor(law, row);
  const radar = radarLaw(law);
  const code = escapeHtml(law.code);
  const target = state.questionTarget;
  const searchText = [law.code, law.title, law.group, law.priority, law.action, law.cut, law.alert, law.block, law.observations, row?.next_step].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
  const status = radar ? "Radar" : state.complete ? "D0 fechado" : (row?.action || law.action || law.status || "Estudar");
  const questionProgress = law.shared_block ? `M5 ${state.questionsDone}/10 · ${number(law.question_target)}q desta lei` : `questões ${state.questionsDone}/${target}`;
  const shared = law.shared_block ? `<span class="laws-map-note">Bloco M5 · meta total 10 (3 + 4 + 3)</span>` : "";
  return `<article class="laws-map-row ${radar ? "is-radar" : ""}" data-law-card data-law-group="${escapeHtml(law.group)}" data-priority="${escapeHtml(law.priority || "")}" data-search="${escapeHtml(searchText)}">
    <div class="laws-map-main"><a href="./${escapeHtml(lawSlug(law))}/"><span class="law-code">${code}</span><strong>${escapeHtml(law.title)}</strong></a><span class="laws-chip priority-${priorityClass(law.priority)}">${escapeHtml(compactPriority(law.priority))}</span></div>
    <div class="laws-map-meta"><span>${escapeHtml(law.group)}</span><span>${escapeHtml(status)}</span><span>${escapeHtml(radar ? "monitoramento" : questionProgress)}</span></div>
    <p class="laws-map-next">${escapeHtml(state.nextStep)}${shared ? ` · ${shared.replace(/<[^>]+>/g, "")}` : ""}</p>
    <div class="laws-map-checks">${radar ? checkpoint("Radar", false) : `${checkpoint("Orientação", state.orientation)}${checkpoint("D0", state.d0)}${checkpoint("D7", Boolean(row?.d7))}${checkpoint("D20", Boolean(row?.d20))}`}</div>
    <a class="laws-map-open" href="./${escapeHtml(lawSlug(law))}/">Abrir norma →</a>
  </article>`;
}

function buildRadarItem(law) {
  return `<article class="laws-radar-item"><div><span class="law-code">${escapeHtml(law.code)}</span><strong>${escapeHtml(law.title)}</strong><small>${escapeHtml(law.priority || "Radar")} · meta ${number(law.question_target || 0)}</small></div><div class="laws-radar-actions"><a href="./${escapeHtml(lawSlug(law))}/">Abrir página →</a>${law.official_url ? `<a href="${escapeHtml(law.official_url)}" target="_blank" rel="noreferrer">Fonte oficial ↗</a>` : ""}</div></article>`;
}

function buildExternalRadarItem(radar) {
  return `<article class="laws-radar-item"><div><span class="law-code">R${escapeHtml(radar.operational_order)}</span><strong>${escapeHtml(radar.title)}</strong><small>${escapeHtml(radar.priority || "Radar")} · fora da sequência L01–L34</small></div><div class="laws-radar-actions">${radar.official_url ? `<a href="${escapeHtml(radar.official_url)}" target="_blank" rel="noreferrer">Fonte oficial ↗</a>` : ""}${radar.url ? `<a href="${escapeHtml(radar.url)}" target="_blank" rel="noreferrer">Notion ↗</a>` : ""}</div></article>`;
}

export async function buildLeisCockpit(sourceHtml) {
  const snapshot = JSON.parse(await readFile(path.resolve("public/data/leis-primeiro.json"), "utf8"));
  let bankSnapshot = { rows: [] };
  try {
    bankSnapshot = JSON.parse(await readFile(path.resolve("public/data/legislation-bank.json"), "utf8"));
  } catch {}

  const laws = Array.isArray(snapshot.laws) ? snapshot.laws : [];
  const rows = Array.isArray(bankSnapshot.rows) ? bankSnapshot.rows : [];
  const rowsByCode = new Map();
  for (const row of rows) {
    for (const code of row.codes || []) rowsByCode.set(code, row);
  }
  const groups = ["Núcleo comum", "Gestor — Administração", "Apoio Administrativo", "Monitor"];
  const executable = operationalUnits(laws);
  const current = executable.find((law) => !stateFor(law, rowForLaw(law, rowsByCode)).complete) || executable[0] || laws[0];
  const currentState = current ? stateFor(current, rowForLaw(current, rowsByCode)) : { nextStep: "Aguardando sincronização" };
  const completed = executable.filter((law) => stateFor(law, rowForLaw(law, rowsByCode)).complete).length;
  const totalQuestions = laws.filter((law) => !radarLaw(law)).reduce((sum, law) => sum + number(law.question_target), 0);
  const mapped = snapshot.summary?.mapped_law_records ?? snapshot.summary?.mapped_operational_records ?? 32;
  const radarRecords = snapshot.summary?.radar_records ?? (Array.isArray(snapshot.radars) ? snapshot.radars.length : 1);
  const radarLaws = laws.filter(radarLaw);
  const externalRadars = Array.isArray(snapshot.radars) ? snapshot.radars : [];
  const trackMarkup = groups.map((group, index) => buildTrackCard(group, index, laws, rowsByCode)).join("");
  const mapMarkup = groups.map((group) => `<section class="laws-map-group" data-law-group-block><div class="laws-group-title"><h3>${escapeHtml(group)}</h3><span>${laws.filter((law) => law.group === group).length} normas</span></div><div class="laws-map-list">${laws.filter((law) => law.group === group).map((law) => buildMapRow(law, rowsByCode)).join("")}</div></section>`).join("");
  const sequence = (snapshot.study_sequence || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  const auditNotes = (snapshot.audit_notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const radarMarkup = `${radarLaws.map(buildRadarItem).join("")}${externalRadars.map(buildExternalRadarItem).join("")}`;
  const styles = extractStylesheetLinks(sourceHtml, "../").map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("");
  const currentHref = current ? `./${lawSlug(current)}/` : "#mapa-detalhado";
  const currentNotion = current?.notion_url || snapshot.source?.page_url || "#";
  const currentStage = current ? studyStageNumber(currentState) : 1;
  const currentChecks = current ? `${checkpoint("Orientação", currentState.orientation)}${checkpoint("Questões", currentState.questionsDone >= currentState.questionTarget && currentState.questionTarget > 0)}${checkpoint("Flashcards", currentState.flashcardsTarget > 0 && currentState.flashcardsDone >= currentState.flashcardsTarget)}${checkpoint("D0", currentState.d0)}${checkpoint("D7/D20", false)}` : checkpoint("Sincronização", false);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leis Primeiro | SEEDF PPGE</title><meta name="description" content="Central de estudo e acompanhamento da trilha Leis Primeiro do SEEDF"><link rel="icon" href="../favicon.svg"><link rel="manifest" href="../manifest.webmanifest"><script src="../sw-register.js" defer></script>${styles}<style>
html,body{margin:0;min-height:100%;background:#07111f}body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.laws-map-row a{text-decoration:none}.laws-map-row strong{color:#edf6fd}.laws-map-row p{margin:0}.laws-radar-item a{text-decoration:none}.laws-disclosure>summary{list-style:none}.laws-disclosure>summary::-webkit-details-marker{display:none}
</style></head><body class="laws-cockpit-body"><main class="laws-page laws-cockpit">
<header class="laws-topbar"><a class="laws-back" href="../">← Dashboard SEEDF</a><div class="laws-sync"><span class="laws-live-dot"></span> Notion → GitHub · ${escapeHtml(formatDate(snapshot.source?.synced_at))}</div></header>
<section class="laws-hero laws-cockpit-hero"><div class="laws-hero-copy"><p class="laws-kicker">⚖️ TRILHA OPERACIONAL · SEEDF PPGE</p><h1>Leis Primeiro<span class="laws-hero-dot">.</span></h1><p class="laws-lead">A fila de leitura, questões e revisão do SEEDF. Abra a norma certa, cumpra o bloco e registre o avanço no Notion.</p><div class="laws-hero-thesis"><span>LER</span><i>→</i><span>RESPONDER</span><i>→</i><span>REVISAR</span></div><div class="laws-hero-meta"><span class="laws-live-dot"></span><span>Fonte operacional: Notion</span><span class="laws-meta-separator">·</span><span>Site: consulta e navegação</span></div><div class="laws-hero-actions"><a class="laws-primary" href="${escapeHtml(currentHref)}">▶️ Continuar ${escapeHtml(current?.code || "a trilha")}</a><a class="laws-secondary" href="#trilha">Ver trilha ↓</a><a class="laws-secondary" href="./flashcards/">🧠 Abrir flashcards</a><a class="laws-secondary" href="${escapeHtml(snapshot.source?.page_url || "#")}" target="_blank" rel="noreferrer">Notion ↗</a></div></div><aside class="laws-next-card"><div class="laws-next-top"><div><p class="laws-kicker">PRÓXIMA AÇÃO</p><span>Bloco atual · ${escapeHtml(current?.code || "—")}</span></div><span class="laws-next-badge">${String(currentStage).padStart(2, "0")} / 05</span></div><div class="laws-next-law"><span class="laws-next-code">${escapeHtml(current?.code || "—")}</span><h2>${escapeHtml(current?.title || "Aguardando dados")}</h2></div><div class="laws-next-context"><span>${current ? `${current.code} / ${laws.length}` : "—"}</span><span>${currentState.questionTarget || 0} questões-meta</span><span>${escapeHtml(current?.group || "Aguardando")}</span></div><div class="laws-next-focus"><span>${String(currentStage).padStart(2, "0")}</span><div><small>FAÇA AGORA</small><strong>${escapeHtml(currentState.nextStep || "Aguardando sincronização")}</strong></div></div><p>Feche orientação, leitura, questões, flashcards e D0 antes de avançar. D7/D20 seguem em paralelo.</p><div class="laws-checkpoints">${currentChecks}</div><a class="laws-next-cta" href="${escapeHtml(currentHref)}">Abrir norma <span aria-hidden="true">↗</span></a><a class="laws-next-notion" href="${escapeHtml(currentNotion)}" target="_blank" rel="noreferrer">Abrir no Notion ↗</a></aside></section>
${buildStudyFlow(currentState)}
<section class="laws-status-strip" aria-label="Estado da trilha"><article class="laws-stat-progress"><div class="laws-stat-top"><span class="laws-stat-icon">01</span><span>BLOCOS FECHADOS</span></div><strong>${completed}/${executable.length}</strong><small>por D0 · D7/D20 não bloqueiam</small></article><article class="laws-stat-questions"><div class="laws-stat-top"><span class="laws-stat-icon">02</span><span>QUESTÕES DE META</span></div><strong>${totalQuestions}</strong><small>na sequência executável</small></article><article class="laws-stat-map"><div class="laws-stat-top"><span class="laws-stat-icon">03</span><span>NORMAS NO MAPA</span></div><strong>${laws.length}</strong><small>L01–L34 · 4 trilhas</small></article><article class="laws-stat-source"><div class="laws-stat-top"><span class="laws-stat-icon">04</span><span>FONTE VIVA</span></div><strong>Notion</strong><small>${mapped} mapeados · ${radarRecords} radar</small></article></section>
<section class="laws-panel laws-track-panel" id="trilha"><div class="laws-heading"><div><p class="laws-kicker">MAPA DE DECISÃO</p><h2>Por onde continuar</h2><p>Escolha a trilha pelo cargo. Cada cartão já aponta para a próxima norma pendente.</p></div><span class="laws-heading-note">${executable.length} blocos operacionais</span></div><div class="laws-track-grid">${trackMarkup}</div></section>
<nav class="laws-quick-nav" aria-label="Atalhos da trilha"><a class="laws-quick-link" href="#mapa-detalhado"><span class="laws-quick-icon">⌕</span><span><b>Localizar uma norma</b><small>Mapa detalhado e filtros</small></span><span class="laws-quick-arrow">↗</span></a><a class="laws-quick-link" href="#radar"><span class="laws-quick-icon">◎</span><span><b>Ver Radar</b><small>Atualizações fora da fila</small></span><span class="laws-quick-arrow">↗</span></a><a class="laws-quick-link" href="#banco-legislacao"><span class="laws-quick-icon">▦</span><span><b>Consultar o banco</b><small>Metas, revisões e registros</small></span><span class="laws-quick-arrow">↗</span></a><a class="laws-quick-link" href="./flashcards/"><span class="laws-quick-icon">▣</span><span><b>Estudar com cards</b><small>Revisão com repetição espaçada</small></span><span class="laws-quick-arrow">↗</span></a></nav>
<section class="laws-panel laws-radar" id="radar"><div class="laws-heading"><div><p class="laws-kicker">RADAR · FORA DA FILA DIÁRIA</p><h2>Monitorar sem disputar atenção</h2><p>Itens de vigência, carreira e atualização normativa permanecem separados da execução.</p></div><span class="laws-chip priority-radar">${radarLaws.length + externalRadars.length} itens</span></div><div class="laws-radar-list">${radarMarkup}</div></section>
<details class="laws-panel laws-disclosure laws-method-disclosure"><summary><span><b>📖 COMO ESTUDAR</b><strong>Fluxo de uma norma</strong></span><span>abrir método + regras</span></summary><div class="laws-disclosure-body"><ol>${sequence}</ol><p class="laws-rule"><strong>Regra de avanço:</strong> ${escapeHtml(snapshot.advance_rule || "orientação + 1ª leitura + questões + flashcards + D0; D7/D20 seguem em paralelo.")}</p><p class="laws-rule"><strong>Exceções preservadas:</strong> L30–L32 são o Bloco M5 (10 questões totais); L11 e L34 têm meta 0 nas condições registradas; L33 é Radar forte com 10 questões de familiarização.</p></div></details>
<details class="laws-panel laws-disclosure laws-map-panel" id="mapa-detalhado"><summary><span><b>📚 CONSULTA RÁPIDA</b><strong>Mapa detalhado L01–L34</strong><small>Uma linha por norma: ação, prioridade, meta e revisões.</small></span><span>abrir mapa</span></summary><div class="laws-disclosure-body"><div class="laws-heading"><div><p class="laws-kicker">TODAS AS NORMAS</p><h2>Mapa detalhado</h2><p>Use os filtros quando precisar localizar uma lei, um cargo ou um alerta específico.</p></div><span class="laws-result-count" aria-live="polite"><span id="result-count">${laws.length}</span> de ${laws.length}</span></div><div class="laws-toolbar"><label class="laws-search">⌕ <input id="law-search" placeholder="Buscar LDB, ECA, LRF, LAI..." aria-label="Buscar legislação"></label><label class="laws-select">☷ <select id="group-filter" aria-label="Filtrar por trilha"><option value="">Todos os grupos</option>${groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("")}</select></label><label class="laws-select">◈ <select id="priority-filter" aria-label="Filtrar por prioridade"><option value="">Todas prioridades</option><option>P0 - Nuclear</option><option>P1 - Alta</option><option>P2 - Complementar</option><option>Radar forte</option><option>Radar</option></select></label></div><div id="laws-empty" class="laws-empty">Nenhuma norma corresponde aos filtros.</div><div class="laws-map-groups">${mapMarkup}</div></div></details>
<details class="laws-panel laws-disclosure laws-audit" id="auditoria"><summary><span><b>🔎 AUDITORIA E INTEGRIDADE</b><strong>O que está preservado</strong></span><span>abrir conferência</span></summary><div class="laws-disclosure-body"><ul>${auditNotes}</ul><p>O site consulta snapshots; gravações e alterações operacionais devem ser feitas no Notion. A fonte jurídica continua sendo o texto oficial vigente.</p></div></details>
<div class="static-note">Sincronização: Notion → GitHub Actions → snapshots JSON → GitHub Pages. Nenhum controle visual substitui o registro operacional.</div><footer class="laws-footer"><span>SEEDF PPGE · Leis Primeiro</span><span>Fonte operacional: Notion · Fonte jurídica: texto oficial vigente</span></footer></main>
<script>(function(){const q=document.getElementById('law-search'),g=document.getElementById('group-filter'),p=document.getElementById('priority-filter'),map=document.getElementById('mapa-detalhado'),cards=[...document.querySelectorAll('[data-law-card]')],groups=[...document.querySelectorAll('[data-law-group-block]')],count=document.getElementById('result-count'),empty=document.getElementById('laws-empty');function apply(){const needle=(q?.value||'').trim().toLocaleLowerCase('pt-BR');let visible=0;cards.forEach(card=>{const ok=(!needle||card.dataset.search.includes(needle))&&(!g?.value||card.dataset.lawGroup===g.value)&&(!p?.value||card.dataset.priority===p.value);card.style.display=ok?'':'none';if(ok)visible++});groups.forEach(group=>{const shown=[...group.querySelectorAll('[data-law-card]')].some(card=>card.style.display!=='none');group.style.display=shown?'':'none'});if(count)count.textContent=String(visible);if(empty)empty.style.display=visible?'none':'block';if(map&&(needle||g?.value||p?.value))map.open=true}q?.addEventListener('input',apply);g?.addEventListener('change',apply);p?.addEventListener('change',apply);apply()})();</script></body></html>`;
}
