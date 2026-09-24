"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Filter,
  Search,
  ShieldCheck,
} from "lucide-react";
import "./leis.css";

type Law = {
  code: string;
  title: string;
  group: string;
  notion_url: string;
  bank_record_url?: string;
  operational_order?: number;
  priority?: string;
  official_url?: string;
  status?: string;
  study_phase?: string;
  summaries_done?: number;
  summary_number?: number | null;
  readings_done?: number;
  reading_number?: number | null;
  sessions_done?: number;
  question_target?: number;
  questions_additional?: number;
  questions_optional?: number;
  target_model?: string;
  additional_target_cargos?: string[];
  operational_target_total?: number;
  cargos?: string[];
  action?: string;
  /** Força documental e governança pós-TR sincronizadas do Notion. */
  documentary_strength?: string | null;
  strategic_status?: string | null;
  cut?: string;
  alert?: string;
  block?: string;
  observations?: string;
  orientation_read?: boolean;
  d0?: boolean;
  d7?: boolean;
  d20?: boolean;
  last_audit?: string | null;
  shared_block?: boolean;
  shared_codes?: string[];
  questions_done?: number;
  flashcards_done?: boolean;
  flashcards_scope?: "Norma" | "Bloco M5" | string;
  next_step?: string;
};

type Radar = {
  operational_order: number;
  title: string;
  priority: string;
  official_url: string;
  status: string;
  question_target: number;
  cargos: string[];
  action: string;
  cut?: string;
  alert?: string;
  url: string;
};

type LeisExecution = {
  as_of?: string | null;
  latest_day_id?: string | null;
  error_count?: number;
  days?: Array<{
    day_id: string;
    page_code?: string | null;
    title?: string;
    progress?: string | null;
    summary_number?: number | null;
    reading_number?: number | null;
    status?: string;
    planned?: number;
    done?: number;
    correct?: number;
    errors?: number;
    doubts?: number;
    precision?: number | null;
    executed_at?: string | null;
    href?: string | null;
  }>;
  sessions?: Array<{
    title?: string;
    page_code?: string | null;
    date?: string | null;
    progress?: string | null;
    session_type?: string | null;
    modality?: string | null;
    flashcards?: number;
    summary_number?: number | null;
    reading_number?: number | null;
    created_at?: string | null;
    questions_done?: number;
    correct?: number;
    errors?: number;
    precision?: number | null;
  }>;
  errors?: Array<{
    id: string;
    day_id: string;
    page_code?: string | null;
    question_id: string;
    title?: string;
    subject?: string | null;
    discipline?: string | null;
    reason?: string | null;
    pattern?: string | null;
    severity?: string | null;
    review?: string | null;
    status?: string | null;
    recurrence?: number;
    flashcard?: boolean;
    next_review?: string | null;
    url?: string | null;
  }>;
};

type Snapshot = {
  schema_version?: number;
  source: {
    title: string;
    page_url: string;
    last_edited_time: string | null;
    synced_at: string | null;
  };
  summary: {
    pages: number;
    bank_records: number;
    mapped_law_records?: number;
    mapped_operational_records?: number;
    radar_records?: number;
    priorities?: Record<string, number>;
  };
  study_sequence: string[];
  advance_rule: string;
  execution?: LeisExecution | null;
  laws: Law[];
  radars?: Radar[];
  audit_notes?: string[];
};

const groups = ["Todos", "Núcleo comum", "Gestor — Administração", "Apoio Administrativo", "Monitor"];
const priorities = ["Todas", "P0 - Nuclear", "P1 - Alta", "P2 - Complementar", "Radar forte", "Radar"];

function slug(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "aguardando sincronização";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "aguardando sincronização";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

function formatAuditDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function formatPercent(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  const percent = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return `${percent.toFixed(percent % 1 ? 1 : 0).replace(".", ",")}%`;
}

function priorityShort(value?: string) {
  if (!value) return "Sem prioridade";
  return value.replace(" - ", " · ");
}

function isRadarLaw(law: Law) {
  return /radar|suspenso|fora do escopo/i.test(`${law.strategic_status || ""} ${law.action || ""} ${law.priority || ""}`);
}

function numberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function operationalUnits(laws: Law[]) {
  const seen = new Set<string>();
  return laws.filter((law) => !isRadarLaw(law)).filter((law) => {
    const key = law.shared_block ? "M5" : law.code;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function studyState(law: Law) {
  const questionTarget = numberValue(law.operational_target_total ?? law.question_target);
  const questionsDone = numberValue(law.questions_done);
  const flashcardsDone = law.flashcards_done === true;
  const summariesDone = numberValue(law.summaries_done);
  const readingsDone = numberValue(law.readings_done);
  const orientation = law.orientation_read === true;
  const d0 = law.d0 === true;
  const hasSummary = summariesDone !== null && summariesDone > 0;
  const hasReading = readingsDone !== null && readingsDone > 0;
  const questionsComplete = questionTarget === 0 || (questionTarget !== null && questionsDone !== null && questionTarget > 0 && questionsDone >= questionTarget);
  const complete = !isRadarLaw(law)
    && orientation
    && hasSummary
    && hasReading
    && questionsComplete
    && flashcardsDone
    && d0;
  let nextStep = law.next_step || "1 · Ler orientação";
  if (isRadarLaw(law)) nextStep = law.action || "Radar / monitorar";
  else if (!orientation) nextStep = "1 · Ler orientação";
  else if (!hasSummary) nextStep = summariesDone === null ? "2 · Resumo/material — dado ainda não informado" : "2 · Estudar resumo/material (não conta como lei seca)";
  else if (!hasReading) nextStep = readingsDone === null ? "3 · Lei seca — dado ainda não informado" : "3 · Ler a lei seca na fonte oficial";
  else if (!questionsComplete) {
    nextStep = questionTarget === null || questionsDone === null
      ? "4 · Questões — amostra ainda não calculável"
      : "4 · Fazer questões (" + questionsDone + "/" + questionTarget + ")";
  }
  else if (!flashcardsDone) nextStep = law.shared_block ? "5 · Fazer/revisar flashcards do bloco M5" : "5 · Fazer/revisar flashcards";
  else if (!d0) nextStep = "6 · Fechar D0";
  else nextStep = "Bloco fechado · seguir para a próxima norma";
  return {
    complete,
    questionTarget,
    questionsDone,
    flashcardsDone,
    summariesDone,
    readingsDone,
    orientation,
    d0,
    nextStep,
    hasSummary,
    hasReading,
    questionsComplete,
  };
}

function lawComplete(law: Law) {
  return studyState(law).complete;
}

function studyStageNumber(law: Law) {
  const state = studyState(law);
  if (!state.orientation) return 1;
  if (!state.hasSummary) return 2;
  if (!state.hasReading) return 3;
  if (!state.questionsComplete) return 4;
  if (!state.flashcardsDone) return 5;
  return 6;
}

function completionPercent(done: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
}

export default function LeisPrimeiroPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Todos");
  const [priority, setPriority] = useState("Todas");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`../data/leis-primeiro.json?ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("snapshot indisponível");
        return response.json();
      })
      .then((value: Snapshot) => {
        if (!cancelled) setSnapshot(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return (snapshot?.laws || []).filter((law) => {
      if (group !== "Todos" && law.group !== group) return false;
      if (priority !== "Todas" && law.priority !== priority) return false;
      if (!needle) return true;
      const haystack = [law.code, law.title, law.group, law.priority, law.action, law.cut, law.alert, law.block, law.observations, ...(law.cargos || [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return haystack.includes(needle);
    });
  }, [snapshot, query, group, priority]);

  const grouped = groups
    .slice(1)
    .map((name) => ({ name, laws: filtered.filter((law) => law.group === name) }))
    .filter((item) => item.laws.length);
  const executableLaws = operationalUnits(snapshot?.laws || []);
  const currentLaw = executableLaws.find((law) => !lawComplete(law)) || executableLaws[0] || null;
  const currentState = currentLaw ? studyState(currentLaw) : null;
  const completedBlocks = executableLaws.filter(lawComplete).length;
  const currentStep = currentState?.nextStep || "Aguardando sincronização";
  const currentStage = currentLaw ? studyStageNumber(currentLaw) : 1;
  const flowSteps = [
    ["Orientação", "entender o recorte"],
    ["Resumo / material", "estudar a página sem contar como lei seca"],
    ["Lei seca", "ler a fonte oficial"],
    ["Questões", "responder e registrar"],
    ["Flashcards", "recuperar o essencial"],
    ["D0", "fechar o bloco"],
  ];
  const radarLaws = snapshot?.laws.filter(isRadarLaw) || [];
  const groupNames = groups.slice(1);
  const totalQuestions = executableLaws.reduce(
    (sum, law) => sum + (law.operational_target_total ?? law.question_target ?? 0),
    0,
  );
  const mappedRecords = snapshot?.summary.mapped_law_records ?? snapshot?.summary.mapped_operational_records ?? 32;
  const radarRecords = snapshot?.summary.radar_records ?? snapshot?.radars?.length ?? 1;
  const latestExecution = snapshot?.execution?.days?.[0] || null;
  const latestLaw = latestExecution ? snapshot?.laws.find((law) => law.code === latestExecution.page_code) : null;
  const latestErrors = latestExecution
    ? (snapshot?.execution?.errors || []).filter((item) => item.day_id === latestExecution.day_id)
    : [];

  const currentChecks = [
    { label: "Orientação", done: Boolean(currentState?.orientation) },
    { label: "Resumo", done: Boolean(currentState?.hasSummary) },
    { label: "Lei seca", done: Boolean(currentState?.hasReading) },
    { label: "Questões", done: Boolean(currentState?.questionsComplete) },
    { label: "Flashcards", done: Boolean(currentState?.flashcardsDone) },
    { label: "D0", done: Boolean(currentState?.d0) },
    { label: "D7/D20", done: Boolean(currentLaw?.d7 && currentLaw?.d20) },
  ];

  return (
    <main className="laws-page laws-cockpit">
      <header className="laws-topbar">
        <a className="laws-back" href="../"><ArrowLeft size={17} /> Dashboard SEEDF</a>
        <div className="laws-topbar-tools"><div className="reading-settings-host" data-reading-settings /><div className="laws-sync"><span className="laws-live-dot" /> Versão dos dados · {formatDate(snapshot?.source.synced_at)}</div></div>
      </header>

      <section className="laws-hero laws-cockpit-hero">
        <div className="laws-hero-copy">
          <p className="laws-kicker">⚖️ TRILHA OPERACIONAL · SEEDF PPGE</p>
          <h1>Leis Primeiro<span className="laws-hero-dot">.</span></h1>
          <p className="laws-lead">A fila de leitura, questões e revisão do SEEDF. O Notion é a fonte operacional canônica; o site organiza a execução, interpreta os registros e mantém a leitura local disponível.</p>
          <div className="laws-hero-thesis"><span>LER</span><i>→</i><span>RESPONDER</span><i>→</i><span>REVISAR</span></div>
          <div className="laws-hero-meta"><span className="laws-live-dot" /><span>Fonte canônica: Notion</span><span className="laws-meta-separator">·</span><span>Camada de execução: site</span></div>
          <div className="laws-hero-actions">
            <a className="laws-primary" href={currentLaw ? `./${currentLaw.code.toLowerCase()}/` : "#mapa-detalhado"}>▶️ Continuar {currentLaw?.code || "a trilha"}</a>
            <a className="laws-secondary" href="#trilha">Ver trilha ↓</a>
            <a className="laws-secondary" href="./flashcards/">🧠 Abrir flashcards</a>
            <a className="laws-secondary" href={snapshot?.source.page_url || "https://app.notion.com/p/3d8cf5a26731817c89f4f4907d14a701"} target="_blank" rel="noreferrer">Registro vivo · Notion ↗</a>
          </div>
        </div>
        <aside className="laws-next-card">
          <div className="laws-next-top"><div><p className="laws-kicker">PRÓXIMA AÇÃO</p><span>Bloco atual · {currentLaw?.code || "—"}</span></div><span className="laws-next-badge">{String(currentStage).padStart(2, "0")} / 06</span></div>
          <div className="laws-next-law"><span className="laws-next-code">{currentLaw?.code || "—"}</span><h2>{currentLaw?.title || "Aguardando dados"}</h2></div>
          <div className="laws-next-context"><span>{currentLaw ? `${currentLaw.code} / ${snapshot?.laws.length || 34}` : "—"}</span><span>{currentState?.questionTarget ?? "—"} obrigatórias{currentLaw?.questions_optional ? ` + ${currentLaw.questions_optional} opcionais` : ""}</span><span>{currentLaw?.group || "Aguardando"}</span></div>
          <div className="laws-next-focus"><span>{String(currentStage).padStart(2, "0")}</span><div><small>FAÇA AGORA</small><strong>{currentStep}</strong></div></div>
          <p>Resumo e leitura de lei seca são eventos distintos. Feche D0 somente após cumprir os requisitos reais da Lxx; D7/D20 seguem em paralelo.</p>
          <div className="laws-checkpoints">{currentChecks.map(({ label, done }) => <span className={`laws-checkpoint ${done ? "is-done" : ""}`} key={label}>{done ? "✓" : "○"} {label}</span>)}</div>
          <a className="laws-next-cta" href={currentLaw ? `./${currentLaw.code.toLowerCase()}/` : "#mapa-detalhado"}>Abrir norma <span aria-hidden="true">↗</span></a>
          <a className="laws-next-notion" href={currentLaw?.notion_url || snapshot?.source.page_url || "#"} target="_blank" rel="noreferrer">Registro vivo · abrir no Notion ↗</a>
        </aside>
      </section>

      <section className="laws-study-flow" aria-label="Fluxo para fechar uma norma">
        <div className="laws-flow-intro"><p className="laws-kicker">MÉTODO DE FECHAMENTO</p><h2>Uma norma, um bloco fechado.</h2><p>O caminho é fixo. A próxima ação muda conforme o que já foi registrado.</p><span className="laws-flow-now">Agora: <strong>{currentStep}</strong></span></div>
        <ol className="laws-flow-steps">
          {flowSteps.map(([label, detail], index) => {
            const step = index + 1;
            const done = Boolean(currentLaw && lawComplete(currentLaw)) || step < currentStage;
            const active = !currentLaw || !lawComplete(currentLaw) ? step === currentStage : false;
            return <li className={`${done ? "is-done" : ""} ${active ? "is-current" : ""}`} key={label}><span>{String(step).padStart(2, "0")}</span><div><b>{label}</b><small>{detail}</small></div></li>;
          })}
        </ol>
        <div className="laws-flow-review"><span>↗</span><div><small>EM PARALELO</small><b>D7 + D20</b><p>não bloqueiam a próxima norma</p></div></div>
      </section>

      <section className="laws-status-strip" aria-label="Estado da trilha">
        <article className="laws-stat-progress"><div className="laws-stat-top"><span className="laws-stat-icon">01</span><span>BLOCOS FECHADOS</span></div><strong>{completedBlocks}/{executableLaws.length}</strong><small>por D0 · D7/D20 não bloqueiam</small></article>
        <article className="laws-stat-questions"><div className="laws-stat-top"><span className="laws-stat-icon">02</span><span>QUESTÕES DE META</span></div><strong>{snapshot ? totalQuestions : "—"}</strong><small>obrigatórias · Radar/opcionais fora da dívida</small></article>
        <article className="laws-stat-map"><div className="laws-stat-top"><span className="laws-stat-icon">03</span><span>NORMAS NO MAPA</span></div><strong>{snapshot?.summary.pages ?? 34}</strong><small>L01–L34 · 4 trilhas</small></article>
        <article className="laws-stat-source"><div className="laws-stat-top"><span className="laws-stat-icon">04</span><span>FONTE VIVA</span></div><strong>Notion</strong><small>{mappedRecords} mapeados · {radarRecords} radar</small></article>
      </section>

      {latestExecution ? (
        <section className="laws-panel" id="historico-leis">
          <div className="laws-heading"><div><p className="laws-kicker">HISTÓRICO REAL · LEIS PRIMEIRO</p><h2>Última execução registrada</h2><p>Resumo, leitura de lei seca, questões e erros permanecem separados pelo Dia ID.</p></div><span className="laws-heading-note">{latestExecution.day_id}</span></div>
          <div className="laws-status-strip">
            <article className="laws-stat-progress"><div className="laws-stat-top"><span className="laws-stat-icon">R</span><span>RESUMO × LEI</span></div><strong>{latestExecution.summary_number ?? "—"} / {latestExecution.reading_number ?? "—"}</strong><small>resumo nº / leitura nº · leitura real não é inferida</small></article>
            <article className="laws-stat-questions"><div className="laws-stat-top"><span className="laws-stat-icon">Q</span><span>QUESTÕES</span></div><strong>{latestExecution.done ?? "—"}/{latestExecution.planned ?? "—"}</strong><small>{latestExecution.correct ?? "—"} acertos · {formatPercent(latestExecution.precision)}</small></article>
            <article className="laws-stat-map"><div className="laws-stat-top"><span className="laws-stat-icon">E</span><span>CADERNO DE ERROS</span></div><strong>{latestErrors.length}</strong><small>erros vinculados por Dia ID</small></article>
            <article className="laws-stat-source"><div className="laws-stat-top"><span className="laws-stat-icon">D0</span><span>D0 DA NORMA</span></div><strong>{latestLaw?.d0 ? "Concluído" : "Pendente"}</strong><small>Flashcards: {latestLaw?.flashcards_done ? "feitos" : "pendentes"} · sem meta numérica</small></article>
          </div>
          {latestErrors.length ? <div className="laws-map-list">{latestErrors.map((item) => <article className="laws-map-row" key={item.id}><div className="laws-map-main"><span className="law-code">{item.question_id}</span><strong>{item.subject || item.title || "Erro registrado"}</strong></div><div className="laws-map-meta"><span>{item.review || "Sem revisão"}</span><span>{item.status || "Sem status"}</span><span>reincidência {item.recurrence || 0}</span></div><p className="laws-map-next">{item.title || item.pattern || item.reason || "Registro vinculado ao Caderno de Erros"}</p>{item.url ? <a className="laws-map-open" href={item.url} target="_blank" rel="noreferrer">Abrir erro ↗</a> : null}</article>)}</div> : <p className="laws-empty">Nenhum erro vinculado a esta execução.</p>}
        </section>
      ) : null}

      <section className="laws-panel laws-track-panel" id="trilha">
        <div className="laws-heading"><div><p className="laws-kicker">MAPA DE DECISÃO</p><h2>Por onde continuar</h2><p>Escolha a trilha pelo cargo. Cada cartão já aponta para a próxima norma pendente.</p></div><span className="laws-heading-note">{executableLaws.length} blocos operacionais</span></div>
        <div className="laws-track-grid">
          {groupNames.map((name, index) => {
            const groupLaws = snapshot?.laws.filter((law) => law.group === name) || [];
            const executable = operationalUnits(groupLaws);
            const radars = groupLaws.filter(isRadarLaw);
            const completed = executable.filter(lawComplete).length;
            const pending = executable.find((law) => !lawComplete(law));
            const range = groupLaws.length ? `${groupLaws[0].code}–${groupLaws[groupLaws.length - 1].code}` : "—";
            const progress = completionPercent(completed, executable.length);
            return <article className="laws-track-card" data-track-group={name} key={name}>
              <div className="laws-track-head"><div className="laws-track-head-main"><span className="laws-track-number">0{index + 1}</span><span>{name}</span></div><span className="laws-track-range">{range}</span></div>
              <div className="laws-track-status">{pending ? `Próxima: ${pending.code}` : executable.length ? "Trilha concluída" : "Acompanhar"}</div>
              <strong>{pending ? `${pending.code} · ${pending.title}` : executable.length ? "Grupo concluído" : "Somente monitoramento"}</strong>
              <p>{completed}/{executable.length} blocos fechados por D0{radars.length ? ` · ${radars.length} radar` : ""}.</p>
              <div className="laws-track-progress" aria-label={`${progress}% concluído`}><span style={{ width: `${progress}%` }} /></div>
              <div className="laws-track-foot"><small>{progress}% do grupo</small><a href={pending ? `./${pending.code.toLowerCase()}/` : "#mapa-detalhado"}><span>{pending ? `Abrir ${pending.code}` : "Ver grupo"}</span><span aria-hidden="true">↗</span></a></div>
            </article>;
          })}
        </div>
      </section>

      <nav className="laws-quick-nav" aria-label="Atalhos da trilha"><a className="laws-quick-link" href="#mapa-detalhado"><span className="laws-quick-icon">⌕</span><span><b>Localizar uma norma</b><small>Mapa detalhado e filtros</small></span><span className="laws-quick-arrow">↗</span></a><a className="laws-quick-link" href="#radar"><span className="laws-quick-icon">◎</span><span><b>Ver Radar</b><small>Atualizações fora da fila</small></span><span className="laws-quick-arrow">↗</span></a><a className="laws-quick-link" href={snapshot?.source.page_url || "#"} target="_blank" rel="noreferrer"><span className="laws-quick-icon">▦</span><span><b>Consultar o banco</b><small>Metas, revisões e registros no Notion</small></span><span className="laws-quick-arrow">↗</span></a><a className="laws-quick-link" href="./flashcards/"><span className="laws-quick-icon">▣</span><span><b>Estudar com cards</b><small>Revisão com repetição espaçada</small></span><span className="laws-quick-arrow">↗</span></a></nav>

      <details className="laws-panel laws-disclosure laws-method-disclosure">
        <summary><span><b>📖 COMO ESTUDAR</b><strong>Fluxo de uma norma</strong></span><span>abrir método + regras</span></summary>
        <div className="laws-disclosure-body">
        <div className="laws-steps">
          {(snapshot?.study_sequence || [
            "Orientação — leia Como estudar, Marcar, Pegadinhas, Recorte prioritário e Vigência / alerta.",
            "Lei seca — abra a fonte oficial e leia o recorte indicado.",
            "Questões — cumpra a meta específica e registre no banco.",
            "Flashcards — crie cartões apenas do que exige recuperação ativa.",
            "D0 — feche marcação, erros e flashcards.",
            "D7/D20 — revise em paralelo enquanto avança.",
          ]).map((step, index) => (
            <article className="laws-step" key={step}><span>{index + 1}</span><p>{step}</p></article>
          ))}
        </div>
        <div className="laws-rule"><BookOpenCheck size={18} /><strong>Critério para avançar:</strong><span>{snapshot?.advance_rule || "orientação + 1ª leitura + questões + flashcards + D0; D7/D20 seguem em paralelo."}</span></div>
        </div>
      </details>

      <details className="laws-panel laws-disclosure laws-audit">
        <summary><span><b>🔎 AUDITORIA E INTEGRIDADE</b><strong>O que está preservado</strong></span><span>abrir conferência</span></summary>
        <div className="laws-disclosure-body">
        <div className="laws-audit-grid">
          {(snapshot?.audit_notes || [
            "34 páginas L01–L34 usam 32 registros diretamente mapeados; L30 + L31 + L32 compartilham o registro M5 de acessibilidade.",
            "O 33º registro do banco é o Radar 901 do novo PDE/DF, fora da numeração L01–L34.",
            "Meta obrigatória 0 não cria dívida; questões opcionais/Radar ficam fora da continuidade canônica.",
            "L33 permanece Radar suspenso: 0 obrigatórias + 10 opcionais.",
            "L34 permanece Radar suspenso: 0 obrigatórias + 8 opcionais; Lei nº 15.450/2026 vigente a partir de 28/12/2026.",
          ]).map((note) => <div key={note}><CheckCircle2 size={16} /><span>{note}</span></div>)}
        </div>
        </div>
      </details>

      <details className="laws-panel laws-disclosure laws-map-panel" id="mapa-detalhado">
        <summary><span><b>📚 CONSULTA RÁPIDA</b><strong>Mapa detalhado L01–L34</strong><small>Uma linha por norma: ação, prioridade, meta e revisões.</small></span><span>abrir mapa</span></summary>
        <div className="laws-disclosure-body">
        <div className="laws-heading laws-list-heading">
          <div><p className="laws-kicker">ORDEM REAL DE ESTUDO</p><h2>L01–L34</h2><p>Busque por lei, tema, cargo ou alerta. Abra o cartão para ver recorte, vigência, observações e o estado das revisões.</p></div>
          <span className="laws-result-count">{filtered.length} de {snapshot?.laws.length ?? 34}</span>
        </div>

        <div className="laws-toolbar">
          <label className="laws-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar LDB, ECA, LRF, LAI..." aria-label="Buscar legislação" /></label>
          <label className="laws-select"><Filter size={16} /><select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filtrar por trilha">{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="laws-select"><ShieldCheck size={16} /><select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filtrar por prioridade">{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>

        {error ? <div className="laws-error"><CircleAlert size={18} /> O snapshot do site não carregou. Consulte a fonte operacional canônica no Notion pelo botão acima.</div> : null}
        {!snapshot && !error ? <div className="laws-loading">Carregando a trilha operacional…</div> : null}
        {snapshot && filtered.length === 0 ? <div className="laws-empty">Nenhuma norma corresponde aos filtros atuais.</div> : null}

        <div className="laws-groups">
          {grouped.map((section) => (
            <section className="laws-group" key={section.name}>
              <div className="laws-group-title"><h3>{section.name}</h3><span>{section.laws.length} normas</span></div>
              <div className="laws-grid">
                {section.laws.map((law) => {
                  const isOpen = expanded === law.code;
                  const auditDate = formatAuditDate(law.last_audit);
                  return (
                    <article className={`law-card law-priority-${slug(law.priority)}`} key={law.code}>
                      <div className="law-card-top">
                        <span className="law-code">{law.code}</span>
                        <div className="law-badges">
                          <span className={`laws-chip priority-${slug(law.priority)}`}>{priorityShort(law.priority)}</span>
                          <span className="laws-chip laws-chip-meta">{law.shared_block ? `${law.question_target}q · M5 10q` : `${law.question_target ?? 0} questões`}</span>
                        </div>
                      </div>
                      <h4>{law.title}</h4>
                      <div className="law-meta-row"><span>{law.action || "Estudar"}</span><span>•</span><span>{law.status || "Não iniciado"}</span>{law.operational_order ? <><span>•</span><span>ordem {law.operational_order}</span></> : null}</div>
                      <div className="law-cargos">{(law.cargos || []).map((cargo) => <span key={cargo}>{cargo}</span>)}</div>
                      <div className="law-progress" aria-label={`Estado de revisão de ${law.code}`}>
                        <span className={law.orientation_read ? "is-done" : ""}>Orientação {law.orientation_read ? "✓" : "—"}</span>
                        <span className={(law.summaries_done || 0) > 0 ? "is-done" : ""}>Resumo {(law.summaries_done || 0) > 0 ? "✓" : "—"}</span>
                        <span className={(law.readings_done || 0) > 0 ? "is-done" : ""}>Lei seca {(law.readings_done || 0) > 0 ? "✓" : "—"}</span>
                        <span className={law.flashcards_done ? "is-done" : ""}>{law.shared_block ? "Flashcards M5" : "Flashcards"} {law.flashcards_done ? "✓" : "—"}</span>
                        <span className={law.d0 ? "is-done" : ""}>D0 {law.d0 ? "✓" : "—"}</span>
                        <span className={law.d7 ? "is-done" : ""}>D7 {law.d7 ? "✓" : "—"}</span>
                        <span className={law.d20 ? "is-done" : ""}>D20 {law.d20 ? "✓" : "—"}</span>
                      </div>
                      {(law.cut || law.alert || law.block || law.observations) ? (
                        <button
                          className="law-details-button"
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : law.code)}
                        >
                          {isOpen ? "Ocultar recorte" : "Ver recorte e alertas"} <ArrowUpRight size={14} />
                        </button>
                      ) : null}
                      {isOpen ? (
                        <div className="law-details">
                          {law.cut ? <div><strong>Recorte prioritário</strong><p>{law.cut}</p></div> : null}
                          {law.alert ? <div className="law-alert"><strong>Vigência / alerta</strong><p>{law.alert}</p></div> : null}
                          {law.block ? <div><strong>Bloco sugerido</strong><p>{law.block}</p></div> : null}
                          {law.observations ? <div><strong>Observações</strong><p>{law.observations}</p></div> : null}
                          {auditDate ? <div className="law-audit-date"><strong>Última auditoria no banco</strong><p>{auditDate}</p></div> : null}
                        </div>
                      ) : null}
                      {law.shared_block ? <div className="law-shared-note"><CircleAlert size={14} /> M5: questões, Flashcards feitos?, D0, D7 e D20 são do bloco; resumos e leituras são individuais por Página Lxx.</div> : null}
                      <div className="law-actions">
                        <a href={law.notion_url} target="_blank" rel="noreferrer">Página da lei <ExternalLink size={14} /></a>
                        {law.bank_record_url ? <a href={law.bank_record_url} target="_blank" rel="noreferrer">Registro operacional <ExternalLink size={14} /></a> : null}
                        {law.official_url ? <a href={law.official_url} target="_blank" rel="noreferrer">Fonte oficial <ExternalLink size={14} /></a> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        </div>
      </details>

      {(radarLaws.length || snapshot?.radars?.length) ? (
        <section className="laws-panel laws-radar" id="radar">
          <div className="laws-heading"><div><p className="laws-kicker">RADAR · FORA DA FILA DIÁRIA</p><h2>Monitorar sem disputar atenção</h2><p>Itens de vigência, carreira e atualização normativa permanecem separados da execução.</p></div><span className="laws-chip priority-radar">{radarLaws.length + (snapshot?.radars?.length || 0)} itens</span></div>
          {radarLaws.map((law) => <article key={law.code}><div><strong>{law.code} · {law.title}</strong><span>{law.priority || "Radar"} · meta {law.question_target || 0}</span></div><a href={`./${law.code.toLowerCase()}/`}>Abrir página <ExternalLink size={14} /></a></article>)}
          {(snapshot?.radars || []).map((radar) => <article key={radar.operational_order}><div><strong>R{radar.operational_order} · {radar.title}</strong><span>{radar.priority} · fora da sequência L01–L34</span></div><a href={radar.official_url || radar.url} target="_blank" rel="noreferrer">Abrir fonte <ExternalLink size={14} /></a></article>)}
        </section>
      ) : null}

      <footer className="laws-footer"><span>SEEDF PPGE · Leis Primeiro</span><span>Leitura principal: site · Fallback: Notion · Fonte jurídica: texto oficial vigente</span></footer>
    </main>
  );
}
