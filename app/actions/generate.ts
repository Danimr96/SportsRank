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
import type { PicksPreviewSummary } from "@/lib/ingestion/types";
import { transformRawOddsToPicks } from "@/lib/ingestion/transform";
import {
  summarizePicksPayload,
  validateGeneratedPicks,
} from "@/lib/ingestion/validation";
import { MockProvider } from "@/lib/providers/mock-provider";

export interface GenerateActionState {
  status: "idle" | "error" | "preview" | "success";
  message: string | null;
  errors: string[];
  warnings: string[];
  preview: PicksPreviewSummary | null;
  inserted: { picks: number; options: number } | null;
  generated: { events: number; odds_markets: number } | null;
  roundId: string | null;
}

export const initialGenerateState: GenerateActionState = {
  status: "idle",
  message: null,
  errors: [],
  warnings: [],
  preview: null,
  inserted: null,
  generated: null,
  roundId: null,
};

function createErrorState(
  message: string,
  errors: string[] = [],
  warnings: string[] = [],
): GenerateActionState {
  return {
    status: "error",
    message,
    errors,
    warnings,
    preview: null,
    inserted: null,
    generated: null,
    roundId: null,
  };
}

function parseCsv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function normalizeDateInput(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export async function generatePicksAction(
  _: GenerateActionState,
  formData: FormData,
): Promise<GenerateActionState> {
  try {
    const intent = String(formData.get("intent") ?? "preview");
    const roundId = String(formData.get("round_id") ?? "").trim();
    const sports = parseCsv(formData.get("sports"));
    const markets = parseCsv(formData.get("markets"));
    const start = normalizeDateInput(formData.get("start"));
    const end = normalizeDateInput(formData.get("end"));

    if (!roundId) {
      return createErrorState("round_id is required.");
    }

    if (sports.length === 0) {
      return createErrorState("At least one sport slug is required.");
    }

    if (!start || !end) {
      return createErrorState("Valid start and end date/time values are required.");
    }

    if (new Date(end).getTime() <= new Date(start).getTime()) {
      return createErrorState("end must be after start.");
    }

    const supabase = await requireAdminClient();

    const [round, availableSports] = await Promise.all([
      getRoundById(supabase, roundId),
      listSports(supabase),
    ]);

    if (!round) {
      return createErrorState("Round not found.");
    }

    if (round.status !== "draft") {
      return createErrorState(
        `Round ${round.name} must be in draft status for generation.`,
      );
    }

    const sportSlugToId = availableSports.reduce<Record<string, string>>((acc, sport) => {
      acc[sport.slug] = sport.id;
      return acc;
    }, {});

    const unknownSports = sports.filter((sport) => !sportSlugToId[sport]);
    if (unknownSports.length > 0) {
      return createErrorState(
        `Unknown sport slugs: ${unknownSports.join(", ")}`,
      );
    }

    const provider = new MockProvider();
    const events = await provider.fetchUpcomingEvents(sports, start, end);
    if (events.length === 0) {
      return createErrorState("MockProvider returned no events for the selected window.");
    }

    const odds = await provider.fetchOddsForEvents(
      events.map((event) => event.id),
      markets,
    );

    const payload = transformRawOddsToPicks({
      round_id: roundId,
      events,
      odds,
    });

    const validation = validateGeneratedPicks(payload);
    if (validation.errors.length > 0) {
      return createErrorState(
        "Generated payload failed validation.",
        validation.errors,
        validation.warnings,
      );
    }

    const plan = buildPickInsertPlan(payload, sportSlugToId, () => crypto.randomUUID());
    if (plan.errors.length > 0) {
      return createErrorState(
        "Generated payload could not be mapped to DB rows.",
        plan.errors,
        validation.warnings,
      );
    }

    const preview = summarizePicksPayload(payload);

    if (intent !== "import") {
      return {
        status: "preview",
        message: "Preview ready using MockProvider. No records inserted.",
        errors: [],
        warnings: validation.warnings,
        preview,
        inserted: null,
        generated: {
          events: events.length,
          odds_markets: odds.length,
        },
        roundId,
      };
    }

    await insertImportedPicks(supabase, plan.pickRows);
    await insertImportedPickOptions(supabase, plan.optionRows);

    revalidatePath("/admin/rounds");
    revalidatePath(`/admin/rounds/${roundId}`);
    revalidatePath(`/admin/settle/${roundId}`);
    revalidatePath("/admin/generate");

    return {
      status: "success",
      message: "Generation and import completed using MockProvider.",
      errors: [],
      warnings: validation.warnings,
      preview,
      inserted: {
        picks: plan.pickRows.length,
        options: plan.optionRows.length,
      },
      generated: {
        events: events.length,
        odds_markets: odds.length,
      },
      roundId,
    };
  } catch (error) {
    return createErrorState((error as Error).message);
  }
}
