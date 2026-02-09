"use server";

import { revalidatePath } from "next/cache";
import { requireAdminClient } from "@/app/actions/admin";
import {
  insertImportedPickOptions,
  insertImportedPicks,
  listSports,
} from "@/lib/data/admin";
import { getRoundById } from "@/lib/data/rounds";
import { buildPickInsertPlan } from "@/lib/ingestion/plan";
import {
  parseImportPayload,
  summarizePicksPayload,
} from "@/lib/ingestion/validation";
import type { ImportActionState } from "@/lib/ingestion/import-state";

async function extractJsonPayload(formData: FormData): Promise<string | null> {
  const fileInput = formData.get("json_file");
  if (fileInput instanceof File && fileInput.size > 0) {
    return fileInput.text();
  }

  const textInput = String(formData.get("payload") ?? "").trim();
  if (textInput.length > 0) {
    return textInput;
  }

  return null;
}

function createErrorState(
  message: string,
  errors: string[] = [],
  warnings: string[] = [],
): ImportActionState {
  return {
    status: "error",
    message,
    errors,
    warnings,
    preview: null,
    inserted: null,
    roundId: null,
  };
}

export async function importPicksAction(
  _: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const intent = String(formData.get("intent") ?? "preview");
    const rawPayload = await extractJsonPayload(formData);

    if (!rawPayload) {
      return createErrorState("Provide a JSON payload through file upload or textarea.");
    }

    const parsed = parseImportPayload(rawPayload);
    if (!parsed.payload) {
      return createErrorState("Payload validation failed.", parsed.errors, parsed.warnings);
    }

    if (parsed.errors.length > 0) {
      return createErrorState("Payload validation failed.", parsed.errors, parsed.warnings);
    }

    const supabase = await requireAdminClient();

    const [round, sports] = await Promise.all([
      getRoundById(supabase, parsed.payload.round_id),
      listSports(supabase),
    ]);

    if (!round) {
      return createErrorState("Round not found.", [], parsed.warnings);
    }

    if (round.status !== "draft") {
      return createErrorState(
        `Round ${round.name} must be in draft status for import.`,
        [],
        parsed.warnings,
      );
    }

    const sportSlugToId = sports.reduce<Record<string, string>>((acc, sport) => {
      acc[sport.slug] = sport.id;
      return acc;
    }, {});

    const plan = buildPickInsertPlan(
      parsed.payload,
      sportSlugToId,
      () => crypto.randomUUID(),
    );

    if (plan.errors.length > 0) {
      return createErrorState("Import planning failed.", plan.errors, parsed.warnings);
    }

    const preview = summarizePicksPayload(parsed.payload);

    if (intent !== "import") {
      return {
        status: "preview",
        message: "Preview ready. No records inserted.",
        errors: [],
        warnings: parsed.warnings,
        preview,
        inserted: null,
        roundId: parsed.payload.round_id,
      };
    }

    await insertImportedPicks(supabase, plan.pickRows);
    await insertImportedPickOptions(supabase, plan.optionRows);

    revalidatePath("/admin/rounds");
    revalidatePath(`/admin/rounds/${parsed.payload.round_id}`);
    revalidatePath(`/admin/settle/${parsed.payload.round_id}`);
    revalidatePath("/admin/import");

    return {
      status: "success",
      message: "Import completed. Picks inserted as draft content.",
      errors: [],
      warnings: parsed.warnings,
      preview,
      inserted: {
        picks: plan.pickRows.length,
        options: plan.optionRows.length,
      },
      roundId: parsed.payload.round_id,
    };
  } catch (error) {
    return createErrorState((error as Error).message);
  }
}
