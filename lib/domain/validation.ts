import type { PickWithOptions, Round } from "@/lib/types";

export type ValidationErrorCode =
  | "ROUND_NOT_OPEN"
  | "ROUND_CLOSED"
  | "INVALID_PICK"
  | "INVALID_OPTION"
  | "DUPLICATE_PICK_SELECTION"
  | "INVALID_STAKE"
  | "STAKE_OUT_OF_RANGE"
  | "STAKE_STEP_INVALID"
  | "TOTAL_STAKE_EXCEEDED"
  | "FULL_BUDGET_REQUIRED"
  | "PICK_START_TIME_MISSING"
  | "PICK_ALREADY_STARTED";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
}

export interface EntrySelectionInput {
  pick_id: string;
  pick_option_id: string;
  stake: number;
}

export interface ValidateEntryResult {
  ok: boolean;
  errors: ValidationError[];
  totalStake: number;
  remainingCredits: number;
}

export interface ValidateSelectionResult {
  ok: boolean;
  errors: ValidationError[];
  totalStake: number;
  remainingCredits: number;
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function getPickStartTime(pick: PickWithOptions): Date | null {
  const rawStartTime = pick.metadata?.["start_time"];
  if (typeof rawStartTime !== "string") {
    return null;
  }

  const parsed = new Date(rawStartTime);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function validateRoundState(round: Round, now: Date): ValidationError[] {
  const errors: ValidationError[] = [];

  if (round.status !== "open") {
    errors.push({
      code: "ROUND_NOT_OPEN",
      message: "Round is not open.",
    });
  }

  if (new Date(round.closes_at).getTime() <= now.getTime()) {
    errors.push({
      code: "ROUND_CLOSED",
      message: "Round has already closed.",
    });
  }

  return errors;
}

function validateStake(
  stake: number,
  minStake: number,
  maxStake: number,
  stakeStep: number,
  pickId: string,
): ValidationError[] {
  if (!isInteger(stake)) {
    return [
      {
        code: "INVALID_STAKE",
        message: `Stake for pick ${pickId} must be an integer.`,
      },
    ];
  }

  if (!isInteger(stakeStep) || stakeStep <= 0) {
    return [
      {
        code: "STAKE_STEP_INVALID",
        message: "Round stake step configuration is invalid.",
      },
    ];
  }

  if (stake < minStake || stake > maxStake) {
    return [
      {
        code: "STAKE_OUT_OF_RANGE",
        message: `Stake for pick ${pickId} must be between ${minStake} and ${maxStake}.`,
      },
    ];
  }

  if (stake % stakeStep !== 0) {
    return [
      {
        code: "STAKE_STEP_INVALID",
        message: `Stake for pick ${pickId} must be in steps of ${stakeStep}.`,
      },
    ];
  }

  return [];
}

function validatePickWindow(
  round: Round,
  pick: PickWithOptions,
  now: Date,
): ValidationError[] {
  const startTime = getPickStartTime(pick);

  if (!startTime) {
    return [
      {
        code: "PICK_START_TIME_MISSING",
        message: `Pick ${pick.id} is missing a valid metadata.start_time.`,
      },
    ];
  }

  if (startTime.getTime() <= now.getTime()) {
    return [
      {
        code: "PICK_ALREADY_STARTED",
        message: `Pick ${pick.id} has already started and can no longer be edited.`,
      },
    ];
  }

  if (new Date(round.closes_at).getTime() <= now.getTime()) {
    return [
      {
        code: "ROUND_CLOSED",
        message: "Round has already closed.",
      },
    ];
  }

  return [];
}

/**
 * Validates a potential entry lock according to round/pick constraints.
 * This function is intentionally pure and deterministic for unit testing.
 */
export function validateEntry(
  round: Round,
  picks: PickWithOptions[],
  selections: EntrySelectionInput[],
  creditsStart: number,
  now: Date = new Date(),
): ValidateEntryResult {
  const errors: ValidationError[] = [...validateRoundState(round, now)];

  const pickById = new Map(picks.map((pick) => [pick.id, pick]));
  const seenPickIds = new Set<string>();

  for (const selection of selections) {
    const pick = pickById.get(selection.pick_id);
    if (!pick) {
      errors.push({
        code: "INVALID_PICK",
        message: `Pick ${selection.pick_id} does not exist in this round.`,
      });
      continue;
    }

    if (seenPickIds.has(selection.pick_id)) {
      errors.push({
        code: "DUPLICATE_PICK_SELECTION",
        message: `Pick ${selection.pick_id} has more than one selection.`,
      });
    }
    seenPickIds.add(selection.pick_id);

    const optionExists = pick.options.some(
      (option) => option.id === selection.pick_option_id,
    );
    if (!optionExists) {
      errors.push({
        code: "INVALID_OPTION",
        message: `Option ${selection.pick_option_id} does not belong to pick ${selection.pick_id}.`,
      });
    }

    errors.push(
      ...validateStake(
        selection.stake,
        round.min_stake,
        round.max_stake,
        round.stake_step,
        selection.pick_id,
      ),
    );
  }

  const totalStake = selections.reduce((sum, selection) => sum + selection.stake, 0);
  if (totalStake > creditsStart) {
    errors.push({
      code: "TOTAL_STAKE_EXCEEDED",
      message: `Total stake must be less than or equal to ${creditsStart}.`,
    });
  }

  if (round.enforce_full_budget && totalStake !== creditsStart) {
    errors.push({
      code: "FULL_BUDGET_REQUIRED",
      message: `Total stake must equal ${creditsStart} for this round.`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    totalStake,
    remainingCredits: creditsStart - totalStake,
  };
}

/**
 * Validates one selection upsert against stake constraints, budget, and event start lock.
 */
export function validateSelection(
  round: Round,
  picks: PickWithOptions[],
  existingSelections: EntrySelectionInput[],
  nextSelection: EntrySelectionInput,
  creditsStart: number,
  now: Date = new Date(),
): ValidateSelectionResult {
  const errors: ValidationError[] = [...validateRoundState(round, now)];

  const pick = picks.find((candidate) => candidate.id === nextSelection.pick_id);
  if (!pick) {
    errors.push({
      code: "INVALID_PICK",
      message: `Pick ${nextSelection.pick_id} does not exist in this round.`,
    });
  } else {
    errors.push(...validatePickWindow(round, pick, now));

    const optionExists = pick.options.some(
      (option) => option.id === nextSelection.pick_option_id,
    );

    if (!optionExists) {
      errors.push({
        code: "INVALID_OPTION",
        message: `Option ${nextSelection.pick_option_id} does not belong to pick ${nextSelection.pick_id}.`,
      });
    }
  }

  errors.push(
    ...validateStake(
      nextSelection.stake,
      round.min_stake,
      round.max_stake,
      round.stake_step,
      nextSelection.pick_id,
    ),
  );

  const selectionsWithoutCurrent = existingSelections.filter(
    (selection) => selection.pick_id !== nextSelection.pick_id,
  );

  const totalStake =
    selectionsWithoutCurrent.reduce((sum, selection) => sum + selection.stake, 0) +
    nextSelection.stake;

  if (totalStake > creditsStart) {
    errors.push({
      code: "TOTAL_STAKE_EXCEEDED",
      message: `Total stake must be less than or equal to ${creditsStart}.`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    totalStake,
    remainingCredits: creditsStart - totalStake,
  };
}
