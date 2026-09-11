import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const LEIS_PAGE_ID = "3d8cf5a2-6731-817c-89f4-f4907d14a701";
const LEGISLATION_DATA_SOURCE_ID = "6b3c940a-a382-419f-9ef6-531a1dc5cad2";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const token = process.env.NOTION_TOKEN?.trim();
const outputPath = path.resolve("public/data/leis-primeiro.json");

if (!token) throw new Error("NOTION_TOKEN is not configured.");

const request = async (endpoint, init = {}) => {
  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Notion API ${response.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
};

const [page, pageBlocks, databasePages] = await Promise.all([
  request(`/pages/${LEIS_PAGE_ID}`),
  getAllChildren(LEIS_PAGE_ID),
  queryDataSource(LEGISLATION_DATA_SOURCE_ID),
]);

const childPages = pageBlocks
  .filter((block) => block.type === "child_page" && /^L\d{2}\b/i.test(block.child_page?.title || ""))
  .map((block) => ({
    code: (block.child_page.title.match(/^(L\d{2})\b/i)?.[1] || "").toUpperCase(),
    title: block.child_page.title.replace(/^L\d{2}\s*[—–-]\s*/i, "").trim(),
    notion_url: notionPageUrl(block.id),
  }))
  .filter((item) => item.code)
  .sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)));

const bankRows = databasePages.map(parseBankRow).filter(Boolean).sort((a, b) => a.operational_order - b.operational_order);
const mappedRows = bankRows.filter((row) => row.operational_order < 900);
const radarRows = bankRows.filter((row) => row.operational_order >= 900);
const rowsByOrder = new Map(mappedRows.map((row) => [row.operational_order, row]));

if (childPages.length !== 34) {
  throw new Error(`Expected 34 L pages, found ${childPages.length}.`);
}

const expectedOrders = Array.from(new Set(childPages.map((child) => operationalOrderForCode(child.code))));
const missingOrders = expectedOrders.filter((order) => !rowsByOrder.has(order));
if (missingOrders.length) {
  throw new Error(`Missing legislation records for operational orders: ${missingOrders.join(", ")}.`);
}
if (expectedOrders.length !== 32) {
  throw new Error(`Expected 32 unique records mapped to L01-L34, found ${expectedOrders.length}.`);
}

const sharedSourceOverrides = {
  L30: "https://www.planalto.gov.br/ccivil_03/leis/l10048.htm",
  L31: "https://www.planalto.gov.br/ccivil_03/leis/l10098.htm",
  L32: "https://www.planalto.gov.br/ccivil_03/decreto/d5296.htm",
};
const sharedTargets = { L30: 3, L31: 4, L32: 3 };

const laws = childPages.map((child) => {
  const number = Number(child.code.slice(1));
  const operationalOrder = operationalOrderForCode(child.code);
  const row = rowsByOrder.get(operationalOrder);
  if (!row) throw new Error(`No mapped row for ${child.code} (order ${operationalOrder}).`);
  const sharedBlock = number >= 30 && number <= 32;
  return {
    code: child.code,
    title: child.title,
    group: groupFor(number),
    notion_url: child.notion_url,
    bank_record_url: row.url,
    operational_order: row.operational_order,
    priority: row.priority,
    official_url: sharedSourceOverrides[child.code] || row.official_url,
    status: row.status,
    question_target: sharedBlock ? sharedTargets[child.code] : row.question_target,
    operational_target_total: sharedBlock ? 10 : row.question_target,
    cargos: row.cargos,
    action: row.action,
    cut: row.cut,
    alert: row.alert,
    block: row.block,
    observations: row.observations,
    orientation_read: row.orientation_read,
    d0: row.d0,
    d7: row.d7,
    d20: row.d20,
    last_audit: row.last_audit,
    shared_block: sharedBlock,
    shared_codes: sharedBlock ? ["L30", "L31", "L32"] : [],
  };
});

const priorities = bankRows.reduce((acc, row) => {
  acc[row.priority || "Sem prioridade"] = (acc[row.priority || "Sem prioridade"] || 0) + 1;
  return acc;
}, {});

const snapshot = {
  schema_version: 2,
  source: {
    kind: "notion",
    title: pageTitle(page) || "Leis Primeiro | SEEDF",
    page_id: LEIS_PAGE_ID,
    page_url: page.url || notionPageUrl(LEIS_PAGE_ID),
    last_edited_time: page.last_edited_time || null,
    synced_at: new Date().toISOString(),
    data_source_id: LEGISLATION_DATA_SOURCE_ID,
  },
  summary: {
    pages: childPages.length,
    bank_records: bankRows.length,
    mapped_law_records: expectedOrders.length,
    radar_records: radarRows.length,
    priorities,
  },
  study_sequence: [
    "Orientação — leia Como estudar, Marcar, Pegadinhas, Recorte prioritário e Vigência / alerta.",
    "Lei seca — abra a fonte oficial e leia o recorte indicado.",
    "Questões — cumpra a Questões-meta e registre no Banco de Controle de Questões SEEDF.",
    "Flashcards — crie cartões apenas do que exige recuperação ativa.",
    "D0 — feche o bloco com marcação, erros e flashcards.",
    "D7/D20 — revise em paralelo enquanto avança para as próximas normas.",
  ],
  advance_rule: "Avance após orientação + 1ª leitura + questões + flashcards + D0; D7/D20 seguem em paralelo.",
  laws,
  radars: radarRows,
  audit_notes: [
    "34 páginas L01–L34 usam 32 registros diretamente mapeados; L30 + L31 + L32 compartilham o registro M5 de acessibilidade.",
    "O 33º registro do banco é o Radar 901 do novo PDE/DF, fora da numeração L01–L34.",
    "L11 permanece com meta operacional 0 enquanto o edital não fechar cargos e escolaridade.",
    "L33 é Radar forte com 10 questões de familiarização.",
    "L34 permanece com meta operacional 0 durante a vacatio legis; vigência em 28/12/2026.",
    "A propriedade Questões-meta do BANCO — LEGISLAÇÃO SEEDF é a referência operacional.",
  ],
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Leis Primeiro atualizado em ${outputPath}: ${laws.length} páginas, ${expectedOrders.length} registros mapeados, ${radarRows.length} radar(es).`);

function operationalOrderForCode(code) {
  const number = Number(String(code).replace(/^L/i, ""));
  if (!Number.isInteger(number) || number < 1 || number > 34) throw new Error(`Invalid law code: ${code}`);
  if (number <= 11) return number;
  if (number <= 18) return 100 + (number - 11);
  if (number <= 24) return 200 + (number - 18);
  if (number <= 29) return 300 + (number - 24);
  if (number <= 32) return 306;
  if (number === 33) return 307;
  return 308;
}

async function getAllChildren(blockId) {
  const results = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await request(`/blocks/${blockId}/children?${query}`);
    results.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

async function queryDataSource(dataSourceId) {
  const results = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const response = await request(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    results.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

function parseBankRow(page) {
  const properties = page.properties || {};
  const operationalOrder = propertyNumber(properties, "Ordem");
  if (!operationalOrder) return null;
  return {
    url: page.url || notionPageUrl(page.id),
    operational_order: operationalOrder,
    title: propertyText(properties, "Norma"),
    priority: propertyText(properties, "Prioridade"),
    official_url: propertyUrl(properties, "Fonte oficial"),
    status: propertyText(properties, "Status"),
    question_target: propertyNumber(properties, "Questões-meta"),
    cargos: propertyMultiSelect(properties, "Cargos"),
    action: propertyText(properties, "Ação atual"),
    cut: propertyText(properties, "Recorte prioritário"),
    alert: propertyText(properties, "Vigência / alerta"),
    block: propertyText(properties, "Bloco sugerido"),
    observations: propertyText(properties, "Observações"),
    orientation_read: propertyCheckbox(properties, "Orientação lida"),
    d0: propertyCheckbox(properties, "D0"),
    d7: propertyCheckbox(properties, "D7"),
    d20: propertyCheckbox(properties, "D20"),
    last_audit: propertyDate(properties, "Última auditoria"),
  };
}

function propertyText(properties, name) {
  const property = properties?.[name];
  if (!property) return "";
  if (property.title) return property.title.map((item) => item.plain_text || item.text?.content || "").join("").trim();
  if (property.rich_text) return property.rich_text.map((item) => item.plain_text || item.text?.content || "").join("").trim();
  if (property.select) return property.select?.name || "";
  if (property.status) return property.status?.name || "";
  if (property.formula?.type === "string") return property.formula.string || "";
  return "";
}
function propertyNumber(properties, name) {
  const value = properties?.[name]?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function propertyUrl(properties, name) { return properties?.[name]?.url || ""; }
function propertyMultiSelect(properties, name) { return (properties?.[name]?.multi_select || []).map((item) => item.name).filter(Boolean); }
function propertyCheckbox(properties, name) { return Boolean(properties?.[name]?.checkbox); }
function propertyDate(properties, name) { return properties?.[name]?.date?.start || null; }
function pageTitle(page) {
  const title = Object.values(page?.properties || {}).find((property) => property?.type === "title" || property?.title);
  return title?.title?.map((item) => item.plain_text || item.text?.content || "").join("") || "";
}
function notionPageUrl(value) { return `https://app.notion.com/p/${String(value).replaceAll("-", "")}`; }
function groupFor(number) {
  if (number <= 11) return "Núcleo comum";
  if (number <= 18) return "Gestor — Administração";
  if (number <= 24) return "Apoio Administrativo";
  return "Monitor";
}
