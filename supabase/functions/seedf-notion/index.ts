const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const PAGE_ID = "3d4cf5a2-6731-8106-a2c9-c97816aa6cf5";
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

  const token = Deno.env.get("SEEDF")?.trim();
  if (!token) {
    return json({ error: "API temporariamente indisponível." }, 503, headers);
  }

  if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
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
  const page = await request(`/pages/${PAGE_ID}`);
  const topLevelBlocks = await getAllChildren(PAGE_ID, request);
  const blocks = await expandBlocks(topLevelBlocks, request);
  const sourceText = blocks.map(blockToText).filter(Boolean).join("\n");
  const contentHash = await sha256(sourceText);

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
    notice: "Dados consultados em tempo real no Notion. O conteúdo completo não é exposto.",
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
    return data.rich_text.map((item: any) => item.plain_text || item.text?.content || "").join("");
  }

  if (block.type === "table_row" && Array.isArray(data.cells)) {
    return data.cells
      .map((cell: any[]) => cell.map((item) => item.plain_text || item.text?.content || "").join(""))
      .join(" | ");
  }

  if (block.type === "child_page") return data.title || "";
  return "";
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
  notice: string;
};
