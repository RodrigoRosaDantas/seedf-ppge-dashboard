import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve("dist/client/leis");
const lawsSnapshot = JSON.parse(await readFile(path.resolve("public/data/leis-primeiro.json"), "utf8"));
let bankSnapshot = { source: {}, rows: [] };
try { bankSnapshot = JSON.parse(await readFile(path.resolve("public/data/legislation-bank.json"), "utf8")); } catch {}
const laws = Array.isArray(lawsSnapshot.laws) ? lawsSnapshot.laws : [];
const rows = Array.isArray(bankSnapshot.rows) ? bankSnapshot.rows : [];
const rowByOrder = new Map(rows.map((row) => [Number(row.operational_order), row]));

function esc(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function pct(done, target) { return target > 0 ? Math.max(0, Math.min(100, Math.round((done / target) * 100))) : 0; }
function fmt(value) { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ","); return String(value); }
function accuracy(value) { if (value === null || value === undefined || value === "") return "—"; let x = Number(value); if (!Number.isFinite(x)) return esc(value); if (x >= 0 && x <= 1) x *= 100; return `${x.toFixed(x % 1 ? 1 : 0).replace(".", ",")}%`; }
function date(value) { if (!value) return "—"; const m = String(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(value); }
function priorityClass(value="") { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function codesForOrder(order) {
  if (order >= 1 && order <= 11) return [`L${String(order).padStart(2,"0")}`];
  if (order >= 101 && order <= 107) return [`L${String(order-89).padStart(2,"0")}`];
  if (order >= 201 && order <= 206) return [`L${String(order-182).padStart(2,"0")}`];
  if (order >= 301 && order <= 305) return [`L${String(order-276).padStart(2,"0")}`];
  if (order === 306) return ["L30","L31","L32"];
  if (order === 307) return ["L33"];
  if (order === 308) return ["L34"];
  return [];
}
function orderForCode(code) {
  const x = Number(String(code).replace(/^L/i,""));
  if (x <= 11) return x; if (x <= 18) return 100 + x - 11; if (x <= 24) return 200 + x - 18; if (x <= 29) return 300 + x - 24; if (x <= 32) return 306; if (x === 33) return 307; return 308;
}
function cssLink(prefix) { return `<link rel="stylesheet" href="${prefix}leis-enhanced.css?v=20260911b">`; }

function operationalMarkup(law, row) {
  const target = n(law.shared_block ? 10 : (row?.question_target ?? law.question_target));
  const done = n(row?.questions_done); const flashDone = n(row?.flashcards_done); const flashTarget = n(row?.flashcards_meta);
  const state = (label, ok) => `<span class="ops-state ${ok ? "done" : ""}">${ok ? "✓" : "○"} ${esc(label)}</span>`;
  return `<section class="study-enhanced-ops" aria-label="Painel operacional sincronizado do Notion">
    <article class="study-ops-card"><span class="eyebrow">Questões</span><div class="big"><strong>${done}</strong><span>de ${target}</span></div><div class="ops-progress"><span style="width:${pct(done,target)}%"></span></div><div class="ops-grid"><div class="ops-mini"><b>${n(row?.hits)}</b><small>acertos</small></div><div class="ops-mini"><b>${n(row?.errors)}</b><small>erros</small></div><div class="ops-mini"><b>${accuracy(row?.accuracy)}</b><small>precisão</small></div></div></article>
    <article class="study-ops-card"><span class="eyebrow">Flashcards</span><div class="big"><strong>${flashDone}</strong><span>${flashTarget ? `de ${flashTarget}` : "feitos"}</span></div>${flashTarget ? `<div class="ops-progress"><span style="width:${pct(flashDone,flashTarget)}%"></span></div>` : ""}<p class="ops-next">${esc(row?.flashcards_status || "Sem status registrado")}</p></article>
    <article class="study-ops-card"><span class="eyebrow">Próxima ação</span><div class="big"><strong style="font-size:15px">${esc(row?.action || law.action || law.status || "Estudar")}</strong></div><p class="ops-next">${esc(row?.next_step || "Feche orientação, leitura, questões, flashcards e D0 para avançar.")}</p><div class="ops-grid"><div class="ops-mini"><b>${date(row?.next_review)}</b><small>próx. revisão</small></div><div class="ops-mini"><b>${date(row?.last_read)}</b><small>últ. leitura</small></div><div class="ops-mini"><b>${date(row?.last_audit || law.last_audit)}</b><small>auditoria</small></div></div><div class="ops-states">${state("Orientação",row?.orientation_read ?? law.orientation_read)}${state("D0",row?.d0 ?? law.d0)}${state("D7",row?.d7 ?? law.d7)}${state("D20",row?.d20 ?? law.d20)}</div></article>
  </section>`;
}

function enhanceLawHtml(html, law) {
  const row = rowByOrder.get(orderForCode(law.code));
  if (!html.includes("leis-enhanced.css")) html = html.replace("</head>", `${cssLink("../../")}</head>`);
  if (!html.includes("read-progress")) html = html.replace("<body>", `<body><div class="read-progress"><span id="read-progress-bar"></span></div>`);
  const jump = laws.map((item)=>`<option value="${esc(item.code.toLowerCase())}" ${item.code===law.code?"selected":""}>${esc(item.code)} · ${esc(item.title)}</option>`).join("");
  html = html.replace(/<header class="study-topbar">[\s\S]*?<\/header>/, `<header class="study-topbar enhanced"><a href="../">← Leis Primeiro</a><select id="law-jump" class="study-jump" aria-label="Ir para outra lei">${jump}</select><span class="study-progress">${esc(law.code)} · ${laws.findIndex((x)=>x.code===law.code)+1} de ${laws.length}</span></header>`);
  if (!html.includes("study-enhanced-ops")) html = html.replace("<section class=\"study-summary-grid\">", `${operationalMarkup(law,row)}<section class="study-summary-grid">`);
  if (!html.includes("study-reading-layout")) {
    html = html.replace("<article class=\"study-content\">", `<details class="study-mobile-toc"><summary>Sumário desta lei</summary><nav class="study-toc" data-toc-mobile></nav></details><div class="study-reading-layout"><aside class="study-rail"><div class="study-rail-title">Nesta página</div><nav class="study-toc" data-toc-desktop></nav><div class="study-rail-sync">Fonte operacional: Notion<br>Dados: ${esc(bankSnapshot.source?.synced_at ? new Date(bankSnapshot.source.synced_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "sincronização automática")}</div></aside><article class="study-content" id="study-content">`);
    html = html.replace("</article>\n<nav class=\"study-nav\"", `</article></div>\n<nav class="study-nav enhanced-nav"`);
    html = html.replace("<footer class=\"study-footer\">", `<footer class="study-footer enhanced-footer">`);
  }
  if (!html.includes("law-enhance-runtime")) html = html.replace("</body>", `<script id="law-enhance-runtime">(function(){const jump=document.getElementById('law-jump');jump?.addEventListener('change',()=>location.href='../'+jump.value+'/');const content=document.getElementById('study-content');const headings=content?[...content.querySelectorAll('h2,h3')]:[];const slug=t=>(t||'secao').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const used=new Set();headings.forEach((h,i)=>{let id=slug(h.textContent)||('secao-'+(i+1)),base=id,k=2;while(used.has(id))id=base+'-'+k++;used.add(id);h.id=id});const toc=headings.map(h=>'<a class="level-'+(h.tagName==='H3'?'3':'2')+'" href="#'+h.id+'">'+h.textContent.replace(/</g,'&lt;')+'</a>').join('');document.querySelectorAll('[data-toc-desktop],[data-toc-mobile]').forEach(el=>el.innerHTML=toc||'<span style="font-size:10px;color:#718aa0">Sem seções detectadas.</span>');const links=[...document.querySelectorAll('.study-toc a')],bar=document.getElementById('read-progress-bar');function update(){const max=document.documentElement.scrollHeight-innerHeight,p=max>0?Math.min(100,Math.max(0,scrollY/max*100)):0;if(bar)bar.style.width=p+'%';let active='';for(const h of headings){if(h.getBoundingClientRect().top<=125)active=h.id;else break}links.forEach(a=>a.classList.toggle('is-active',a.getAttribute('href')==='#'+active))}addEventListener('scroll',update,{passive:true});update()})();</script></body>`);
  return html;
}

function bankRow(row) {
  const codes = row.codes?.length ? row.codes : codesForOrder(n(row.operational_order));
  const codeLinks = codes.length ? codes.map((code)=>`<a href="./${esc(code.toLowerCase())}/">${esc(code)}</a>`).join("") : `<span class="bank-radar-code">R${esc(row.operational_order)}</span>`;
  const search = [row.operational_order,row.title,row.priority,row.status,row.action,row.next_step,row.cut,row.alert,row.block,row.observations,row.flashcards_status,...(row.cargos||[]),...codes].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
  const details = `${row.cargos?.length?`<div><b>Cargos</b><span>${esc(row.cargos.join(" · "))}</span></div>`:""}${row.cut?`<div><b>Recorte prioritário</b><span>${esc(row.cut)}</span></div>`:""}${row.alert?`<div class="is-alert"><b>Vigência / alerta</b><span>${esc(row.alert)}</span></div>`:""}${row.block?`<div><b>Bloco sugerido</b><span>${esc(row.block)}</span></div>`:""}${row.observations?`<div><b>Observações</b><span>${esc(row.observations)}</span></div>`:""}<div><b>Última leitura / auditoria</b><span>${date(row.last_read)} · ${date(row.last_audit)}</span></div>`;
  const links = `${codes.map((code)=>`<a href="./${esc(code.toLowerCase())}/">${esc(code)} ↗</a>`).join("")}${row.official_url?`<a href="${esc(row.official_url)}" target="_blank" rel="noreferrer">Oficial ↗</a>`:""}${row.url?`<a href="${esc(row.url)}" target="_blank" rel="noreferrer">Notion ↗</a>`:""}`;
  return `<tr data-bank-row data-priority="${esc(row.priority||"")}" data-status="${esc(row.status||"")}" data-search="${esc(search)}"><td class="bank-sticky bank-order"><b>${esc(row.operational_order)}</b><div class="bank-codes">${codeLinks}</div></td><td class="bank-sticky-2 bank-norma"><strong>${esc(row.title||"Sem título")}</strong><details><summary>ver recorte e dados</summary><div class="bank-detail-grid">${details}</div></details></td><td><span class="bank-badge priority-${priorityClass(row.priority)}">${esc(row.priority||"—")}</span></td><td><span class="bank-status">${esc(row.status||"—")}</span></td><td>${esc(row.action||"—")}</td><td class="num"><b>${n(row.questions_done)}</b> / ${n(row.question_target)}</td><td class="num good">${n(row.hits)}</td><td class="num bad">${n(row.errors)}</td><td class="num">${accuracy(row.accuracy)}</td><td class="num"><b>${n(row.flashcards_done)}</b> / ${esc(fmt(row.flashcards_meta))}</td><td class="check ${row.orientation_read?"done":""}">${row.orientation_read?"✓":"—"}</td><td class="check ${row.d0?"done":""}">${row.d0?"✓":"—"}</td><td class="check ${row.d7?"done":""}">${row.d7?"✓":"—"}</td><td class="check ${row.d20?"done":""}">${row.d20?"✓":"—"}</td><td>${date(row.next_review)}</td><td class="bank-next">${esc(row.next_step||"—")}</td><td><div class="bank-links">${links}</div></td></tr>`;
}

function bankSection() {
  const priorities = [...new Set(rows.map((r)=>r.priority).filter(Boolean))]; const statuses=[...new Set(rows.map((r)=>r.status).filter(Boolean))];
  return `<section class="laws-panel bank-panel" id="banco-legislacao"><div class="laws-heading"><div><p class="laws-kicker">ESPELHO OPERACIONAL DO NOTION</p><h2>BANCO — LEGISLAÇÃO SEEDF</h2><p>A tabela inline da página Leis Primeiro também está aqui: metas, desempenho, flashcards, revisões, recortes e alertas.</p></div><div class="bank-heading-actions">${bankSnapshot.source?.database_url?`<a href="${esc(bankSnapshot.source.database_url)}" target="_blank" rel="noreferrer">Abrir banco no Notion ↗</a>`:""}</div></div><div class="bank-tools"><label>⌕ <input id="bank-search" placeholder="Buscar norma, cargo, recorte, alerta..."></label><label>◈ <select id="bank-priority"><option value="">Todas prioridades</option>${priorities.map((x)=>`<option>${esc(x)}</option>`).join("")}</select></label><label>● <select id="bank-status"><option value="">Todos status</option>${statuses.map((x)=>`<option>${esc(x)}</option>`).join("")}</select></label><div class="bank-count"><span id="bank-count">${rows.length}</span>&nbsp;de&nbsp;${rows.length}</div></div><div class="bank-table-wrap"><table class="bank-table"><thead><tr><th class="bank-sticky">Ordem / L</th><th class="bank-sticky-2">Norma</th><th>Prioridade</th><th>Status</th><th>Ação atual</th><th>Questões</th><th>Acertos</th><th>Erros</th><th>%</th><th>Flashcards</th><th>Orient.</th><th>D0</th><th>D7</th><th>D20</th><th>Próx. revisão</th><th>Próximo passo</th><th>Acessos</th></tr></thead><tbody>${rows.map(bankRow).join("")}</tbody></table><div id="bank-empty" class="bank-empty">Nenhum registro corresponde aos filtros.</div></div><p class="bank-note">Espelho somente para estudo e consulta. O Notion permanece como fonte operacional de gravação; o texto jurídico deve ser confirmado na fonte oficial vigente.</p></section>`;
}

let indexPath = path.join(out,"index.html");
await access(indexPath);
let index = await readFile(indexPath,"utf8");
if (!index.includes("leis-enhanced.css")) index = index.replace("</head>", `${cssLink("../")}</head>`);
if (rows.length && !index.includes('id="banco-legislacao"')) index = index.replace('<div class="static-note">', `${bankSection()}<div class="static-note">`);
if (rows.length && !index.includes("bank-enhance-runtime")) index = index.replace("</body>", `<script id="bank-enhance-runtime">(function(){const q=document.getElementById('bank-search'),p=document.getElementById('bank-priority'),s=document.getElementById('bank-status'),rows=[...document.querySelectorAll('[data-bank-row]')],count=document.getElementById('bank-count'),empty=document.getElementById('bank-empty');function apply(){const needle=(q?.value||'').trim().toLocaleLowerCase('pt-BR');let shown=0;rows.forEach(row=>{const ok=(!needle||row.dataset.search.includes(needle))&&(!p?.value||row.dataset.priority===p.value)&&(!s?.value||row.dataset.status===s.value);row.style.display=ok?'':'none';if(ok)shown++});if(count)count.textContent=shown;if(empty)empty.style.display=shown?'none':'block'}q?.addEventListener('input',apply);p?.addEventListener('change',apply);s?.addEventListener('change',apply);apply()})();</script></body>`);
await writeFile(indexPath,index,"utf8");

for (const law of laws) {
  const file = path.join(out,law.code.toLowerCase(),"index.html");
  await access(file);
  const html = await readFile(file,"utf8");
  await writeFile(file,enhanceLawHtml(html,law),"utf8");
}

const check = await readFile(indexPath,"utf8");
if (rows.length && (!check.includes("BANCO — LEGISLAÇÃO SEEDF") || !check.includes("data-bank-row"))) throw new Error("Legislation bank mirror was not injected.");
for (const code of ["L01","L12","L25","L34"]) {
  const html=await readFile(path.join(out,code.toLowerCase(),"index.html"),"utf8");
  if (!html.includes("study-enhanced-ops") || !html.includes("study-reading-layout") || !html.includes("law-enhance-runtime")) throw new Error(`${code} enhancement validation failed.`);
}
console.log(`Leis Primeiro aprimorado: ${laws.length} páginas internas + ${rows.length} registros do banco operacional.`);
