import type { PicksPreviewSummary } from "@/lib/ingestion/types";

export interface ImportActionState {
  status: "idle" | "error" | "preview" | "success";
  message: string | null;
  errors: string[];
  warnings: string[];
  preview: PicksPreviewSummary | null;
  inserted: { picks: number; options: number } | null;
  roundId: string | null;
}

export const initialImportState: ImportActionState = {
  status: "idle",
  message: null,
  errors: [],
  warnings: [],
  preview: null,
  inserted: null,
  roundId: null,
};
