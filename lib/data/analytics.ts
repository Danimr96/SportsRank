import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsBoardType, AnalyticsSelectionRow } from "@/lib/domain/analytics";

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function asBoardType(rawTitle: string | null | undefined): AnalyticsBoardType {
  if (!rawTitle) {
    return "other";
  }

  const normalized = rawTitle.toUpperCase();
  if (normalized.startsWith("[DAILY]")) {
    return "daily";
  }

  if (normalized.startsWith("[WEEK]")) {
    return "weekly";
  }

  return "other";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function fallbackPayout(stake: number, odds: number, result: string): number {
  if (result === "win") {
    return Math.floor(stake * odds);
  }

  if (result === "void") {
    return stake;
  }

  return 0;
}

export async function listUserAnalyticsRows(
  client: SupabaseClient,
  userId: string,
): Promise<AnalyticsSelectionRow[]> {
  const { data, error } = await client
    .from("entries")
    .select(
      "entry_selections(stake, payout, picks(title, metadata, sports(slug, name)), pick_options(odds, result))",
    )
    .eq("user_id", userId)
    .eq("status", "settled");

  if (error) {
    throw error;
  }

  const rows: AnalyticsSelectionRow[] = [];

  for (const entryRow of data ?? []) {
    const selections = entryRow.entry_selections ?? [];

    for (const selection of selections) {
      const pick = unwrapSingle(selection.picks);
      const sport = unwrapSingle(pick?.sports);
      const option = unwrapSingle(selection.pick_options);

      const stake = Math.max(0, Math.trunc(toNumber(selection.stake)));
      const payout = selection.payout === null || selection.payout === undefined
        ? fallbackPayout(stake, toNumber(option?.odds), String(option?.result ?? "lose"))
        : Math.max(0, Math.trunc(toNumber(selection.payout)));

      const metadata = pick?.metadata as Record<string, unknown> | null | undefined;
      const startTime = typeof metadata?.["start_time"] === "string"
        ? metadata["start_time"]
        : null;

      rows.push({
        sportSlug: sport?.slug ?? "unknown",
        sportName: sport?.name ?? "Unknown",
        boardType: asBoardType(pick?.title),
        stake,
        payout,
        eventStartTime: startTime,
      });
    }
  }

  return rows;
}

interface GlobalAnalyticsRpcRow {
  sport_slug: string;
  sport_name: string;
  board_type: string;
  event_start_time: string | null;
  stake: number;
  payout: number;
}

export async function listGlobalAnalyticsRows(
  client: SupabaseClient,
): Promise<AnalyticsSelectionRow[]> {
  const { data, error } = await client.rpc("get_global_analytics_selection_rows");

  if (error) {
    throw error;
  }

  return ((data ?? []) as GlobalAnalyticsRpcRow[]).map((row) => ({
    sportSlug: row.sport_slug,
    sportName: row.sport_name,
    boardType: asBoardType(row.board_type),
    stake: Math.max(0, Math.trunc(toNumber(row.stake))),
    payout: Math.max(0, Math.trunc(toNumber(row.payout))),
    eventStartTime: row.event_start_time,
  }));
}
