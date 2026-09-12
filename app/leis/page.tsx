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
  question_target?: number;
  operational_target_total?: number;
  cargos?: string[];
  action?: string;
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
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatAuditDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function priorityShort(value?: string) {
  if (!value) return "Sem prioridade";
  return value.replace(" - ", " · ");
}

function isRadarLaw(law: Law) {
  return /radar/i.test(`${law.action || ""} ${law.priority || ""}`);
}

function lawComplete(law: Law) {
  if (isRadarLaw(law)) return false;
  return Boolean(law.orientation_read && law.d0);
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
  const executableLaws = snapshot?.laws.filter((law) => !isRadarLaw(law)) || [];
  const currentLaw = executableLaws.find((law) => !lawComplete(law)) || executableLaws[0] || null;
  const completedBlocks = executableLaws.filter(lawComplete).length;
  const currentStep = currentLaw
    ? !currentLaw.orientation_read
      ? "1 · Ler orientação"
      : !currentLaw.d0
        ? "5 · Fechar D0"
        : "Bloco fechado · seguir para a próxima norma"
    : "Aguardando sincronização";
  const currentStage = currentLaw?.orientation_read ? 5 : 1;
  const flowSteps = [
    ["Orientação", "entender o recorte"],
    ["Lei seca", "ler a fonte oficial"],
    ["Questões", "responder e registrar"],
    ["Flashcards", "recuperar o essencial"],
    ["D0", "fechar o bloco"],
  ];
  const radarLaws = snapshot?.laws.filter(isRadarLaw) || [];
  const groupNames = groups.slice(1);
  const totalQuestions = (snapshot?.laws || []).reduce(
    (sum, law) => sum + (law.shared_block ? (law.code === "L30" ? 10 : 0) : law.question_target || 0),
    0,
  );
  const mappedRecords = snapshot?.summary.mapped_law_records ?? snapshot?.summary.mapped_operational_records ?? 32;
  const radarRecords = snapshot?.summary.radar_records ?? snapshot?.radars?.length ?? 1;

  return (
    <main className="laws-page laws-cockpit">
      <header className="laws-topbar">
        <a className="laws-back" href="../"><ArrowLeft size={17} /> Dashboard SEEDF</a>
        <div className="laws-sync"><span className="laws-live-dot" /> Notion → GitHub · {formatDate(snapshot?.source.synced_at)}</div>
      </header>

      <section className="laws-hero laws-cockpit-hero">
        <div className="laws-hero-copy">
          <p className="laws-kicker">⚖️ TRILHA OPERACIONAL · SEEDF PPGE</p>
          <h1>Leis Primeiro<span className="laws-hero-dot">.</span></h1>
          <p className="laws-lead">A fila de leitura, questões e revisão do SEEDF. Abra a norma certa, cumpra o bloco e registre o avanço no Notion.</p>
          <div className="laws-hero-thesis"><span>LER</span><i>→</i><span>RESPONDER</span><i>→</i><span>REVISAR</span></div>
          <div className="laws-hero-meta"><span className="laws-live-dot" /><span>Fonte operacional: Notion</span><span className="laws-meta-separator">·</span><span>Site: consulta e navegação</span></div>
          <div className="laws-hero-actions">
            <a className="laws-primary" href={currentLaw ? `./${currentLaw.code.toLowerCase()}/` : "#mapa-detalhado"}>▶️ Continuar {currentLaw?.code || "a trilha"}</a>
            <a className="laws-secondary" href="#trilha">Ver trilha ↓</a>
            <a className="laws-secondary" href={snapshot?.source.page_url || "https://app.notion.com/p/3d8cf5a26731817c89f4f4907d14a701"} target="_blank" rel="noreferrer">Notion ↗</a>
          </div>
        </div>
        <aside className="laws-next-card">
          <div className="laws-next-top"><div><p className="laws-kicker">PRÓXIMA AÇÃO</p><span>Bloco atual · {currentLaw?.code || "—"}</span></div><span className="laws-next-badge">{String(currentStage).padStart(2, "0")} / 05</span></div>
          <div className="laws-next-law"><span className="laws-next-code">{currentLaw?.code || "—"}</span><h2>{currentLaw?.title || "Aguardando dados"}</h2></div>
          <div className="laws-next-context"><span>{currentLaw ? `${currentLaw.code} / ${snapshot?.laws.length || 34}` : "—"}</span><span>{currentLaw?.question_target || 0} questões-meta</span><span>{currentLaw?.group || "Aguardando"}</span></div>
          <div className="laws-next-focus"><span>{String(currentStage).padStart(2, "0")}</span><div><small>FAÇA AGORA</small><strong>{currentStep}</strong></div></div>
          <p>Feche orientação, leitura, questões, flashcards e D0 antes de avançar. D7/D20 seguem em paralelo.</p>
          <div className="laws-checkpoints">{["Orientação", "Questões", "Flashcards", "D0", "D7/D20"].map((label) => <span className={`laws-checkpoint ${label === "Orientação" && currentLaw?.orientation_read ? "is-done" : ""}`} key={label}>{label === "Orientação" && currentLaw?.orientation_read ? "✓" : "○"} {label}</span>)}</div>
          <a className="laws-next-cta" href={currentLaw ? `./${currentLaw.code.toLowerCase()}/` : "#mapa-detalhado"}>Abrir norma <span aria-hidden="true">↗</span></a>
          <a className="laws-next-notion" href={currentLaw?.notion_url || snapshot?.source.page_url || "#"} target="_blank" rel="noreferrer">Abrir no Notion ↗</a>
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
        <article className="laws-stat-questions"><div className="laws-stat-top"><span className="laws-stat-icon">02</span><span>QUESTÕES DE META</span></div><strong>{snapshot ? totalQuestions : "—"}</strong><small>na sequência executável</small></article>
        <article className="laws-stat-map"><div className="laws-stat-top"><span className="laws-stat-icon">03</span><span>NORMAS NO MAPA</span></div><strong>{snapshot?.summary.pages ?? 34}</strong><small>L01–L34 · 4 trilhas</small></article>
        <article className="laws-stat-source"><div className="laws-stat-top"><span className="laws-stat-icon">04</span><span>FONTE VIVA</span></div><strong>Notion</strong><small>{mappedRecords} mapeados · {radarRecords} radar</small></article>
      </section>

      <section className="laws-panel laws-track-panel" id="trilha">
        <div className="laws-heading"><div><p className="laws-kicker">MAPA DE DECISÃO</p><h2>Por onde continuar</h2><p>Escolha a trilha pelo cargo. Cada cartão já aponta para a próxima norma pendente.</p></div><span className="laws-heading-note">{executableLaws.length} blocos executáveis</span></div>
        <div className="laws-track-grid">
          {groupNames.map((name, index) => {
            const groupLaws = snapshot?.laws.filter((law) => law.group === name) || [];
            const executable = groupLaws.filter((law) => !isRadarLaw(law));
            const completed = executable.filter(lawComplete).length;
            const pending = executable.find((law) => !lawComplete(law));
            const range = groupLaws.length ? `${groupLaws[0].code}–${groupLaws[groupLaws.length - 1].code}` : "—";
            const progress = completionPercent(completed, executable.length);
            return <article className="laws-track-card" data-track-group={name} key={name}>
              <div className="laws-track-head"><div className="laws-track-head-main"><span className="laws-track-number">0{index + 1}</span><span>{name}</span></div><span className="laws-track-range">{range}</span></div>
              <div className="laws-track-status">{pending ? `Próxima: ${pending.code}` : executable.length ? "Trilha concluída" : "Acompanhar"}</div>
              <strong>{pending ? `${pending.code} · ${pending.title}` : executable.length ? "Grupo concluído" : "Somente monitoramento"}</strong>
              <p>{completed}/{executable.length} blocos fechados por D0{groupLaws.length > executable.length ? ` · ${groupLaws.length - executable.length} radar` : ""}.</p>
              <div className="laws-track-progress" aria-label={`${progress}% concluído`}><span style={{ width: `${progress}%` }} /></div>
              <div className="laws-track-foot"><small>{progress}% do grupo</small><a href={pending ? `./${pending.code.toLowerCase()}/` : "#mapa-detalhado"}><span>{pending ? `Abrir ${pending.code}` : "Ver grupo"}</span><span aria-hidden="true">↗</span></a></div>
            </article>;
          })}
        </div>
      </section>

      <nav className="laws-quick-nav" aria-label="Atalhos da trilha"><a className="laws-quick-link" href="#mapa-detalhado"><span className="laws-quick-icon">⌕</span><span><b>Localizar uma norma</b><small>Mapa detalhado e filtros</small></span><span className="laws-quick-arrow">↗</span></a><a className="laws-quick-link" href="#radar"><span className="laws-quick-icon">◎</span><span><b>Ver Radar</b><small>Atualizações fora da fila</small></span><span className="laws-quick-arrow">↗</span></a><a className="laws-quick-link" href={snapshot?.source.page_url || "#"} target="_blank" rel="noreferrer"><span className="laws-quick-icon">▦</span><span><b>Consultar o banco</b><small>Metas, revisões e registros no Notion</small></span><span className="laws-quick-arrow">↗</span></a></nav>

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
            "L11 tem meta operacional 0 enquanto o edital não fechar cargos e escolaridade.",
            "L33 é Radar forte com 10 questões de familiarização.",
            "L34 permanece com meta 0 durante a vacatio legis; vigência em 28/12/2026.",
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

        {error ? <div className="laws-error"><CircleAlert size={18} /> O snapshot do site não carregou. A trilha original continua disponível no Notion pelo botão acima.</div> : null}
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
                      {law.shared_block ? <div className="law-shared-note"><CircleAlert size={14} /> L30–L32 compartilham uma única meta operacional de 10 questões.</div> : null}
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

      <footer className="laws-footer"><span>SEEDF PPGE · Leis Primeiro</span><span>Fonte operacional: Notion · Fonte jurídica: texto oficial vigente</span></footer>
    </main>
  );
}
