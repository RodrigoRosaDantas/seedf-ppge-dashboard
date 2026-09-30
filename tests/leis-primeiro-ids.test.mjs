import test from "node:test";
import assert from "node:assert/strict";
import {
  leisPrimeiroSequence,
  normalizeLeisPrimeiroId,
  pageCodeFromExecutionId
} from "../lib/leis-primeiro-ids.mjs";
import { buildSeedfCentralStatus } from "../scripts/build-central-status.mjs";

test("Leis Primeiro IDs accept reading, summary, and question suffixes", () => {
  assert.equal(normalizeLeisPrimeiroId(" lp-20260929-l05-q1 "), "LP-20260929-L05-Q1");
  assert.equal(pageCodeFromExecutionId("LP-20260929-L05-Q1"), "L05");
  assert.equal(leisPrimeiroSequence("LP-20260929-L05-Q26"), 26);
  assert.equal(normalizeLeisPrimeiroId("LP-20260929-L05-R2"), "LP-20260929-L05-R2");
  assert.equal(leisPrimeiroSequence("LP-20260929-L05-L10"), 10);
});

test("Leis Primeiro rejects malformed identifiers instead of guessing", () => {
  assert.equal(normalizeLeisPrimeiroId("LP-20260929-L05-X1"), null);
  assert.equal(pageCodeFromExecutionId("not-an-execution-id"), "");
  assert.equal(leisPrimeiroSequence("LP-20260929-L05-Qx"), 0);
});

test("SEEDF contract distinguishes a completed session from a completed unit", () => {
  const contract = buildSeedfCentralStatus({
    source: { status: "synced", synced_at: "2026-09-29T18:24:49.031Z" },
    dashboard: { phase: "Fase 1" },
    execution: { leis_primeiro: {
      days: [{ page_code: "L04", status: "Concluído", executed_at: "2026-09-28" }],
      sessions: [
        { page_code: "L05", date: "2026-09-29", completed: true, questions_done: 30 },
        { page_code: "L04", date: "2026-09-28", completed: true, questions_done: 20 }
      ],
      session_totals: { sessions: 5, questions: 145, correct: 123, errors: 22, doubts: 0, precision: 123 / 145 },
      errors: [{ next_review: null }],
      error_count: 22
    } }
  }, {
    laws: [{ code: "L05", title: "Norma L05", operational_order: 5, study_phase: "Não iniciado" }],
    summary: { pages: 34 }
  }, { now: new Date("2026-09-30T12:00:00.000Z") });

  assert.equal(contract.state.currentUnit, "L05");
  assert.equal(contract.study.nextUnit, "L05");
  assert.equal(contract.state.nextAction, "L05 — Norma L05");
  assert.equal(contract.state.nextActionKind, "planned");
  assert.equal(contract.study.lastCompletedUnit, "L04");
  assert.equal(contract.study.lastStudiedAt, "2026-09-29");
  assert.equal(contract.study.questionsDone, 145);
  assert.equal(contract.study.correct, 123);
  assert.equal(contract.study.errors, 22);
  assert.equal(contract.study.doubts, 0);
  assert.equal(contract.study.accuracy, 123 / 145);
  assert.equal(contract.study.activeErrors, 22);
  assert.equal(contract.study.completedSessions, 5);
  assert.equal(contract.study.totalSessions, null);
  assert.equal(contract.study.reviewsDue, null);
  assert.equal(contract.study.nextReviewAt, null);
  assert.ok(contract.study.notes.some(note => note.includes("sessão mais recente de L05")));
});
