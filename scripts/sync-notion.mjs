import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PAGE_ID = "3d4cf5a2-6731-8106-a2c9-c97816aa6cf5";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const pageId = normalizePageId(process.env.NOTION_PAGE_ID || DEFAULT_PAGE_ID);
const token = process.env.NOTION_TOKEN?.trim();
const outputPath = path.resolve("public/data/seedf-snapshot.json");

if (!token) {
  throw new Error("NOTION_TOKEN is not configured. Add it as a GitHub Actions secret.");
}

const page = await notionRequest(`/pages/${pageId}`);
const topLevelBlocks = await getAllChildren(pageId);
const blocks = await expandBlocks(topLevelBlocks);
const sourceText = blocks.map(blockToText).filter(Boolean).join("\n");
const contentHash = createHash("sha256").update(sourceText).digest("hex");
const previous = await readPreviousSnapshot();
const syncedAt =
  previous?.source?.content_hash === contentHash && previous?.source?.synced_at
    ? previous.source.synced_at
    : new Date().toISOString();

const snapshot = {
  schema_version: 1,
  source: {
    kind: "notion",
    title: pageTitle(page) || "SEEDF — PPGE | Dashboard PRO",
    page_id: pageId,
    page_url: page.url || `https://www.notion.so/${pageId.replaceAll("-", "")}`,
    last_edited_time: page.last_edited_time || null,
    synced_at: syncedAt,
    content_hash: contentHash,
    status: "synced",
  },
  dashboard: {
    phase: firstMatch(sourceText, /Fase atual:\s*(Fase\s+\d+)/i) || "Fase 1",
    cycle: cycleLabel(sourceText),
    next_action:
      firstMatch(sourceText, /Próxima ação operacional:\s*([^\.\n]+)/i) ||
      "D01 · Português fino + LDB",
    planned_questions:
      firstNumber(sourceText, /metas fixas somam\s*([\d.]+)\s*questões/i) || 385,
    projected_questions: 455,
    executed_questions: sourceText.includes("Ainda não há desempenho SEEDF executado") ? 0 : null,
    verticalized_axes: 60,
    jobs: 3,
  },
  notice: "Snapshot público sanitizado. O conteúdo completo continua no Notion.",
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Snapshot do Notion atualizado em ${outputPath}`);

async function notionRequest(endpoint) {
  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Notion API returned ${response.status}: ${body.slice(0, 240)}`);
  }

  return JSON.parse(body);
}

async function getAllChildren(blockId) {
  const children = [];
  let cursor = null;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await notionRequest(`/blocks/${blockId}/children?${query}`);
    children.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return children;
}

async function expandBlocks(blocks, depth = 0) {
  const expanded = [];
  for (const block of blocks) {
    expanded.push(block);
    if (block.has_children && depth < 3 && block.type !== "child_page") {
      expanded.push(...(await expandBlocks(await getAllChildren(block.id), depth + 1)));
    }
  }
  return expanded;
}

function blockToText(block) {
  const data = block?.[block?.type];
  if (!data) return "";

  if (Array.isArray(data.rich_text)) {
    return data.rich_text.map((item) => item.plain_text || item.text?.content || "").join("");
  }

  if (block.type === "table_row" && Array.isArray(data.cells)) {
    return data.cells
      .map((cell) => cell.map((item) => item.plain_text || item.text?.content || "").join(""))
      .join(" | ");
  }

  if (block.type === "child_page") return data.title || "";
  return "";
}

function pageTitle(pageObject) {
  const titleProperty = pageObject?.properties?.title;
  return titleProperty?.title?.map((item) => item.plain_text || item.text?.content || "").join("") || "";
}

function normalizePageId(value) {
  const compact = value.replaceAll("-", "").trim();
  if (!/^[a-f0-9]{32}$/i.test(compact)) {
    throw new Error("NOTION_PAGE_ID must be a valid 32-character Notion page ID.");
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function firstMatch(text, pattern) {
  return text.match(pattern)?.[1]?.trim() || null;
}

function firstNumber(text, pattern) {
  const value = firstMatch(text, pattern);
  if (!value) return null;
  const number = Number(value.replaceAll(".", ""));
  return Number.isFinite(number) ? number : null;
}

function cycleLabel(text) {
  const value = text.match(/Ciclo\s+0?(\d+)/i)?.[1];
  return value ? `Ciclo ${value.padStart(2, "0")}` : "Ciclo 01";
}

async function readPreviousSnapshot() {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return null;
  }
}
