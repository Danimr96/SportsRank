import type { OptionResult, PickWithOptions, Round } from "@/lib/types";
import { normalizeStakeToStep } from "@/lib/domain/stake-rules";

export type SimulationScenario = "conservative" | "base" | "aggressive";

export interface SimulationSelectionInput {
  pickId: string;
  pickTitle: string;
  sportSlug: string;
  stake: number;
  odds: number;
  result: OptionResult;
  marketOdds: number[];
  editable: boolean;
}

export interface LiveSimulationInput {
  entryId: string;
  userId: string;
  username: string;
  lockedAt: string | null;
  creditsStart: number;
  selections: SimulationSelectionInput[];
}

export interface SelectionProjection {
  pickId: string;
  probability: number;
  minPayout: number;
  conservativePayout: number;
  basePayout: number;
  aggressivePayout: number;
  maxPayout: number;
  scenarioPayout: number;
}

export interface EntryProjection {
  entryId: string;
  userId: string;
  username: string;
  lockedAt: string | null;
  creditsStart: number;
  totalStake: number;
  cashRemaining: number;
  minCreditsEnd: number;
  conservativeCreditsEnd: number;
  baseCreditsEnd: number;
  aggressiveCreditsEnd: number;
  maxCreditsEnd: number;
  scenarioCreditsEnd: number;
  volatilityRange: number;
  selections: SelectionProjection[];
}

export interface ProjectedRankRow {
  rank: number;
  entryId: string;
  userId: string;
  username: string;
  lockedAt: string | null;
  score: number;
  minScore: number;
  maxScore: number;
  baseScore: number;
  selectionsCount: number;
}

export interface ProjectedRankRange {
  scenario: SimulationScenario;
  participants: number;
  currentRank: number | null;
  scenarioRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  around: ProjectedRankRow[];
}

export interface StakeSuggestion {
  id: string;
  type: "increase" | "decrease" | "info";
  confidence: "low" | "medium" | "high";
  title: string;
  description: string;
  pickId?: string;
  currentStake?: number;
  suggestedStake?: number;
}

interface StakeSuggestionInput {
  round: Round;
  picks: PickWithOptions[];
  selections: SimulationSelectionInput[];
  creditsStart: number;
}

function toInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function toPositiveNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value > 0 ? value : 0;
}

function normalizedProbability(odds: number, marketOdds: number[]): number {
  const validOdds = marketOdds.filter((value) => Number.isFinite(value) && value > 0);
  if (validOdds.length === 0 || !Number.isFinite(odds) || odds <= 0) {
    return 0;
  }

  const denominator = validOdds.reduce((sum, value) => sum + 1 / value, 0);
  if (denominator <= 0) {
    return 0;
  }

  return (1 / odds) / denominator;
}

function scenarioFromRange(
  conservative: number,
  base: number,
  aggressive: number,
  scenario: SimulationScenario,
): number {
  if (scenario === "conservative") {
    return conservative;
  }
  if (scenario === "aggressive") {
    return aggressive;
  }
  return base;
}

function projectPendingSelection(stake: number, odds: number, marketOdds: number[]) {
  const maxPayout = Math.floor(stake * odds);
  const probability = normalizedProbability(odds, marketOdds);
  const basePayout = Math.round(maxPayout * probability);
  const conservativePayout = Math.round(basePayout * 0.72);
  const aggressivePayout = Math.round(basePayout + (maxPayout - basePayout) * 0.62);

  return {
    probability,
    minPayout: 0,
    conservativePayout: Math.max(0, conservativePayout),
    basePayout: Math.max(0, basePayout),
    aggressivePayout: Math.min(maxPayout, Math.max(0, aggressivePayout)),
    maxPayout: Math.max(0, maxPayout),
  };
}

/**
 * Pure projection for one selection under uncertainty scenarios.
 */
export function projectSelectionRange(
  selection: SimulationSelectionInput,
  scenario: SimulationScenario = "base",
): SelectionProjection {
  const stake = toInt(selection.stake);
  const odds = toPositiveNumber(selection.odds);

  let projection: Omit<SelectionProjection, "pickId" | "scenarioPayout">;
  if (selection.result === "win") {
    const payout = Math.floor(stake * odds);
    projection = {
      probability: 1,
      minPayout: payout,
      conservativePayout: payout,
      basePayout: payout,
      aggressivePayout: payout,
      maxPayout: payout,
    };
  } else if (selection.result === "lose") {
    projection = {
      probability: 0,
      minPayout: 0,
      conservativePayout: 0,
      basePayout: 0,
      aggressivePayout: 0,
      maxPayout: 0,
    };
  } else if (selection.result === "void") {
    projection = {
      probability: 1,
      minPayout: stake,
      conservativePayout: stake,
      basePayout: stake,
      aggressivePayout: stake,
      maxPayout: stake,
    };
  } else {
    projection = projectPendingSelection(
      stake,
      odds,
      selection.marketOdds.length > 0 ? selection.marketOdds : [odds],
    );
  }

  return {
    pickId: selection.pickId,
    ...projection,
    scenarioPayout: scenarioFromRange(
      projection.conservativePayout,
      projection.basePayout,
      projection.aggressivePayout,
      scenario,
    ),
  };
}

/**
 * Pure projection for one entry with min/base/max outcomes and scenario score.
 */
export function projectEntryRange(
  input: LiveSimulationInput,
  scenario: SimulationScenario = "base",
): EntryProjection {
  const selections = input.selections.map((selection) =>
    projectSelectionRange(selection, scenario),
  );

  const totalStake = input.selections.reduce((sum, selection) => sum + toInt(selection.stake), 0);
  const cashRemaining = Math.max(0, toInt(input.creditsStart) - totalStake);

  const minPayout = selections.reduce((sum, selection) => sum + selection.minPayout, 0);
  const conservativePayout = selections.reduce(
    (sum, selection) => sum + selection.conservativePayout,
    0,
  );
  const basePayout = selections.reduce((sum, selection) => sum + selection.basePayout, 0);
  const aggressivePayout = selections.reduce(
    (sum, selection) => sum + selection.aggressivePayout,
    0,
  );
  const maxPayout = selections.reduce((sum, selection) => sum + selection.maxPayout, 0);
  const scenarioPayout = selections.reduce(
    (sum, selection) => sum + selection.scenarioPayout,
    0,
  );

  const minCreditsEnd = cashRemaining + minPayout;
  const conservativeCreditsEnd = cashRemaining + conservativePayout;
  const baseCreditsEnd = cashRemaining + basePayout;
  const aggressiveCreditsEnd = cashRemaining + aggressivePayout;
  const maxCreditsEnd = cashRemaining + maxPayout;

  return {
    entryId: input.entryId,
    userId: input.userId,
    username: input.username,
    lockedAt: input.lockedAt,
    creditsStart: toInt(input.creditsStart),
    totalStake,
    cashRemaining,
    minCreditsEnd,
    conservativeCreditsEnd,
    baseCreditsEnd,
    aggressiveCreditsEnd,
    maxCreditsEnd,
    scenarioCreditsEnd: cashRemaining + scenarioPayout,
    volatilityRange: maxCreditsEnd - minCreditsEnd,
    selections,
  };
}

function lockedSortValue(lockedAt: string | null): number {
  if (!lockedAt) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = new Date(lockedAt).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function sortByScore(
  left: { score: number; lockedAt: string | null; username: string },
  right: { score: number; lockedAt: string | null; username: string },
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const lockDiff = lockedSortValue(left.lockedAt) - lockedSortValue(right.lockedAt);
  if (lockDiff !== 0) {
    return lockDiff;
  }
  return left.username.localeCompare(right.username);
}

function rankInScenario(
  entries: EntryProjection[],
  userId: string,
  myScore: (entry: EntryProjection) => number,
  othersScore: (entry: EntryProjection) => number,
): number | null {
  const rows = entries
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      lockedAt: entry.lockedAt,
      score: entry.userId === userId ? myScore(entry) : othersScore(entry),
    }))
    .sort(sortByScore);

  const index = rows.findIndex((row) => row.userId === userId);
  return index >= 0 ? index + 1 : null;
}

/**
 * Computes projected current/scenario/best/worst rank range from projected entries.
 */
export function computeProjectedRankRange(
  entries: LiveSimulationInput[],
  currentUserId: string,
  scenario: SimulationScenario = "base",
): ProjectedRankRange {
  const projected = entries.map((entry) => projectEntryRange(entry, scenario));
  const ranked = projected
    .map((entry) => ({
      ...entry,
      score: entry.baseCreditsEnd,
    }))
    .sort((left, right) =>
      sortByScore(
        { score: left.score, lockedAt: left.lockedAt, username: left.username },
        { score: right.score, lockedAt: right.lockedAt, username: right.username },
      ),
    );

  const rows: ProjectedRankRow[] = ranked.map((entry, index) => ({
    rank: index + 1,
    entryId: entry.entryId,
    userId: entry.userId,
    username: entry.username,
    lockedAt: entry.lockedAt,
    score: entry.scenarioCreditsEnd,
    minScore: entry.minCreditsEnd,
    maxScore: entry.maxCreditsEnd,
    baseScore: entry.baseCreditsEnd,
    selectionsCount: entry.selections.length,
  }));

  const currentRank =
    rows.find((row) => row.userId === currentUserId)?.rank ?? null;
  const scenarioRank = rankInScenario(
    projected,
    currentUserId,
    (entry) => entry.scenarioCreditsEnd,
    (entry) => entry.baseCreditsEnd,
  );
  const bestRank = rankInScenario(
    projected,
    currentUserId,
    (entry) => entry.maxCreditsEnd,
    (entry) => entry.conservativeCreditsEnd,
  );
  const worstRank = rankInScenario(
    projected,
    currentUserId,
    (entry) => entry.conservativeCreditsEnd,
    (entry) => entry.aggressiveCreditsEnd,
  );

  const aroundCenter =
    (rows.find((row) => row.userId === currentUserId)?.rank ?? 1) - 1;
  const around = rows.slice(
    Math.max(0, aroundCenter - 2),
    Math.min(rows.length, aroundCenter + 3),
  );

  return {
    scenario,
    participants: rows.length,
    currentRank,
    scenarioRank,
    bestRank,
    worstRank,
    around,
  };
}

function nextStakeStep(
  currentStake: number,
  minStake: number,
  maxStake: number,
  stakeStep: number,
  direction: "up" | "down",
) {
  const delta = Math.max(1, toInt(stakeStep));
  const candidate = direction === "up" ? currentStake + delta : currentStake - delta;
  return normalizeStakeToStep(candidate, minStake, maxStake, delta);
}

/**
 * Builds deterministic, explainable suggestions without mutating selections.
 */
export function buildStakeSuggestions(input: StakeSuggestionInput): StakeSuggestion[] {
  const { round, selections, creditsStart } = input;
  const totalStake = selections.reduce((sum, selection) => sum + toInt(selection.stake), 0);
  const remaining = Math.max(0, creditsStart - totalStake);
  const suggestions: StakeSuggestion[] = [];

  if (remaining >= round.min_stake) {
    suggestions.push({
      id: "deploy-cash",
      type: "info",
      confidence: "high",
      title: "Cash sin desplegar",
      description: `Tienes ${remaining} créditos disponibles para mejorar cobertura de picks.`,
    });
  }

  const bySport = new Map<string, number>();
  for (const selection of selections) {
    const current = bySport.get(selection.sportSlug) ?? 0;
    bySport.set(selection.sportSlug, current + toInt(selection.stake));
  }
  const [topSportSlug, topSportStake] =
    Array.from(bySport.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (topSportStake > 0 && totalStake > 0) {
    const concentration = topSportStake / totalStake;
    if (concentration >= 0.6) {
      suggestions.push({
        id: "diversify-sport",
        type: "info",
        confidence: "medium",
        title: "Riesgo de concentración",
        description: `Más del ${Math.round(concentration * 100)}% del stake está en ${topSportSlug}. Diversificar reduce volatilidad.`,
      });
    }
  }

  const editableSelections = selections.filter((selection) => selection.editable);
  const highVolatility = editableSelections
    .filter((selection) => selection.odds >= 3 && selection.stake > round.min_stake + 50)
    .sort((a, b) => b.stake - a.stake)[0];
  if (highVolatility) {
    const suggestedStake = nextStakeStep(
      toInt(highVolatility.stake),
      round.min_stake,
      round.max_stake,
      round.stake_step,
      "down",
    );
    suggestions.push({
      id: `trim-${highVolatility.pickId}`,
      type: "decrease",
      confidence: "high",
      title: "Reduce exposición en cuota alta",
      description: `${highVolatility.pickTitle} tiene cuota ${highVolatility.odds.toFixed(2)}. Bajar stake reduce drawdown potencial.`,
      pickId: highVolatility.pickId,
      currentStake: toInt(highVolatility.stake),
      suggestedStake,
    });
  }

  const stableCandidate = editableSelections
    .filter(
      (selection) =>
        selection.odds >= 1.45 &&
        selection.odds <= 2.25 &&
        selection.stake < round.max_stake &&
        selection.result === "pending",
    )
    .sort((a, b) => {
      const aProb = normalizedProbability(a.odds, a.marketOdds);
      const bProb = normalizedProbability(b.odds, b.marketOdds);
      return bProb - aProb;
    })[0];
  if (stableCandidate && remaining > 0) {
    const stepUp = Math.min(remaining, Math.max(1, toInt(round.stake_step)));
    const suggestedStake = normalizeStakeToStep(
      toInt(stableCandidate.stake) + stepUp,
      round.min_stake,
      round.max_stake,
      round.stake_step,
    );
    if (suggestedStake > stableCandidate.stake) {
      suggestions.push({
        id: `boost-${stableCandidate.pickId}`,
        type: "increase",
        confidence: "medium",
        title: "Refuerza posición más estable",
        description: `Puedes aumentar stake en ${stableCandidate.pickTitle} para capturar valor con riesgo contenido.`,
        pickId: stableCandidate.pickId,
        currentStake: toInt(stableCandidate.stake),
        suggestedStake,
      });
    }
  }

  return suggestions.slice(0, 4);
}
