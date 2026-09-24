export function normalizeLeisPrimeiroId(value) {
  const match = String(value ?? "").trim().match(/^LP-(\d{8})-(L\d{2})-([LR])(\d+)$/i);
  if (!match) return null;
  return "LP-" + match[1] + "-" + match[2].toUpperCase() + "-" + match[3].toUpperCase() + match[4];
}

export function pageCodeFromExecutionId(value) {
  return normalizeLeisPrimeiroId(value)?.match(/-(L\d{2})-/)?.[1] || "";
}

export function leisPrimeiroSequence(value) {
  const match = normalizeLeisPrimeiroId(value)?.match(/-[LR](\d+)$/i);
  return match ? Number(match[1]) : 0;
}
