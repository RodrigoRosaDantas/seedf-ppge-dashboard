import test from "node:test";
import assert from "node:assert/strict";
import {
  accuracy,
  buildSeedfIntelligence,
  knownNumber,
  sampleConfidence,
  safeEditalMatch,
  trendFromEvents,
} from "../lib/seedf-intelligence.mjs";

function fixture(overrides = {}) {
  const base = {
    snapshot: {
      dashboard: { phase: "Fase 1", cycle: "Ciclo 01" },
      execution: {
        c01: {
          active_day: "D01",
          totals: { done: 0 },
          days: [{ day: "D01", title: "D01", status: "Próximo", done: 0, correct: 0, errors: 0, minutes: 0, executed_at: null }],
          errors: [],
        },
        leis_primeiro: { totals: { done: 0 }, sessions: [], errors: [] },
      },
    },
    lawsSnapshot: {
      laws: [
        { code: "L01", title: "CF/88", action: "Estudar agora", study_phase: "Não iniciado", questions_done: 0, hits: 0, errors: 0, sessions_done: 0, summaries_done: 0, readings_done: 0, orientation_read: false, d0: false, d7: false, d20: false, next_step: "1 · Ler orientação" },
      ],
    },
    legislationBank: {
      rows: [
        { codes: ["L01"], record_kind: "trilha", title: "CF/88", study_phase: "Não iniciado", questions_done: 0, hits: 0, errors: 0, sessions_done: 0, summaries_done: 0, readings_done: 0, orientation_read: false, d0: false, d7: false, d20: false, next_review: null },
      ],
    },
    editalSnapshot: {
      axes: [
        { topic: "Constituição", subject: "Direito Constitucional", covered: null, domainState: null },
        { topic: "LDB", subject: "Legislação Educacional", covered: null, domainState: null },
      ],
    },
    referenceDate: "2026-09-24",
  };
  return {
    ...base,
    ...overrides,
    snapshot: { ...base.snapshot, ...(overrides.snapshot || {}) },
    lawsSnapshot: { ...base.lawsSnapshot, ...(overrides.lawsSnapshot || {}) },
    legislationBank: { ...base.legislationBank, ...(overrides.legislationBank || {}) },
    editalSnapshot: { ...base.editalSnapshot, ...(overrides.editalSnapshot || {}) },
  };
}

test("campo ausente continua ausente", () => assert.equal(knownNumber(undefined), null));
test("null continua ausente", () => assert.equal(knownNumber(null), null));
test("zero explícito continua zero", () => assert.equal(knownNumber(0), 0));
test("precisão sem campos completos é não calculável", () => assert.equal(accuracy(3, null), null));
test("zero questões não vira 0% de precisão", () => assert.equal(accuracy(0, 0), null));

test("sem questão ou sessão => sem dados suficientes", () => assert.equal(sampleConfidence(0, 0).key, "none"));
test("3/3 continua amostra muito pequena", () => assert.equal(sampleConfidence(3, 1).key, "tiny"));
test("10 questões em uma sessão continua amostra pequena", () => assert.equal(sampleConfidence(10, 1).key, "small"));
test("25 questões com duas sessões => evidência moderada", () => assert.equal(sampleConfidence(25, 2).key, "moderate"));
test("60 questões com três sessões => evidência forte", () => assert.equal(sampleConfidence(60, 3).key, "strong"));
test("dados parciais rebaixam a redação da confiança", () => assert.match(sampleConfidence(60, 3, 0.5).label, /parciais/));

test("tendência exige quatro eventos reais", () => assert.equal(trendFromEvents([{date:"2026-01-01",accuracy:80},{date:"2026-01-02",accuracy:90},{date:"2026-01-03",accuracy:95}]).key, "insufficient"));
test("melhora consistente é detectada", () => assert.equal(trendFromEvents([{date:"2026-01-01",accuracy:60},{date:"2026-01-02",accuracy:65},{date:"2026-01-03",accuracy:75},{date:"2026-01-04",accuracy:80}]).key, "improving"));
test("piora consistente é detectada", () => assert.equal(trendFromEvents([{date:"2026-01-01",accuracy:90},{date:"2026-01-02",accuracy:85},{date:"2026-01-03",accuracy:70},{date:"2026-01-04",accuracy:65}]).key, "worsening"));
test("variação pequena é estável", () => assert.equal(trendFromEvents([{date:"2026-01-01",accuracy:80},{date:"2026-01-02",accuracy:82},{date:"2026-01-03",accuracy:81},{date:"2026-01-04",accuracy:83}]).key, "stable"));

test("alias inequívoco funciona", () => {
  const axes=[{subject:"LC 840/2011"},{subject:"Português"}];
  assert.equal(safeEditalMatch("LC 840",axes).subject,"LC 840/2011");
});
test("alias/partial ambíguo permanece sem vínculo seguro", () => {
  const axes=[{subject:"Administração Geral"},{subject:"Administração Pública"}];
  assert.equal(safeEditalMatch("Administração",axes),null);
});
test("disciplina formal casa por igualdade exata", () => {
  const axes=[{subject:"Português"}];
  assert.equal(safeEditalMatch("Português",axes).match,"exact");
});

test("sessão interrompida vira RETOMAR SESSÃO e precede D01", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.sessions=[{id:"s1",page_code:"L01",date:"2026-09-23",title:"L01 leitura",session_type:"Lei seca",completed:false,questions_done:0}];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.nextAction.kind,"resume");
  assert.match(result.nextAction.eyebrow,/RETOMAR/);
});

test("sessão interrompida de lei suspensa não vira retomada", () => {
  const data=fixture();
  data.lawsSnapshot.laws=[
    {code:"L25",title:"ECA",action:"Radar / monitorar",strategic_status:"Radar — suspenso até edital"},
    {code:"L01",title:"CF/88",action:"Estudar agora"},
  ];
  data.snapshot.execution.leis_primeiro.sessions=[
    {id:"s25",page_code:"L25",date:"2026-09-23",title:"L25",completed:false,questions_done:5},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.interruptedSessions.length,0);
  assert.notEqual(result.nextAction.kind,"resume");
});

test("sessão concluída não vira retomada", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.sessions=[{id:"s1",page_code:"L01",date:"2026-09-23",title:"L01",completed:true,questions_done:0}];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.interruptedSessions.length,0);
});

test("erro fechado não volta como fragilidade ativa", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.errors=[{id:"e1",status:"Resolvido",date:"2026-09-22",title:"erro"}];
  assert.equal(buildSeedfIntelligence(data).activeErrors.length,0);
});

test("erro aberto permanece ativo", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.errors=[{id:"e1",status:"Em andamento",date:"2026-09-22",title:"erro",recurrence:1}];
  assert.equal(buildSeedfIntelligence(data).activeErrors.length,1);
});

test("erro aberto de Radar permanece preservado sem virar fragilidade ativa", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.errors=[
    {id:"e1",status:"Em andamento",strategic_use:"Radar suspenso",date:"2026-09-22",title:"erro Monitor",recurrence:1},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.activeErrors.length,0);
  assert.equal(result.suspendedErrors.length,1);
  assert.notEqual(result.nextAction.kind,"error");
});

test("revisão vencida influencia decisão quando não há retomada", () => {
  const data=fixture();
  data.legislationBank.rows=[{codes:["L01"],record_kind:"trilha",study_phase:"Em estudo",questions_done:10,sessions_done:1,d0:true,d7:false,d20:false,next_review:"2026-09-20"}];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.nextAction.kind,"review");
  assert.equal(result.reviews[0].state,"atrasado");
});

test("lei suspensa não cria D0, D7 ou revisão vencida", () => {
  const data=fixture();
  data.legislationBank.rows=[{
    codes:["L25"],record_kind:"trilha",strategic_status:"Radar — suspenso até edital",
    study_phase:"Em estudo",questions_done:25,sessions_done:1,d0:false,d7:false,d20:false,next_review:"2026-09-20",
  }];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.reviews.length,0);
  assert.notEqual(result.nextAction.kind,"review");
});

test("revisão concluída deixa de criar pendência D0", () => {
  const data=fixture();
  data.legislationBank.rows=[{codes:["L01"],record_kind:"trilha",study_phase:"Em estudo",questions_done:10,sessions_done:1,d0:true,d7:true,d20:true,next_review:null}];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.reviews.length,0);
});

test("material publicado não vira estudado", () => {
  const result=buildSeedfIntelligence(fixture());
  assert.equal(result.coverage.law.available,1);
  assert.equal(result.coverage.law.studied,0);
});

test("questões praticadas geram evidência apenas com resultado calculável", () => {
  const data=fixture();
  data.lawsSnapshot.laws[0]={...data.lawsSnapshot.laws[0],study_phase:"Em estudo",questions_done:10,hits:8,errors:2,sessions_done:1};
  const result=buildSeedfIntelligence(data);
  assert.equal(result.coverage.law.practiced,1);
  assert.equal(result.coverage.law.evidenced,1);
});

test("L01 usa somente a bateria ativa quando suplemento Monitor está em Radar", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.question_records=[
    {id:"q-core",day_id:"LP-20260921-L01-R1",page_code:"L01",strategic_use:"Ativo",planned:30,done:30,correct:29,errors:1,doubts:0},
    {id:"q-monitor",day_id:"LP-20260921-L01-R1",page_code:"L01",strategic_use:"Radar suspenso",planned:10,done:10,correct:8,errors:2,doubts:0},
  ];
  data.snapshot.execution.leis_primeiro.sessions=[
    {page_code:"L01",date:"2026-09-21",completed:true,questions_done:40,correct:37,errors:3},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.lawPerformance.length,1);
  assert.equal(result.lawPerformance[0].questions,30);
  assert.equal(result.lawPerformance[0].correct,29);
  assert.equal(result.lawPerformance[0].errors,1);
  assert.equal(result.lawPerformance[0].source,"questões ativas");
  assert.equal(result.lawPerformance[0].accuracy,29/30*100);
});

test("baterias ativas preservam tendência temporal por data real", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.question_records=[
    {day_id:"LP-20260901-L01-R1",page_code:"L01",strategic_use:"Ativo",date:"2026-09-01",done:20,correct:20,errors:0},
    {day_id:"LP-20260905-L01-R2",page_code:"L01",strategic_use:"Ativo",date:"2026-09-05",done:20,correct:19,errors:1},
    {day_id:"LP-20260910-L01-R3",page_code:"L01",strategic_use:"Ativo",date:"2026-09-10",done:20,correct:17,errors:3},
    {day_id:"LP-20260915-L01-R4",page_code:"L01",strategic_use:"Ativo",date:"2026-09-15",done:20,correct:16,errors:4},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.lawPerformance[0].questions,80);
  assert.equal(result.lawPerformance[0].confidence.key,"strong");
  assert.equal(result.lawPerformance[0].trend.key,"worsening");
  assert.equal(result.lawPerformance[0].strength,null);
});

test("grande amostra pode ser força sem exigir 100%", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.sessions=[
    {page_code:"L01",date:"2026-09-01",completed:true,questions_done:20,correct:18,errors:2},
    {page_code:"L01",date:"2026-09-05",completed:true,questions_done:20,correct:17,errors:3},
    {page_code:"L01",date:"2026-09-10",completed:true,questions_done:20,correct:18,errors:2},
    {page_code:"L01",date:"2026-09-15",completed:true,questions_done:20,correct:18,errors:2},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.lawPerformance[0].confidence.key,"strong");
  assert.ok(result.lawPerformance[0].strength);
});

test("dados parciais não criam falsa força", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.sessions=[
    {page_code:"L01",date:"2026-09-01",completed:true,questions_done:30,correct:30,errors:null},
    {page_code:"L01",date:"2026-09-05",completed:true,questions_done:30,correct:30,errors:null},
    {page_code:"L01",date:"2026-09-10",completed:true,questions_done:30,correct:30,errors:null},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.lawPerformance[0].strength,null);
});

test("piora consistente impede declaração de força", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.sessions=[
    {page_code:"L01",date:"2026-09-01",completed:true,questions_done:20,correct:20,errors:0},
    {page_code:"L01",date:"2026-09-05",completed:true,questions_done:20,correct:19,errors:1},
    {page_code:"L01",date:"2026-09-10",completed:true,questions_done:20,correct:17,errors:3},
    {page_code:"L01",date:"2026-09-15",completed:true,questions_done:20,correct:16,errors:4},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.lawPerformance[0].trend.key,"worsening");
  assert.equal(result.lawPerformance[0].strength,null);
});

test("impacto do edital sozinho não cria fragilidade", () => {
  const result=buildSeedfIntelligence(fixture());
  assert.equal(result.weaknesses.length,0);
});

test("cobertura distingue total histórico de escopo ativo pós-TR", () => {
  const data=fixture();
  data.editalSnapshot.axes=[
    {topic:"A",subject:"Português",documentaryStrength:"🚨 Confirmado pelo TR atual",covered:false},
    {topic:"B",subject:"Administração Geral",documentaryStrength:"🟢 Base histórica forte",covered:false},
    {topic:"C",subject:"Radar",documentaryStrength:"🟡 Radar provável",covered:false},
    {topic:"D",subject:"Monitor",documentaryStrength:"⏸️ Suspenso",covered:false},
    {topic:"E",subject:"Governança",documentaryStrength:"🔴 Fora do escopo atual",covered:false},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.coverage.edital.total,5);
  assert.equal(result.coverage.edital.activeTotal,2);
  assert.equal(result.coverage.edital.radar,1);
  assert.equal(result.coverage.edital.suspended,1);
  assert.equal(result.coverage.edital.outside,1);
});

test("contador ausente permanece desconhecido na soma global", () => {
  const data=fixture();
  data.snapshot.execution.c01.totals.done=null;
  data.snapshot.execution.leis_primeiro.totals.done=null;
  assert.equal(buildSeedfIntelligence(data).state.knownQuestions,null);
});

test("zero questões explicitamente registradas continua zero questões", () => {
  const result=buildSeedfIntelligence(fixture());
  assert.equal(result.state.knownQuestions,0);
});

test("execução sem data real vira alerta de qualidade, não tendência inventada", () => {
  const data=fixture();
  data.snapshot.execution.c01.days=[{day:"D01",done:10,correct:8,errors:2,minutes:30,executed_at:null}];
  const result=buildSeedfIntelligence(data);
  assert.ok(result.quality.issues.some((item)=>item.code==="MISSING_EXEC_DATE"));
});

test("acertos + erros diferente de questões vira erro de qualidade", () => {
  const data=fixture();
  data.snapshot.execution.c01.days=[{day:"D01",done:10,correct:8,errors:1,minutes:30,executed_at:"2026-09-20"}];
  const result=buildSeedfIntelligence(data);
  assert.ok(result.quality.issues.some((item)=>item.code==="QUESTIONS_SUM"));
});

test("prioridade de retomada supera revisão vencida", () => {
  const data=fixture();
  data.snapshot.execution.leis_primeiro.sessions=[{id:"s1",page_code:"L01",date:"2026-09-23",title:"L01",completed:false}];
  data.legislationBank.rows=[{codes:["L01"],record_kind:"trilha",study_phase:"Em estudo",questions_done:10,sessions_done:1,d0:true,next_review:"2026-09-20"}];
  assert.equal(buildSeedfIntelligence(data).nextAction.kind,"resume");
});


test("continuidade canônica respeita o avanço real e não volta para L01 por D0 pendente", () => {
  const data=fixture();
  data.lawsSnapshot.laws=[
    {code:"L01",title:"L01",study_phase:"Em estudo",d0:false},
    {code:"L02",title:"L02",study_phase:"Em estudo",d0:false},
    {code:"L03",title:"L03",study_phase:"Em estudo",d0:false},
    {code:"L04",title:"L04",study_phase:"Não iniciado",d0:false},
  ];
  data.snapshot.execution.leis_primeiro.sessions=[
    {id:"s3",page_code:"L03",date:"2026-09-23",title:"L03",completed:true,questions_done:0},
    {id:"s2",page_code:"L02",date:"2026-09-22",title:"L02",completed:true,questions_done:30,correct:22,errors:8},
    {id:"s1",page_code:"L01",date:"2026-09-21",title:"L01",completed:true,questions_done:40,correct:37,errors:3},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.continuity.law,"L04");
});

test("sessão atual incompleta mantém a própria Lxx como continuidade", () => {
  const data=fixture();
  data.lawsSnapshot.laws=[
    {code:"L01",title:"L01"},
    {code:"L02",title:"L02"},
    {code:"L03",title:"L03"},
    {code:"L04",title:"L04"},
  ];
  data.snapshot.execution.leis_primeiro.sessions=[
    {id:"s3",page_code:"L03",date:"2026-09-23",title:"L03",completed:false,questions_done:0},
    {id:"s2",page_code:"L02",date:"2026-09-22",title:"L02",completed:true,questions_done:30,correct:22,errors:8},
  ];
  const result=buildSeedfIntelligence(data);
  assert.equal(result.continuity.law,"L03");
  assert.equal(result.nextAction.kind,"resume");
});
