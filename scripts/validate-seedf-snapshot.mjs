import { readFile } from "node:fs/promises";

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function numericOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

const [snapshot, laws, bank, edital] = await Promise.all([
  json("public/data/seedf-snapshot.json"),
  json("public/data/leis-primeiro.json"),
  json("public/data/legislation-bank.json"),
  json("public/data/seedf-edital.json"),
]);

assert(snapshot?.source?.kind === "notion", "seedf-snapshot: fonte deve continuar sendo Notion.");
assert(Array.isArray(snapshot?.execution?.c01?.days), "seedf-snapshot: C01 sem dias.");
assert(snapshot.execution.c01.days.length === 14, "seedf-snapshot: C01 deve preservar D01-D14.");
assert(Array.isArray(laws?.laws) && laws.laws.length === 34, "leis-primeiro: esperado L01-L34.");
assert(Array.isArray(bank?.rows) && bank.rows.length >= 32, "legislation-bank: trilha incompleta.");
assert(Array.isArray(edital?.axes) && edital.axes.length >= 1, "seedf-edital: sem eixos.");

const lawCodes = new Set(laws.laws.map((law) => law.code));
for (let index = 1; index <= 34; index += 1) {
  const code = "L" + String(index).padStart(2, "0");
  assert(lawCodes.has(code), "leis-primeiro: ausente " + code + ".");
}

for (const day of snapshot.execution.c01.days) {
  for (const field of ["planned","done","correct","errors","doubts","minutes","precision","progress"]) {
    assert(numericOrNull(day[field]), "C01 " + day.day + ": " + field + " precisa ser número ou null.");
  }
  if (day.done === 0) assert(day.precision === null, "C01 " + day.day + ": 0 questões não pode produzir 0%.");
}
for (const session of snapshot?.execution?.leis_primeiro?.sessions || []) {
  for (const field of ["questions_planned","questions_done","correct","errors","doubts","precision"]) {
    assert(numericOrNull(session[field]), "Sessão " + (session.title || session.id) + ": " + field + " precisa ser número ou null.");
  }
}
const serialized = JSON.stringify({snapshot,laws,bank,edital});
for (const forbidden of ["service_role","BEGIN PRIVATE KEY","ntn_","secret_"]) {
  assert(!serialized.includes(forbidden), "Snapshot público contém padrão sensível: " + forbidden);
}
console.log("Snapshot SEEDF validado: C01, L01-L34, banco de legislação e edital íntegros.");
