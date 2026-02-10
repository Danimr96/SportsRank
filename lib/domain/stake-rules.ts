export interface SuggestedStakeRange {
  minStake: number;
  maxStake: number;
}

function toInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value);
}

export function sanitizeStakeStep(value: number, fallback = 100): number {
  const parsed = toInteger(value);
  if (parsed <= 0) {
    return Math.max(1, toInteger(fallback));
  }
  return parsed;
}

export function roundToStep(value: number, step: number): number {
  const safeStep = sanitizeStakeStep(step, 1);
  return Math.round(value / safeStep) * safeStep;
}

export function normalizeStakeToStep(
  value: number,
  minStake: number,
  maxStake: number,
  step: number,
): number {
  const safeStep = sanitizeStakeStep(step, 1);
  const safeMin = Math.max(0, toInteger(minStake));
  const safeMax = Math.max(safeMin, toInteger(maxStake));
  const snapped = roundToStep(value, safeStep);
  return Math.min(safeMax, Math.max(safeMin, snapped));
}

export function deriveStakeRange(
  startingCredits: number,
  stakeStep: number,
): SuggestedStakeRange {
  const safeStep = sanitizeStakeStep(stakeStep, 100);
  const safeCredits = Math.max(safeStep, toInteger(startingCredits));

  const minFromFormula = roundToStep(safeCredits * 0.02, safeStep);
  const maxFromFormula = roundToStep(safeCredits * 0.08, safeStep);

  const minStake = normalizeStakeToStep(
    Math.max(safeStep, minFromFormula),
    safeStep,
    safeCredits,
    safeStep,
  );
  const maxStake = normalizeStakeToStep(
    Math.max(minStake, maxFromFormula),
    minStake,
    safeCredits,
    safeStep,
  );

  return { minStake, maxStake };
}
