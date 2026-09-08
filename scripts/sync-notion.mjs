import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PAGE_ID = "3d4cf5a2-6731-8106-a2c9-c97816aa6cf5";
const MATERIALS_PAGE_ID = "3d4cf5a2-6731-81a4-a51f-eed1c396c77b";
const CYCLE_PAGE_ID = "3d4cf5a2-6731-8185-a1c6-da3820a7687b";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const MAX_NOTION_CONCURRENCY = 4;
const pageId = normalizePageId(process.env.NOTION_PAGE_ID || DEFAULT_PAGE_ID);
const token = process.env.NOTION_TOKEN?.trim();
const outputPath = path.resolve("public/data/seedf-snapshot.json");

if (!token) {
  throw new Error("NOTION_TOKEN is not configured. Add it as a GitHub Actions secret.");
}

const request = createNotionRequest();
const [page, topLevelBlocks] = await Promise.all([
  request(`/pages/${pageId}`),
  getAllChildren(pageId, request),
]);
const blocks = await expandBlocks(topLevelBlocks, request);
const sourceText = blocks.map(blockToText).filter(Boolean).join("\n");
let materials = null;
let materialsText = "";

try {
  const [materialsPage, materialsTopLevelBlocks, cycleTopLevelBlocks] = await Promise.all([
    request(`/pages/${MATERIALS_PAGE_ID}`),
    getAllChildren(MATERIALS_PAGE_ID, request),
    getAllChildren(CYCLE_PAGE_ID, request),
  ]);
  const [materialBlocks, cycleBlocks] = await Promise.all([
    expandBlocks(materialsTopLevelBlocks, request),
    expandBlocks(cycleTopLevelBlocks, request),
  ]);
  materialsText = materialBlocks.map(blockToText).filter(Boolean).join("\n");
  materials = buildMaterialsSnapshot(materialsPage, materialsText, cycleBlocks);
} catch (error) {
  console.error("Materiais do Notion indisponíveis:", error instanceof Error ? error.message : "unknown error");
}

const contentHash = createHash("sha256").update([sourceText, materialsText].filter(Boolean).join("\n")).digest("hex");
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
  materials,
  notice: "Snapshot público sanitizado. O conteúdo completo continua no Notion; materiais e fontes são indexados para consulta.",
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

function createNotionRequest() {
  let inFlight = 0;
  const waiting = [];

  const acquire = () =>
    new Promise((resolve) => {
      if (inFlight < MAX_NOTION_CONCURRENCY) {
        inFlight += 1;
        resolve();
      } else {
        waiting.push(resolve);
      }
    });

  const release = () => {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      inFlight -= 1;
    }
  };

  return async (endpoint) => {
    await acquire();
    try {
      return await notionRequest(endpoint);
    } finally {
      release();
    }
  };
}

async function getAllChildren(blockId, request) {
  const children = [];
  let cursor = null;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await request(`/blocks/${blockId}/children?${query}`);
    children.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return children;
}

async function expandBlocks(blocks, request, depth = 0) {
  const nested = await mapWithConcurrency(blocks, MAX_NOTION_CONCURRENCY, async (block) => {
    if (!block.has_children || depth >= 3 || block.type === "child_page") {
      return [];
    }

    return expandBlocks(await getAllChildren(block.id, request), request, depth + 1);
  });

  return blocks.flatMap((block, index) => [block, ...nested[index]]);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function blockToText(block) {
  const data = block?.[block?.type];
  if (!data) return "";

  if (Array.isArray(data.rich_text)) {
    return richTextToMarkdown(data.rich_text);
  }

  if (block.type === "table_row" && Array.isArray(data.cells)) {
    return data.cells.map((cell) => richTextToMarkdown(cell)).join(" | ");
  }

  if (block.type === "child_page") return data.title || "";
  return "";
}

function richTextToMarkdown(items) {
  return items
    .map((item) => {
      const text = item.plain_text || item.text?.content || item.mention?.page?.title || "";
      const href =
        item.href ||
        item.text?.link?.url ||
        (item.mention?.page?.id ? notionPageUrl(item.mention.page.id) : null);
      return href && text ? `[${text}](${href})` : text;
    })
    .join("");
}

function buildMaterialsSnapshot(page, materialsText, cycleBlocks) {
  const materialPages = new Map();
  const materialTitles = new Map();

  for (const block of cycleBlocks) {
    if (block.type !== "child_page") continue;
    const title = block.child_page?.title || "";
    const day = title.match(/^(D\d{2})\b/i)?.[1]?.toUpperCase();
    if (day) {
      materialPages.set(day, notionPageUrl(block.id));
      materialTitles.set(day, title.replace(/^D\d{2}\s*[—–-]\s*/i, "").trim());
    }
  }

  const legislation = extractDayLines(materialsText)
    .map((line) => parseReadingDay(line, materialPages))
    .filter(Boolean);
  const legislationByDay = new Map(legislation.map((item) => [item.day, item]));
  const days = Array.from(new Set([...materialTitles.keys(), ...legislationByDay.keys()])).map((day) => {
    const lawItem = legislationByDay.get(day);
    return {
      day,
      title: materialTitles.get(day) || lawItem?.title || day,
      detail: lawItem?.title ? `Leitura vinculada: ${lawItem.title}.` : "Material do ciclo no Notion.",
      meta: META_BY_DAY[day] || "",
      href: materialPages.get(day) || notionPageUrl(CYCLE_PAGE_ID),
      tone: TONE_BY_DAY[day] || "teal",
    };
  });

  return {
    source_url: page.url || notionPageUrl(MATERIALS_PAGE_ID),
    last_edited_time: page.last_edited_time || null,
    days,
    legislation,
    future: extractFutureMaterials(materialsText),
  };
}

function extractDayLines(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]\s*)?(?:\*{1,2})?D\d{2}\b/i.test(line));
}

function parseReadingDay(line, materialPages) {
  const normalized = line
    .replace(/^[-*]\s*/, "")
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .trim();
  const match = normalized.match(/^D(\d{2})\s*[—–-]\s*([^:]+):\s*(.*)$/i);
  if (!match) return null;

  const day = `D${match[1]}`;
  const rawDetail = match[3].trim();
  return {
    day,
    title: stripInlineMarkup(match[2]),
    detail: stripInlineMarkup(rawDetail),
    meta: META_BY_DAY[day] || "",
    href: materialPages.get(day) || notionPageUrl(CYCLE_PAGE_ID),
    status: STATUS_BY_DAY[day] || "Material do ciclo",
    tone: TONE_BY_DAY[day] || "teal",
    links: extractLinks(rawDetail).filter((link) => !/notion\.so|app\.notion\.com/i.test(link.href)),
  };
}

function extractFutureMaterials(text) {
  const start = text.indexOf("Fila posterior");
  if (start < 0) return [];
  return text
    .slice(start)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]\s*)?(?:\*{1,2})?MS\d{2}/i.test(line))
    .map((line) => {
      const normalized = line.replace(/^[-*]\s*/, "").replace(/^\*+/, "").replace(/\*+$/, "").trim();
      const match = normalized.match(/^(MS\d{2}(?:\/MS\d{2})?):\s*(.*)$/i);
      return match ? { label: match[1].toUpperCase(), detail: stripInlineMarkup(match[2]) } : null;
    })
    .filter(Boolean);
}

function extractLinks(value) {
  return Array.from(value.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)).map((match) => ({
    label: match[1].trim(),
    href: match[2].trim(),
  }));
}

function stripInlineMarkup(value) {
  return value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/<mention-page[^>]*\/>/g, "")
    .replace(/\*{1,2}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function notionPageUrl(value) {
  const normalized = normalizePageId(value);
  return `https://app.notion.com/p/${normalized.replaceAll("-", "")}`;
}

const META_BY_DAY = {
  D01: "25 questões",
  D02: "30 questões",
  D03: "30 questões",
  D04: "30 questões",
  D05: "35 questões",
  D06: "35 questões",
  D07: "30 questões · adaptativo",
  D08: "35 questões",
  D09: "30 questões",
  D10: "35 questões",
  D11: "35 questões",
  D12: "35 questões",
  D13: "30 questões",
  D14: "40 questões · adaptativo",
};

const STATUS_BY_DAY = {
  D01: "Leitura obrigatória",
  D02: "Leitura obrigatória",
  D03: "Leitura obrigatória + atualização",
  D04: "Questões primeiro",
  D05: "Leitura obrigatória",
  D06: "Fonte técnica",
  D07: "Revisão pelos dados",
  D08: "Leitura complementar",
  D09: "Conceitos + questões",
  D10: "Teoria + questões",
  D11: "Leitura obrigatória",
  D12: "Reforço pontual",
  D13: "Leitura + radar normativo",
  D14: "Checkpoint adaptativo",
};

const TONE_BY_DAY = {
  D01: "gold",
  D02: "teal",
  D03: "violet",
  D04: "teal",
  D05: "coral",
  D06: "violet",
  D07: "violet",
  D08: "teal",
  D09: "teal",
  D10: "coral",
  D11: "gold",
  D12: "teal",
  D13: "coral",
  D14: "violet",
};

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
