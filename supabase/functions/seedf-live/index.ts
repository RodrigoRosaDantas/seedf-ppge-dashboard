import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const CYCLE_PAGE_ID = "3d4cf5a2-6731-8185-a1c6-da3820a7687b";
const DAYS_DATA_SOURCE_ID = "60966f0a-b3eb-416b-8995-64253ed26a45";
const QUESTIONS_DATA_SOURCE_ID = "8a241986-94e7-4340-b898-dc905b19fd58";
const LEGISLATION_DATA_SOURCE_ID = "6b3c940a-a382-419f-9ef6-531a1dc5cad2";
const LEGISLATION_HISTORY_DATA_SOURCE_ID = "61340ed0-f7cf-4fbf-b543-62e1c2b6f458";
const MAX_NOTION_CONCURRENCY = 4;
const CACHE_TTL_MS = 60_000;
const FORCE_REFRESH_COOLDOWN_MS = 10_000;

const allowedOrigins = new Set([
  "https://rodrigorosadantas.github.io",
  "https://seedf-ppge-dashboard.rodrigo-lzavsj-rr.chatgpt.site",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://terminal.local:4173",
]);

type CacheValue = { expiresAt: number; value: unknown; forcedAt: number };
const cache = new Map<string, CacheValue>();

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "GET") return json({ error: "Método não permitido." }, 405, headers);

  const token = Deno.env.get("SEEDF")?.trim();
  if (!token) return json({ error: "API temporariamente indisponível." }, 503, headers);

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "material";
  const force = url.searchParams.get("refresh") === "1";
  const day = (url.searchParams.get("day") || "").toUpperCase();

  const key = mode === "material" ? \`material:\${day}\` : mode;
  const now = Date.now();
  const cached = cache.get(key);
  if (!force && cached && cached.expiresAt > now) {
    return json(cached.value, 200, { ...headers, "X-SEEDF-Cache": "hit", "Cache-Control": "public, max-age=30" });
  }
  if (force && cached && now - cached.forcedAt < FORCE_REFRESH_COOLDOWN_MS) {
    return json(cached.value, 200, { ...headers, "X-SEEDF-Cache": "throttled", "Cache-Control": "public, max-age=10" });
  }

  try {
    const notion = createNotionRequest(token);
    let value: unknown;
    if (mode === "material") {
      if (!/^D(0[1-9]|1[0-4])$/.test(day)) {
        return json({ error: "Dia inválido." }, 400, headers);
      }
      value = await buildMaterial(day, notion);
    } else if (mode === "leis") {
      value = await buildLeisProgress(notion);
    } else {
      return json({ error: "Modo inválido." }, 400, headers);
    }
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value, forcedAt: force ? now : (cached?.forcedAt || 0) });
    return json(value, 200, { ...headers, "X-SEEDF-Cache": "miss", "Cache-Control": "public, max-age=30" });
  } catch (error) {
    console.error("SEEDF live endpoint failed:", error instanceof Error ? error.message : String(error));
    if (cached) {
      return json(cached.value, 200, { ...headers, "X-SEEDF-Cache": "stale", "Cache-Control": "public, max-age=30, stale-while-revalidate=60" });
    }
    return json({ error: "Não foi possível consultar o Notion agora." }, 502, headers);
  }
});

async function buildMaterial(day: string, notion: NotionRequest) {
  const children = await getAllChildren(CYCLE_PAGE_ID, notion);
  const pageBlock = children.find((block) => {
    if (block.type !== "child_page") return false;
    const title = String(block.child_page?.title || "");
    return title.toUpperCase().startsWith(day);
  });
  if (!pageBlock) throw new Error(\`\${day} não localizado no Ciclo 01\`);

  const [page, tree] = await Promise.all([
    notion(\`/pages/\${pageBlock.id}\`),
    getBlockTree(pageBlock.id, notion),
  ]);
  const rawTitle = String(pageBlock.child_page?.title || day);
  return {
    mode: "material",
    day,
    title: rawTitle.replace(/^D\d{2}\s*[—–-]\s*/i, "").trim() || rawTitle,
    source_url: page.url || notionPageUrl(pageBlock.id),
    last_edited_time: page.last_edited_time || null,
    synced_at: new Date().toISOString(),
    content_html: renderBlocks(tree),
  };
}

async function buildLeisProgress(notion: NotionRequest) {
  const [bankPages, dayPages, questionPages, sessionPages] = await Promise.all([
    queryDataSource(LEGISLATION_DATA_SOURCE_ID, notion),
    queryDataSource(DAYS_DATA_SOURCE_ID, notion),
    queryDataSource(QUESTIONS_DATA_SOURCE_ID, notion),
    queryDataSource(LEGISLATION_HISTORY_DATA_SOURCE_ID, notion),
  ]);

  const questions = questionPages
    .map(parseLawQuestion)
    .filter(Boolean) as Array<Record<string, unknown>>;
  const sessions = sessionPages
    .map(parseLawSession)
    .filter(Boolean)
    .sort((a, b) => String(b.date || b.updated_at || "").localeCompare(String(a.date || a.updated_at || "")));
  const days = dayPages
    .map(parseLawDay)
    .filter(Boolean)
    .sort((a, b) => String(b.executed_at || b.updated_at || "").localeCompare(String(a.executed_at || a.updated_at || "")));

  const laws: Array<Record<string, unknown>> = [];
  for (const page of bankPages) {
    const row = parseLawBankRow(page);
    if (!row) continue;
    const codes = codesForOperationalOrder(Number(row.operational_order));
    for (const code of codes) {
      const activeQuestions = questions.filter((q) => q.page_code === code && !strategicallyInactive(q.strategic_use));
      const qsum = activeQuestions.reduce((acc, q) => {
        acc.planned += Number(q.planned || 0);
        acc.done += Number(q.done || 0);
        acc.correct += Number(q.correct || 0);
        acc.errors += Number(q.errors || 0);
        acc.doubts += Number(q.doubts || 0);
        return acc;
      }, { planned: 0, done: 0, correct: 0, errors: 0, doubts: 0 });

      const individualSessions = sessions.filter((s) => s.page_code === code);
      const individual = individualSessions.reduce((acc, s) => {
        acc.summaries_done += Number(s.summary_counter || 0);
        acc.readings_done += Number(s.reading_counter || 0);
        acc.sessions_done += Number(s.session_counter || 0);
        acc.summary_number = Math.max(acc.summary_number, Number(s.summary_number || 0));
        acc.reading_number = Math.max(acc.reading_number, Number(s.reading_number || 0));
        return acc;
      }, { summaries_done: 0, readings_done: 0, sessions_done: 0, summary_number: 0, reading_number: 0 });

      laws.push({
        ...row,
        code,
        ...(activeQuestions.length ? {
          questions_done: qsum.done,
          active_questions_planned: qsum.planned,
          active_questions_correct: qsum.correct,
          active_questions_errors: qsum.errors,
          active_questions_doubts: qsum.doubts,
        } : {}),
        ...(codes.length > 1 ? {
          summaries_done: individual.summaries_done,
          readings_done: individual.readings_done,
          sessions_done: individual.sessions_done,
          summary_number: individual.summary_number || null,
          reading_number: individual.reading_number || null,
        } : {}),
      });
    }
  }

  return {
    mode: "leis",
    synced_at: new Date().toISOString(),
    laws,
    execution: {
      days,
      sessions,
      latest_day_id: days[0]?.day_id || null,
      totals: days.reduce((acc, d) => {
        acc.planned += Number(d.planned || 0);
        acc.done += Number(d.done || 0);
        acc.correct += Number(d.correct || 0);
        acc.errors += Number(d.errors || 0);
        acc.doubts += Number(d.doubts || 0);
        return acc;
      }, { planned: 0, done: 0, correct: 0, errors: 0, doubts: 0 }),
    },
  };
}

type NotionRequest = (endpoint: string, init?: RequestInit) => Promise<Record<string, any>>;

function createNotionRequest(token: string): NotionRequest {
  let inFlight = 0;
  const waiting: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (inFlight < MAX_NOTION_CONCURRENCY) {
      inFlight += 1;
      resolve();
    } else {
      waiting.push(resolve);
    }
  });
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else inFlight -= 1;
  };
  return async (endpoint: string, init: RequestInit = {}) => {
    await acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(\`\${NOTION_API_BASE}\${endpoint}\`, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: \`Bearer \${token}\`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
            ...(init.headers || {}),
          },
        });
        const body = await response.text();
        if (!response.ok) throw new Error(\`Notion API returned \${response.status}: \${body.slice(0, 240)}\`);
        return JSON.parse(body);
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      release();
    }
  };
}

async function queryDataSource(id: string, notion: NotionRequest) {
  const pages: Array<Record<string, any>> = [];
  let cursor: string | null = null;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const response = await notion(\`/data_sources/\${id}/query\`, { method: "POST", body: JSON.stringify(body) });
    pages.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return pages;
}

async function getAllChildren(blockId: string, notion: NotionRequest) {
  const results: Array<Record<string, any>> = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await notion(\`/blocks/\${blockId}/children?\${query}\`);
    results.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

async function getBlockTree(blockId: string, notion: NotionRequest): Promise<Array<Record<string, any>>> {
  const blocks = await getAllChildren(blockId, notion);
  const children = await Promise.all(blocks.map(async (block) => {
    if (block.has_children && !["child_page", "child_database"].includes(block.type)) {
      return getBlockTree(block.id, notion);
    }
    return [];
  }));
  return blocks.map((block, index) => ({ ...block, __children: children[index] }));
}

function renderBlocks(blocks: Array<Record<string, any>>): string {
  let html = "";
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (["bulleted_list_item", "numbered_list_item"].includes(block.type)) {
      const type = block.type;
      const tag = type === "bulleted_list_item" ? "ul" : "ol";
      const items: string[] = [];
      while (index < blocks.length && blocks[index].type === type) {
        const item = blocks[index];
        items.push(\`<li>\${richTextHtml(item[type]?.rich_text)}\${renderBlocks(item.__children || [])}</li>\`);
        index += 1;
      }
      index -= 1;
      html += \`<\${tag}>\${items.join("")}</\${tag}>\`;
      continue;
    }
    html += renderBlock(block);
  }
  return html;
}

function renderBlock(block: Record<string, any>): string {
  const type = block.type;
  const data = block[type] || {};
  const text = richTextHtml(data.rich_text);
  const children = renderBlocks(block.__children || []);
  if (type === "paragraph") return text ? \`<p>\${text}</p>\${children}\` : children;
  if (type === "heading_1") return \`<h2>\${text}</h2>\${children}\`;
  if (type === "heading_2") return \`<h2>\${text}</h2>\${children}\`;
  if (type === "heading_3") return \`<h3>\${text}</h3>\${children}\`;
  if (type === "quote") return \`<blockquote>\${text}\${children}</blockquote>\`;
  if (type === "callout") {
    const icon = data.icon?.type === "emoji" ? \`\${escapeHtml(data.icon.emoji)} \` : "";
    return \`<aside class="study-callout">\${icon}\${text}\${children}</aside>\`;
  }
  if (type === "divider") return "<hr>";
  if (type === "toggle") return \`<details class="study-toggle"><summary>\${text || "Ver conteúdo"}</summary>\${children}</details>\`;
  if (type === "to_do") return \`<div class="study-todo"><span>\${data.checked ? "☑" : "☐"}</span><span>\${text}</span></div>\${children}\`;
  if (type === "code") return \`<pre><code>\${escapeHtml((data.rich_text || []).map((item: any) => item.plain_text || "").join(""))}</code></pre>\${children}\`;
  if (type === "table") {
    const rows = (block.__children || []).filter((item: any) => item.type === "table_row").map((row: any, rowIndex: number) => {
      const cells = (row.table_row?.cells || []).map((cell: any[]) => {
        const cellTag = rowIndex === 0 && data.has_column_header ? "th" : "td";
        return \`<\${cellTag}>\${richTextHtml(cell)}</\${cellTag}>\`;
      }).join("");
      return \`<tr>\${cells}</tr>\`;
    }).join("");
    return \`<div class="study-table-wrap"><table>\${rows}</table></div>\`;
  }
  if (type === "bookmark" || type === "link_preview") {
    const href = safeExternalUrl(data.url || "");
    return href ? \`<p><a href="\${escapeHtml(href)}" target="_blank" rel="noreferrer">\${escapeHtml(href)} ↗</a></p>\` : children;
  }
  if (type === "image") {
    const href = data.type === "external" ? safeExternalUrl(data.external?.url || "") : "";
    if (href) return \`<figure><img src="\${escapeHtml(href)}" alt="" loading="lazy"></figure>\`;
    return \`<div class="study-media-note">🖼️ Arquivo visual disponível na fonte original do Notion.</div>\`;
  }
  if (type === "child_page") return \`<div class="study-media-note">📄 \${escapeHtml(data.title || "Página vinculada")} — abra a fonte original se precisar entrar nesta subpágina.</div>\`;
  if (type === "synced_block" || type === "column" || type === "column_list") return children;
  return children || (text ? \`<p>\${text}</p>\` : "");
}

function richTextHtml(items: Array<Record<string, any>> = []): string {
  return (items || []).map((item) => {
    let value = item.type === "equation"
      ? escapeHtml(item.equation?.expression || "")
      : escapeHtml(item.plain_text || item.text?.content || "");
    const annotations = item.annotations || {};
    if (annotations.code) value = \`<code>\${value}</code>\`;
    if (annotations.bold) value = \`<strong>\${value}</strong>\`;
    if (annotations.italic) value = \`<em>\${value}</em>\`;
    if (annotations.underline) value = \`<u>\${value}</u>\`;
    if (annotations.strikethrough) value = \`<s>\${value}</s>\`;
    const href = safeExternalUrl(item.href || item.text?.link?.url || "");
    return href ? \`<a href="\${escapeHtml(href)}" target="_blank" rel="noreferrer">\${value}</a>\` : value;
  }).join("");
}

function parseLawBankRow(page: Record<string, any>) {
  const p = page.properties || {};
  const order = propertyNumber(p, "Ordem");
  if (!order) return null;
  return {
    operational_order: order,
    status: propertyText(p, "Status"),
    study_phase: propertyText(p, "Fase de estudo"),
    summaries_done: propertyRollupNumber(p, "Resumos realizados"),
    summary_number: propertyRollupNullableNumber(p, "Resumo nº atual"),
    readings_done: propertyRollupNumber(p, "Leituras realizadas"),
    reading_number: propertyRollupNullableNumber(p, "Leitura nº atual"),
    sessions_done: propertyRollupNumber(p, "Sessões registradas"),
    questions_done: propertyRollupNumber(p, "Questões feitas"),
    flashcards_done: propertyCheckbox(p, "Flashcards feitos?"),
    orientation_read: propertyCheckbox(p, "Orientação lida"),
    d0: propertyCheckbox(p, "D0"),
    d7: propertyCheckbox(p, "D7"),
    d20: propertyCheckbox(p, "D20"),
    next_step: propertyFormula(p, "Próximo passo"),
  };
}

function parseLawQuestion(page: Record<string, any>) {
  const p = page.properties || {};
  const dayId = normalizeLawId(propertyText(p, "Dia ID"));
  if (!dayId) return null;
  const pageCode = pageCodeFromLawId(dayId);
  if (!pageCode) return null;
  return {
    page_code: pageCode,
    strategic_use: propertyText(p, "Uso estratégico pós-TR") || null,
    planned: propertyNumber(p, "Meta de questões"),
    done: propertyNumber(p, "Questões feitas"),
    correct: propertyNumber(p, "Acertos"),
    errors: propertyNumber(p, "Erros"),
    doubts: propertyNumber(p, "Acertos com dúvida"),
  };
}

function parseLawDay(page: Record<string, any>) {
  const p = page.properties || {};
  if (propertyText(p, "Trilha") !== "Leis Primeiro") return null;
  const dayId = normalizeLawId(propertyText(p, "Dia ID"));
  if (!dayId) return null;
  const pageCode = propertyText(p, "Página Lxx") || pageCodeFromLawId(dayId);
  return {
    day_id: dayId,
    page_code: pageCode,
    title: propertyText(p, "Dia") || dayId,
    progress: propertyText(p, "Progresso da sessão"),
    status: propertyText(p, "Situação") || "Sem situação",
    planned: firstKnownNumber(p, ["Meta auto", "Meta questões"]),
    done: firstKnownNumber(p, ["Feitas auto", "Questões feitas"]),
    correct: firstKnownNumber(p, ["Acertos auto", "Acertos"]),
    errors: firstKnownNumber(p, ["Erros auto", "Erros"]),
    doubts: firstKnownNumber(p, ["Dúvidas auto", "Acertos com dúvida"]),
    executed_at: propertyDate(p, "Data execução"),
    updated_at: page.last_edited_time || null,
  };
}

function parseLawSession(page: Record<string, any>) {
  const p = page.properties || {};
  const pageCode = propertyText(p, "Página Lxx");
  const title = propertyText(p, "Sessão");
  if (!title && !pageCode) return null;
  const done = propertyNumber(p, "Questões feitas");
  const correct = propertyNumber(p, "Acertos");
  return {
    id: page.id,
    title: title || page.id,
    page_code: pageCode || null,
    date: propertyDate(p, "Data"),
    progress: propertyText(p, "Progresso da sessão") || null,
    summary_number: propertyNumber(p, "Resumo nº") || null,
    reading_number: propertyNumber(p, "Leitura nº") || null,
    summary_counter: propertyNumber(p, "Contador - resumo"),
    reading_counter: propertyNumber(p, "Contador - leitura"),
    session_counter: propertyNumber(p, "Contador - sessão"),
    completed: propertyCheckbox(p, "Concluída"),
    questions_done: done,
    correct,
    errors: propertyNumber(p, "Erros"),
    doubts: propertyNumber(p, "Acertos com dúvida"),
    flashcards: propertyNumber(p, "Flashcards gerados"),
    precision: done > 0 ? correct / done : null,
    updated_at: page.last_edited_time || null,
  };
}

function codesForOperationalOrder(order: number) {
  if (order >= 1 && order <= 11) return [\`L\${String(order).padStart(2, "0")}\`];
  if (order >= 101 && order <= 107) return [\`L\${String(order - 89).padStart(2, "0")}\`];
  if (order >= 201 && order <= 206) return [\`L\${String(order - 182).padStart(2, "0")}\`];
  if (order >= 301 && order <= 305) return [\`L\${String(order - 276).padStart(2, "0")}\`];
  if (order === 306) return ["L30", "L31", "L32"];
  if (order === 307) return ["L33"];
  if (order === 308) return ["L34"];
  return [];
}

function normalizeLawId(value: string) {
  const match = String(value || "").trim().match(/^LP-(\d{8})-(L\d{2})-([LR]\d+|Q\d*)$/i);
  if (!match) return null;
  return \`LP-\${match[1]}-\${match[2].toUpperCase()}-\${match[3].toUpperCase()}\`;
}
function pageCodeFromLawId(value: string) {
  return normalizeLawId(value)?.match(/-(L\d{2})-/)?.[1] || "";
}
function strategicallyInactive(value: unknown) {
  const key = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /radar|suspenso|historico|fora do escopo/.test(key);
}

function propertyText(p: Record<string, any>, name: string) {
  const v = p?.[name];
  if (!v) return "";
  if (v.title) return v.title.map((x: any) => x.plain_text || x.text?.content || "").join("").trim();
  if (v.rich_text) return v.rich_text.map((x: any) => x.plain_text || x.text?.content || "").join("").trim();
  if (v.select) return v.select?.name || "";
  if (v.status) return v.status?.name || "";
  if (v.formula?.type === "string") return v.formula.string || "";
  return "";
}
function propertyNumber(p: Record<string, any>, name: string) {
  const n = p?.[name]?.number;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
function propertyRollupNumber(p: Record<string, any>, name: string) {
  const r = p?.[name]?.rollup;
  if (!r) return 0;
  if (r.type === "number" && typeof r.number === "number") return r.number;
  if (Array.isArray(r.array)) return r.array.reduce((sum: number, item: any) => {
    if (item?.type === "number" && typeof item.number === "number") return sum + item.number;
    if (item?.type === "formula" && typeof item.formula?.number === "number") return sum + item.formula.number;
    return sum;
  }, 0);
  return 0;
}
function propertyRollupNullableNumber(p: Record<string, any>, name: string) {
  const r = p?.[name]?.rollup;
  if (!r) return null;
  if (r.type === "number") return typeof r.number === "number" ? r.number : null;
  const values = Array.isArray(r.array) ? r.array.flatMap((item: any) => {
    if (item?.type === "number" && typeof item.number === "number") return [item.number];
    if (item?.type === "formula" && typeof item.formula?.number === "number") return [item.formula.number];
    return [];
  }) : [];
  return values.length ? Math.max(...values) : null;
}
function propertyFormula(p: Record<string, any>, name: string) {
  const f = p?.[name]?.formula;
  if (!f) return null;
  if (f.type === "string") return f.string || "";
  if (f.type === "number") return typeof f.number === "number" ? f.number : null;
  if (f.type === "boolean") return Boolean(f.boolean);
  if (f.type === "date") return f.date?.start || null;
  return null;
}
function propertyCheckbox(p: Record<string, any>, name: string) {
  return Boolean(p?.[name]?.checkbox);
}
function propertyDate(p: Record<string, any>, name: string) {
  return p?.[name]?.date?.start || null;
}
function firstKnownNumber(p: Record<string, any>, names: string[]) {
  for (const name of names) {
    const v = p?.[name];
    if (!v) continue;
    if (typeof v.number === "number") return v.number;
    if (v.formula?.type === "number" && typeof v.formula.number === "number") return v.formula.number;
    if (v.rollup?.type === "number" && typeof v.rollup.number === "number") return v.rollup.number;
  }
  return 0;
}

function richTextPlain(items: Array<Record<string, any>> = []) {
  return items.map((item) => item.plain_text || item.text?.content || "").join("");
}
function safeExternalUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function notionPageUrl(value: string) {
  return \`https://app.notion.com/p/\${String(value || "").replaceAll("-", "")}\`;
}
function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "https://rodrigorosadantas.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}
function json(value: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
