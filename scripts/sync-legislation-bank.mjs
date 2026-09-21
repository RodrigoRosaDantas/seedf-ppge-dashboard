import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATABASE_ID = "49157e87d33a4fa590edfdb4b84dbc46";
const DATA_SOURCE_ID = "6b3c940a-a382-419f-9ef6-531a1dc5cad2";
const API = "https://api.notion.com/v1";
const VERSION = process.env.NOTION_VERSION || "2026-03-11";
const token = process.env.NOTION_TOKEN?.trim();
const output = path.resolve("public/data/legislation-bank.json");
if (!token) throw new Error("NOTION_TOKEN is not configured.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(endpoint, init = {}, attempt = 0) {
  const response = await fetch(`${API}${endpoint}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  if (response.status === 429 && attempt < 6) {
    await sleep(Math.max(500, Number(response.headers.get("retry-after") || 1) * 1000));
    return request(endpoint, init, attempt + 1);
  }
  if (!response.ok) throw new Error(`Notion API ${response.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function queryAll() {
  const rows = [];
  let cursor = null;
  do {
    const body = { page_size: 100, sorts: [{ property: "Ordem", direction: "ascending" }] };
    if (cursor) body.start_cursor = cursor;
    const response = await request(`/data_sources/${DATA_SOURCE_ID}/query`, { method: "POST", body: JSON.stringify(body) });
    rows.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return rows;
}

function text(properties, name) {
  const p = properties?.[name];
  if (!p) return "";
  if (Array.isArray(p.title)) return p.title.map((x) => x.plain_text || x.text?.content || "").join("").trim();
  if (Array.isArray(p.rich_text)) return p.rich_text.map((x) => x.plain_text || x.text?.content || "").join("").trim();
  if (p.select) return p.select.name || "";
  if (p.status) return p.status.name || "";
  if (p.formula?.type === "string") return p.formula.string || "";
  return "";
}
function number(properties, name) { const v = properties?.[name]?.number; return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function checkbox(properties, name) { return Boolean(properties?.[name]?.checkbox); }
function date(properties, name) { return properties?.[name]?.date?.start || null; }
function url(properties, name) { return properties?.[name]?.url || ""; }
function multi(properties, name) { return (properties?.[name]?.multi_select || []).map((x) => x.name).filter(Boolean); }
function rollupNumber(properties, name) {
  const r = properties?.[name]?.rollup;
  if (!r) return 0;
  if (r.type === "number" && typeof r.number === "number") return r.number;
  if (Array.isArray(r.array)) return r.array.reduce((sum, item) => {
    if (item?.type === "number" && typeof item.number === "number") return sum + item.number;
    if (item?.type === "formula" && typeof item.formula?.number === "number") return sum + item.formula.number;
    return sum;
  }, 0);
  return 0;
}
function rollupNullableNumber(properties, name) {
  const r = properties?.[name]?.rollup;
  if (!r) return null;
  if (r.type === "number") return typeof r.number === "number" && Number.isFinite(r.number) ? r.number : null;
  if (Array.isArray(r.array)) {
    const values = r.array.flatMap((item) => {
      if (item?.type === "number" && typeof item.number === "number" && Number.isFinite(item.number)) return [item.number];
      if (item?.type === "formula" && typeof item.formula?.number === "number" && Number.isFinite(item.formula.number)) return [item.formula.number];
      return [];
    });
    return values.length ? Math.max(...values) : null;
  }
  return null;
}
function formula(properties, name) {
  const f = properties?.[name]?.formula;
  if (!f) return null;
  if (f.type === "number") return typeof f.number === "number" ? f.number : null;
  if (f.type === "string") return f.string || "";
  if (f.type === "boolean") return Boolean(f.boolean);
  if (f.type === "date") return f.date?.start || null;
  return null;
}
function compactId(value) { return String(value || "").replaceAll("-", "").toLowerCase(); }
function notionUrl(value) { return `https://app.notion.com/p/${compactId(value)}`; }
function codesForOrder(order) {
  if (order >= 1 && order <= 11) return [`L${String(order).padStart(2, "0")}`];
  if (order >= 101 && order <= 107) return [`L${String(order - 89).padStart(2, "0")}`];
  if (order >= 201 && order <= 206) return [`L${String(order - 182).padStart(2, "0")}`];
  if (order >= 301 && order <= 305) return [`L${String(order - 276).padStart(2, "0")}`];
  if (order === 306) return ["L30", "L31", "L32"];
  if (order === 307) return ["L33"];
  if (order === 308) return ["L34"];
  return [];
}

const pages = await queryAll();
const rows = pages.map((page) => {
  const p = page.properties || {};
  const order = number(p, "Ordem");
  const codes = codesForOrder(order);
  return {
    page_id: page.id,
    url: page.url || notionUrl(page.id),
    operational_order: order,
    codes,
    internal_paths: codes.map((code) => `./${code.toLowerCase()}/`),
    record_kind: order >= 900 ? "radar" : "trilha",
    title: text(p, "Norma"),
    priority: text(p, "Prioridade"),
    status: text(p, "Status"),
    study_phase: text(p, "Fase de estudo"),
    action: text(p, "Ação atual"),
    official_url: url(p, "Fonte oficial"),
    question_target: number(p, "Questões-meta"),
    questions_additional: number(p, "Questões adicionais"),
    questions_optional: number(p, "Questões opcionais"),
    target_model: text(p, "Modelo de meta"),
    additional_target_cargos: multi(p, "Cargo da meta adicional"),
    operational_question_target: number(p, "Questões-meta") + number(p, "Questões adicionais"),
    questions_done: rollupNumber(p, "Questões feitas"),
    hits: rollupNumber(p, "Acertos"),
    errors: rollupNumber(p, "Erros"),
    doubtful_hits: rollupNumber(p, "Acertos com dúvida"),
    accuracy: formula(p, "% de acerto"),
    flashcards_done: checkbox(p, "Flashcards feitos?"),
    cargos: multi(p, "Cargos"),
    orientation_read: checkbox(p, "Orientação lida"),
    summaries_done: rollupNumber(p, "Resumos realizados"),
    summary_number: rollupNullableNumber(p, "Resumo nº atual"),
    readings_done: rollupNumber(p, "Leituras realizadas"),
    reading_number: rollupNullableNumber(p, "Leitura nº atual"),
    sessions_done: rollupNumber(p, "Sessões registradas"),
    d0: checkbox(p, "D0"), d7: checkbox(p, "D7"), d20: checkbox(p, "D20"),
    next_review: date(p, "Próxima revisão"),
    next_step: formula(p, "Próximo passo"),
    cut: text(p, "Recorte prioritário"),
    alert: text(p, "Vigência / alerta"),
    block: text(p, "Bloco sugerido"),
    observations: text(p, "Observações"),
    complementary_sources: text(p, "Fontes complementares"),
    last_read: date(p, "Última leitura"),
    last_audit: date(p, "Última auditoria"),
  };
}).filter((row) => row.operational_order > 0).sort((a, b) => a.operational_order - b.operational_order);

const snapshot = {
  schema_version: 4,
  source: { kind: "notion", database_id: DATABASE_ID, database_url: notionUrl(DATABASE_ID), data_source_id: DATA_SOURCE_ID, synced_at: new Date().toISOString() },
  summary: { records: rows.length, trail_records: rows.filter((r) => r.record_kind === "trilha").length, radar_records: rows.filter((r) => r.record_kind === "radar").length },
  rows,
};
if (rows.length !== 33) throw new Error(`Expected 33 legislation bank rows, found ${rows.length}.`);
await mkdir(path.dirname(output), { recursive: true });
const previousSnapshot = await readPreviousSnapshot(output);
if (previousSnapshot?.source?.synced_at && snapshotContent(previousSnapshot) === snapshotContent(snapshot)) {
  snapshot.source.synced_at = previousSnapshot.source.synced_at;
}
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`BANCO — LEGISLAÇÃO SEEDF: ${rows.length} registros sincronizados em ${output}.`);

async function readPreviousSnapshot(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function snapshotContent(value) {
  return JSON.stringify(value, (key, nested) => key === "synced_at" ? undefined : nested);
}
