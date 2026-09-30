export function deriveLeisPrimeiroProgress(execution = {}) {
  const sessions = Array.isArray(execution.sessions) ? execution.sessions : [];
  const days = Array.isArray(execution.days) ? execution.days : [];
  const byDate = (a, b) => String(b?.date || b?.executed_at || b?.updated_at || b?.created_at || "")
    .localeCompare(String(a?.date || a?.executed_at || a?.updated_at || a?.created_at || ""));
  const latestActivity = [...sessions].sort(byDate)[0] || null;
  const latestReading = [...sessions]
    .filter(session => session?.completed === true && Number(session.reading_counter) > 0 && typeof session.page_code === "string")
    .sort(byDate)[0] || null;
  const legacyCompleted = [...days]
    .filter(day => day?.status === "Concluído" && day?.executed_at && !/questões/i.test(String(day.progress || "")))
    .sort(byDate)[0] || null;
  const hasSessionHistory = sessions.length > 0;
  const lastCompletedUnit = latestReading?.page_code || (!hasSessionHistory ? legacyCompleted?.page_code || null : null);
  const currentUnit = latestActivity?.page_code || legacyCompleted?.page_code || null;
  const activityDate = latestActivity?.date || latestActivity?.updated_at || latestActivity?.created_at || null;
  const lastStudiedAt = activityDate || legacyCompleted?.executed_at || null;
  const completedSessions = sessions.length
    ? sessions.filter(session => session?.completed === true).length
    : days.filter(day => day?.status === "Concluído" && day?.executed_at).length;
  const questionsOnly = Boolean(
    latestActivity &&
    Number(latestActivity.questions_done) > 0 &&
    Number(latestActivity.reading_counter) === 0 &&
    /questões/i.test(String(latestActivity.source || latestActivity.progress || "")),
  );
  let questionOnlyNote = null;
  if (questionsOnly) {
    const count = Number(latestActivity.questions_done);
    const correct = Number(latestActivity.correct);
    questionOnlyNote = latestActivity.page_code + ": " + count + " questões e " + correct + " acertos registrados; leitura/material e D0 continuam pendentes.";
  }
  return { currentUnit, lastCompletedUnit, lastStudiedAt, completedSessions, latestActivity, questionsOnly, questionOnlyNote };
}
