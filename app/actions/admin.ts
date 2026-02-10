"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createPick,
  createPickOption,
  createRound,
  listRoundEntriesWithSelections,
  updatePickOptionResult,
  updateRound,
  updateRoundStatus,
} from "@/lib/data/admin";
import {
  settleEntryRecord,
  updateSelectionPayout,
} from "@/lib/data/entries";
import { settleEntry } from "@/lib/domain/settlement";
import {
  deriveStakeRange,
  normalizeStakeToStep,
  sanitizeStakeStep,
} from "@/lib/domain/stake-rules";
import { isAdminUser } from "@/lib/data/users";

export interface AdminActionResult {
  ok: boolean;
  error?: string;
}

function parseIntegerField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function parseRoundStakeConfig(formData: FormData): {
  startingCredits: number;
  stakeStep: number;
  minStake: number;
  maxStake: number;
} {
  const parsedStartingCredits = parseIntegerField(formData.get("starting_credits")) ?? 10000;
  const parsedStakeStep = parseIntegerField(formData.get("stake_step")) ?? 100;

  const stakeStep = sanitizeStakeStep(parsedStakeStep, 100);
  const startingCredits = Math.max(stakeStep, parsedStartingCredits);
  const suggested = deriveStakeRange(startingCredits, stakeStep);

  const minStake = normalizeStakeToStep(
    parseIntegerField(formData.get("min_stake")) ?? suggested.minStake,
    stakeStep,
    startingCredits,
    stakeStep,
  );

  const maxStake = normalizeStakeToStep(
    parseIntegerField(formData.get("max_stake")) ?? suggested.maxStake,
    minStake,
    startingCredits,
    stakeStep,
  );

  return {
    startingCredits,
    stakeStep,
    minStake,
    maxStake: Math.max(minStake, maxStake),
  };
}

export async function requireAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated.");
  }

  const isAdmin = await isAdminUser(supabase, user.id);
  if (!isAdmin) {
    throw new Error("Not authorized.");
  }

  return supabase;
}

export async function createRoundAction(
  formData: FormData,
): Promise<void> {
  const supabase = await requireAdminClient();
  const stakeConfig = parseRoundStakeConfig(formData);

  await createRound(supabase, {
    name: String(formData.get("name") ?? "").trim(),
    status: String(formData.get("status") ?? "draft") as
      | "draft"
      | "open"
      | "locked"
      | "settled",
    opens_at: String(formData.get("opens_at") ?? ""),
    closes_at: String(formData.get("closes_at") ?? ""),
    starting_credits: stakeConfig.startingCredits,
    stake_step: stakeConfig.stakeStep,
    min_stake: stakeConfig.minStake,
    max_stake: stakeConfig.maxStake,
    enforce_full_budget: formData.get("enforce_full_budget") === "on",
  });

  revalidatePath("/admin/rounds");
}

export async function updateRoundAction(
  formData: FormData,
): Promise<void> {
  const supabase = await requireAdminClient();
  const roundId = String(formData.get("round_id") ?? "");
  const stakeConfig = parseRoundStakeConfig(formData);

  await updateRound(supabase, roundId, {
    name: String(formData.get("name") ?? "").trim(),
    status: String(formData.get("status") ?? "draft") as
      | "draft"
      | "open"
      | "locked"
      | "settled",
    opens_at: String(formData.get("opens_at") ?? ""),
    closes_at: String(formData.get("closes_at") ?? ""),
    starting_credits: stakeConfig.startingCredits,
    stake_step: stakeConfig.stakeStep,
    min_stake: stakeConfig.minStake,
    max_stake: stakeConfig.maxStake,
    enforce_full_budget: formData.get("enforce_full_budget") === "on",
  });

  revalidatePath("/admin/rounds");
  revalidatePath(`/admin/rounds/${roundId}`);
}

export async function createPickAction(
  formData: FormData,
): Promise<void> {
  const supabase = await requireAdminClient();
  const roundId = String(formData.get("round_id") ?? "");

  await createPick(supabase, {
    round_id: roundId,
    sport_id: String(formData.get("sport_id") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    order_index: Number(formData.get("order_index") ?? 0),
    is_required: formData.get("is_required") === "on",
  });

  revalidatePath(`/admin/rounds/${roundId}`);
}

export async function createPickOptionAction(
  formData: FormData,
): Promise<void> {
  const supabase = await requireAdminClient();
  const roundId = String(formData.get("round_id") ?? "");

  await createPickOption(supabase, {
    pick_id: String(formData.get("pick_id") ?? ""),
    label: String(formData.get("label") ?? "").trim(),
    odds: Number(formData.get("odds") ?? 1),
    result: "pending",
  });

  revalidatePath(`/admin/rounds/${roundId}`);
  revalidatePath(`/admin/settle/${roundId}`);
}

export async function updateOptionResultAction(
  formData: FormData,
): Promise<void> {
  const supabase = await requireAdminClient();
  const roundId = String(formData.get("round_id") ?? "");

  await updatePickOptionResult(
    supabase,
    String(formData.get("option_id") ?? ""),
    String(formData.get("result") ?? "pending") as
      | "pending"
      | "win"
      | "lose"
      | "void",
  );

  revalidatePath(`/admin/settle/${roundId}`);
  revalidatePath(`/admin/rounds/${roundId}`);
}

export async function settleRoundAction(roundId: string): Promise<AdminActionResult> {
  try {
    const supabase = await requireAdminClient();
    const entries = await listRoundEntriesWithSelections(supabase, roundId);

    for (const entry of entries) {
      const settlement = settleEntry(
        entry.selections.map((selection) => ({
          id: selection.id,
          stake: selection.stake,
          odds: selection.odds,
          result: selection.result,
        })),
        entry.credits_start,
      );

      for (const settledSelection of settlement.selections) {
        await updateSelectionPayout(supabase, {
          selectionId: settledSelection.id,
          payout: settledSelection.payout,
        });
      }

      await settleEntryRecord(supabase, {
        entryId: entry.id,
        creditsEnd: settlement.creditsEnd,
      });
    }

    await updateRoundStatus(supabase, roundId, "settled");

    revalidatePath(`/leaderboard/${roundId}`);
    revalidatePath(`/admin/settle/${roundId}`);
    revalidatePath("/admin/rounds");
    revalidatePath("/history");

    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
