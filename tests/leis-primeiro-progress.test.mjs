import assert from "node:assert/strict";
import test from "node:test";
import { deriveLeisPrimeiroProgress } from "../lib/leis-primeiro-contract.mjs";
import { leisPrimeiroSequence, normalizeLeisPrimeiroId, pageCodeFromExecutionId } from "../lib/leis-primeiro-ids.mjs";

test("accepts question activity IDs without treating them as reading sequence numbers", () => {
  const id = "LP-20260929-L05-Q1";
  assert.equal(normalizeLeisPrimeiroId(id), id);
  assert.equal(pageCodeFromExecutionId(id), "L05");
  assert.equal(leisPrimeiroSequence(id), 0);
  assert.equal(normalizeLeisPrimeiroId("LP-20260929-L05-X1"), null);
});

test("surfaces a completed question session while keeping the law unit incomplete", () => {
  const progress = deriveLeisPrimeiroProgress({
    days: [
      { page_code: "L05", status: "Concluído", executed_at: "2026-09-29", progress: "Questões" },
      { page_code: "L04", status: "Concluído", executed_at: "2026-09-28", progress: "Questões" },
    ],
    sessions: [
      { page_code: "L05", completed: true, date: "2026-09-29", stage: "D0", source: "Questões", reading_counter: 0, questions_done: 30, correct: 26 },
      { page_code: "L04", completed: true, date: "2026-09-28", stage: "D0", source: "Questões", reading_counter: 0, questions_done: 20, correct: 15 },
      { page_code: "L03", completed: true, date: "2026-09-23", source: "Lei seca oficial", reading_counter: 1, questions_done: 25, correct: 21 },
    ],
  });
  assert.equal(progress.currentUnit, "L05");
  assert.equal(progress.lastCompletedUnit, "L03");
  assert.equal(progress.lastStudiedAt, "2026-09-29");
  assert.equal(progress.completedSessions, 3);
  assert.equal(progress.questionsOnly, true);
  assert.equal(progress.questionOnlyNote, "L05: 30 questões e 26 acertos registrados; leitura/material e D0 continuam pendentes.");
});
