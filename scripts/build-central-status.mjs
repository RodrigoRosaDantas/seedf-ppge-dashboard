import { readFile, writeFile } from "node:fs/promises";
import { deriveLeisPrimeiroProgress } from "../lib/leis-primeiro-contract.mjs";

const ROOT = new URL("../", import.meta.url);
const snapshot = JSON.parse(await readFile(new URL("public/data/seedf-snapshot.json", ROOT), "utf8"));
const laws = JSON.parse(await readFile(new URL("public/data/leis-primeiro.json", ROOT), "utf8"));
const lp = snapshot?.execution?.leis_primeiro || {};
const days = Array.isArray(lp.days) ? lp.days : [];
const progress = deriveLeisPrimeiroProgress(lp);
const nextLaw = (Array.isArray(laws?.laws) ? laws.laws : []).filter(x => x?.study_phase === "Não iniciado").sort((a,b)=>(a.operational_order ?? 999)-(b.operational_order ?? 999))[0] || null;
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
    notes
  }
};

await writeFile(new URL("public/central-status.json", ROOT), `${JSON.stringify(contract,null,2)}\n`, "utf8");
console.log("SEEDF central-status: atividade " + (progress.currentUnit || "não publicada") + " · concluída " + (progress.lastCompletedUnit || "não publicada") + " -> " + (nextLaw?.code || "sem próxima lei") + ".");
