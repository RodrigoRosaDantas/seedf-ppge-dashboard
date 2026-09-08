"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers3,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Route,
  Target,
  TimerReset,
  TrendingUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SectionId = "inicio" | "estudar" | "fases" | "cargos" | "progresso" | "materiais";

type DashboardSnapshot = {
  schema_version: number;
  source: {
    kind: "notion";
    title: string;
    page_id: string;
    page_url: string;
    last_edited_time: string | null;
    synced_at: string | null;
    content_hash: string | null;
    status: string;
  };
  dashboard: {
    phase: string;
    cycle: string;
    next_action: string;
    planned_questions: number;
    projected_questions: number;
    executed_questions: number | null;
    verticalized_axes: number;
    jobs: number;
  };
  notice?: string;
};

const LIVE_NOTION_API_URL = "https://fqqkkyusnzhuuizahkww.supabase.co/functions/v1/seedf-notion";
// Public Supabase anon key: it gates the read-only function; the Notion token never reaches the browser.
const LIVE_NOTION_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxcWtreXVzbnpodXVpemFoa3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjIwNTksImV4cCI6MjEwMTI5ODA1OX0.YZd0d4XsFHFT6uETemPZdcDc9t0pQUn8_XmNFHx7hJ0";

function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const source = candidate.source as Record<string, unknown> | undefined;
  const dashboard = candidate.dashboard as Record<string, unknown> | undefined;
  return Boolean(
    source &&
      dashboard &&
      source.kind === "notion" &&
      typeof source.title === "string" &&
      typeof source.page_id === "string" &&
      typeof source.page_url === "string" &&
      typeof dashboard.phase === "string" &&
      typeof dashboard.cycle === "string" &&
      typeof dashboard.next_action === "string" &&
      typeof dashboard.planned_questions === "number" &&
      typeof dashboard.projected_questions === "number" &&
      typeof dashboard.verticalized_axes === "number" &&
      typeof dashboard.jobs === "number",
  );
}

function formatSnapshotDate(value: string | null) {
  if (!value) return "aguardando sincronização";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "aguardando sincronização";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const navigation: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: "inicio", label: "Visão geral", icon: LayoutDashboard },
  { id: "estudar", label: "Estudar hoje", icon: BookOpen },
  { id: "fases", label: "Fases e ciclos", icon: Route },
  { id: "cargos", label: "Cargos-meta", icon: GraduationCap },
  { id: "progresso", label: "Progresso", icon: BarChart3 },
  { id: "materiais", label: "Materiais", icon: FileText },
];

const jobs = [
  {
    code: "A",
    title: "Gestor PPGE",
    subtitle: "Administração",
    priority: "Prioridade máxima",
    tone: "gold",
    source: "SEEDF 2022 + atualização 2026",
  },
  {
    code: "B",
    title: "Analista PPGE",
    subtitle: "Apoio Administrativo",
    priority: "Prioridade alta",
    tone: "teal",
    source: "SEEDF 2016 + carreira atual",
  },
  {
    code: "C",
    title: "Analista PPGE",
    subtitle: "Monitor",
    priority: "Peso controlado",
    tone: "violet",
    source: "SEEDF 2016 + carreira atual",
  },
];

const workload = [
  { label: "Reforço", blocks: 19, questions: 175, tone: "coral" },
  { label: "Manutenção", blocks: 11, questions: 115, tone: "teal" },
  { label: "Novo", blocks: 9, questions: 95, tone: "violet" },
  { label: "Dominado", blocks: 0, questions: 0, tone: "slate" },
];

const dayRows = [
  { day: "D01", label: "Português fino + LDB", detail: "Próxima ação", state: "next", meta: "25 questões" },
  { day: "D02", label: "CF/88 Educação + LDB", detail: "Aguardando execução", state: "ready", meta: "30 questões" },
  { day: "D03", label: "PNE 2026 + PNED + LDB", detail: "Aguardando execução", state: "ready", meta: "30 questões" },
  { day: "D04", label: "Administração Geral/Pública + PODC", detail: "Aguardando execução", state: "ready", meta: "30 questões" },
  { day: "D05", label: "LC 840 + atos administrativos", detail: "Aguardando execução", state: "ready", meta: "35 questões" },
  { day: "D06", label: "Informática atualizada", detail: "Aguardando execução", state: "ready", meta: "35 questões" },
  { day: "D07", label: "Revisão adaptativa", detail: "Definida pelos resultados de D01–D06", state: "adaptive", meta: "30 questões · adaptativo" },
  { day: "D08", label: "Arquivologia + e-ARQ", detail: "Aguardando execução", state: "ready", meta: "35 questões" },
  { day: "D09", label: "Qualidade + BPM + Projetos", detail: "Aguardando execução", state: "ready", meta: "30 questões" },
  { day: "D10", label: "Gestão de Pessoas + comportamento", detail: "Aguardando execução", state: "ready", meta: "35 questões" },
  { day: "D11", label: "AFO + orçamento público", detail: "Aguardando execução", state: "ready", meta: "35 questões" },
  { day: "D12", label: "Materiais + patrimônio + LAI", detail: "Aguardando execução", state: "ready", meta: "35 questões" },
  { day: "D13", label: "ECA + acessibilidade + Educação Especial", detail: "Aguardando execução", state: "ready", meta: "30 questões" },
  { day: "D14", label: "Fechamento do Ciclo 01", detail: "Bateria integrada após D01–D13", state: "adaptive", meta: "40 questões · adaptativo" },
];

const sources = [
  { title: "Edital projetado v0.2", detail: "60 eixos classificados por probabilidade e domínio.", tag: "NORTE", href: "https://app.notion.com/p/3d4cf5a2673181ccb624e95c0759c02d" },
  { title: "Legislação vigente", detail: "Atualizações normativas entram antes do conteúdo histórico.", tag: "BASE", href: "https://app.notion.com/p/3d4cf5a2673181a4a51feed1c396c77b" },
  { title: "Últimos editais aplicáveis", detail: "Gestor 2022, Apoio Administrativo 2017 e Monitor 2017.", tag: "HISTÓRICO", href: "https://app.notion.com/p/3d4cf5a2673181ccb624e95c0759c02d" },
  { title: "Bancos SEEDF", detail: "Questões, erros, simulados, conceitos e discursivas em bancos próprios.", tag: "EXECUÇÃO", href: "https://app.notion.com/p/3d4cf5a26731814e88b1e91e1d4b3208" },
];

const notionMaterialsPage = "https://app.notion.com/p/3d4cf5a2673181a4a51feed1c396c77b";
const d01NotionPage = "https://app.notion.com/p/3d4cf5a2673181fabef1f407c2451392";
const ldbOfficialUrl = "https://www.planalto.gov.br/ccivil_03/leis/l9394compilado.htm";

const studyMaterials = [
  { day: "D01", title: "Português fino + LDB", detail: "Fundamentos e organização", meta: "25 questões", href: d01NotionPage, tone: "gold" },
  { day: "D02", title: "CF/88 Educação + LDB", detail: "Deveres e sistemas", meta: "30 questões", href: "https://app.notion.com/p/3d4cf5a267318134be45ca366aa2cda5", tone: "teal" },
  { day: "D03", title: "PNE 2026 + PNED + LDB", detail: "Atualizações educacionais", meta: "30 questões", href: "https://app.notion.com/p/3d4cf5a2673181cba515e85f76f0804e", tone: "violet" },
  { day: "D04", title: "Administração Geral/Pública + PODC", detail: "Manutenção ativa", meta: "30 questões", href: "https://app.notion.com/p/3d4cf5a267318162b575d24188df79fe", tone: "teal" },
  { day: "D05", title: "LC 840 + atos administrativos", detail: "Pontos finos e atualização 2026", meta: "35 questões", href: "https://app.notion.com/p/3d4cf5a2673181cb92befed47cd317f5", tone: "coral" },
  { day: "D06", title: "Informática atualizada", detail: "Windows 11, Microsoft 365, internet e segurança", meta: "35 questões", href: "https://app.notion.com/p/3d4cf5a2673181dd8545efe40f585297", tone: "violet" },
  { day: "D07", title: "Revisão adaptativa D01–D06", detail: "Recalibração pelos resultados reais", meta: "30 questões · adaptativo", href: "https://app.notion.com/p/3d4cf5a2673181ac9f28e46ce90bf88e", tone: "violet" },
  { day: "D08", title: "Arquivologia + gestão documental", detail: "e-ARQ Brasil 2.0", meta: "35 questões", href: "https://app.notion.com/p/3d4cf5a26731819093ebd77e661ed9dd", tone: "teal" },
  { day: "D09", title: "Qualidade + Processos/BPM + Projetos", detail: "Manutenção aplicada", meta: "30 questões", href: "https://app.notion.com/p/3d4cf5a26731814d9a81e0354b75d6b9", tone: "teal" },
  { day: "D10", title: "Gestão de Pessoas", detail: "Comportamento organizacional", meta: "35 questões", href: "https://app.notion.com/p/3d4cf5a2673181b381fad65285d56860", tone: "coral" },
  { day: "D11", title: "AFO + orçamento público", detail: "Reforço dirigido 2026", meta: "35 questões", href: "https://app.notion.com/p/3d4cf5a2673181f985a9fcffe5e94bfa", tone: "gold" },
  { day: "D12", title: "Materiais + patrimônio + LAI", detail: "Manutenção de alta eficiência", meta: "35 questões", href: "https://app.notion.com/p/3d4cf5a2673181339102dfeed723def3", tone: "teal" },
  { day: "D13", title: "ECA + acessibilidade + Educação Especial", detail: "Núcleo Monitor", meta: "30 questões", href: "https://app.notion.com/p/3d4cf5a26731817db4f3d27a70ed8646", tone: "coral" },
  { day: "D14", title: "Revisão integrada + checkpoint", detail: "Fechamento do Ciclo 01", meta: "40 questões · adaptativo", href: "https://app.notion.com/p/3d4cf5a2673181db8454e5ad9dd90c01", tone: "violet" },
] as const;

const legislationPlan = [
  {
    day: "D01",
    title: "LDB — fundamentos",
    detail: "Arts. 1º–5º e 8º–14º. O art. 26 e suas alterações ficam consolidados no D03.",
    status: "Leitura obrigatória",
    tone: "gold",
    links: [{ label: "LDB compilada", href: ldbOfficialUrl }],
  },
  {
    day: "D02",
    title: "CF/88 + LDB — educação e sistemas",
    detail: "CF, arts. 205–214; LDB, arts. 8º–14º, com foco em competências, deveres e colaboração.",
    status: "Leitura obrigatória",
    tone: "teal",
    links: [
      { label: "Constituição Federal", href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm" },
      { label: "LDB compilada", href: ldbOfficialUrl },
    ],
  },
  {
    day: "D03",
    title: "PNE, PNED e atualizações da LDB",
    detail: "PNE, arts. 1º–20º e metas selecionadas; PNED, núcleo dos arts. 1º–4º; conferir apenas os dispositivos alterados e a redação consolidada.",
    status: "Leitura obrigatória + atualização",
    tone: "violet",
    links: [
      { label: "PNE — Lei 15.388/2026", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15388.htm" },
      { label: "PNED — Lei 14.533/2023", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14533.htm" },
      { label: "Lei 14.644/2023", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14644.htm" },
      { label: "Lei 14.945/2024", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14945.htm" },
      { label: "Lei 15.231/2025", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15231.htm" },
      { label: "Lei 15.369/2026", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15369.htm" },
      { label: "Lei 15.468/2026", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15468.htm" },
    ],
  },
  {
    day: "D04",
    title: "Administração Geral/Pública",
    detail: "CF, art. 37, caput; Decreto-Lei 200, arts. 6º–10º. Portaria SEEDF 167/2026 entra como atualização institucional complementar.",
    status: "Questões primeiro",
    tone: "teal",
    links: [
      { label: "Constituição Federal", href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm" },
      { label: "Decreto-Lei 200/1967", href: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del0200.htm" },
      { label: "Portaria SEEDF 167/2026", href: "https://www.sinj.df.gov.br/sinj/Norma/1ff2ce3031664ac8a9f1b499bf904ab9/Portaria_167_24_02_2026.html" },
    ],
  },
  {
    day: "D05",
    title: "LC 840 e atos administrativos",
    detail: "LC 840, arts. 22–40, com atenção aos pontos reincidentes; Decreto 48.806/2026 como atualização distrital.",
    status: "Leitura obrigatória",
    tone: "coral",
    links: [
      { label: "LC 840/2011", href: "https://www.sinj.df.gov.br/sinj/Norma/70196/LC_840.html" },
      { label: "Decreto 48.806/2026", href: "https://www.sinj.df.gov.br/sinj/Norma/1ea7112d3ff24d658213638f263d87bf/Decreto_48806_18_06_2026.html" },
    ],
  },
  {
    day: "D06",
    title: "Informática atualizada",
    detail: "Não há lei seca nuclear no material fixo. Priorizar Windows 11, Microsoft 365, internet e segurança; LGPD e Marco Civil ficam condicionados ao edital.",
    status: "Fonte técnica",
    tone: "violet",
    links: [],
  },
  {
    day: "D07",
    title: "Revisão adaptativa D01–D06",
    detail: "Nenhuma lei nova. Reabrir somente artigos, dúvidas e erros produzidos nos seis primeiros dias.",
    status: "Revisão pelos dados",
    tone: "violet",
    links: [],
  },
  {
    day: "D08",
    title: "Arquivologia e e-ARQ Brasil",
    detail: "Resoluções CONARQ 48/2021 e 51/2023 entram como complementos; Lei 8.159, arts. 1º–3º e 7º–10º.",
    status: "Leitura complementar",
    tone: "teal",
    links: [
      { label: "Resolução CONARQ 50/2022", href: "https://www.gov.br/conarq/pt-br/legislacao-arquivistica/resolucoes-do-conarq/resolucao-no-50-de-06-de-maio-de-2022" },
      { label: "Lei 8.159/1991", href: "https://www.planalto.gov.br/ccivil_03/leis/l8159.htm" },
    ],
  },
  {
    day: "D09",
    title: "Qualidade, processos e projetos",
    detail: "Não há lei seca nuclear. Estudar conceitos, aplicações e questões do material.",
    status: "Conceitos + questões",
    tone: "teal",
    links: [],
  },
  {
    day: "D10",
    title: "Gestão de Pessoas",
    detail: "Não há lei seca nuclear. Estudar teoria, comportamento organizacional e casos curtos.",
    status: "Teoria + questões",
    tone: "coral",
    links: [],
  },
  {
    day: "D11",
    title: "AFO e orçamento público",
    detail: "CF, arts. 165–169; Lei 4.320; LRF; MTO 2026 e MCASP 11ª edição conforme o material.",
    status: "Leitura obrigatória",
    tone: "gold",
    links: [
      { label: "Constituição Federal", href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm" },
      { label: "Lei 4.320/1964", href: "https://www.planalto.gov.br/ccivil_03/leis/l4320.htm" },
      { label: "LRF — LC 101/2000", href: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm" },
    ],
  },
  {
    day: "D12",
    title: "Materiais, patrimônio e LAI",
    detail: "Lei seca de transparência em reforço pontual; materiais e patrimônio permanecem em manutenção por questões.",
    status: "Reforço pontual",
    tone: "teal",
    links: [
      { label: "LAI — Lei 12.527/2011", href: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm" },
      { label: "Lei Distrital 4.990/2012", href: "https://www.sinj.df.gov.br/sinj/Norma/72983/Lei_4990.html" },
      { label: "Decreto Distrital 34.276/2013", href: "https://www.sinj.df.gov.br/sinj/Norma/74029/decreto_34276_11_04_2013.html" },
    ],
  },
  {
    day: "D13",
    title: "ECA, LBI e Educação Especial Inclusiva",
    detail: "ECA, arts. 1º–6º, 53–59, 98–102 e 131–136; LBI, arts. 1º–4º e 27–30. A Lei 15.450/2026 fica no radar por ainda não estar vigente na auditoria.",
    status: "Leitura + radar normativo",
    tone: "coral",
    links: [
      { label: "ECA — Lei 8.069/1990", href: "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm" },
      { label: "LBI — Lei 13.146/2015", href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm" },
      { label: "Decreto 12.686/2025", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12686.htm" },
      { label: "Decreto 12.773/2025", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12773.htm" },
      { label: "Lei 15.450/2026 — radar", href: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15450.htm" },
    ],
  },
  {
    day: "D14",
    title: "Revisão integrada",
    detail: "Nenhuma leitura nova. A seleção nasce do Caderno de Erros, dúvidas, reincidências e desempenho real do C01.",
    status: "Checkpoint adaptativo",
    tone: "violet",
    links: [],
  },
] as const;

const futureMaterials = [
  { label: "MS03/MS07", detail: "PDE-DF e LODF — transição posterior, sem antecipar novo ciclo." },
  { label: "MS05/MS06", detail: "Direito Administrativo e LC 840 — aprofundar conforme lacunas reais." },
  { label: "MS13", detail: "Lei 14.133/2021 — licitações e contratos." },
  { label: "MS15/MS16", detail: "Tecnologia, segurança, arquivologia e preservação digital." },
];

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "teal" | "violet" | "coral" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function StatCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string; detail: string; tone: string }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-icon"><Icon size={18} strokeWidth={2.1} /></div>
      <div>
        <p className="eyebrow">{label}</p>
        <p className="stat-value">{value}</p>
        <p className="stat-detail">{detail}</p>
      </div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function Overview({ onNavigate, snapshot }: { onNavigate: (section: SectionId) => void; snapshot: DashboardSnapshot | null }) {
  const nextAction = snapshot?.dashboard.next_action ?? "D01 · Português fino + LDB";
  const plannedQuestions = snapshot?.dashboard.planned_questions ?? 385;
  const projectedQuestions = snapshot?.dashboard.projected_questions ?? 455;
  const executedQuestions = snapshot?.dashboard.executed_questions ?? 0;
  const verticalizedAxes = snapshot?.dashboard.verticalized_axes ?? 60;
  const jobsCount = snapshot?.dashboard.jobs ?? 3;
  const executionRate = plannedQuestions > 0 ? Math.round((executedQuestions / plannedQuestions) * 100) : 0;
  return (
    <>
      <section className="hero-grid">
        <div className="hero-card">
          <div className="hero-kicker"><span className="live-dot" /> Fase 1 ativa · Ciclo 01 liberado</div>
          <h1>O próximo passo está definido.</h1>
          <p className="hero-copy">Comece pelo D01 e transforme o plano SEEDF em execução real. O painel acompanha o que foi estudado, não o que ficou bonito na planilha.</p>
          <div className="hero-action-row">
            <button className="primary-button" onClick={() => onNavigate("estudar")}>Abrir D01 <ArrowRight size={17} /></button>
            <span className="hero-note"><Clock3 size={15} /> Dias efetivamente estudados</span>
          </div>
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
        </div>
        <div className="focus-card">
          <div className="focus-topline"><span>FOCO DE HOJE</span><StatusPill tone="gold">D01</StatusPill></div>
          <h3>{nextAction}</h3>
          <p>Primeira unidade de execução do C01. Teoria curta, questões registradas no banco SEEDF e fechamento do dia.</p>
          <div className="focus-rule" />
          <div className="focus-meta"><span><Target size={15} /> Meta inicial</span><strong>25 questões</strong></div>
          <div className="focus-meta"><span><TimerReset size={15} /> Estado</span><strong>Próximo</strong></div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Resumo do projeto">
        <StatCard icon={Layers3} label="Eixos verticalizados" value={String(verticalizedAxes)} detail="24 manutenção · 25 reforço · 11 novos" tone="blue" />
        <StatCard icon={Target} label="Carga fixa do C01" value={String(plannedQuestions)} detail="Questões sincronizadas do Notion" tone="gold" />
        <StatCard icon={TrendingUp} label="Projeção do C01" value={`≈ ${projectedQuestions}`} detail="Inclui checkpoints adaptativos" tone="teal" />
        <StatCard icon={GraduationCap} label="Cargos-meta" value={String(jobsCount)} detail="Gestor + dois Analistas PPGE" tone="violet" />
      </section>

      <section className="content-grid two-thirds">
        <div className="panel workload-panel">
          <SectionHeading eyebrow="CICLO 01 · SNAPSHOT PRÉ-EXECUÇÃO" title="Onde a energia deve entrar" description="A carga abaixo é planejamento. Ela ainda não é desempenho." action={<StatusPill>{executionRate}% executado</StatusPill>} />
          <div className="workload-list">
            {workload.map((item) => <div className="workload-row" key={item.label}><div className="workload-label"><span className={`workload-dot dot-${item.tone}`} /><strong>{item.label}</strong><span>{item.blocks} blocos</span></div><div className="workload-track"><span className={`workload-fill fill-${item.tone}`} style={{ width: `${item.questions ? Math.max(6, (item.questions / 175) * 100) : 0}%` }} /></div><strong className="workload-number">{item.questions}</strong></div>)}
          </div>
          <div className="panel-footnote"><CircleAlert size={15} /> Os números só mudam quando você registra questões feitas, acertos, erros e dúvidas no banco detalhado.</div>
        </div>

        <div className="panel integrity-panel">
          <SectionHeading eyebrow="GOVERNANÇA" title="Fonte sob controle" />
          <div className="integrity-status"><span className="check-mark"><Check size={15} /></span><div><strong>Projeto segregado</strong><p>SEEDF não compartilha métricas com TDAS, EDAS ou TJDFT.</p></div></div>
          <div className="integrity-status"><span className="check-mark"><Check size={15} /></span><div><strong>Fonte operacional</strong><p>Notion SEEDF é a referência; o site é a camada de acompanhamento.</p></div></div>
          <div className="integrity-status"><span className="check-mark"><Check size={15} /></span><div><strong>Sem progresso artificial</strong><p>O painel começa em zero até a primeira sessão real.</p></div></div>
          <button className="text-button" onClick={() => onNavigate("materiais")}>Ver fontes do projeto <ChevronRight size={16} /></button>
        </div>
      </section>

      <section className="panel cycle-panel">
        <SectionHeading eyebrow="ROADMAP" title="Fase 1 · Construção e consolidação" description="56 dias de estudo de referência, organizados em quatro ciclos de 14 dias efetivamente estudados." action={<button className="text-button" onClick={() => onNavigate("fases")}>Abrir fases <ChevronRight size={16} /></button>} />
        <div className="phase-rail"><div className="phase-rail-line" />{["C01", "C02", "C03", "C04"].map((cycle, index) => <div className={`phase-node ${index === 0 ? "phase-active" : "phase-locked"}`} key={cycle}><span className="phase-node-circle">{index === 0 ? <Check size={15} /> : index + 1}</span><strong>{cycle}</strong><span>{index === 0 ? "Ativo · D01" : "Bloqueado pela sequência"}</span></div>)}</div>
      </section>

      <section className="content-grid jobs-grid">
        <div className="panel jobs-panel">
          <SectionHeading eyebrow="CARGOS-META" title="Uma preparação, três portas" description="O núcleo comum sustenta as três trilhas; o peso de cada cargo continua separado." action={<button className="text-button" onClick={() => onNavigate("cargos")}>Detalhar cargos <ChevronRight size={16} /></button>} />
          <div className="job-cards">{jobs.map((job) => <JobCard job={job} key={job.code} compact />)}</div>
        </div>
        <div className="panel no-data-panel"><div className="empty-icon"><BarChart3 size={22} /></div><p className="eyebrow">DESEMPENHO SEEDF</p><h3>Ainda não há desempenho executado.</h3><p>Isso é correto: o C01 está preparado, mas o diagnóstico deve nascer das suas próprias sessões.</p><button className="secondary-button" onClick={() => onNavigate("estudar")}>Começar D01 <ArrowRight size={16} /></button></div>
      </section>
    </>
  );
}

function JobCard({ job, compact = false }: { job: typeof jobs[number]; compact?: boolean }) {
  return <article className={`job-card job-${job.tone} ${compact ? "job-compact" : ""}`}><div className="job-code">{job.code}</div><div className="job-content"><div className="job-title-row"><h3>{job.title}</h3><StatusPill tone={job.tone === "gold" ? "gold" : job.tone === "teal" ? "teal" : "violet"}>{job.priority}</StatusPill></div><strong>{job.subtitle}</strong><p>{job.source}</p></div>{!compact && <div className="job-metrics"><span>Domínio inicial</span><strong>Em diagnóstico</strong></div>}</article>;
}

function StudyToday() {
  const [checked, setChecked] = useState<string[]>([]);
  const [sessionStarted, setSessionStarted] = useState(false);
  const checklist = [
    { id: "portugues", label: "Executar Português fino", detail: "Revisão objetiva + resolução orientada" },
    { id: "ldb", label: "Ler LDB no recorte do dia", detail: "Leitura seca com marcação de conceitos" },
    { id: "questoes", label: "Registrar questões e resultado", detail: "Feitas, acertos, erros e acertos com dúvida" },
    { id: "fechamento", label: "Fechar o D01", detail: "Só avançar quando todas as linhas estiverem corrigidas" },
  ];
  const progress = Math.round((checked.length / checklist.length) * 100);
  return <div className="inner-page"><section className="page-intro"><div><p className="eyebrow">EXECUÇÃO DIÁRIA · SEEDF</p><h1>D01 · Português fino + LDB</h1><p>O primeiro dia não precisa ser perfeito. Precisa ser registrado.</p></div><StatusPill tone="gold">Próximo</StatusPill></section><section className="content-grid two-thirds study-layout"><div className="panel study-main-panel"><div className="study-progress-head"><div><p className="eyebrow">CHECKLIST DE EXECUÇÃO</p><h2>Feche o dia na ordem certa</h2></div><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="checklist">{checklist.map((item) => { const isChecked = checked.includes(item.id); return <button className={`check-row ${isChecked ? "is-checked" : ""}`} key={item.id} onClick={() => setChecked((current) => isChecked ? current.filter((id) => id !== item.id) : [...current, item.id])}><span className="checkbox">{isChecked && <Check size={14} />}</span><span className="check-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={17} /></button>; })}</div><div className="study-actions"><button className="primary-button" onClick={() => setSessionStarted((value) => !value)}>{sessionStarted ? "Pausar sessão" : "Iniciar sessão"}<TimerReset size={16} /></button><span>{sessionStarted ? "Sessão em andamento neste dispositivo" : "O cronômetro real entra na execução"}</span></div><div className="study-source-links"><p className="eyebrow">MATERIAL DO DIA</p><div><a className="resource-link" href={d01NotionPage} target="_blank" rel="noreferrer">Abrir D01 completo no Notion <ArrowRight size={15} /></a><a className="resource-link" href={ldbOfficialUrl} target="_blank" rel="noreferrer">Abrir LDB compilada <ArrowRight size={15} /></a></div></div></div><aside className="panel day-rule-panel"><div className="day-badge">D01</div><p className="eyebrow">REGRA DO DIA</p><h3>Estude, registre, feche.</h3><p>O Banco de Dias agrega os números a partir das linhas detalhadas do Banco de Controle de Questões. Não lance os totais duas vezes.</p><div className="rule-list"><div><Check size={15} /> Dias não estudados não viram atraso.</div><div><Check size={15} /> D07 só nasce dos resultados de D01–D06.</div><div><Check size={15} /> O site não cria desempenho sem dado real.</div></div></aside></section><section className="panel next-days-panel"><SectionHeading eyebrow="SEQUÊNCIA" title="O C01 já está preparado" description="Os próximos dias permanecem não iniciados até a execução real." /><div className="day-strip">{dayRows.slice(0, 7).map((row) => <DayCard row={row} key={row.day} />)}</div></section></div>;
}

function DayCard({ row }: { row: typeof dayRows[number] }) {
  return <article className={`day-card day-${row.state}`}><div className="day-card-top"><strong>{row.day}</strong><span className="day-state-dot" /></div><h3>{row.label}</h3><p>{row.detail}</p><span>{row.meta}</span></article>;
}

function Phases() {
  const phases = [{name:"Fase 1", title:"Construção e consolidação pré-edital", detail:"C01–C04 · 56 dias de referência", status:"Ativa · C01", tone:"active"},{name:"Fase 2", title:"Pré-edital adaptativo", detail:"C05 em diante, se o edital ainda não sair", status:"Bloqueada", tone:"locked"},{name:"Fase 3", title:"Pós-edital", detail:"Edital oficial → prova", status:"Aguardando gatilho", tone:"waiting"}];
  return <div className="inner-page"><section className="page-intro"><div><p className="eyebrow">ARQUITETURA DE PREPARAÇÃO</p><h1>Fases e ciclos sem calendário artificial</h1><p>A unidade de avanço é o dia efetivamente estudado. Pausa suspende a sequência; não cria dívida.</p></div><StatusPill tone="teal">Fase 1 ativa</StatusPill></section><section className="panel roadmap-large"><SectionHeading eyebrow="ROADMAP OFICIAL" title="Três fases, um gatilho superior" description="O edital publicado interrompe a lógica pré-edital e passa a comandar o projeto." /><div className="phase-table">{phases.map((phase, index) => <div className={`phase-table-row ${phase.tone}`} key={phase.name}><div className="phase-number">0{index + 1}</div><div><p className="eyebrow">{phase.name}</p><h3>{phase.title}</h3><p>{phase.detail}</p></div><StatusPill tone={phase.tone === "active" ? "teal" : "neutral"}>{phase.status}</StatusPill></div>)}</div></section><section className="panel cycle-detail-panel"><SectionHeading eyebrow="CICLO 01" title="14 dias efetivamente estudados" description="D01 está liberado. D02–D06 e D08–D13 estão preparados. D07 e D14 dependem dos resultados reais." /><div className="day-grid">{dayRows.map((row) => <DayCard row={row} key={row.day} />)}</div></section></div>;
}

function Jobs() {
  return <div className="inner-page"><section className="page-intro"><div><p className="eyebrow">EDITAL PROJETADO · 60 EIXOS</p><h1>Cargos-meta e trilhas de cobrança</h1><p>O núcleo comum conversa com os três cargos; a prioridade e o aprofundamento continuam visíveis.</p></div><StatusPill tone="gold">v0.2 · 07/09/2026</StatusPill></section><section className="job-list">{jobs.map((job) => <JobCard job={job} key={job.code} />)}</section><section className="content-grid three-columns"><div className="panel mini-metric"><p className="eyebrow">MANUTENÇÃO</p><strong>24</strong><span>eixos com base histórica pertinente</span></div><div className="panel mini-metric"><p className="eyebrow">REFORÇO</p><strong>25</strong><span>eixos que pedem teoria + questões</span></div><div className="panel mini-metric"><p className="eyebrow">NOVOS</p><strong>11</strong><span>eixos sem domínio presumido</span></div></section></div>;
}

function Progress() {
  const totalPlanned = useMemo(() => workload.reduce((sum, item) => sum + item.questions, 0), []);
  return <div className="inner-page"><section className="page-intro"><div><p className="eyebrow">PAINÉIS E PROGRESSO</p><h1>O painel começa em zero por honestidade</h1><p>O C01 está planejado; ainda não está executado. A diferença é exatamente o que protege sua decisão.</p></div><StatusPill>Sem sessões registradas</StatusPill></section><section className="stats-grid progress-stats"><StatCard icon={Check} label="Questões feitas" value="0" detail={`de ${totalPlanned} fixas no C01`} tone="blue" /><StatCard icon={TrendingUp} label="Precisão" value="—" detail="Aparece após a primeira correção" tone="teal" /><StatCard icon={CircleAlert} label="Caderno de erros" value="0" detail="Nenhum erro SEEDF importado" tone="coral" /><StatCard icon={Clock3} label="Tempo médio" value="—" detail="Exige volume de execução" tone="violet" /></section><section className="content-grid two-thirds"><div className="panel empty-chart"><div className="empty-chart-lines"><span /><span /><span /><span /><span /></div><div className="empty-chart-message"><div className="empty-icon"><BarChart3 size={21} /></div><h3>Gráfico liberado após a primeira sessão</h3><p>O painel vai mostrar evolução por cargo, matéria, assunto, acertos, erros, omissões e tempo médio quando houver dados reais.</p></div></div><div className="panel decision-panel"><p className="eyebrow">DECISÃO DO PAINEL</p><h3>Agora, estudar. Depois, recalibrar.</h3><p>Não ajuste a carga antes de existir evidência SEEDF. O histórico TDAS/EDAS serve para o estado inicial dos tópicos, não para fabricar acurácia.</p><div className="decision-quote">“Métrica sem decisão não entra como KPI principal.”</div></div></section></div>;
}

function Materials() {
  return <div className="inner-page"><section className="page-intro"><div><p className="eyebrow">BIBLIOTECA SEEDF</p><h1>Fontes que alimentam a preparação</h1><p>O site organiza o acesso. A verdade continua no material oficial e no Notion operacional.</p></div><StatusPill tone="teal">Fonte: Notion SEEDF</StatusPill></section><section className="source-grid">{sources.map((source) => <article className="panel source-card" key={source.title}><div className="source-card-top"><span className="source-icon"><FileCheck2 size={18} /></span><StatusPill>{source.tag}</StatusPill></div><h3>{source.title}</h3><p>{source.detail}</p><a className="text-button" href={source.href} target="_blank" rel="noreferrer">Abrir no Notion <ChevronRight size={16} /></a></article>)}</section><section className="panel materials-roadmap"><SectionHeading eyebrow="CICLO 01 · MATERIAL COMPLETO" title="Materiais do D01 ao D14" description="Cada cartão abre a página correspondente no Notion. A meta e o estado seguem a sequência operacional do C01." action={<a className="text-button" href={notionMaterialsPage} target="_blank" rel="noreferrer">Abrir biblioteca no Notion <ChevronRight size={16} /></a>} /><div className="material-grid">{studyMaterials.map((material) => <article className={`material-card material-${material.tone}`} key={material.day}><div className="material-card-top"><span className="material-day">{material.day}</span><StatusPill tone={material.tone === "coral" ? "coral" : material.tone === "gold" ? "gold" : material.tone === "violet" ? "violet" : "teal"}>{material.meta}</StatusPill></div><h3>{material.title}</h3><p>{material.detail}</p><a className="text-button" href={material.href} target="_blank" rel="noreferrer">Abrir material <ArrowRight size={15} /></a></article>)}</div></section><section className="panel legislation-panel"><SectionHeading eyebrow="LEITURA LEGISLATIVA · AUDITORIA 08/09/2026" title="Leis e fontes oficiais por dia" description="O roteiro abaixo foi organizado a partir da página de materiais do Notion. “Sem lei seca nuclear” significa que o dia prioriza material técnico, conceitos ou revisão adaptativa." action={<a className="text-button" href={notionMaterialsPage} target="_blank" rel="noreferrer">Ver roteiro no Notion <ChevronRight size={16} /></a>} /><div className="legislation-list">{legislationPlan.map((item) => <article className={`legislation-item legislation-${item.tone}`} key={item.day}><div className="legislation-day">{item.day}</div><div className="legislation-body"><div className="legislation-title-row"><h3>{item.title}</h3><StatusPill tone={item.tone === "coral" ? "coral" : item.tone === "gold" ? "gold" : item.tone === "violet" ? "violet" : "teal"}>{item.status}</StatusPill></div><p>{item.detail}</p>{item.links.length > 0 ? <div className="law-links">{item.links.map((link) => <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label} <ArrowRight size={13} /></a>)}</div> : <span className="law-empty">Sem lei seca nuclear neste recorte</span>}</div></article>)}</div></section><section className="panel future-materials"><SectionHeading eyebrow="FILA POSTERIOR · NOTION" title="Materiais já previstos para depois do C01" description="Eles permanecem no repositório, mas não deslocam o D01 nem antecipam um novo ciclo." action={<a className="text-button" href={notionMaterialsPage} target="_blank" rel="noreferrer">Abrir materiais sequenciais <ChevronRight size={16} /></a>} /><div className="future-material-grid">{futureMaterials.map((material) => <div className="future-material" key={material.label}><strong>{material.label}</strong><span>{material.detail}</span></div>)}</div></section><section className="panel materials-note"><div className="note-icon"><CircleAlert size={19} /></div><div><p className="eyebrow">REGRA-MÃE</p><h3>Fonte oficial atualizada prevalece sobre resumo antigo.</h3><p>O Notion mantém o material completo; o site oferece uma visão rápida, com links para a fonte oficial e para cada página do C01.</p></div></section></div>;
}

export default function Home() {
  const [section, setSection] = useState<SectionId>("inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState("Notion · carregando...");
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [syncMode, setSyncMode] = useState<"live" | "fallback" | "error">("error");
  const handleNavigate = (next: SectionId) => { setSection(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const readSnapshot = async (url: string, options: RequestInit = {}) => {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}ts=${Date.now()}`, { ...options, cache: "no-store" });
    if (!response.ok) throw new Error("Snapshot indisponível");
    const candidate: unknown = await response.json();
    if (!isDashboardSnapshot(candidate)) throw new Error("Snapshot inválido");
    return candidate;
  };
  const refreshSnapshot = async () => {
    setRefreshing(true);
    setSyncError(false);
    try {
      const candidate = await readSnapshot(LIVE_NOTION_API_URL, {
        headers: {
          Accept: "application/json",
          apikey: LIVE_NOTION_API_KEY,
          Authorization: `Bearer ${LIVE_NOTION_API_KEY}`,
        },
      });
      setSnapshot(candidate);
      setSyncMode("live");
      setLastUpdated(`Notion · ao vivo · ${formatSnapshotDate(candidate.source.synced_at)}`);
    } catch {
      try {
        const candidate = await readSnapshot("./data/seedf-snapshot.json");
        setSnapshot(candidate);
        setSyncMode("fallback");
        setLastUpdated(`GitHub · backup · ${formatSnapshotDate(candidate.source.synced_at)}`);
      } catch {
        setSyncMode("error");
        setSyncError(true);
        setLastUpdated("Notion · indisponível");
      }
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const fallback = await readSnapshot("./data/seedf-snapshot.json");
        if (!cancelled) {
          setSnapshot(fallback);
          setSyncMode("fallback");
          setLastUpdated(`GitHub · backup · ${formatSnapshotDate(fallback.source.synced_at)}`);
        }
      } catch {
        // A live request below can still initialize the dashboard when no backup is available.
      }

      if (!cancelled) void refreshSnapshot();
    };

    void initialize();
    return () => { cancelled = true; };
  }, []);
  const activeLabel = navigation.find((item) => item.id === section)?.label ?? "Visão geral";
  const nextAction = snapshot?.dashboard.next_action ?? "D01 · Português fino + LDB";
  return <main className="site-shell"><aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}><div className="brand-block"><div className="brand-mark">S</div><div><strong>SEEDF</strong><span>PPGE · Dashboard PRO</span></div><button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={18} /></button></div><div className="sidebar-context"><span className="live-dot" /> Pré-edital 2026/2027</div><nav className="main-nav" aria-label="Navegação principal">{navigation.map((item) => { const Icon = item.icon; const active = section === item.id; return <button className={`nav-item ${active ? "nav-active" : ""}`} key={item.id} onClick={() => handleNavigate(item.id)}><Icon size={18} /><span>{item.label}</span>{active && <span className="nav-indicator" />}</button>; })}</nav><div className="sidebar-bottom"><div className="sidebar-card"><p className="eyebrow">PRÓXIMA AÇÃO</p><strong>{nextAction}</strong><button onClick={() => handleNavigate("estudar")}>Abrir execução <ArrowRight size={15} /></button></div><div className="sidebar-footer"><span className="source-dot" /> Notion como fonte operacional</div></div></aside>{menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}<div className="main-column"><header className="topbar"><div className="topbar-left"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div><span className="breadcrumb">SEEDF PPGE</span><strong>{activeLabel}</strong></div></div><div className="topbar-actions"><span className={`sync-label ${syncError ? "sync-error" : syncMode === "fallback" ? "sync-fallback" : ""}`}><span className="source-dot" /> {lastUpdated}</span><button className={`refresh-button ${refreshing ? "is-refreshing" : ""}`} onClick={refreshSnapshot} disabled={refreshing} aria-label="Atualizar dados do Notion" title="Consultar a API do Notion agora"><RefreshCw size={17} /></button></div></header><div className="page-content">{section === "inicio" && <Overview onNavigate={handleNavigate} snapshot={snapshot} />}{section === "estudar" && <StudyToday />}{section === "fases" && <Phases />}{section === "cargos" && <Jobs />}{section === "progresso" && <Progress />}{section === "materiais" && <Materials />}</div><footer className="site-footer"><span>SEEDF PPGE · Projeto exclusivo</span><span>{syncMode === "live" ? `Notion ao vivo · ${formatSnapshotDate(snapshot?.source?.synced_at ?? null)}` : syncMode === "fallback" ? `Backup do GitHub · ${formatSnapshotDate(snapshot?.source?.synced_at ?? null)}` : "Notion · indisponível"}</span></footer></div></main>;
}
