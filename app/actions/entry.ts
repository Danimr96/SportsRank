"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateEntry, validateSelection } from "@/lib/domain/validation";
import {
  getEntryById,
  listEntrySelections,
  lockEntry,
  unlockEntry,
  upsertEntrySelection,
} from "@/lib/data/entries";
import { getRoundById, listRoundPicksWithOptions } from "@/lib/data/rounds";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errors?: string[];
}

async function getOwnedEntry(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: "You must be logged in." } as const;
  }

  const entry = await getEntryById(supabase, entryId);
  if (!entry || entry.user_id !== user.id) {
    return { supabase, error: "Entry not found." } as const;
  }

  return { supabase, entry } as const;
}

export async function upsertSelectionAction(input: {
  entryId: string;
  pickId: string;
  pickOptionId: string;
  stake: number;
}): Promise<ActionResult> {
  const owned = await getOwnedEntry(input.entryId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }

  const { supabase, entry } = owned;

  if (entry.status !== "building") {
    return { ok: false, error: "This entry is already locked." };
  }

  const [round, picks, existingSelections] = await Promise.all([
    getRoundById(supabase, entry.round_id),
    listRoundPicksWithOptions(supabase, entry.round_id),
    listEntrySelections(supabase, entry.id),
  ]);

  if (!round) {
    return { ok: false, error: "Round not found." };
  }

  const validation = validateSelection(
    round,
    picks,
    existingSelections.map((selection) => ({
      pick_id: selection.pick_id,
      pick_option_id: selection.pick_option_id,
      stake: selection.stake,
    })),
    {
      pick_id: input.pickId,
      pick_option_id: input.pickOptionId,
      stake: input.stake,
    },
    entry.credits_start,
  );

  if (!validation.ok) {
    return {
      ok: false,
      error: "Selection validation failed.",
      errors: validation.errors.map((error) => error.message),
    };
  }

  await upsertEntrySelection(supabase, {
    entry_id: input.entryId,
    pick_id: input.pickId,
    pick_option_id: input.pickOptionId,
    stake: input.stake,
  });

  revalidatePath(`/round/${entry.round_id}`);
  revalidatePath("/dashboard");

  return { ok: true };
}

export async function lockEntryAction(input: {
  entryId: string;
}): Promise<ActionResult> {
  const owned = await getOwnedEntry(input.entryId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }

  const { supabase, entry } = owned;

  if (entry.status !== "building") {
    return { ok: false, error: "Entry is not in building status." };
  }

  const [round, picks, selections] = await Promise.all([
    getRoundById(supabase, entry.round_id),
    listRoundPicksWithOptions(supabase, entry.round_id),
    listEntrySelections(supabase, entry.id),
  ]);

  if (!round) {
    return { ok: false, error: "Round not found." };
  }

  const validation = validateEntry(
    round,
    picks,
    selections.map((selection) => ({
      pick_id: selection.pick_id,
      pick_option_id: selection.pick_option_id,
      stake: selection.stake,
    })),
    entry.credits_start,
  );

  if (!validation.ok) {
    return {
      ok: false,
      error: "Entry validation failed.",
      errors: validation.errors.map((e) => e.message),
    };
  }

  await lockEntry(supabase, entry.id);

  revalidatePath(`/round/${entry.round_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");

  return { ok: true };
}

export async function unlockEntryAction(input: {
  entryId: string;
}): Promise<ActionResult> {
  const owned = await getOwnedEntry(input.entryId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }

  const { supabase, entry } = owned;

  if (entry.status !== "locked") {
    return { ok: false, error: "Entry is not locked." };
  }

  const round = await getRoundById(supabase, entry.round_id);
  if (!round) {
    return { ok: false, error: "Round not found." };
  }

  if (new Date(round.closes_at).getTime() <= Date.now()) {
    return { ok: false, error: "Round has already closed." };
  }

  await unlockEntry(supabase, entry.id);

  revalidatePath(`/round/${entry.round_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");

  return { ok: true };
}
