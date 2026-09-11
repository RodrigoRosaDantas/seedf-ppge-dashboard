"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  Filter,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
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
  source: {
    title: string;
    page_url: string;
    last_edited_time: string | null;
    synced_at: string | null;
  };
  summary: {
    pages: number;
    bank_records: number;
    mapped_operational_records?: number;
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
  if (!value) return "11/09/2026";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "11/09/2026";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function priorityShort(value?: string) {
  if (!value) return "Sem prioridade";
  return value.replace(" - ", " · ");
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
      const haystack = [law.code, law.title, law.group, law.priority, law.action, law.cut, law.alert, ...(law.cargos || [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return haystack.includes(needle);
    });
  }, [snapshot, query, group, priority]);

  const grouped = groups.slice(1).map((name) => ({ name, laws: filtered.filter((law) => law.group === name) })).filter((item) => item.laws.length);
  const totalQuestions = (snapshot?.laws || []).reduce((sum, law) => sum + (law.shared_block ? (law.code === "L30" ? 10 : 0) : law.question_target || 0), 0);

  return (
    <main className="laws-page">
      <header className="laws-topbar">
        <a className="laws-back" href="../"><ArrowLeft size={17} /> Dashboard SEEDF</a>
        <div className="laws-sync"><span className="laws-live-dot" /> Notion → GitHub · {formatDate(snapshot?.source.synced_at)}</div>
      </header>

      <section className="laws-hero">
        <div className="laws-hero-copy">
          <p className="laws-kicker">⚖️ TRILHA OPERACIONAL · SEEDF PPGE</p>
          <h1>Leis Primeiro</h1>
          <p className="laws-lead">Leitura + questões + flashcards em uma sequência única. A página organiza o que estudar; o Notion continua sendo a fonte operacional e as fontes oficiais continuam prevalecendo sobre qualquer resumo.</p>
          <div className="laws-hero-actions">
            <a className="laws-primary" href={snapshot?.source.page_url || "https://app.notion.com/p/3d8cf5a26731817c89f4f4907d14a701"} target="_blank" rel="noreferrer">Abrir trilha no Notion <ExternalLink size={15} /></a>
            <a className="laws-secondary" href="#leis">Ir para L01–L34 <ArrowUpRight size={15} /></a>
          </div>
        </div>
        <div className="laws-hero-card">
          <div className="laws-seal"><ShieldCheck size={22} /></div>
          <div><span>Auditoria jurídica</span><strong>11/09/2026</strong><small>34 páginas · 33 registros no banco</small></div>
        </div>
      </section>

      <section className="laws-stats" aria-label="Resumo da trilha">
        <article><FileText size={19} /><span>Páginas L01–L34</span><strong>{snapshot?.summary.pages ?? 34}</strong></article>
        <article><Layers3 size={19} /><span>Registros operacionais</span><strong>{snapshot?.summary.bank_records ?? 33}</strong></article>
        <article><Target size={19} /><span>Questões-meta mapeadas</span><strong>{snapshot ? totalQuestions : "—"}</strong></article>
        <article><Sparkles size={19} /><span>Regra de avanço</span><strong>D0 fecha o bloco</strong></article>
      </section>

      <section className="laws-panel laws-method">
        <div className="laws-heading">
          <div><p className="laws-kicker">SEQUÊNCIA OBRIGATÓRIA</p><h2>Como executar cada norma</h2></div>
          <span className="laws-chip laws-chip-green"><CheckCircle2 size={14} /> sem esperar D7/D20</span>
        </div>
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
      </section>

      <section className="laws-panel laws-audit">
        <div className="laws-heading"><div><p className="laws-kicker">AUDITORIA INTEGRAL</p><h2>Pontos que não podem ser perdidos</h2></div><CircleAlert size={20} /></div>
        <div className="laws-audit-grid">
          {(snapshot?.audit_notes || [
            "L30 + L31 + L32 formam um único bloco M5: 10 questões no total, distribuídas 3 + 4 + 3.",
            "L11 tem meta operacional 0 enquanto o edital não fechar cargos e escolaridade.",
            "L33 é Radar forte com 10 questões de familiarização.",
            "L34 permanece com meta 0 durante a vacatio legis; vigência em 28/12/2026.",
          ]).map((note) => <div key={note}><CheckCircle2 size={16} /><span>{note}</span></div>)}
        </div>
      </section>

      <section className="laws-panel" id="leis">
        <div className="laws-heading laws-list-heading">
          <div><p className="laws-kicker">ORDEM REAL DE ESTUDO</p><h2>L01–L34</h2><p>Busque por lei, tema, cargo ou alerta. Abra o cartão para ver o recorte e a vigência quando disponíveis.</p></div>
          <span className="laws-result-count">{filtered.length} de {snapshot?.laws.length ?? 34}</span>
        </div>

        <div className="laws-toolbar">
          <label className="laws-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar LDB, ECA, LRF, LAI..." aria-label="Buscar legislação" /></label>
          <label className="laws-select"><Filter size={16} /><select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filtrar por trilha">{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="laws-select"><ShieldCheck size={16} /><select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filtrar por prioridade">{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>

        {error ? <div className="laws-error"><CircleAlert size={18} /> O snapshot do site não carregou. A trilha original continua disponível no Notion pelo botão acima.</div> : null}
        {!snapshot && !error ? <div className="laws-loading">Carregando a trilha operacional…</div> : null}

        <div className="laws-groups">
          {grouped.map((section) => (
            <section className="laws-group" key={section.name}>
              <div className="laws-group-title"><h3>{section.name}</h3><span>{section.laws.length} normas</span></div>
              <div className="laws-grid">
                {section.laws.map((law) => {
                  const isOpen = expanded === law.code;
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
                      <div className="law-meta-row"><span>{law.action || "Estudar"}</span><span>•</span><span>{law.status || "Não iniciado"}</span></div>
                      <div className="law-cargos">{(law.cargos || []).map((cargo) => <span key={cargo}>{cargo}</span>)}</div>
                      {(law.cut || law.alert || law.block) ? (
                        <button className="law-details-button" type="button" onClick={() => setExpanded(isOpen ? null : law.code)}>{isOpen ? "Ocultar recorte" : "Ver recorte e alertas"} <ArrowUpRight size={14} /></button>
                      ) : null}
                      {isOpen ? (
                        <div className="law-details">
                          {law.cut ? <div><strong>Recorte prioritário</strong><p>{law.cut}</p></div> : null}
                          {law.alert ? <div className="law-alert"><strong>Vigência / alerta</strong><p>{law.alert}</p></div> : null}
                          {law.block ? <div><strong>Bloco sugerido</strong><p>{law.block}</p></div> : null}
                        </div>
                      ) : null}
                      {law.shared_block ? <div className="law-shared-note"><CircleAlert size={14} /> L30–L32 compartilham uma única meta operacional de 10 questões.</div> : null}
                      <div className="law-actions">
                        <a href={law.notion_url} target="_blank" rel="noreferrer">Página da lei <ExternalLink size={14} /></a>
                        {law.official_url ? <a href={law.official_url} target="_blank" rel="noreferrer">Fonte oficial <ExternalLink size={14} /></a> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      {snapshot?.radars?.length ? (
        <section className="laws-panel laws-radar">
          <div className="laws-heading"><div><p className="laws-kicker">RADAR FORA DA NUMERAÇÃO L01–L34</p><h2>Monitoramento normativo</h2></div><ShieldCheck size={20} /></div>
          {snapshot.radars.map((radar) => (
            <article key={radar.operational_order}><div><strong>{radar.title}</strong><span>{radar.priority} · meta {radar.question_target}</span></div><a href={radar.official_url || radar.url} target="_blank" rel="noreferrer">Abrir fonte <ExternalLink size={14} /></a></article>
          ))}
        </section>
      ) : null}

      <footer className="laws-footer"><span>SEEDF PPGE · Leis Primeiro</span><span>Fonte operacional: Notion · Fonte jurídica: texto oficial vigente</span></footer>
    </main>
  );
}
