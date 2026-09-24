const DAY_MS = 86_400_000;

const CLOSED_ERROR_STATUSES = new Set([
  "validado", "encerrado", "resolvido", "fechado", "concluido", "corrigido", "recuperado",
]);

const SUBJECT_ALIASES = new Map([
  ["lc 840", "lc 840 2011"],
  ["lei complementar 840", "lc 840 2011"],
  ["materiais patrimonio", "materiais e patrimonio"],
  ["gestao patrimonial", "materiais e patrimonio"],
  ["eca", "eca e direitos"],
  ["educacao especial", "inclusao e educacao especial"],
]);

export function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function knownNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function knownSum(values, options = {}) {
  const numbers = values.map(knownNumber);
  const known = numbers.filter((value) => value !== null);
  if (!known.length) return null;
  if (options.requireComplete && known.length !== numbers.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

export function accuracy(correct, errors) {
  const c = knownNumber(correct);
  const e = knownNumber(errors);
  if (c === null || e === null) return null;
  const total = c + e;
  return total > 0 ? (c / total) * 100 : null;
}

export function sampleConfidence(totalQuestions, sessions, completeness = 1) {
  const q = knownNumber(totalQuestions);
  const s = knownNumber(sessions);
  if (q === null || s === null || q <= 0 || s <= 0) {
    return { key: "none", label: "sem dados suficientes", rank: 0, completeness };
  }
  let result;
  if (q < 10) result = { key: "tiny", label: "amostra muito pequena", rank: 1 };
  else if (q < 25 || s < 2) result = { key: "small", label: "amostra pequena", rank: 2 };
  else if (q < 60 || s < 3) result = { key: "moderate", label: "evidência moderada", rank: 3 };
  else result = { key: "strong", label: "evidência forte", rank: 4 };
  if (completeness < 1) {
    result = {
      ...result,
      label: result.rank ? result.label + " · dados parciais" : "dados parciais sem amostra suficiente",
      partial: true,
    };
  }
  return { ...result, completeness };
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function utcDay(value) {
  const match = dateOnly(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysBetween(from, to) {
  const a = utcDay(from);
  const b = utcDay(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / DAY_MS) : null;
}

export function trendFromEvents(events = []) {
  const usable = events
    .map((event) => ({ date: dateOnly(event.date), accuracy: knownNumber(event.accuracy) }))
    .filter((event) => event.date && event.accuracy !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (usable.length < 4) {
    return { key: "insufficient", label: "amostra temporal insuficiente", delta: null, events: usable.length };
  }
  const previous = usable.slice(-4, -2).reduce((sum, item) => sum + item.accuracy, 0) / 2;
  const current = usable.slice(-2).reduce((sum, item) => sum + item.accuracy, 0) / 2;
  const delta = current - previous;
  if (delta >= 5) return { key: "improving", label: "melhorando", delta, events: usable.length };
  if (delta <= -5) return { key: "worsening", label: "piorando", delta, events: usable.length };
  return { key: "stable", label: "estável", delta, events: usable.length };
}

export function safeEditalMatch(subject, axes = []) {
  const n = norm(subject);
  if (!n) return null;
  const target = SUBJECT_ALIASES.get(n) || n;
  const exact = axes.filter((axis) => norm(axis.subject) === target);
  if (exact.length) return { subject: exact[0].subject, match: target === n ? "exact" : "alias", axes: exact };
  const possibleSubjects = [...new Set(axes.map((axis) => axis.subject).filter(Boolean))];
  const partial = possibleSubjects.filter((label) => {
    const candidate = norm(label);
    return candidate.length >= 6 && target.length >= 6 && (candidate.includes(target) || target.includes(candidate));
  });
  if (partial.length !== 1) return null;
  const label = partial[0];
  return { subject: label, match: "unique-partial", axes: axes.filter((axis) => axis.subject === label) };
}

function isClosedError(status) {
  return CLOSED_ERROR_STATUSES.has(norm(status));
}

function lawByCode(laws, code) {
  return (laws || []).find((law) => String(law.code || "").toUpperCase() === String(code || "").toUpperCase()) || null;
}

function lawHref(code) {
  return code ? "leis/" + String(code).toLowerCase() + "/" : "leis/";
}

function getLawDiscipline(law) {
  if (!law) return "Legislação";
  if (law.code === "L01") return "Direito Constitucional";
  const title = norm(law.title);
  if (title.includes("lc 840")) return "LC 840/2011";
  if (title.includes("eca")) return "ECA e Direitos";
  if (title.includes("educacao especial") || title.includes("inclus")) return "Inclusão e Educação Especial";
  return "Legislação Educacional";
}

function explicitLawProgress(law) {
  const started = Boolean(
    law &&
    (
      knownNumber(law.sessions_done) > 0 ||
      knownNumber(law.questions_done) > 0 ||
      knownNumber(law.summaries_done) > 0 ||
      knownNumber(law.readings_done) > 0 ||
      law.orientation_read ||
      law.d0 ||
      law.study_phase === "Em estudo" ||
      law.study_phase === "Resumo estudado"
    )
  );
  const practiced = knownNumber(law?.questions_done) !== null && knownNumber(law?.questions_done) > 0;
  const evidenced = practiced && accuracy(law?.hits, law?.errors) !== null;
  const consolidated = Boolean(law?.study_phase === "Consolidado" && law?.d0 && law?.d7 && law?.d20);
  return { available: Boolean(law), started, practiced, evidenced, consolidated };
}

function sessionHasExecution(session) {
  return Boolean(
    session &&
    (
      session.date ||
      session.progress ||
      session.completed === true ||
      knownNumber(session.questions_done) > 0 ||
      knownNumber(session.minutes) > 0 ||
      knownNumber(session.summary_counter) > 0 ||
      knownNumber(session.reading_counter) > 0
    )
  );
}

function buildInterruptedSessions(snapshot, laws) {
  const sessions = snapshot?.execution?.leis_primeiro?.sessions || [];
  return sessions
    .filter((session) => {
      if (session.completed !== false || !sessionHasExecution(session)) return false;
      const law = lawByCode(laws, session.page_code);
      return !law || activeLaw(law);
    })
    .map((session) => {
      const law = lawByCode(laws, session.page_code);
      return {
        id: session.id,
        code: session.page_code || null,
        date: session.date || null,
        title: session.title || "Sessão iniciada",
        detail: [session.session_type, session.progress].filter(Boolean).join(" · ") || "execução iniciada e não concluída",
        href: lawHref(session.page_code),
        notionHref: session.url || law?.notion_url || null,
      };
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function isStrategicallyInactive(value) {
  const key = norm(value);
  return /radar|suspenso|historico|fora do escopo/.test(key);
}

function activeLaw(law) {
  return !isStrategicallyInactive(law?.strategic_status || law?.action || law?.priority);
}

function activeAxis(axis) {
  const explicit = norm(axis?.documentaryStrength || axis?.documentary_strength);
  if (explicit) return !/radar|suspenso|fora do escopo/.test(explicit);
  const fallback = norm(`${axis?.layer || ""} ${axis?.priority || ""}`);
  if (/radar|suspenso|fora do escopo/.test(fallback)) return false;
  if (/monitorar/i.test(String(axis?.action || "")) && /monitor/i.test(String(axis?.cargos || ""))) return false;
  return true;
}

function aggregateLawPerformance(snapshot, laws) {
  const questionRows = (snapshot?.execution?.leis_primeiro?.question_records || [])
    .filter((row) => row.page_code && !isStrategicallyInactive(row.strategic_use));
  const sessions = snapshot?.execution?.leis_primeiro?.sessions || [];
  const groups = new Map();

  for (const row of questionRows) {
    const done = knownNumber(row.done);
    const correct = knownNumber(row.correct);
    const errors = knownNumber(row.errors);
    if (done === null || done <= 0) continue;
    const key = String(row.page_code).toUpperCase();
    const current = groups.get(key) || {
      code: key,
      sessions: 0,
      questions: 0,
      correct: 0,
      errors: 0,
      completeRows: 0,
      events: [],
      source: "questões ativas",
      _days: new Set(),
    };
    current.questions += done;
    if (correct !== null) current.correct += correct;
    if (errors !== null) current.errors += errors;
    if (correct !== null && errors !== null) current.completeRows += 1;
    if (row.day_id) current._days.add(row.day_id);
    groups.set(key, current);
  }

  for (const group of groups.values()) {
    group.sessions = Math.max(1, group._days.size);
    delete group._days;
  }
  const activeQuestionCodes = new Set(groups.keys());

  for (const session of sessions) {
    if (!session.page_code || session.completed !== true) continue;
    const key = String(session.page_code).toUpperCase();
    if (activeQuestionCodes.has(key)) continue;
    const law = lawByCode(laws, key);
    if (law && !activeLaw(law)) continue;
    const done = knownNumber(session.questions_done);
    const correct = knownNumber(session.correct);
    const errors = knownNumber(session.errors);
    if (done === null || done <= 0) continue;
    const current = groups.get(key) || {
      code: key,
      sessions: 0,
      questions: 0,
      correct: 0,
      errors: 0,
      completeRows: 0,
      events: [],
      source: "sessões",
    };
    current.sessions += 1;
    current.questions += done;
    if (correct !== null) current.correct += correct;
    if (errors !== null) current.errors += errors;
    if (correct !== null && errors !== null) {
      current.completeRows += 1;
      const a = accuracy(correct, errors);
      if (a !== null && session.date) current.events.push({ date: session.date, accuracy: a });
    }
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => {
    const law = lawByCode(laws, group.code);
    const completeness = group.sessions ? Math.min(1, group.completeRows / group.sessions) : 0;
    const a = completeness === 1 ? accuracy(group.correct, group.errors) : null;
    const confidence = sampleConfidence(group.questions, group.sessions, completeness);
    const trend = trendFromEvents(group.events);
    return {
      ...group,
      title: law?.title || group.code,
      discipline: getLawDiscipline(law),
      accuracy: a,
      confidence,
      trend,
      strength:
        a !== null &&
        a >= 85 &&
        confidence.rank >= 3 &&
        trend.key !== "worsening"
          ? confidence.key === "strong" && a >= 90
            ? "forte com boa amostra"
            : "forte"
          : null,
    };
  }).sort((a, b) => b.questions - a.questions);
}

function buildActiveErrors(snapshot, referenceDate) {
  const raw = [
    ...(snapshot?.execution?.c01?.errors || []),
    ...(snapshot?.execution?.leis_primeiro?.errors || []),
  ];
  return raw
    .filter((error) => !isClosedError(error.status) && !isStrategicallyInactive(error.strategic_use))
    .map((error) => {
      const recurrence = knownNumber(error.recurrence);
      const days = error.date ? daysBetween(error.date, referenceDate) : null;
      let score = 18;
      if (norm(error.severity) === "critica" || norm(error.severity) === "p1") score += 22;
      else if (norm(error.severity) === "alta" || norm(error.severity) === "p2") score += 14;
      else if (error.severity) score += 7;
      if (recurrence !== null && recurrence >= 3) score += 18;
      else if (recurrence !== null && recurrence >= 2) score += 12;
      else if (recurrence === 1) score += 6;
      if (days !== null && days >= 0 && days <= 7) score += 8;
      else if (days !== null && days <= 30) score += 4;
      if (error.next_review && dateOnly(error.next_review) < referenceDate) score += 10;
      return {
        ...error,
        recurrence,
        daysSince: days,
        score: Math.min(95, score),
        confidence: recurrence !== null && recurrence >= 2 ? "evidência moderada" : "evidência limitada",
      };
    })
    .sort((a, b) => b.score - a.score || String(b.date || "").localeCompare(String(a.date || "")));
}

function buildReviews(bankRows, referenceDate) {
  const reviews = [];
  for (const row of bankRows || []) {
    if (row.record_kind && row.record_kind !== "trilha") continue;
    if (isStrategicallyInactive(row.strategic_status || row.action || row.priority)) continue;
    const code = row.codes?.[0] || null;
    const started = explicitLawProgress({
      ...row,
      sessions_done: row.sessions_done,
      questions_done: row.questions_done,
      summaries_done: row.summaries_done,
      readings_done: row.readings_done,
      orientation_read: row.orientation_read,
      study_phase: row.study_phase,
      d0: row.d0,
      d7: row.d7,
      d20: row.d20,
    }).started;
    if (!started) continue;
    if (!row.d0) {
      reviews.push({
        kind: "D0",
        code,
        title: code + " · fechamento D0",
        state: "pendente-sem-data",
        due: null,
        href: lawHref(code),
        reason: "execução iniciada, mas D0 ainda não foi fechado",
      });
    }
    const due = dateOnly(row.next_review);
    if (due) {
      const kind = row.d7 ? (row.d20 ? "manutenção" : "D20") : "D7";
      const state = due < referenceDate ? "atrasado" : due === referenceDate ? "hoje" : "próximo";
      reviews.push({
        kind,
        code,
        title: code + " · " + kind,
        state,
        due,
        href: lawHref(code),
        reason: "próxima revisão registrada no Notion",
      });
    }
  }
  const order = { atrasado: 0, hoje: 1, "pendente-sem-data": 2, próximo: 3 };
  return reviews.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || String(a.due || "").localeCompare(String(b.due || "")));
}

function buildCoverage(laws, bankRows, editalAxes) {
  const activeLaws = (laws || []).filter(activeLaw);
  const lawRows = (bankRows || []).filter((row) =>
    row.record_kind !== "radar" &&
    !isStrategicallyInactive(row.strategic_status || row.action || row.priority)
  );
  const lawCoverage = {
    total: lawRows.length || activeLaws.length,
    allTotal: (bankRows || []).filter((row) => row.record_kind !== "radar").length || (laws || []).length,
    available: activeLaws.length,
    studied: 0,
    practiced: 0,
    evidenced: 0,
    consolidated: 0,
  };
  for (const law of activeLaws) {
    const state = explicitLawProgress(law);
    if (state.started) lawCoverage.studied += 1;
    if (state.practiced) lawCoverage.practiced += 1;
    if (state.evidenced) lawCoverage.evidenced += 1;
    if (state.consolidated) lawCoverage.consolidated += 1;
  }

  const activeAxes = (editalAxes || []).filter(activeAxis);
  const edital = {
    total: editalAxes.length,
    activeTotal: activeAxes.length,
    radar: editalAxes.filter((axis) => /radar/.test(norm(axis.documentaryStrength || axis.layer))).length,
    suspended: editalAxes.filter((axis) => /suspenso/.test(norm(axis.documentaryStrength || axis.layer))).length,
    outside: editalAxes.filter((axis) => /fora do escopo/.test(norm(axis.documentaryStrength || axis.layer))).length,
    confirmed: editalAxes.filter((axis) => /confirmado pelo tr/.test(norm(axis.documentaryStrength))).length,
    historical: editalAxes.filter((axis) => /base historica forte/.test(norm(axis.documentaryStrength))).length,
    covered: null,
    domain: null,
    withEvidence: 0,
  };
  const coveredValues = activeAxes.map((axis) => axis.covered).filter((value) => typeof value === "boolean");
  if (coveredValues.length === activeAxes.length && activeAxes.length) edital.covered = coveredValues.filter(Boolean).length;
  const domainValues = activeAxes.map((axis) => axis.domainState).filter(Boolean);
  if (domainValues.length === activeAxes.length && activeAxes.length) {
    edital.domain = domainValues.reduce((map, value) => {
      map[value] = (map[value] || 0) + 1;
      return map;
    }, {});
  }
  const practicedSubjects = new Set(
    activeLaws.filter((law) => explicitLawProgress(law).evidenced).map((law) => norm(getLawDiscipline(law))),
  );
  edital.withEvidence = activeAxes.filter((axis) => practicedSubjects.has(norm(axis.subject))).length;
  return {
    law: lawCoverage,
    edital,
    note: "Cobertura ativa exclui Radar, conteúdo suspenso e fora do escopo; o total histórico continua preservado.",
  };
}

function buildQuality(snapshot, laws, bankRows, editalAxes) {
  const issues = [];
  const push = (severity, code, title, detail) => issues.push({ severity, code, title, detail });

  for (const day of snapshot?.execution?.c01?.days || []) {
    const done = knownNumber(day.done);
    const correct = knownNumber(day.correct);
    const errors = knownNumber(day.errors);
    const minutes = knownNumber(day.minutes);
    if (done !== null && done > 0 && correct !== null && errors !== null && correct + errors !== done) {
      push("erro", "QUESTIONS_SUM", day.day + " · soma inconsistente", "acertos + erros difere de questões feitas");
    }
    if (done !== null && done > 0 && !day.executed_at) {
      push("alerta", "MISSING_EXEC_DATE", day.day + " · execução sem data real", "tendência temporal fica indisponível");
    }
    if (done !== null && done > 0 && minutes === null) {
      push("alerta", "MISSING_TIME", day.day + " · execução sem tempo", "tempo permanece não calculável");
    }
  }

  for (const session of snapshot?.execution?.leis_primeiro?.sessions || []) {
    if (session.completed === true && !session.date) {
      push("erro", "SESSION_NO_DATE", session.title || "Sessão", "sessão concluída sem data real");
    }
    const done = knownNumber(session.questions_done);
    const correct = knownNumber(session.correct);
    const errors = knownNumber(session.errors);
    if (done !== null && done > 0 && (correct === null || errors === null)) {
      push("alerta", "PARTIAL_RESULT", session.title || "Sessão", "questões realizadas sem acertos/erros completos");
    }
  }

  for (const row of bankRows || []) {
    const done = knownNumber(row.questions_done);
    const a = knownNumber(row.accuracy);
    if (done === 0 && a === 0) {
      push("info", "ZERO_ACCURACY_WITH_ZERO_Q", (row.codes?.[0] || row.title || "Norma") + " · precisão sem amostra", "0 questões não deve ser apresentado como 0% de domínio");
    }
  }

  const unsafeAliases = [...new Set(editalAxes.map((axis) => axis.subject).filter(Boolean))]
    .filter((subject) => safeEditalMatch(subject, editalAxes) === null);
  if (unsafeAliases.length) {
    push("info", "UNMATCHED_SUBJECT", "Disciplinas sem vínculo seguro", unsafeAliases.slice(0, 4).join(", "));
  }

  return {
    issues,
    errorCount: issues.filter((item) => item.severity === "erro").length,
    alertCount: issues.filter((item) => item.severity === "alerta").length,
    infoCount: issues.filter((item) => item.severity === "info").length,
  };
}

function buildRisks(activeErrors, reviews, lawPerformance, coverage, interrupted) {
  const risks = [];
  for (const error of activeErrors.filter((item) => item.score >= 55)) {
    risks.push({
      id: "error-" + (error.id || error.question_id || error.score),
      kind: "erro",
      title: error.title || error.subject || "Erro recorrente",
      evidence: [
        error.recurrence === null ? "reincidência não informada" : "reincidência: " + error.recurrence,
        error.date ? "registro: " + dateOnly(error.date) : "data não informada",
      ],
      impact: "pode contaminar novas questões do mesmo tópico",
      confidence: error.confidence,
      action: "tratar no caderno de erros",
      href: "erros/",
      score: error.score,
    });
  }
  for (const review of reviews.filter((item) => item.state === "atrasado")) {
    risks.push({
      id: "review-" + review.code + "-" + review.kind,
      kind: "revisão",
      title: review.title + " vencida",
      evidence: ["data prevista " + review.due],
      impact: "retenção programada não executada",
      confidence: "evidência direta",
      action: "executar revisão",
      href: review.href,
      score: 68,
    });
  }
  for (const row of lawPerformance.filter((item) => item.accuracy !== null && item.accuracy < 70 && item.confidence.rank >= 2)) {
    risks.push({
      id: "performance-" + row.code,
      kind: "desempenho",
      title: row.code + " · desempenho baixo",
      evidence: [row.accuracy.toFixed(1) + "%", row.confidence.label],
      impact: "fragilidade com prática registrada",
      confidence: row.confidence.label,
      action: "revisão dirigida + questões",
      href: lawHref(row.code),
      score: 62,
    });
  }
  if (coverage.edital.total && coverage.edital.covered !== null && coverage.edital.covered / coverage.edital.total < 0.5) {
    risks.push({
      id: "coverage-edital",
      kind: "cobertura",
      title: "Cobertura do edital ainda baixa",
      evidence: [coverage.edital.covered + "/" + coverage.edital.total + " itens marcados como cobertos"],
      impact: "lacuna de cobertura",
      confidence: "evidência direta do edital verticalizado",
      action: "consultar edital",
      href: "edital/",
      score: 58,
    });
  }
  if (interrupted.length) {
    risks.push({
      id: "interrupted-" + interrupted[0].id,
      kind: "continuidade",
      title: "Sessão interrompida",
      evidence: [interrupted[0].title, interrupted[0].date || "data não informada"],
      impact: "quebra de continuidade operacional",
      confidence: "evidência direta",
      action: "retomar sessão",
      href: interrupted[0].href,
      score: 72,
    });
  }
  return risks.sort((a, b) => b.score - a.score);
}

function nextCanonicalLaw(snapshot, laws) {
  const executable = (laws || []).filter(activeLaw);
  if (!executable.length) return null;

  const sessions = [...(snapshot?.execution?.leis_primeiro?.sessions || [])]
    .filter((session) => session.page_code && sessionHasExecution(session))
    .sort((left, right) =>
      String(right.date || right.created_at || "").localeCompare(String(left.date || left.created_at || ""))
    );
  const latest = sessions[0] || null;
  if (latest) {
    const index = executable.findIndex((law) => String(law.code).toUpperCase() === String(latest.page_code).toUpperCase());
    if (index >= 0) {
      if (latest.completed !== true) return executable[index];
      return executable[index + 1] || null;
    }
  }

  let furthestStarted = -1;
  executable.forEach((law, index) => {
    if (explicitLawProgress(law).started) furthestStarted = index;
  });
  if (furthestStarted >= 0) return executable[furthestStarted];
  return executable[0];
}

function buildNextAction(snapshot, laws, reviews, activeErrors, interrupted) {
  if (interrupted.length) {
    const item = interrupted[0];
    return {
      kind: "resume",
      score: 100,
      eyebrow: "RETOMAR SESSÃO",
      title: item.code ? item.code + " · continuar execução iniciada" : item.title,
      reason: "Existe uma sessão iniciada e ainda não concluída. A continuidade real prevalece sobre abrir uma unidade nova.",
      href: item.href,
      confidence: "evidência direta",
      evidence: [item.title, item.date || "data não informada"],
    };
  }

  const overdue = reviews.find((review) => review.state === "atrasado");
  if (overdue) {
    return {
      kind: "review",
      score: 90,
      eyebrow: "REVISÃO VENCIDA",
      title: overdue.title,
      reason: overdue.reason,
      href: overdue.href,
      confidence: "evidência direta",
      evidence: ["data prevista " + overdue.due],
    };
  }

  const critical = activeErrors.find((error) => error.score >= 70);
  if (critical) {
    return {
      kind: "error",
      score: 84,
      eyebrow: "FRAGILIDADE ATIVA",
      title: critical.title || critical.subject || "Erro prioritário",
      reason: "Erro aberto com evidência suficiente para intervenção curta antes da continuidade.",
      href: "erros/",
      confidence: critical.confidence,
      evidence: [critical.date || "data não informada", "prioridade " + critical.score + "/100"],
    };
  }

  const law = nextCanonicalLaw(snapshot, laws);
  if (law) {
    return {
      kind: "law",
      score: 70,
      eyebrow: "CONTINUIDADE CANÔNICA",
      title: law.code + " · " + (law.next_step || "continuar trilha"),
      reason: "Mantém a ordem pedagógica do Leis Primeiro; o Mentor não reordena a trilha sem evidência.",
      href: lawHref(law.code),
      confidence: "evidência operacional",
      evidence: [law.study_phase || law.status || "estado não informado"],
    };
  }

  const activeDay = snapshot?.execution?.c01?.days?.find((day) => day.day === snapshot?.execution?.c01?.active_day);
  if (activeDay) {
    return {
      kind: "day",
      score: 60,
      eyebrow: "PRÓXIMA SESSÃO",
      title: activeDay.title || activeDay.day,
      reason: "Próxima sessão canônica registrada no Notion.",
      href: activeDay.href || null,
      confidence: "evidência operacional",
      evidence: [activeDay.status || "status não informado"],
    };
  }
  return {
    kind: "unknown",
    score: 0,
    eyebrow: "SEM DECISÃO AUTOMÁTICA",
    title: "Sem dados suficientes para recomendar a próxima ação",
    reason: "O sistema preservou a ausência como desconhecida em vez de inventar um zero ou uma prioridade.",
    href: null,
    confidence: "sem dados suficientes",
    evidence: [],
  };
}

function buildAgenda(snapshot, laws, reviews, interrupted) {
  const items = [];
  for (const session of interrupted) {
    items.push({ state: "hoje", kind: "retomada", title: "Retomar " + (session.code || "sessão"), detail: session.title, href: session.href });
  }
  for (const review of reviews) {
    items.push({ state: review.state, kind: "revisão", title: review.title, detail: review.reason, href: review.href, due: review.due });
  }
  const currentLaw = nextCanonicalLaw(snapshot, laws);
  if (currentLaw) {
    items.push({ state: "próximo", kind: "legislação", title: currentLaw.code + " · " + currentLaw.title, detail: currentLaw.next_step || "continuidade", href: lawHref(currentLaw.code) });
  }
  const activeDay = snapshot?.execution?.c01?.days?.find((day) => day.day === snapshot?.execution?.c01?.active_day);
  if (activeDay) {
    items.push({ state: "próximo", kind: "sessão", title: activeDay.title || activeDay.day, detail: activeDay.status || "próxima sessão", href: activeDay.href || null });
  }
  const order = { atrasado: 0, hoje: 1, "pendente-sem-data": 2, próximo: 3 };
  return items.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));
}

export function buildSeedfIntelligence(input = {}) {
  const snapshot = input.snapshot || {};
  const lawsSnapshot = input.lawsSnapshot || {};
  const legislationBank = input.legislationBank || {};
  const editalSnapshot = input.editalSnapshot || {};
  const referenceDate = dateOnly(input.referenceDate || new Date().toISOString());
  const laws = lawsSnapshot.laws || [];
  const bankRows = legislationBank.rows || [];
  const editalAxes = editalSnapshot.axes || [];

  const interruptedSessions = buildInterruptedSessions(snapshot, laws);
  const lawPerformance = aggregateLawPerformance(snapshot, laws);
  const activeErrors = buildActiveErrors(snapshot, referenceDate);
  const suspendedErrors = [
    ...(snapshot?.execution?.c01?.errors || []),
    ...(snapshot?.execution?.leis_primeiro?.errors || []),
  ].filter((error) => !isClosedError(error.status) && isStrategicallyInactive(error.strategic_use));
  const reviews = buildReviews(bankRows, referenceDate);
  const coverage = buildCoverage(laws, bankRows, editalAxes);
  const quality = buildQuality(snapshot, laws, bankRows, editalAxes);
  const risks = buildRisks(activeErrors, reviews, lawPerformance, coverage, interruptedSessions);
  const nextAction = buildNextAction(snapshot, laws, reviews, activeErrors, interruptedSessions);
  const agenda = buildAgenda(snapshot, laws, reviews, interruptedSessions);
  const strengths = lawPerformance.filter((row) => row.strength);
  const weaknesses = lawPerformance.filter((row) => row.accuracy !== null && row.accuracy < 80).map((row) => ({
    ...row,
    label: row.confidence.rank >= 3 ? "fragilidade sustentada" : "sinal de fragilidade · confirmar com mais amostra",
  }));

  const knownQuestions = knownSum([
    snapshot?.execution?.c01?.totals?.done,
    snapshot?.execution?.leis_primeiro?.totals?.done,
  ]);

  return {
    referenceDate,
    state: {
      phase: snapshot?.dashboard?.phase || "—",
      cycle: snapshot?.dashboard?.cycle || "—",
      knownQuestions,
      sessions: (snapshot?.execution?.leis_primeiro?.sessions || []).filter((item) => item.completed === true).length,
      interrupted: interruptedSessions.length,
      activeErrors: activeErrors.length,
      suspendedErrors: suspendedErrors.length,
      risks: risks.length,
    },
    nextAction,
    interruptedSessions,
    agenda,
    reviews,
    activeErrors,
    suspendedErrors,
    lawPerformance,
    strengths,
    weaknesses,
    coverage,
    risks,
    quality,
    continuity: {
      c01: snapshot?.execution?.c01?.active_day || null,
      law: nextCanonicalLaw(snapshot, laws)?.code || null,
    },
    methodology: {
      sample: "confiança combina questões, sessões e completude; uma única sessão mantém a amostra pequena",
      strength: "força exige pelo menos evidência moderada, precisão >= 85% e ausência de piora",
      trend: "tendência usa somente datas reais; exige quatro eventos e compara os dois últimos com os dois anteriores",
      absence: "null, undefined e campo ausente permanecem desconhecidos; zero só é zero quando está explicitamente presente",
      coverage: "escopo ativo, Radar/histórico, prática, evidência e consolidação são estados diferentes",
      priority: "retomada > revisão vencida > erro crítico > continuidade canônica; a trilha não é reordenada arbitrariamente",
    },
  };
}
