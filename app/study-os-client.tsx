"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Home,
  Layers3,
  Menu,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { buildSeedfIntelligence } from "@/lib/seedf-intelligence.mjs";

export type StudyOsView =
  | "home"
  | "today"
  | "mentor"
  | "performance"
  | "risks"
  | "errors"
  | "reviews"
  | "edital"
  | "quality"
  | "trail";

type Props = {
  view: StudyOsView;
  basePrefix: "./" | "../";
};

type Payload = {
  snapshot: any;
  laws: any;
  bank: any;
  edital: any;
};

const viewTitle: Record<StudyOsView, string> = {
  home: "Início",
  today: "Hoje",
  mentor: "Mentor",
  performance: "Desempenho",
  risks: "Riscos",
  errors: "Caderno de erros",
  reviews: "Revisões",
  edital: "Edital",
  quality: "Qualidade dos dados",
  trail: "Trilha",
};

const navGroups = [
  {
    label: "Operação",
    items: [
      ["home", "", "Início"],
      ["today", "hoje/", "Hoje"],
      ["trail", "trilha/", "Trilha"],
      ["leis", "leis/", "Leis Primeiro"],
      ["reviews", "revisoes/", "Revisões"],
    ],
  },
  {
    label: "Diagnóstico",
    items: [
      ["mentor", "mentor/", "Mentor"],
      ["errors", "erros/", "Caderno de erros"],
      ["performance", "desempenho/", "Desempenho"],
      ["risks", "riscos/", "Riscos"],
    ],
  },
  {
    label: "Cobertura",
    items: [["edital", "edital/", "Edital"]],
  },
  {
    label: "Sistema",
    items: [["quality", "qualidade/", "Qualidade"]],
  },
];

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return map.year + "-" + map.month + "-" + map.day;
}

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("pt-BR").format(n) : "—";
}

function formatPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—";
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const text = String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : text;
}

function toneForState(state: string) {
  if (state === "atrasado") return "danger";
  if (state === "hoje") return "gold";
  if (state === "pendente-sem-data") return "violet";
  return "neutral";
}

function actionIcon(kind: string) {
  if (kind === "resume") return TimerReset;
  if (kind === "review") return RefreshCcw;
  if (kind === "error") return CircleAlert;
  if (kind === "law") return BookOpenCheck;
  return Target;
}

function resolveHref(basePrefix: string, href: string | null | undefined) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return basePrefix + href.replace(/^\.?\//, "");
}

function SmartLink({
  href,
  basePrefix,
  className,
  children,
}: {
  href?: string | null;
  basePrefix: string;
  className?: string;
  children: React.ReactNode;
}) {
  const resolved = resolveHref(basePrefix, href);
  if (!resolved) return <span className={className}>{children}</span>;
  const external = /^https?:\/\//i.test(resolved);
  return (
    <a className={className} href={resolved} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

function Metric({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <article className="os-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="os-empty"><CheckCircle2 size={18} />{children}</div>;
}

function Loading() {
  return (
    <main className="os-loading">
      <RefreshCcw className="os-spin" size={22} />
      <strong>Lendo os snapshots do Notion…</strong>
      <span>Sem inventar zero enquanto os dados chegam.</span>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="os-loading">
      <AlertTriangle size={24} />
      <strong>Não foi possível montar a inteligência.</strong>
      <span>{message}</span>
    </main>
  );
}

function DecisionCard({ intel, basePrefix }: { intel: any; basePrefix: string }) {
  const Icon = actionIcon(intel.nextAction.kind);
  return (
    <section className="os-decision">
      <div className="os-decision-icon"><Icon size={24} /></div>
      <div className="os-decision-copy">
        <span className="os-eyebrow">{intel.nextAction.eyebrow}</span>
        <h2>{intel.nextAction.title}</h2>
        <p>{intel.nextAction.reason}</p>
        <div className="os-evidence">
          {(intel.nextAction.evidence || []).map((item: string, index: number) => <span key={index}>{item}</span>)}
          <span>{intel.nextAction.confidence}</span>
        </div>
      </div>
      <SmartLink href={intel.nextAction.href} basePrefix={basePrefix} className="os-primary">
        Executar agora <ArrowRight size={16} />
      </SmartLink>
    </section>
  );
}

function Agenda({ intel, basePrefix, limit }: { intel: any; basePrefix: string; limit?: number }) {
  const items = typeof limit === "number" ? intel.agenda.slice(0, limit) : intel.agenda;
  if (!items.length) return <Empty>Nenhum compromisso operacional calculável.</Empty>;
  return (
    <div className="os-stack">
      {items.map((item: any, index: number) => (
        <SmartLink href={item.href} basePrefix={basePrefix} className="os-row" key={item.kind + "-" + index}>
          <div>
            <span className={"os-chip os-chip-" + toneForState(item.state)}>{item.state}</span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </div>
          <ChevronRight size={16} />
        </SmartLink>
      ))}
    </div>
  );
}

function HomeView({ intel, data, basePrefix }: { intel: any; data: Payload; basePrefix: string }) {
  const law = intel.coverage.law;
  const topWeakness = intel.weaknesses[0];
  const topStrength = intel.strengths[0];
  return (
    <>
      <DecisionCard intel={intel} basePrefix={basePrefix} />
      <section className="os-metrics-grid">
        <Metric label="Questões conhecidas" value={formatNumber(intel.state.knownQuestions)} detail="zero apenas quando explícito" />
        <Metric label="Sessões concluídas" value={formatNumber(intel.state.sessions)} detail={intel.state.interrupted ? intel.state.interrupted + " em retomada" : "sem interrupção ativa"} />
        <Metric label="Erros ativos" value={formatNumber(intel.state.activeErrors)} detail="fechados ficam fora" />
        <Metric label="Riscos com evidência" value={formatNumber(intel.state.risks)} detail="sem alerta por palpite" />
      </section>

      <section className="os-grid os-grid-2">
        <article className="os-panel">
          <div className="os-section-head"><div><span className="os-eyebrow">ONDE ESTOU</span><h3>Leis Primeiro</h3></div><SmartLink href="leis/" basePrefix={basePrefix}>Abrir trilha →</SmartLink></div>
          <div className="os-progress-states">
            <Metric label="Disponíveis" value={formatNumber(law.available)} />
            <Metric label="Estudadas" value={formatNumber(law.studied)} />
            <Metric label="Praticadas" value={formatNumber(law.practiced)} />
            <Metric label="Com evidência" value={formatNumber(law.evidenced)} />
            <Metric label="Consolidadas" value={formatNumber(law.consolidated)} />
          </div>
          <p className="os-note">Publicada ≠ estudada ≠ praticada ≠ consolidada.</p>
        </article>
        <article className="os-panel">
          <div className="os-section-head"><div><span className="os-eyebrow">O QUE VEM DEPOIS</span><h3>Agenda operacional</h3></div><SmartLink href="hoje/" basePrefix={basePrefix}>Ver Hoje →</SmartLink></div>
          <Agenda intel={intel} basePrefix={basePrefix} limit={5} />
        </article>
      </section>

      <section className="os-grid os-grid-2">
        <article className="os-panel">
          <div className="os-section-head"><div><span className="os-eyebrow">ONDE ESTOU ERRANDO</span><h3>Fragilidade com evidência</h3></div><SmartLink href="desempenho/" basePrefix={basePrefix}>Desempenho →</SmartLink></div>
          {topWeakness ? (
            <div className="os-highlight os-highlight-danger">
              <strong>{topWeakness.code} · {topWeakness.title}</strong>
              <span>{formatPercent(topWeakness.accuracy)} · {topWeakness.confidence.label}</span>
              <p>{topWeakness.label}</p>
            </div>
          ) : <Empty>Nenhuma fragilidade estatística sustentada por amostra disponível.</Empty>}
        </article>
        <article className="os-panel">
          <div className="os-section-head"><div><span className="os-eyebrow">ONDE ESTOU BEM</span><h3>Força real</h3></div><SmartLink href="desempenho/" basePrefix={basePrefix}>Abrir análise →</SmartLink></div>
          {topStrength ? (
            <div className="os-highlight os-highlight-good">
              <strong>{topStrength.code} · {topStrength.title}</strong>
              <span>{formatPercent(topStrength.accuracy)} · {topStrength.confidence.label}</span>
              <p>{topStrength.strength}</p>
            </div>
          ) : <Empty>Ainda não há força com amostra suficiente. Um 3/3 bonito não ganha coroa. 👑</Empty>}
        </article>
      </section>

      <section className="os-grid os-grid-2">
        <article className="os-panel">
          <div className="os-section-head"><div><span className="os-eyebrow">HÁ RISCO?</span><h3>Sinais relevantes</h3></div><SmartLink href="riscos/" basePrefix={basePrefix}>Ver riscos →</SmartLink></div>
          {intel.risks.length ? intel.risks.slice(0, 3).map((risk: any) => (
            <div className="os-mini-risk" key={risk.id}><AlertTriangle size={16}/><div><strong>{risk.title}</strong><small>{risk.action} · {risk.confidence}</small></div></div>
          )) : <Empty>Sem riscos sustentados pelos dados atuais.</Empty>}
        </article>
        <article className="os-panel">
          <div className="os-section-head"><div><span className="os-eyebrow">INTEGRIDADE</span><h3>Qualidade dos dados</h3></div><SmartLink href="qualidade/" basePrefix={basePrefix}>Auditar →</SmartLink></div>
          <div className="os-quality-summary">
            <Metric label="Erros" value={intel.quality.errorCount} />
            <Metric label="Alertas" value={intel.quality.alertCount} />
            <Metric label="Informativos" value={intel.quality.infoCount} />
          </div>
          <p className="os-note">O site sinaliza inconsistências; não corrige silenciosamente o Notion.</p>
        </article>
      </section>
    </>
  );
}

function TodayView({ intel, basePrefix }: { intel: any; basePrefix: string }) {
  return (
    <>
      <DecisionCard intel={intel} basePrefix={basePrefix} />
      <section className="os-grid os-grid-2">
        <article className="os-panel">
          <span className="os-eyebrow">ORDEM DE EXECUÇÃO</span>
          <h3>Hoje, sem atrito</h3>
          <Agenda intel={intel} basePrefix={basePrefix} />
        </article>
        <article className="os-panel">
          <span className="os-eyebrow">CONTINUIDADE CANÔNICA</span>
          <h3>Depois da intervenção</h3>
          <div className="os-continuity">
            <div><BookOpenCheck size={18}/><span>Leis Primeiro</span><strong>{intel.continuity.law || "—"}</strong></div>
            <div><Layers3 size={18}/><span>Ciclo principal</span><strong>{intel.continuity.c01 || "—"}</strong></div>
          </div>
          <p className="os-note">A agenda contextualiza o tempo, mas não reordena arbitrariamente a sequência pedagógica.</p>
        </article>
      </section>
      <section className="os-panel">
        <span className="os-eyebrow">REVISÕES</span>
        <h3>D0 · D7 · D20</h3>
        {intel.reviews.length ? <Agenda intel={{ agenda: intel.reviews.map((item: any) => ({...item, detail: item.reason})) }} basePrefix={basePrefix} /> : <Empty>Nenhuma revisão datada ou fechamento D0 pendente calculável.</Empty>}
      </section>
    </>
  );
}

function MentorView({ intel, basePrefix }: { intel: any; basePrefix: string }) {
  return (
    <>
      <DecisionCard intel={intel} basePrefix={basePrefix} />
      <section className="os-grid os-grid-2">
        <article className="os-panel">
          <span className="os-eyebrow">POR QUE ESSA DECISÃO?</span>
          <h3>Evidências e prioridade</h3>
          <div className="os-score"><strong>{intel.nextAction.score}</strong><span>/100</span></div>
          <p>{intel.nextAction.reason}</p>
          <div className="os-evidence os-evidence-dark">{intel.nextAction.evidence.map((item: string, index: number)=><span key={index}>{item}</span>)}</div>
        </article>
        <article className="os-panel">
          <span className="os-eyebrow">METODOLOGIA EXPLICÁVEL</span>
          <h3>O Mentor não é caixa-preta</h3>
          <div className="os-method-list">
            {Object.entries(intel.methodology).map(([key, value]) => <div key={key}><strong>{key}</strong><span>{String(value)}</span></div>)}
          </div>
        </article>
      </section>
      <section className="os-panel">
        <div className="os-section-head"><div><span className="os-eyebrow">INTERVENÇÕES POSSÍVEIS</span><h3>Riscos e fragilidades ordenados por evidência</h3></div></div>
        {intel.risks.length ? <div className="os-card-grid">{intel.risks.map((risk: any)=>(
          <article className="os-card" key={risk.id}>
            <span className="os-chip os-chip-danger">{risk.kind} · {risk.score}/100</span>
            <h4>{risk.title}</h4>
            <p>{risk.impact}</p>
            <small>{risk.confidence}</small>
            <SmartLink href={risk.href} basePrefix={basePrefix} className="os-text-link">Executar ação →</SmartLink>
          </article>
        ))}</div> : <Empty>Sem intervenção extraordinária. O Mentor preserva a continuidade canônica.</Empty>}
      </section>
    </>
  );
}

function PerformanceView({ intel, data, basePrefix }: { intel: any; data: Payload; basePrefix: string }) {
  const c01=data.snapshot?.execution?.c01?.totals || {};
  return (
    <>
      <section className="os-metrics-grid">
        <Metric label="Ciclo C01 · feitas" value={formatNumber(c01.done)} detail={c01.done === null ? "não informado" : "questões"} />
        <Metric label="Ciclo C01 · acertos" value={formatNumber(c01.correct)} />
        <Metric label="Leis · sessões" value={formatNumber(intel.state.sessions)} />
        <Metric label="Leis · evidência" value={formatNumber(intel.coverage.law.evidenced)} detail="normas com resultado calculável" />
      </section>
      <section className="os-panel">
        <div className="os-section-head"><div><span className="os-eyebrow">DESEMPENHO POR NORMA</span><h3>Amostra antes do adjetivo</h3></div></div>
        {intel.lawPerformance.length ? <div className="os-card-grid">{intel.lawPerformance.map((row:any)=>(
          <article className="os-card" key={row.code}>
            <div className="os-card-top"><span className="os-chip os-chip-neutral">{row.code}</span><span>{row.confidence.label}</span></div>
            <h4>{row.title}</h4>
            <strong className="os-big-number">{formatPercent(row.accuracy)}</strong>
            <div className="os-card-stats"><span>{formatNumber(row.questions)} questões</span><span>{formatNumber(row.sessions)} sessão(ões)</span></div>
            <div className="os-trend">
              {row.trend.key === "improving" ? <TrendingUp size={16}/> : row.trend.key === "worsening" ? <TrendingDown size={16}/> : <BarChart3 size={16}/>}
              <span>{row.trend.label}</span>
            </div>
            {row.strength ? <span className="os-chip os-chip-good">{row.strength}</span> : null}
            <SmartLink href={"leis/" + row.code.toLowerCase() + "/"} basePrefix={basePrefix} className="os-text-link">Abrir norma →</SmartLink>
          </article>
        ))}</div> : <Empty>Ainda não há sessões concluídas com questões suficientes para desempenho por norma.</Empty>}
      </section>
    </>
  );
}

function RisksView({ intel, basePrefix }: { intel: any; basePrefix: string }) {
  if (!intel.risks.length) return <section className="os-panel"><Empty>Nenhum risco sustentado por evidência no snapshot atual.</Empty></section>;
  return (
    <section className="os-card-grid">
      {intel.risks.map((risk:any)=>(
        <article className="os-card os-risk-card" key={risk.id}>
          <div className="os-card-top"><span className="os-chip os-chip-danger">{risk.kind}</span><strong>{risk.score}/100</strong></div>
          <h3>{risk.title}</h3>
          <p>{risk.impact}</p>
          <div className="os-evidence os-evidence-light">{risk.evidence.map((item:string,index:number)=><span key={index}>{item}</span>)}</div>
          <small>Confiança: {risk.confidence}</small>
          <SmartLink href={risk.href} basePrefix={basePrefix} className="os-primary">{risk.action}<ArrowRight size={15}/></SmartLink>
        </article>
      ))}
    </section>
  );
}

function ErrorsView({ intel, basePrefix }: { intel: any; basePrefix: string }) {
  return (
    <section className="os-panel">
      <div className="os-section-head"><div><span className="os-eyebrow">CADERNO DE ERROS</span><h3>Somente fragilidades abertas</h3></div><span>{intel.activeErrors.length} ativa(s)</span></div>
      {intel.activeErrors.length ? <div className="os-stack">{intel.activeErrors.map((error:any,index:number)=>(
        <SmartLink href={error.url || "erros/"} basePrefix={basePrefix} className="os-row" key={error.id || index}>
          <div>
            <span className="os-chip os-chip-danger">prioridade {error.score}/100</span>
            <strong>{error.title || error.subject || "Erro registrado"}</strong>
            <small>{error.discipline || "disciplina não informada"} · reincidência {error.recurrence === null ? "—" : error.recurrence} · {formatDate(error.date)}</small>
          </div>
          <ChevronRight size={16}/>
        </SmartLink>
      ))}</div> : <Empty>Sem erros abertos exportados. Erros resolvidos não reaparecem aqui.</Empty>}
    </section>
  );
}

function ReviewsView({ intel, basePrefix }: { intel: any; basePrefix: string }) {
  return (
    <>
      <section className="os-panel">
        <div className="os-section-head"><div><span className="os-eyebrow">D0 · D7 · D20</span><h3>Revisões com contexto</h3></div><span>{intel.reviews.length} pendência(s)</span></div>
        {intel.reviews.length ? <div className="os-card-grid">{intel.reviews.map((review:any,index:number)=>(
          <article className="os-card" key={review.code + "-" + review.kind + "-" + index}>
            <span className={"os-chip os-chip-" + toneForState(review.state)}>{review.state}</span>
            <h4>{review.title}</h4>
            <p>{review.reason}</p>
            <small>Vencimento: {formatDate(review.due)}</small>
            <SmartLink href={review.href} basePrefix={basePrefix} className="os-text-link">Abrir norma →</SmartLink>
          </article>
        ))}</div> : <Empty>Nenhuma revisão vencida/de hoje nem fechamento D0 calculável.</Empty>}
      </section>
      <section className="os-panel os-method-banner">
        <ShieldCheck size={22}/>
        <div><strong>Regra do motor</strong><p>Uma revisão não ganha prioridade só por existir: atraso, motivo, gravidade, reincidência e fragilidade associada entram antes da decisão.</p></div>
      </section>
    </>
  );
}

function EditalView({ intel, data }: { intel: any; data: Payload }) {
  const bySubject = new Map<string, any[]>();
  for (const axis of data.edital?.axes || []) {
    const list=bySubject.get(axis.subject) || [];
    list.push(axis);
    bySubject.set(axis.subject,list);
  }
  return (
    <>
      <section className="os-metrics-grid">
        <Metric label="Itens verticalizados" value={formatNumber(intel.coverage.edital.total)} />
        <Metric label="Marcados cobertos" value={formatNumber(intel.coverage.edital.covered)} detail={intel.coverage.edital.covered === null ? "campo ainda não disponível no snapshot" : "Notion"} />
        <Metric label="Com evidência operacional" value={formatNumber(intel.coverage.edital.withEvidence)} />
        <Metric label="Consolidação" value={formatNumber(intel.coverage.law.consolidated)} detail="Leis Primeiro" />
      </section>
      <section className="os-panel">
        <span className="os-eyebrow">COBERTURA DO EDITAL</span>
        <h3>Material existente não vira domínio</h3>
        <div className="os-card-grid">
          {[...bySubject.entries()].map(([subject,axes])=>{
            const covered=axes.filter((axis)=>axis.covered===true).length;
            const known=axes.every((axis)=>typeof axis.covered==="boolean");
            return <article className="os-card" key={subject}>
              <h4>{subject}</h4>
              <strong className="os-big-number">{axes.length}</strong>
              <span>item(ns) verticalizado(s)</span>
              <small>Cobertos: {known ? covered + "/" + axes.length : "—"}</small>
              <small>Prioridades: {[...new Set(axes.map((axis)=>axis.priority).filter(Boolean))].join(", ") || "—"}</small>
            </article>;
          })}
        </div>
      </section>
    </>
  );
}

function QualityView({ intel }: { intel: any }) {
  return (
    <>
      <section className="os-metrics-grid">
        <Metric label="Erros" value={intel.quality.errorCount} />
        <Metric label="Alertas" value={intel.quality.alertCount} />
        <Metric label="Informativos" value={intel.quality.infoCount} />
        <Metric label="Regra" value="— ≠ 0" detail="ausência permanece desconhecida" />
      </section>
      <section className="os-panel">
        <span className="os-eyebrow">INTEGRIDADE</span>
        <h3>O site sinaliza; o Notion continua canônico</h3>
        {intel.quality.issues.length ? <div className="os-stack">{intel.quality.issues.map((issue:any,index:number)=>(
          <div className="os-row os-row-static" key={issue.code + "-" + index}>
            <div><span className={"os-chip os-chip-" + (issue.severity === "erro" ? "danger" : issue.severity === "alerta" ? "gold" : "neutral")}>{issue.severity}</span><strong>{issue.title}</strong><small>{issue.detail}</small></div>
            <code>{issue.code}</code>
          </div>
        ))}</div> : <Empty>Nenhuma inconsistência detectada pelas regras atuais.</Empty>}
      </section>
    </>
  );
}

function TrailView({ intel, data, basePrefix }: { intel:any; data:Payload; basePrefix:string }) {
  const days=data.snapshot?.execution?.c01?.days || [];
  return (
    <>
      <section className="os-grid os-grid-2">
        <article className="os-panel">
          <span className="os-eyebrow">CICLO PRINCIPAL</span>
          <h3>{data.snapshot?.dashboard?.phase || "—"} · {data.snapshot?.dashboard?.cycle || "—"}</h3>
          <p className="os-note">Próxima sessão canônica: {intel.continuity.c01 || "—"}. Planejamento não é execução.</p>
        </article>
        <article className="os-panel">
          <span className="os-eyebrow">LEIS PRIMEIRO</span>
          <h3>Continuidade: {intel.continuity.law || "—"}</h3>
          <SmartLink href="leis/" basePrefix={basePrefix} className="os-primary">Abrir Leis Primeiro <ArrowRight size={15}/></SmartLink>
        </article>
      </section>
      <section className="os-panel">
        <span className="os-eyebrow">D01–D14</span>
        <h3>Planejado × executado</h3>
        <div className="os-card-grid">
          {days.map((day:any)=>(
            <article className="os-card" key={day.day}>
              <div className="os-card-top"><span className="os-chip os-chip-neutral">{day.day}</span><span>{day.status}</span></div>
              <h4>{String(day.title || day.day).replace(/^C01-D\d+\s*[—-]\s*/,"")}</h4>
              <div className="os-card-stats"><span>{formatNumber(day.done)}/{formatNumber(day.planned)} questões</span><span>{day.executed_at ? formatDate(day.executed_at) : "não executado"}</span></div>
              <SmartLink href={day.href} basePrefix={basePrefix} className="os-text-link">Registro vivo →</SmartLink>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function ViewContent({ view, intel, data, basePrefix }: {view:StudyOsView;intel:any;data:Payload;basePrefix:string}) {
  if (view === "home") return <HomeView intel={intel} data={data} basePrefix={basePrefix}/>;
  if (view === "today") return <TodayView intel={intel} basePrefix={basePrefix}/>;
  if (view === "mentor") return <MentorView intel={intel} basePrefix={basePrefix}/>;
  if (view === "performance") return <PerformanceView intel={intel} data={data} basePrefix={basePrefix}/>;
  if (view === "risks") return <RisksView intel={intel} basePrefix={basePrefix}/>;
  if (view === "errors") return <ErrorsView intel={intel} basePrefix={basePrefix}/>;
  if (view === "reviews") return <ReviewsView intel={intel} basePrefix={basePrefix}/>;
  if (view === "edital") return <EditalView intel={intel} data={data}/>;
  if (view === "quality") return <QualityView intel={intel}/>;
  return <TrailView intel={intel} data={data} basePrefix={basePrefix}/>;
}

export default function StudyOsClient({ view, basePrefix }: Props) {
  const [data,setData]=useState<Payload|null>(null);
  const [error,setError]=useState("");
  const [menuOpen,setMenuOpen]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);

  useEffect(()=>{
    let alive=true;
    async function load(){
      try{
        setError("");
        const names=["seedf-snapshot.json","leis-primeiro.json","legislation-bank.json","seedf-edital.json"];
        const responses=await Promise.all(names.map((name)=>fetch(basePrefix+"data/"+name+"?v="+Date.now(),{cache:"no-store"})));
        const failed=responses.find((response)=>!response.ok);
        if(failed) throw new Error("Snapshot HTTP "+failed.status+".");
        const values=await Promise.all(responses.map((response)=>response.json()));
        if(alive) setData({snapshot:values[0],laws:values[1],bank:values[2],edital:values[3]});
      }catch(cause){
        if(alive) setError(cause instanceof Error?cause.message:"Falha desconhecida.");
      }
    }
    void load();
    return ()=>{alive=false;};
  },[basePrefix,refreshKey]);

  const intel=useMemo(()=>data?buildSeedfIntelligence({
    snapshot:data.snapshot,
    lawsSnapshot:data.laws,
    legislationBank:data.bank,
    editalSnapshot:data.edital,
    referenceDate:saoPauloDate(),
  }):null,[data]);

  if(error) return <ErrorState message={error}/>;
  if(!data||!intel) return <Loading/>;

  const lastSync=data.snapshot?.source?.synced_at;
  const title=viewTitle[view];
  return (
    <div className="os-shell">
      <aside className={"os-sidebar "+(menuOpen?"is-open":"")}>
        <div className="os-brand">
          <div className="os-brand-mark">S</div>
          <div><strong>SEEDF PPGE</strong><span>Study OS · v5</span></div>
          <button aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}><X size={18}/></button>
        </div>
        <div className="os-source"><span></span>Notion = fonte canônica</div>
        <nav>
          {navGroups.map((group)=>(
            <div className="os-nav-group" key={group.label}>
              <small>{group.label}</small>
              {group.items.map(([key,path,label])=>{
                const active=(key==="leis"&&false)||key===view;
                return <a className={active?"is-active":""} href={basePrefix+path} key={key}>
                  {label}{active?<span></span>:null}
                </a>;
              })}
            </div>
          ))}
        </nav>
        <div className="os-sidebar-foot">
          <Sparkles size={15}/><span>decisão → evidência → continuidade</span>
        </div>
      </aside>

      <div className="os-main">
        <header className="os-topbar">
          <div>
            <button className="os-menu" aria-label="Abrir menu" onClick={()=>setMenuOpen(true)}><Menu size={20}/></button>
            <div><span>SEEDF / {title}</span><strong>{intel.state.phase} · {intel.state.cycle}</strong></div>
          </div>
          <div className="os-sync">
            <span><i></i>{lastSync?new Date(lastSync).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"sem sincronização"}</span>
            <button aria-label="Atualizar dados" onClick={()=>setRefreshKey((value)=>value+1)}><RefreshCcw size={16}/></button>
          </div>
        </header>

        <main className="os-content">
          <div className="os-page-head">
            <div>
              <span className="os-eyebrow">{view === "home" ? "CENTRAL DE COMANDO" : "STUDY OS"}</span>
              <h1>{title}</h1>
              <p>{view === "home" ? "O site interpreta o que foi registrado no Notion e devolve a próxima ação com evidência." : "A mesma inteligência central da Home, sem matemática paralela."}</p>
            </div>
            <div className="os-head-status"><ShieldCheck size={18}/><span>Ausência ≠ zero</span></div>
          </div>
          <ViewContent view={view} intel={intel} data={data} basePrefix={basePrefix}/>
        </main>
      </div>

      <nav className="os-bottom-nav">
        <a className={view==="home"?"is-active":""} href={basePrefix}><Home size={18}/><span>Início</span></a>
        <a className={view==="today"?"is-active":""} href={basePrefix+"hoje/"}><CalendarClock size={18}/><span>Hoje</span></a>
        <a className={view==="mentor"?"is-active":""} href={basePrefix+"mentor/"}><Sparkles size={18}/><span>Mentor</span></a>
        <a href={basePrefix+"leis/"}><BookOpenCheck size={18}/><span>Leis</span></a>
        <a className={view==="performance"?"is-active":""} href={basePrefix+"desempenho/"}><Gauge size={18}/><span>Dados</span></a>
      </nav>
    </div>
  );
}
