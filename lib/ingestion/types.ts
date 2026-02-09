export interface PickMetadata {
  league: string;
  event: string;
  start_time: string;
}

export interface ImportedPickOptionInput {
  label: string;
  odds: number;
}

export interface ImportedPickInput {
  sport_slug: string;
  title: string;
  description: string | null;
  order_index: number;
  options: ImportedPickOptionInput[];
  metadata: PickMetadata;
}

export interface ImportedPicksPayload {
  round_id: string;
  picks: ImportedPickInput[];
}

export interface PicksPreviewSummary {
  total_picks: number;
  counts_by_sport: Record<string, number>;
  min_odds: number;
  max_odds: number;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ParsePayloadResult extends ValidationResult {
  payload: ImportedPicksPayload | null;
}

export interface PlannedPickInsertRow {
  id: string;
  round_id: string;
  sport_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  metadata: PickMetadata;
}

export interface PlannedPickOptionInsertRow {
  id: string;
  pick_id: string;
  label: string;
  odds: number;
  result: "pending";
}

export interface InsertPlanResult {
  pickRows: PlannedPickInsertRow[];
  optionRows: PlannedPickOptionInsertRow[];
  errors: string[];
}
