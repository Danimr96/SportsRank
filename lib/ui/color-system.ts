export type BoardType = "daily" | "weekly" | "other";

interface SportVisualTheme {
  sectionClassName: string;
  accentClassName: string;
  chipClassName: string;
}

interface BoardVisualTheme {
  panelClassName: string;
  badgeClassName: string;
  dotClassName: string;
  statCardClassName: string;
}

// Editorial-first palette: calm neutrals + one accent tone.
const SHARED_SPORT_THEME: SportVisualTheme = {
  sectionClassName: "border-stone-200 bg-white",
  accentClassName: "bg-accent/80",
  chipClassName: "border-stone-300 bg-stone-100 text-stone-700",
};

const SPORT_THEMES: Record<string, SportVisualTheme> = {
  soccer: SHARED_SPORT_THEME,
  basketball: SHARED_SPORT_THEME,
  tennis: SHARED_SPORT_THEME,
  golf: SHARED_SPORT_THEME,
  motor: SHARED_SPORT_THEME,
  "american-football": SHARED_SPORT_THEME,
  baseball: SHARED_SPORT_THEME,
  hockey: SHARED_SPORT_THEME,
  combat: SHARED_SPORT_THEME,
};

const DEFAULT_SPORT_THEME: SportVisualTheme = SHARED_SPORT_THEME;

const BOARD_THEMES: Record<BoardType, BoardVisualTheme> = {
  daily: {
    panelClassName: "border-accent/25 bg-accent/5",
    badgeClassName: "border-accent/35 bg-accent/10 text-accent-700",
    dotClassName: "text-accent",
    statCardClassName: "border-accent/20 bg-accent/5",
  },
  weekly: {
    panelClassName: "border-stone-300 bg-stone-100/70",
    badgeClassName: "border-stone-300 bg-stone-100 text-stone-700",
    dotClassName: "text-stone-500",
    statCardClassName: "border-stone-300 bg-stone-100/70",
  },
  other: {
    panelClassName: "border-stone-300 bg-white",
    badgeClassName: "border-stone-300 bg-white text-stone-700",
    dotClassName: "text-stone-500",
    statCardClassName: "border-stone-300 bg-white",
  },
};

export type ActionTone = "primary" | "secondary" | "success" | "neutral";

export function getActionButtonClass(tone: ActionTone): string {
  if (tone === "primary") {
    return "bg-forest text-bone hover:bg-forest-700";
  }
  if (tone === "secondary") {
    return "bg-clay text-ink hover:bg-[#c47d53]";
  }
  if (tone === "success") {
    return "bg-forest text-bone hover:bg-forest-700";
  }
  return "border-stone-400/70 bg-transparent text-ink hover:border-stone-500 hover:bg-bone-100";
}

export function getSportVisualTheme(sportSlug: string): SportVisualTheme {
  return SPORT_THEMES[sportSlug] ?? DEFAULT_SPORT_THEME;
}

export function getBoardVisualTheme(boardType: BoardType): BoardVisualTheme {
  return BOARD_THEMES[boardType];
}
