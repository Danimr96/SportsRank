import type {
  ImportedPicksPayload,
  InsertPlanResult,
  PlannedPickInsertRow,
  PlannedPickOptionInsertRow,
} from "@/lib/ingestion/types";

export function buildPickInsertPlan(
  payload: ImportedPicksPayload,
  sportSlugToId: Record<string, string>,
  idFactory: () => string,
): InsertPlanResult {
  const pickRows: PlannedPickInsertRow[] = [];
  const optionRows: PlannedPickOptionInsertRow[] = [];
  const errors: string[] = [];

  for (const pick of payload.picks) {
    const sportId = sportSlugToId[pick.sport_slug];

    if (!sportId) {
      errors.push(`Unknown sport slug: ${pick.sport_slug}`);
      continue;
    }

    const pickId = idFactory();
    pickRows.push({
      id: pickId,
      round_id: payload.round_id,
      sport_id: sportId,
      title: pick.title,
      description: pick.description,
      order_index: pick.order_index,
      is_required: true,
      metadata: pick.metadata,
    });

    for (const option of pick.options) {
      optionRows.push({
        id: idFactory(),
        pick_id: pickId,
        label: option.label,
        odds: option.odds,
        result: "pending",
      });
    }
  }

  return {
    pickRows,
    optionRows,
    errors,
  };
}
