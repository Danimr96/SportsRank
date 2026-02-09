import type { OptionResult } from "@/lib/types";

export interface SettlementSelectionInput {
  id: string;
  stake: number;
  odds: number;
  result: OptionResult;
}

export interface SettledSelection {
  id: string;
  payout: number;
}

export interface SettleEntryResult {
  creditsEnd: number;
  cashRemaining: number;
  selections: SettledSelection[];
}

/**
 * Computes payout for a single selection from stake, decimal odds, and result.
 */
export function calculatePayout(
  stake: number,
  odds: number,
  result: OptionResult,
): number {
  if (!Number.isInteger(stake) || stake < 0) {
    throw new Error("Stake must be a non-negative integer.");
  }

  if (odds <= 0) {
    throw new Error("Odds must be greater than zero.");
  }

  if (result === "win") {
    return Math.floor(stake * odds);
  }

  if (result === "lose") {
    return 0;
  }

  if (result === "void") {
    return stake;
  }

  throw new Error("Cannot settle while selection result is pending.");
}

/**
 * Settles one full entry by summing computed payouts of each selection.
 */
export function settleEntry(
  selections: SettlementSelectionInput[],
  creditsStart = 0,
): SettleEntryResult {
  if (!Number.isInteger(creditsStart) || creditsStart < 0) {
    throw new Error("creditsStart must be a non-negative integer.");
  }

  const settled = selections.map((selection) => ({
    id: selection.id,
    payout: calculatePayout(selection.stake, selection.odds, selection.result),
  }));

  const totalStake = selections.reduce((sum, selection) => sum + selection.stake, 0);
  const cashRemaining = Math.max(0, creditsStart - totalStake);
  const payoutTotal = settled.reduce((sum, selection) => sum + selection.payout, 0);
  const creditsEnd = cashRemaining + payoutTotal;

  return {
    creditsEnd,
    cashRemaining,
    selections: settled,
  };
}
