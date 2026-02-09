import type {
  ImportedPickInput,
  ImportedPickOptionInput,
  ImportedPicksPayload,
  ParsePayloadResult,
  PicksPreviewSummary,
  ValidationResult,
} from "@/lib/ingestion/types";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asInteger(value: unknown): number | null {
  const numberValue = asNumber(value);
  if (numberValue === null || !Number.isInteger(numberValue)) {
    return null;
  }

  return numberValue;
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return (
    value.includes("T") &&
    (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value))
  );
}

function normalizeOption(
  raw: unknown,
  pickPath: string,
  optionIndex: number,
  errors: string[],
): ImportedPickOptionInput | null {
  if (!isRecord(raw)) {
    errors.push(`${pickPath}.options[${optionIndex}] must be an object.`);
    return null;
  }

  const label = asString(raw["label"]);
  if (!label) {
    errors.push(`${pickPath}.options[${optionIndex}].label is required.`);
  }

  const odds = asNumber(raw["odds"]);
  if (odds === null || odds <= 1) {
    errors.push(`${pickPath}.options[${optionIndex}].odds must be a number > 1.`);
  }

  if (!label || odds === null || odds <= 1) {
    return null;
  }

  return {
    label,
    odds,
  };
}

function normalizePick(
  raw: unknown,
  index: number,
  errors: string[],
): ImportedPickInput | null {
  const basePath = `picks[${index}]`;

  if (!isRecord(raw)) {
    errors.push(`${basePath} must be an object.`);
    return null;
  }

  const sportSlug = asString(raw["sport_slug"]);
  if (!sportSlug) {
    errors.push(`${basePath}.sport_slug is required.`);
  }

  const title = asString(raw["title"]);
  if (!title) {
    errors.push(`${basePath}.title is required.`);
  }

  let description: string | null = null;
  if (raw["description"] === undefined || raw["description"] === null) {
    description = null;
  } else {
    const nextDescription = asString(raw["description"]);
    if (nextDescription === null) {
      errors.push(`${basePath}.description must be a string when provided.`);
    } else {
      description = nextDescription;
    }
  }

  const orderIndex = asInteger(raw["order_index"]);
  if (orderIndex === null || orderIndex < 0) {
    errors.push(`${basePath}.order_index must be an integer >= 0.`);
  }

  const optionsRaw = raw["options"];
  if (!Array.isArray(optionsRaw) || optionsRaw.length < 2) {
    errors.push(`${basePath}.options must contain at least 2 options.`);
  }

  const normalizedOptions = Array.isArray(optionsRaw)
    ? optionsRaw
        .map((option, optionIndex) =>
          normalizeOption(option, basePath, optionIndex, errors),
        )
        .filter((option): option is ImportedPickOptionInput => option !== null)
    : [];

  const metadataRaw = raw["metadata"];
  if (!isRecord(metadataRaw)) {
    errors.push(`${basePath}.metadata must be an object.`);
    return null;
  }

  const league = asString(metadataRaw["league"]);
  if (!league) {
    errors.push(`${basePath}.metadata.league is required.`);
  }

  const event = asString(metadataRaw["event"]);
  if (!event) {
    errors.push(`${basePath}.metadata.event is required.`);
  }

  const startTime = asString(metadataRaw["start_time"]);
  if (!startTime) {
    errors.push(`${basePath}.metadata.start_time is required.`);
  } else if (!isIsoDate(startTime)) {
    errors.push(
      `${basePath}.metadata.start_time must be an ISO 8601 UTC string (e.g. 2026-02-09T18:00:00.000Z).`,
    );
  }

  if (
    !sportSlug ||
    !title ||
    orderIndex === null ||
    orderIndex < 0 ||
    normalizedOptions.length < 2 ||
    !league ||
    !event ||
    !startTime ||
    !isIsoDate(startTime)
  ) {
    return null;
  }

  return {
    sport_slug: sportSlug,
    title,
    description,
    order_index: orderIndex,
    options: normalizedOptions,
    metadata: {
      league,
      event,
      start_time: startTime,
    },
  };
}

function validateNormalizedPayload(payload: ImportedPicksPayload): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!UUID_V4_REGEX.test(payload.round_id)) {
    errors.push("round_id must be a valid UUID.");
  }

  if (payload.picks.length === 0) {
    errors.push("picks must contain at least one item.");
  }

  const seenOrderIndexes = new Set<number>();
  const seenTitles = new Set<string>();

  for (const [index, pick] of payload.picks.entries()) {
    if (seenOrderIndexes.has(pick.order_index)) {
      errors.push(`Duplicate order_index found at picks[${index}].`);
    }
    seenOrderIndexes.add(pick.order_index);

    const titleKey = `${pick.sport_slug.toLowerCase()}::${pick.title.toLowerCase()}`;
    if (seenTitles.has(titleKey)) {
      warnings.push(`Duplicate title detected for sport '${pick.sport_slug}': ${pick.title}`);
    }
    seenTitles.add(titleKey);

    for (const option of pick.options) {
      if (option.odds > 15) {
        warnings.push(
          `High odds detected in '${pick.title}' (${option.label} = ${option.odds}).`,
        );
      }
      if (option.odds < 1.05) {
        warnings.push(
          `Low odds detected in '${pick.title}' (${option.label} = ${option.odds}).`,
        );
      }
    }
  }

  if (payload.picks.length < 10) {
    warnings.push("Generated/imported payload contains fewer than 10 picks.");
  }

  return { errors, warnings };
}

export function parseImportPayload(jsonInput: string): ParsePayloadResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonInput);
  } catch {
    return {
      payload: null,
      errors: ["Payload is not valid JSON."],
      warnings,
    };
  }

  if (!isRecord(parsed)) {
    return {
      payload: null,
      errors: ["Top-level payload must be an object."],
      warnings,
    };
  }

  const roundId = asString(parsed["round_id"]);
  if (!roundId) {
    errors.push("round_id is required.");
  }

  const picksRaw = parsed["picks"];
  if (!Array.isArray(picksRaw)) {
    errors.push("picks must be an array.");
  }

  const normalizedPicks = Array.isArray(picksRaw)
    ? picksRaw
        .map((pick, index) => normalizePick(pick, index, errors))
        .filter((pick): pick is ImportedPickInput => pick !== null)
    : [];

  if (!roundId || errors.length > 0) {
    return {
      payload: null,
      errors,
      warnings,
    };
  }

  const payload: ImportedPicksPayload = {
    round_id: roundId,
    picks: normalizedPicks,
  };

  const normalizedValidation = validateNormalizedPayload(payload);

  return {
    payload,
    errors: [...errors, ...normalizedValidation.errors],
    warnings: [...warnings, ...normalizedValidation.warnings],
  };
}

export function validateGeneratedPicks(
  payload: ImportedPicksPayload,
): ValidationResult {
  const baseValidation = validateNormalizedPayload(payload);
  const errors = [...baseValidation.errors];

  for (const [pickIndex, pick] of payload.picks.entries()) {
    if (!pick.metadata.start_time || !isIsoDate(pick.metadata.start_time)) {
      errors.push(
        `Generated picks[${pickIndex}] must include a valid metadata.start_time ISO string.`,
      );
    }

    if (pick.options.length < 2) {
      errors.push(`Generated picks[${pickIndex}] must include at least 2 options.`);
    }

    for (const [optionIndex, option] of pick.options.entries()) {
      if (!option.label || option.label.trim().length === 0) {
        errors.push(
          `Generated picks[${pickIndex}].options[${optionIndex}].label is required.`,
        );
      }
      if (!Number.isFinite(option.odds) || option.odds <= 1) {
        errors.push(
          `Generated picks[${pickIndex}].options[${optionIndex}].odds must be > 1.`,
        );
      }
    }
  }

  return {
    errors,
    warnings: baseValidation.warnings,
  };
}

export function summarizePicksPayload(
  payload: ImportedPicksPayload,
): PicksPreviewSummary {
  let minOdds = Number.POSITIVE_INFINITY;
  let maxOdds = Number.NEGATIVE_INFINITY;

  const countsBySport = payload.picks.reduce<Record<string, number>>((acc, pick) => {
    acc[pick.sport_slug] = (acc[pick.sport_slug] ?? 0) + 1;
    for (const option of pick.options) {
      minOdds = Math.min(minOdds, option.odds);
      maxOdds = Math.max(maxOdds, option.odds);
    }
    return acc;
  }, {});

  if (!Number.isFinite(minOdds)) {
    minOdds = 0;
  }

  if (!Number.isFinite(maxOdds)) {
    maxOdds = 0;
  }

  return {
    total_picks: payload.picks.length,
    counts_by_sport: countsBySport,
    min_odds: minOdds,
    max_odds: maxOdds,
  };
}
