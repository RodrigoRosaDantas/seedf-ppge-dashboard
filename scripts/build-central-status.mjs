import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);

export function buildSeedfCentralStatus(snapshot, laws, { now = new Date() } = {}) {
  const lp = snapshot?.execution?.leis_primeiro || {};
  const days = Array.isArray(lp.days) ? lp.days : [];
  const sessions = Array.isArray(lp.sessions) ? lp.sessions : [];
  const completedDays = days
    .filter(x => x?.status === "Concluído" && x?.executed_at)
    .sort((a, b) => String(b.executed_at).localeCompare(String(a.executed_at)));
  const completedSessions = sessions
    .filter(x => x?.completed === true && x?.page_code && x?.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latestDay = completedDays[0] || null;
  const latestSession = completedSessions[0] || null;
  const nextLaw = (Array.isArray(laws?.laws) ? laws.laws : [])
    .filter(x => x?.study_phase === "Não iniciado")
    .sort((a, b) => (a.operational_order ?? 999) - (b.operational_order ?? 999))[0] || null;
  const errors = Array.isArray(lp.errors) ? lp.errors : [];
  const reviewDatesComplete = errors.length === 0
    ? lp.error_count === 0
    : errors.every(x => Boolean(x?.next_review));
  const reviewDates = errors.map(x => x?.next_review).filter(Boolean).map(x => String(x).slice(0, 10)).sort();
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const today = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
  const reviewsDue = reviewDatesComplete
    ? reviewDates.filter(date => date <= today).length
    : null;
  const sessionTotals = lp.session_totals || {};
  const syncedAt = snapshot?.source?.synced_at || laws?.source?.synced_at || null;
  const sourceStatus = snapshot?.source?.status || "partial";
  const notes = [];
  if (sourceStatus !== "synced") notes.push("Snapshot SEEDF não está marcado como integralmente sincronizado.");
  if (nextLaw) notes.push(`Próxima lei não iniciada no banco: ${nextLaw.code}.`);
  if (latestSession?.page_code && latestSession.page_code !== latestDay?.page_code) {
    notes.push(`A sessão mais recente de ${latestSession.page_code} está concluída; a unidade integral permanece pendente até o registro do dia.`);
  }
  if (!reviewDatesComplete) notes.push("Datas de revisão não estão disponíveis para todos os erros; revisões devidas permanecem desconhecidas.");
  if (!Number.isFinite(laws?.summary?.total_sessions)) {
    notes.push("A fonte não publica uma meta total de sessões; totalSessions permanece desconhecido.");
  }

  const contract = {
    schemaVersion: 1,
    projectId: "seedf",
    publishedAt: (syncedAt || new Date().toISOString()).slice(0, 10),
    source: {
      kind: "public-project-state",
      ref: "data/seedf-snapshot.json#execution.leis_primeiro",
      status: sourceStatus,
      updatedAt: syncedAt
    },
    state: {
      phase: snapshot?.dashboard?.phase || "Fase 1",
      cycle: "Leis Primeiro",
      currentUnit: latestSession?.page_code || null,
      nextAction: nextLaw ? `${nextLaw.code} — ${nextLaw.title}` : null,
      nextActionKind: nextLaw ? "planned" : "none",
      alerts: sourceStatus === "synced" ? [] : ["O snapshot público SEEDF está parcial; trate os sinais pedagógicos com cautela."]
    },
    study: {
      evidence: sourceStatus === "synced" ? "confirmed" : "partial",
      sourceRef: "data/seedf-snapshot.json#execution.leis_primeiro",
      updatedAt: syncedAt,
      trail: "Leis Primeiro",
      lastCompletedUnit: latestDay?.page_code || null,
      nextUnit: nextLaw?.code || null,
      lastStudiedAt: latestSession?.date || null,
      questionsDone: Number.isFinite(sessionTotals.questions) ? sessionTotals.questions : null,
      correct: Number.isFinite(sessionTotals.correct) ? sessionTotals.correct : null,
      errors: Number.isFinite(sessionTotals.errors) ? sessionTotals.errors : null,
      doubts: Number.isFinite(sessionTotals.doubts) ? sessionTotals.doubts : null,
      accuracy: Number.isFinite(sessionTotals.precision) ? sessionTotals.precision : null,
      reviewsDue,
      nextReviewAt: reviewDatesComplete ? reviewDates.find(date => date > today) || null : null,
      activeErrors: Number.isFinite(lp?.error_count) ? lp.error_count : null,
      completedSessions: Number.isFinite(sessionTotals.sessions)
        ? sessionTotals.sessions
        : (completedSessions.length || null),
      totalSessions: Number.isFinite(laws?.summary?.total_sessions) ? laws.summary.total_sessions : null,
      notes
    }
  };
  return contract;
}

async function main() {
  const snapshot = JSON.parse(await readFile(new URL("public/data/seedf-snapshot.json", ROOT), "utf8"));
  const laws = JSON.parse(await readFile(new URL("public/data/leis-primeiro.json", ROOT), "utf8"));
  const contract = buildSeedfCentralStatus(snapshot, laws);
  await writeFile(new URL("public/central-status.json", ROOT), `${JSON.stringify(contract, null, 2)}\\n`, "utf8");
  console.log(`SEEDF central-status: sessão ${contract.state.currentUnit || "sem unidade"} -> ${contract.study.lastCompletedUnit || "nenhuma unidade integral concluída"}; próxima ${contract.study.nextUnit || "não publicada"}.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
