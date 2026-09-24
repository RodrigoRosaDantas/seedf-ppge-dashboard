import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PAGE_ID = "3d4cf5a2-6731-8106-a2c9-c97816aa6cf5";
const MATERIALS_PAGE_ID = "3d4cf5a2-6731-81a4-a51f-eed1c396c77b";
const SEQUENTIAL_MATERIALS_PAGE_ID = "3d4cf5a2-6731-8152-83c2-e9f51eb86cc6";
const CYCLE_PAGE_ID = "3d4cf5a2-6731-8185-a1c6-da3820a7687b";
const DAYS_DATA_SOURCE_ID = "60966f0a-b3eb-416b-8995-64253ed26a45";
const QUESTIONS_DATA_SOURCE_ID = "8a241986-94e7-4340-b898-dc905b19fd58";
const ERRORS_DATA_SOURCE_ID = "68d7c880-165b-4e44-988b-cb9e3c38d8b2";
const LEGISLATION_HISTORY_DATA_SOURCE_ID = "61340ed0-f7cf-4fbf-b543-62e1c2b6f458";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const MAX_NOTION_CONCURRENCY = 4;
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
let sequenceText = "";

try {
  const [
    materialsPage,
    materialsTopLevelBlocks,
    cycleTopLevelBlocks,
    sequencePage,
    sequenceTopLevelBlocks,
  ] = await Promise.all([
    request(`/pages/${MATERIALS_PAGE_ID}`),
    getAllChildren(MATERIALS_PAGE_ID, request),
    getAllChildren(CYCLE_PAGE_ID, request),
    request(`/pages/${SEQUENTIAL_MATERIALS_PAGE_ID}`),
    getAllChildren(SEQUENTIAL_MATERIALS_PAGE_ID, request),
  ]);
  const [materialBlocks, cycleBlocks, sequenceBlocks] = await Promise.all([
    expandBlocks(materialsTopLevelBlocks, request),
    expandBlocks(cycleTopLevelBlocks, request),
    expandBlocks(sequenceTopLevelBlocks, request),
  ]);
  materialsText = materialBlocks.map(blockToText).filter(Boolean).join("\n");
  sequenceText = sequenceBlocks.map(blockToText).filter(Boolean).join("\n");
  materials = buildMaterialsSnapshot(
    materialsPage,
    materialsText,
    cycleBlocks,
    sequencePage,
    sequenceText,
  );} catch (error) {
  console.error("Materiais do Notion indisponíveis:", error instanceof Error ? error.message : "unknown error");
}

let execution = null;
let executionHashText = "";

try {
  const [dayPages, questionPages, errorPages, legislationSessionPages] = await Promise.all([
    queryDataSource(DAYS_DATA_SOURCE_ID, request),
    queryDataSource(QUESTIONS_DATA_SOURCE_ID, request),
    queryDataSource(ERRORS_DATA_SOURCE_ID, request),
    queryDataSource(LEGISLATION_HISTORY_DATA_SOURCE_ID, request),
  ]);
  execution = buildExecutionSnapshot(dayPages, questionPages, errorPages, legislationSessionPages);
  executionHashText = JSON.stringify(
    [dayPages, questionPages, errorPages, legislationSessionPages].map((pages) =>
      pages.map((page) => ({ id: page.id, edited: page.last_edited_time, properties: page.properties })),
    ),
  );
} catch (error) {
  console.error("Execução SEEDF indisponível:", error instanceof Error ? error.message : "unknown error");
}

const contentHash = createHash("sha256").update([sourceText, materialsText, sequenceText, executionHashText].filter(Boolean).join("\n")).digest("hex");
const previous = await readPreviousSnapshot();
const syncedAt =
  previous?.source?.content_hash === contentHash && previous?.source?.synced_at
    ? previous.source.synced_at
    : new Date().toISOString();

const snapshot = {
  schema_version: 3,
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
    executed_questions: execution?.c01?.totals?.done ?? (sourceText.includes("Ainda não há desempenho SEEDF executado") ? 0 : null),
    verticalized_axes: 60,
    jobs: 3,
  },
  materials: materials || previous?.materials || null,
  execution,
  notice: "Snapshot público sanitizado. O conteúdo completo continua no Notion; materiais, fontes e execução do C01 são indexados para consulta.",
};

if (previous?.source?.content_hash === contentHash && previous.execution?.as_of && snapshot.execution) {
  snapshot.execution.as_of = previous.execution.as_of;
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Snapshot do Notion atualizado em ${outputPath}`);

async function notionRequest(endpoint, init = {}) {
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

  return async (endpoint, init = {}) => {
    await acquire();
    try {
      return await notionRequest(endpoint, init);
    } finally {
      release();
    }
  };
}

async function queryDataSource(dataSourceId, request) {
  const pages = [];
  let cursor = null;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const response = await request(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return pages;
}

function buildExecutionSnapshot(dayPages, questionPages, errorPages, legislationSessionPages = []) {
  const days = dayPages
    .map(parseExecutionDay)
    .filter(Boolean)
    .sort((left, right) => left.order - right.order || left.day.localeCompare(right.day));

  const currentQuestionPages = questionPages
    .map((page) => ({ page, day: normalizeC01Day(propertyText(page.properties, "Dia ID")) }))
    .filter((item) => Boolean(item.day));
  const currentErrorPages = errorPages
    .map((page) => ({
      page,
      day: normalizeC01Day(
        propertyText(page.properties, "Origem / Dia ID") ||
        propertyText(page.properties, "Dia ID"),
      ),
    }))
    .filter((item) => Boolean(item.day));

  const subjects = new Map();
  for (const { page } of currentQuestionPages) {
    const properties = page.properties || {};
    const subject = propertyText(properties, "Matéria") || "Sem matéria";
    const current = subjects.get(subject) || {
      subject,
      planned: 0,
      done: 0,
      correct: 0,
      errors: 0,
      doubts: 0,
      precision: null,
      rows: 0,
    };
    current.planned = strictAdd(current.planned, propertyNumeric(properties, "Meta de questões"));
    current.done = strictAdd(current.done, propertyNumeric(properties, "Questões feitas"));
    current.correct = strictAdd(current.correct, propertyNumeric(properties, "Acertos"));
    current.errors = strictAdd(current.errors, propertyNumeric(properties, "Erros"));
    current.doubts = strictAdd(current.doubts, propertyNumeric(properties, "Acertos com dúvida"));
    current.rows += 1;
    current.precision = precision(current.correct, current.done);
    subjects.set(subject, current);
  }

  const fixedMeta = Array.from(subjects.values()).reduce((sum, subject) => strictAdd(sum, subject.planned), 0);
  const totals = days.reduce(
    (sum, day) => ({
      planned: strictAdd(sum.planned, day.planned),
      fixed_meta: fixedMeta,
      done: strictAdd(sum.done, day.done),
      correct: strictAdd(sum.correct, day.correct),
      errors: strictAdd(sum.errors, day.errors),
      doubts: strictAdd(sum.doubts, day.doubts),
      minutes: strictAdd(sum.minutes, day.minutes),
      precision: null,
      progress: 0,
    }),
    { planned: 0, fixed_meta: fixedMeta, done: 0, correct: 0, errors: 0, doubts: 0, minutes: 0, precision: null, progress: 0 },
  );
  totals.precision = precision(totals.correct, totals.done);
  totals.progress = totals.planned !== null && totals.done !== null && totals.planned > 0 ? totals.done / totals.planned : null;

  const statuses = {};
  for (const day of days) statuses[day.status] = (statuses[day.status] || 0) + 1;
  const activeDay = days.find((day) => /próximo|andamento|execução/i.test(day.status))?.day ||
    days.find((day) => day.done > 0 && day.done < day.planned)?.day || null;

  const lawDays = dayPages
    .map(parseLeisPrimeiroDay)
    .filter(Boolean)
    .sort(compareLeisPrimeiroDays);

  const lawQuestionPages = questionPages
    .map((page) => ({ page, day_id: normalizeLeisPrimeiroId(propertyText(page.properties, "Dia ID")) }))
    .filter((item) => Boolean(item.day_id));
  const currentErrors = currentErrorPages
    .map(({ page }) => parseC01Error(page))
    .filter(Boolean)
    .sort((left, right) => (right.date || "").localeCompare(left.date || "") || String(left.question_id || "").localeCompare(String(right.question_id || "")));

  const lawErrors = errorPages
    .map(parseLeisPrimeiroError)
    .filter(Boolean)
    .sort((left, right) => (right.date || "").localeCompare(left.date || "") || left.question_id.localeCompare(right.question_id));
  const legislationSessions = legislationSessionPages
    .map(parseLegislationSession)
    .filter(Boolean)
    .sort((left, right) =>
      (right.date || "").localeCompare(left.date || "") ||
      (right.created_at || "").localeCompare(left.created_at || "") ||
      right.title.localeCompare(left.title)
    );

  const lawTotals = lawDays.reduce((sum, day) => {
    sum.planned = strictAdd(sum.planned, day.planned);
    sum.done = strictAdd(sum.done, day.done);
    sum.correct = strictAdd(sum.correct, day.correct);
    sum.errors = strictAdd(sum.errors, day.errors);
    sum.doubts = strictAdd(sum.doubts, day.doubts);
    sum.minutes = strictAdd(sum.minutes, day.minutes);
    return sum;
  }, { planned: 0, done: 0, correct: 0, errors: 0, doubts: 0, minutes: 0, precision: null });
  lawTotals.precision = precision(lawTotals.correct, lawTotals.done);

  const sessionTotals = legislationSessions.reduce((sum, session) => {
    sum.sessions = strictAdd(sum.sessions, session.session_counter);
    sum.summaries = strictAdd(sum.summaries, session.summary_counter);
    sum.readings = strictAdd(sum.readings, session.reading_counter);
    sum.questions = strictAdd(sum.questions, session.questions_done);
    sum.correct = strictAdd(sum.correct, session.correct);
    sum.errors = strictAdd(sum.errors, session.errors);
    sum.doubts = strictAdd(sum.doubts, session.doubts);
    sum.flashcards = strictAdd(sum.flashcards, session.flashcards);
    return sum;
  }, { sessions: 0, summaries: 0, readings: 0, questions: 0, correct: 0, errors: 0, doubts: 0, flashcards: 0, precision: null });
  sessionTotals.precision = precision(sessionTotals.correct, sessionTotals.questions);

  const lawStatuses = {};
  for (const day of lawDays) lawStatuses[day.status] = (lawStatuses[day.status] || 0) + 1;

  return {
    as_of: new Date().toISOString(),
    c01: {
      days,
      totals: { ...totals, fixed_meta: fixedMeta },
      subjects: Array.from(subjects.values()).sort((left, right) => right.planned - left.planned || left.subject.localeCompare(right.subject)),
      statuses,
      active_day: activeDay,
      error_count: currentErrors.length,
      errors: currentErrors,
      question_rows: currentQuestionPages.length,
    },
    leis_primeiro: {
      days: lawDays,
      totals: lawTotals,
      statuses: lawStatuses,
      active_day_id: lawDays.find((day) => /próximo|andamento/i.test(day.status))?.day_id || null,
      question_rows: lawQuestionPages.length,
      error_count: lawErrors.length,
      errors: lawErrors,
      latest_day_id: lawDays[0]?.day_id || null,
      sessions: legislationSessions,
      session_totals: sessionTotals,
    },
  };
}

function parseExecutionDay(page) {
  const properties = page.properties || {};
  const day = normalizeC01Day(propertyText(properties, "Dia ID") || propertyText(properties, "Dia"));
  const trail = propertyText(properties, "Trilha");
  if (!day || propertyText(properties, "Ciclo") !== "C01" || (trail && trail !== "Ciclo principal")) return null;

  const planned = firstKnownNumber(properties, ["Meta questões", "Meta auto"]);
  const done = firstKnownNumber(properties, ["Questões feitas", "Feitas auto"]);
  const correct = firstKnownNumber(properties, ["Acertos", "Acertos auto"]);
  const errors = firstKnownNumber(properties, ["Erros", "Erros auto"]);
  const doubts = firstKnownNumber(properties, ["Acertos com dúvida", "Dúvidas auto"]);
  return {
    day,
    day_id: propertyText(properties, "Dia ID") || `C01-${day}`,
    trail: trail || "Ciclo principal",
    title: propertyText(properties, "Dia") || day,
    status: propertyText(properties, "Situação") || "Sem situação",
    type: propertyText(properties, "Tipo") || "Temático",
    order: propertyNumeric(properties, "Ordem"),
    planned,
    done,
    correct,
    errors,
    doubts,
    minutes: firstNumberProperty(properties, ["Tempo (min)", "Minutos", "Tempo"]),
    precision: precision(correct, done),
    progress: planned !== null && done !== null && planned > 0 ? done / planned : null,
    href: propertyUrl(properties, "Página do dia") || page.url || notionPageUrl(page.id),
    executed_at: propertyDate(properties, "Data execução"),
    created_at: page.created_time || null,
    updated_at: page.last_edited_time || null,
  };
}

function parseLeisPrimeiroDay(page) {
  const properties = page.properties || {};
  if (propertyText(properties, "Trilha") !== "Leis Primeiro") return null;
  const dayId = normalizeLeisPrimeiroId(propertyText(properties, "Dia ID"));
  if (!dayId) return null;
  const pageCode = propertyText(properties, "Página Lxx") || pageCodeFromExecutionId(dayId);
  const planned = firstKnownNumber(properties, ["Meta auto", "Meta questões"]);
  const done = firstKnownNumber(properties, ["Feitas auto", "Questões feitas"]);
  const correct = firstKnownNumber(properties, ["Acertos auto", "Acertos"]);
  const errors = firstKnownNumber(properties, ["Erros auto", "Erros"]);
  const doubts = firstKnownNumber(properties, ["Dúvidas auto", "Acertos com dúvida"]);
  return {
    day_id: dayId,
    trail: "Leis Primeiro",
    title: propertyText(properties, "Dia") || dayId,
    page_code: pageCode,
    progress: propertyText(properties, "Progresso da sessão"),
    summary_number: propertyNumeric(properties, "Resumo nº"),
    reading_number: propertyNumeric(properties, "Leitura nº"),
    status: propertyText(properties, "Situação") || "Sem situação",
    phase: propertyText(properties, "Fase") || null,
    type: propertyText(properties, "Tipo") || "Temático",
    planned,
    done,
    correct,
    errors,
    doubts,
    minutes: firstNumberProperty(properties, ["Tempo (min)", "Minutos", "Tempo"]),
    precision: precision(correct, done),
    href: propertyUrl(properties, "Página do dia") || page.url || notionPageUrl(page.id),
    executed_at: propertyDate(properties, "Data execução"),
    created_at: page.created_time || null,
    updated_at: page.last_edited_time || null,
  };
}

function parseC01Error(page) {
  const properties = page.properties || {};
  const day = normalizeC01Day(
    propertyText(properties, "Origem / Dia ID") ||
    propertyText(properties, "Dia ID"),
  );
  if (!day) return null;
  const questionId = propertyText(properties, "Questão ID");
  return {
    id: page.id,
    url: page.url || notionPageUrl(page.id),
    day_id: "C01-" + day,
    question_id: questionId || page.id,
    title: propertyText(properties, "Erro / Questão") || questionId || "Erro registrado",
    subject: propertyText(properties, "Assunto") || null,
    discipline: propertyText(properties, "Matéria") || null,
    reason: propertyText(properties, "Motivo do erro") || null,
    pattern: propertyText(properties, "Padrão do erro") || null,
    severity: propertyText(properties, "Gravidade") || null,
    review: propertyText(properties, "Revisão") || null,
    status: propertyText(properties, "Status") || null,
    recurrence: propertyNumeric(properties, "Reincidência"),
    flashcard: propertyCheckbox(properties, "Flashcard?"),
    next_review: propertyDate(properties, "Próxima revisão"),
    date: propertyDate(properties, "Data"),
    rule: propertyText(properties, "Regra correta / conceito") || null,
    observations: propertyText(properties, "Observações") || null,
  };
}

function parseLeisPrimeiroError(page) {
  const properties = page.properties || {};
  const dayId = normalizeLeisPrimeiroId(propertyText(properties, "Origem / Dia ID"));
  if (!dayId) return null;
  const questionId = propertyText(properties, "Questão ID");
  return {
    id: page.id,
    url: page.url || notionPageUrl(page.id),
    day_id: dayId,
    page_code: pageCodeFromExecutionId(dayId) || questionId.match(/^(L\d{2})-/i)?.[1]?.toUpperCase() || null,
    question_id: questionId || page.id,
    title: propertyText(properties, "Erro / Questão") || questionId || "Erro registrado",
    subject: propertyText(properties, "Assunto") || null,
    discipline: propertyText(properties, "Matéria") || null,
    reason: propertyText(properties, "Motivo do erro") || null,
    pattern: propertyText(properties, "Padrão do erro") || null,
    severity: propertyText(properties, "Gravidade") || null,
    review: propertyText(properties, "Revisão") || null,
    status: propertyText(properties, "Status") || null,
    recurrence: propertyNumeric(properties, "Reincidência"),
    flashcard: propertyCheckbox(properties, "Flashcard?"),
    next_review: propertyDate(properties, "Próxima revisão"),
    date: propertyDate(properties, "Data"),
    rule: propertyText(properties, "Regra correta / conceito") || null,
    observations: propertyText(properties, "Observações") || null,
  };
}

function parseLegislationSession(page) {
  const properties = page.properties || {};
  const pageCode = propertyText(properties, "Página Lxx");
  const title = propertyText(properties, "Sessão");
  if (!title && !pageCode) return null;
  const questionsDone = propertyNumeric(properties, "Questões feitas");
  const correct = propertyNumeric(properties, "Acertos");
  return {
    id: page.id,
    title: title || page.id,
    url: page.url || notionPageUrl(page.id),
    date: propertyDate(properties, "Data"),
    page_code: pageCode || null,
    stage: propertyText(properties, "Etapa") || null,
    session_type: propertyText(properties, "Tipo de sessão") || null,
    modality: propertyText(properties, "Modalidade") || null,
    progress: propertyText(properties, "Progresso da sessão") || null,
    source: propertyText(properties, "Fonte") || null,
    summary_number: propertyNumeric(properties, "Resumo nº"),
    reading_number: propertyNumeric(properties, "Leitura nº"),
    summary_counter: propertyNumeric(properties, "Contador — resumo"),
    reading_counter: propertyNumeric(properties, "Contador — leitura"),
    session_counter: propertyNumeric(properties, "Contador — sessão"),
    completed: propertyCheckbox(properties, "Concluída"),
    questions_planned: propertyNumeric(properties, "Questões previstas"),
    questions_done: questionsDone,
    correct,
    errors: propertyNumeric(properties, "Erros"),
    doubts: propertyNumeric(properties, "Acertos com dúvida"),
    flashcards: propertyNumeric(properties, "Flashcards gerados"),
    minutes: firstKnownNumber(properties, ["Tempo (min)", "Minutos", "Tempo"]),
    precision: precision(correct, questionsDone),
    href: propertyUrl(properties, "Link da página") || null,
    created_at: page.created_time || null,
    updated_at: page.last_edited_time || null,
  };
}

function normalizeC01Day(value) {
  const match = String(value || "").match(/(?:^|\s)C01-D(0[1-9]|1[0-4])(?=$|[\s—–-])/i);
  return match ? `D${match[1]}` : null;
}

function normalizeLeisPrimeiroId(value) {
  const match = String(value || "").trim().match(/^LP-(\d{8})-(L\d{2})-R(\d+)$/i);
  return match ? `LP-${match[1]}-${match[2].toUpperCase()}-R${match[3]}` : null;
}

function pageCodeFromExecutionId(value) {
  return normalizeLeisPrimeiroId(value)?.match(/-(L\d{2})-/)?.[1] || "";
}

function leisPrimeiroSequence(value) {
  const match = normalizeLeisPrimeiroId(value)?.match(/-R(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function compareLeisPrimeiroDays(left, right) {
  const dateOrder = (right.executed_at || "").localeCompare(left.executed_at || "");
  if (dateOrder) return dateOrder;
  if (left.page_code === right.page_code) {
    const sequenceOrder = leisPrimeiroSequence(right.day_id) - leisPrimeiroSequence(left.day_id);
    if (sequenceOrder) return sequenceOrder;
  }
  const createdOrder = (right.created_at || "").localeCompare(left.created_at || "");
  if (createdOrder) return createdOrder;
  return right.day_id.localeCompare(left.day_id);
}

function propertyText(properties, name) {
  const property = properties?.[name];
  if (!property) return "";
  if (property.type === "title" || property.title) {
    return (property.title || []).map((item) => item.plain_text || item.text?.content || "").join("").trim();
  }
  if (property.type === "rich_text" || property.rich_text) {
    return (property.rich_text || []).map((item) => item.plain_text || item.text?.content || "").join("").trim();
  }
  if (property.type === "select" || property.select) return property.select?.name || "";
  if (property.type === "status" || property.status) return property.status?.name || "";
  if (property.type === "formula" && property.formula?.type === "string") return property.formula.string || "";
  return "";
}

function propertyNumeric(properties, name) {
  const property = properties?.[name];
  if (!property) return null;
  if (typeof property.number === "number" && Number.isFinite(property.number)) return property.number;
  if (property.formula?.type === "number" && typeof property.formula.number === "number" && Number.isFinite(property.formula.number)) return property.formula.number;
  const rollup = property.rollup;
  if (rollup?.type === "number" && typeof rollup.number === "number" && Number.isFinite(rollup.number)) return rollup.number;
  if (Array.isArray(rollup?.array)) {
    const values = rollup.array
      .map((item) => {
        if (item?.type === "number" && typeof item.number === "number" && Number.isFinite(item.number)) return item.number;
        if (item?.type === "formula" && typeof item.formula?.number === "number" && Number.isFinite(item.formula.number)) return item.formula.number;
        return null;
      })
      .filter((value) => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return null;
}

function firstKnownNumber(properties, names) {
  for (const name of names) {
    const value = propertyNumeric(properties, name);
    if (value !== null) return value;
  }
  return null;
}

function firstNumberProperty(properties, names) {
  return firstKnownNumber(properties, names);
}

function propertyCheckbox(properties, name) {
  const property = properties?.[name];
  if (!property || !Object.prototype.hasOwnProperty.call(property, "checkbox")) return null;
  return Boolean(property.checkbox);
}

function propertyUrl(properties, name) {
  return properties?.[name]?.url || "";
}

function propertyDate(properties, name) {
  return properties?.[name]?.date?.start || null;
}

function strictAdd(left, right) {
  if (left === null || right === null) return null;
  return left + right;
}

function precision(correct, done) {
  return correct !== null && done !== null && done > 0 ? correct / done : null;
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

function buildMaterialsSnapshot(page, materialsText, cycleBlocks, sequencePage, sequenceText) {
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
    sequence: extractSequentialMaterials(
      sequenceText,
      sequencePage.url || notionPageUrl(SEQUENTIAL_MATERIALS_PAGE_ID),
    ),
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

function extractSequentialMaterials(text, sourceUrl) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => {
      const normalized = line.replace(/^\*+/, "").replace(/\*+$/, "").trim();
      const match = normalized.match(/^(?:\d+\.\s*)?(MS\d{2})\s*[—–-]\s*(.+)$/i);
      if (!match) return null;
      const code = match[1].toUpperCase();
      const order = Number(code.slice(2));
      return {
        code,
        order,
        title: stripInlineMarkup(match[2]),
        group: sequenceGroup(order),
        detail: "Material sequencial atemporal do Notion.",
        href: sourceUrl,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order);
}

function sequenceGroup(order) {
  if (order <= 4) return "Base educacional";
  if (order <= 9) return "Gestão e Administração";
  if (order <= 14) return "Gestão, orçamento e transparência";
  if (order <= 17) return "Tecnologia e apoio";
  return "Educação, proteção e revisão";
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
