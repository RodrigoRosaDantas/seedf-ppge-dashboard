import { readFile, writeFile } from "node:fs/promises";
import { deriveLeisPrimeiroNextLaw, deriveLeisPrimeiroProgress } from "../lib/leis-primeiro-contract.mjs";

const ROOT = new URL("../", import.meta.url);
const snapshot = JSON.parse(await readFile(new URL("public/data/seedf-snapshot.json", ROOT), "utf8"));
const laws = JSON.parse(await readFile(new URL("public/data/leis-primeiro.json", ROOT), "utf8"));
const lp = snapshot?.execution?.leis_primeiro || {};
const days = Array.isArray(lp.days) ? lp.days : [];
const progress = deriveLeisPrimeiroProgress(lp);
const nextLaw = deriveLeisPrimeiroNextLaw(laws?.laws);
const errors = Array.isArray(lp.errors) ? lp.errors : [];
const futureReviews = errors.map(x=>x?.next_review).filter(Boolean).sort();
const nowDate = new Date().toISOString().slice(0,10);
const reviewsDue = futureReviews.filter(x=>String(x).slice(0,10) <= nowDate).length;
const syncedAt = snapshot?.source?.synced_at || laws?.source?.synced_at || new Date().toISOString();
const sourceStatus = snapshot?.source?.status || "partial";
const notes = [];
if (sourceStatus !== "synced") notes.push("Snapshot SEEDF não está marcado como integralmente sincronizado.");
if (nextLaw) notes.push(`Próxima lei não iniciada no banco: ${nextLaw.code}.`);

if (progress.questionOnlyNote) notes.push(progress.questionOnlyNote);

function dateOnly(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

const timeCredits = [];
const creditIds = new Set();
function addTimeCredit({ kind, date, unit, trail, sourceRef }) {
  const normalizedDate = dateOnly(date);
  const normalizedUnit = String(unit || "").trim();
  if (!normalizedDate || !normalizedUnit || !["reading", "study"].includes(kind)) return;
  const id = `seedf:${kind}:${normalizedUnit}:${normalizedDate}`;
  if (creditIds.has(id)) return;
  creditIds.add(id);
  timeCredits.push({
    id,
    date: normalizedDate,
    kind,
    unit: normalizedUnit,
    trail,
    minutes: 60,
    sourceRef,
  });
}

for (const day of Array.isArray(snapshot?.execution?.c01?.days) ? snapshot.execution.c01.days : []) {
  if (day?.executed_at && /conclu|executad/i.test(String(day?.status || ""))) {
    addTimeCredit({
      kind: "study",
      date: day.executed_at,
      unit: day.day_id || day.day,
      trail: "Execução diária SEEDF",
      sourceRef: "data/seedf-snapshot.json#execution.c01.days",
    });
  }
}

for (const session of Array.isArray(lp?.sessions) ? lp.sessions : []) {
  if (session?.completed !== true || !session?.date || !session?.page_code) continue;
  addTimeCredit({
    kind: "study",
    date: session.date,
    unit: session.page_code,
    trail: "Leis Primeiro",
    sourceRef: "data/seedf-snapshot.json#execution.leis_primeiro.sessions",
  });
  const isReading =
    Number(session?.reading_counter) > 0 ||
    Number(session?.reading_number) > 0 ||
    /leitura/i.test(String(session?.progress || "")) ||
    /leitura/i.test(String(session?.session_type || ""));
  if (isReading) {
    addTimeCredit({
      kind: "reading",
      date: session.date,
      unit: session.page_code,
      trail: "Leis Primeiro",
      sourceRef: "data/seedf-snapshot.json#execution.leis_primeiro.sessions",
    });
  }
}
timeCredits.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.unit.localeCompare(b.unit));

const contract = {
  schemaVersion: 1,
  projectId: "seedf",
  publishedAt: syncedAt.slice(0,10),
  source: { kind: "public-project-state", ref: "data/seedf-snapshot.json#execution.leis_primeiro", status: sourceStatus, updatedAt: syncedAt },
  state: {
    phase: snapshot?.dashboard?.phase || "Fase 1",
    cycle: "Leis Primeiro",
    currentUnit: progress.currentUnit,
    nextAction: nextLaw ? `${nextLaw.code} — ${nextLaw.title}` : null,
    nextActionKind: nextLaw ? "planned" : "none",
    alerts: [...(sourceStatus === "synced" ? [] : ["O snapshot público SEEDF está parcial; trate os sinais pedagógicos com cautela."]), ...(progress.questionOnlyNote ? [progress.questionOnlyNote] : [])]
  },
  study: {
    evidence: sourceStatus === "synced" ? "confirmed" : "partial",
    sourceRef: "data/seedf-snapshot.json#execution.leis_primeiro",
    updatedAt: syncedAt,
    trail: "Leis Primeiro",
    lastCompletedUnit: progress.lastCompletedUnit,
    nextUnit: nextLaw?.code || null,
    lastStudiedAt: progress.lastStudiedAt,
    questionsDone: Number.isFinite(lp?.totals?.done) ? lp.totals.done : null,
    correct: Number.isFinite(lp?.totals?.correct) ? lp.totals.correct : null,
    errors: Number.isFinite(lp?.totals?.errors) ? lp.totals.errors : null,
    doubts: Number.isFinite(lp?.totals?.doubts) ? lp.totals.doubts : null,
    accuracy: Number.isFinite(lp?.totals?.precision) ? lp.totals.precision : null,
    reviewsDue,
    nextReviewAt: futureReviews[0] || null,
    activeErrors: Number.isFinite(lp?.error_count) ? lp.error_count : null,
    completedSessions: progress.completedSessions,
    totalSessions: Number.isFinite(laws?.summary?.pages) ? laws.summary.pages : null,
    timeCredits,
    notes
  }
};

await writeFile(new URL("public/central-status.json", ROOT), `${JSON.stringify(contract,null,2)}\n`, "utf8");
console.log("SEEDF central-status: atividade " + (progress.currentUnit || "não publicada") + " · concluída " + (progress.lastCompletedUnit || "não publicada") + " -> " + (nextLaw?.code || "sem próxima lei") + ".");
