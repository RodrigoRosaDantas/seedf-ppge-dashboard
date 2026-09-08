const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const PAGE_ID = "3d4cf5a2-6731-8106-a2c9-c97816aa6cf5";
const MATERIALS_PAGE_ID = "3d4cf5a2-6731-81a4-a51f-eed1c396c77b";
const CYCLE_PAGE_ID = "3d4cf5a2-6731-8185-a1c6-da3820a7687b";
const CACHE_TTL_MS = 60_000;
const MAX_NOTION_CONCURRENCY = 4;

const allowedOrigins = new Set([
  "https://rodrigorosadantas.github.io",
  "https://seedf-ppge-dashboard.rodrigo-lzavsj-rr.chatgpt.site",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://terminal.local:4173",
]);

let cachedSnapshot: { expiresAt: number; value: DashboardSnapshot } | null = null;

Deno.serve(async (request) => {
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "GET") {
    return json({ error: "Método não permitido." }, 405, headers);
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  const token = Deno.env.get("SEEDF")?.trim();
  if (!token) {
    return json({ error: "API temporariamente indisponível." }, 503, headers);
  }

  if (!forceRefresh && cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return json(cachedSnapshot.value, 200, {
      ...headers,
      "X-SEEDF-Cache": "hit",
      "Cache-Control": "public, max-age=30",
    });
  }

  try {
    const snapshot = await buildSnapshot(token);
    cachedSnapshot = { expiresAt: Date.now() + CACHE_TTL_MS, value: snapshot };
    return json(snapshot, 200, {
      ...headers,
      "X-SEEDF-Cache": "miss",
      "Cache-Control": "public, max-age=30",
    });
  } catch (error) {
    console.error("SEEDF Notion sync failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Não foi possível consultar os dados do Notion." }, 502, headers);
  }
});

async function buildSnapshot(token: string): Promise<DashboardSnapshot> {
  const request = createNotionRequest(token);
  const [page, topLevelBlocks] = await Promise.all([
    request(`/pages/${PAGE_ID}`),
    getAllChildren(PAGE_ID, request),
  ]);
  const blocks = await expandBlocks(topLevelBlocks, request);
  const sourceText = blocks.map(blockToText).filter(Boolean).join("\n");
  let materials: MaterialsSnapshot | null = null;
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
    console.error(
      "SEEDF materials sync unavailable:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const contentHash = await sha256([sourceText, materialsText].filter(Boolean).join("\n"));

  return {
    schema_version: 1,
    source: {
      kind: "notion",
      title: pageTitle(page) || "SEEDF — PPGE | Dashboard PRO",
      page_id: PAGE_ID,
      page_url: page.url || `https://www.notion.so/${PAGE_ID.replaceAll("-", "")}`,
      last_edited_time: page.last_edited_time || null,
      synced_at: new Date().toISOString(),
      content_hash: contentHash,
      status: "live",
    },
    dashboard: {
      phase: firstMatch(sourceText, /Fase atual:\s*(Fase\s+\d+)/i) || "Fase 1",
      cycle: cycleLabel(sourceText),
      next_action:
        firstMatch(sourceText, /Próxima ação operacional:\s*([^\.\n]+)/i) ||
        "D01 · Português fino + LDB",
      planned_questions: firstNumber(sourceText, /metas fixas somam\s*([\d.]+)\s*questões/i) || 385,
      projected_questions: 455,
      executed_questions: sourceText.includes("Ainda não há desempenho SEEDF executado") ? 0 : null,
      verticalized_axes: 60,
      jobs: 3,
    },
    materials,
    notice: "Dados consultados em tempo real no Notion. O site expõe apenas um índice sanitizado de materiais e fontes.",
  };
}

async function notionRequest(endpoint: string, token: string): Promise<Record<string, any>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Notion API returned ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

type NotionRequest = (endpoint: string) => Promise<Record<string, any>>;

function createNotionRequest(token: string): NotionRequest {
  let inFlight = 0;
  const waiting: Array<() => void> = [];

  const acquire = () =>
    new Promise<void>((resolve) => {
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

  return async (endpoint: string) => {
    await acquire();
    try {
      return await notionRequest(endpoint, token);
    } finally {
      release();
    }
  };
}

async function getAllChildren(blockId: string, request: NotionRequest): Promise<Array<Record<string, any>>> {
  const children: Array<Record<string, any>> = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await request(`/blocks/${blockId}/children?${query}`);
    children.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return children;
}

async function expandBlocks(blocks: Array<Record<string, any>>, request: NotionRequest, depth = 0) {
  const nested = await mapWithConcurrency(blocks, MAX_NOTION_CONCURRENCY, async (block) => {
    if (!block.has_children || depth >= 3 || block.type === "child_page") {
      return [];
    }

    return expandBlocks(await getAllChildren(block.id, request), request, depth + 1);
  });

  return blocks.flatMap((block, index) => [block, ...nested[index]]);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
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

function blockToText(block: Record<string, any>) {
  const data = block?.[block?.type];
  if (!data) return "";

  if (Array.isArray(data.rich_text)) {
    return richTextToMarkdown(data.rich_text);
  }

  if (block.type === "table_row" && Array.isArray(data.cells)) {
    return data.cells.map((cell: any[]) => richTextToMarkdown(cell)).join(" | ");
  }

  if (block.type === "child_page") return data.title || "";
  return "";
}

function richTextToMarkdown(items: any[]) {
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

function buildMaterialsSnapshot(
  page: Record<string, any>,
  materialsText: string,
  cycleBlocks: Array<Record<string, any>>,
): MaterialsSnapshot {
  const materialPages = new Map<string, string>();
  const materialTitles = new Map<string, string>();

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
    .filter((item): item is MaterialsDay => Boolean(item));
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
    } satisfies MaterialsDaySummary;
  });

  return {
    source_url: page.url || notionPageUrl(MATERIALS_PAGE_ID),
    last_edited_time: page.last_edited_time || null,
    days,
    legislation,
    future: extractFutureMaterials(materialsText),
  };
}

function extractDayLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]\s*)?(?:\*{1,2})?D\d{2}\b/i.test(line));
}

function parseReadingDay(line: string, materialPages: Map<string, string>): MaterialsDay | null {
  const normalized = line
    .replace(/^[-*]\s*/, "")
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .trim();
  const match = normalized.match(/^D(\d{2})\s*[—–-]\s*([^:]+):\s*(.*)$/i);
  if (!match) return null;

  const day = `D${match[1]}`;
  const title = stripInlineMarkup(match[2]);
  const rawDetail = match[3].trim();
  const links = extractLinks(rawDetail).filter((link) => !/notion\.so|app\.notion\.com/i.test(link.href));

  return {
    day,
    title,
    detail: stripInlineMarkup(rawDetail),
    meta: META_BY_DAY[day] || "",
    href: materialPages.get(day) || notionPageUrl(CYCLE_PAGE_ID),
    status: STATUS_BY_DAY[day] || "Material do ciclo",
    tone: TONE_BY_DAY[day] || "teal",
    links,
  };
}

function extractFutureMaterials(text: string): FutureMaterial[] {
  const start = text.indexOf("Fila posterior");
  if (start < 0) return [];
  const section = text.slice(start);
  return section
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]\s*)?(?:\*{1,2})?MS\d{2}/i.test(line))
    .map((line) => {
      const normalized = line.replace(/^[-*]\s*/, "").replace(/^\*+/, "").replace(/\*+$/, "").trim();
      const match = normalized.match(/^(MS\d{2}(?:\/MS\d{2})?):\s*(.*)$/i);
      return match ? { label: match[1].toUpperCase(), detail: stripInlineMarkup(match[2]) } : null;
    })
    .filter((item): item is FutureMaterial => Boolean(item));
}

function extractLinks(value: string) {
  return Array.from(value.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)).map((match) => ({
    label: match[1].trim(),
    href: match[2].trim(),
  }));
}

function stripInlineMarkup(value: string) {
  return value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/<mention-page[^>]*\/>/g, "")
    .replace(/\*{1,2}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function notionPageUrl(value: string) {
  const normalized = normalizePageId(value);
  return `https://app.notion.com/p/${(normalized || value).replaceAll("-", "")}`;
}

function pageTitle(page: Record<string, any>) {
  const titleProperty = page?.properties?.title;
  return titleProperty?.title?.map((item: any) => item.plain_text || item.text?.content || "").join("") || "";
}

function normalizePageId(value: string) {
  const compact = value.replaceAll("-", "").trim();
  if (!/^[a-f0-9]{32}$/i.test(compact)) return null;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function firstMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() || null;
}

function firstNumber(text: string, pattern: RegExp) {
  const value = firstMatch(text, pattern);
  if (!value) return null;
  const number = Number(value.replaceAll(".", ""));
  return Number.isFinite(number) ? number : null;
}

function cycleLabel(text: string) {
  const value = text.match(/Ciclo\s+0?(\d+)/i)?.[1];
  return value ? `Ciclo ${value.padStart(2, "0")}` : "Ciclo 01";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "https://rodrigorosadantas.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(value: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), { status, headers });
}

const META_BY_DAY: Record<string, string> = {
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

const STATUS_BY_DAY: Record<string, string> = {
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
} as const;

type DashboardSnapshot = {
  schema_version: number;
  source: {
    kind: "notion";
    title: string;
    page_id: string;
    page_url: string;
    last_edited_time: string | null;
    synced_at: string | null;
    content_hash: string | null;
    status: string;
  };
  dashboard: {
    phase: string;
    cycle: string;
    next_action: string;
    planned_questions: number;
    projected_questions: number;
    executed_questions: number | null;
    verticalized_axes: number;
    jobs: number;
  };
  materials: MaterialsSnapshot | null;
  notice: string;
};

type MaterialsSnapshot = {
  source_url: string;
  last_edited_time: string | null;
  days: MaterialsDaySummary[];
  legislation: MaterialsDay[];
  future: FutureMaterial[];
};

type MaterialsDaySummary = {
  day: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
  tone: "gold" | "teal" | "violet" | "coral";
};

type MaterialsDay = {
  day: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
  status: string;
  tone: "gold" | "teal" | "violet" | "coral";
  links: Array<{ label: string; href: string }>;
};

type FutureMaterial = {
  label: string;
  detail: string;
};
