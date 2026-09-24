export function studyDisplayStatus(law = {}) {
  const phase = String(law.study_phase || "").trim();
  const status = String(law.status || "").trim();
  if (phase === "Em estudo" && (!status || status === "Não iniciado")) return phase;
  return status || phase || String(law.action || "").trim();
}

export function openStudySessionsForLaw(sessions = [], lawCode) {
  const code = String(lawCode || "").toUpperCase();
  return sessions.filter((session) =>
    String(session?.page_code || "").toUpperCase() === code &&
    session?.completed === false
  );
}
