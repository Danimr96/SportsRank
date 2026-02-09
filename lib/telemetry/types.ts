export type AppEventName =
  | "view_dashboard"
  | "open_pick_drawer"
  | "save_selection"
  | "open_simulator"
  | "apply_suggestion"
  | "lock_entry";

export interface AppEventPayload {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AppEventInput {
  name: AppEventName;
  payload?: AppEventPayload;
}
