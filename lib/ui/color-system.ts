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

const SPORT_THEMES: Record<string, SportVisualTheme> = {
  soccer: {
    sectionClassName:
      "border-emerald-700/30 bg-gradient-to-br from-emerald-200/90 via-emerald-100/85 to-cyan-100/80",
    accentClassName: "from-emerald-700/35 via-emerald-800/95 to-cyan-700/35",
    chipClassName:
      "border-emerald-700/40 bg-emerald-200/75 text-emerald-950 shadow-[0_10px_24px_-18px_rgba(6,95,70,0.55)]",
  },
  basketball: {
    sectionClassName:
      "border-orange-700/30 bg-gradient-to-br from-amber-200/88 via-orange-100/85 to-rose-100/75",
    accentClassName: "from-amber-700/35 via-orange-800/95 to-rose-700/35",
    chipClassName:
      "border-orange-700/40 bg-amber-200/75 text-orange-950 shadow-[0_10px_24px_-18px_rgba(154,52,18,0.55)]",
  },
  tennis: {
    sectionClassName:
      "border-cyan-700/30 bg-gradient-to-br from-cyan-200/90 via-sky-100/85 to-indigo-100/78",
    accentClassName: "from-cyan-700/35 via-blue-800/95 to-indigo-700/35",
    chipClassName:
      "border-cyan-700/40 bg-cyan-200/75 text-cyan-950 shadow-[0_10px_24px_-18px_rgba(12,74,110,0.55)]",
  },
  golf: {
    sectionClassName:
      "border-lime-700/30 bg-gradient-to-br from-lime-200/88 via-emerald-100/82 to-teal-100/75",
    accentClassName: "from-lime-700/35 via-emerald-800/95 to-teal-700/35",
    chipClassName:
      "border-lime-700/40 bg-lime-200/75 text-lime-950 shadow-[0_10px_24px_-18px_rgba(63,98,18,0.55)]",
  },
  motor: {
    sectionClassName:
      "border-violet-700/30 bg-gradient-to-br from-violet-200/90 via-fuchsia-100/80 to-blue-100/75",
    accentClassName: "from-violet-700/35 via-fuchsia-800/95 to-blue-700/35",
    chipClassName:
      "border-violet-700/40 bg-violet-200/75 text-violet-950 shadow-[0_10px_24px_-18px_rgba(76,29,149,0.55)]",
  },
};

const DEFAULT_SPORT_THEME: SportVisualTheme = {
  sectionClassName:
    "border-fuchsia-700/30 bg-gradient-to-br from-fuchsia-200/88 via-violet-100/80 to-cyan-100/72",
  accentClassName: "from-fuchsia-700/34 via-violet-800/95 to-cyan-700/35",
  chipClassName:
    "border-fuchsia-700/40 bg-fuchsia-200/75 text-fuchsia-950 shadow-[0_10px_24px_-18px_rgba(134,25,143,0.55)]",
};

const BOARD_THEMES: Record<BoardType, BoardVisualTheme> = {
  daily: {
    panelClassName:
      "border-emerald-700/30 bg-gradient-to-r from-emerald-200/85 via-emerald-100/80 to-cyan-100/75",
    badgeClassName: "border-emerald-700/40 bg-emerald-200/80 text-emerald-950",
    dotClassName: "text-emerald-700",
    statCardClassName:
      "border-emerald-700/30 bg-gradient-to-br from-emerald-200/88 to-cyan-100/72 shadow-[0_18px_38px_-26px_rgba(5,150,105,0.55)]",
  },
  weekly: {
    panelClassName:
      "border-violet-700/30 bg-gradient-to-r from-violet-200/85 via-violet-100/80 to-fuchsia-100/75",
    badgeClassName: "border-violet-700/40 bg-violet-200/80 text-violet-950",
    dotClassName: "text-violet-700",
    statCardClassName:
      "border-violet-700/30 bg-gradient-to-br from-violet-200/88 to-fuchsia-100/72 shadow-[0_18px_38px_-26px_rgba(109,40,217,0.55)]",
  },
  other: {
    panelClassName: "border-slate-300/80 bg-white/88",
    badgeClassName: "border-slate-300/85 bg-white text-slate-900",
    dotClassName: "text-slate-600",
    statCardClassName: "border-slate-300/80 bg-white/90",
  },
};

export type ActionTone = "primary" | "secondary" | "success" | "neutral";

export function getActionButtonClass(tone: ActionTone): string {
  if (tone === "primary") {
    return "bg-gradient-to-r from-cyan-700 via-blue-700 to-emerald-700 text-white hover:brightness-110";
  }
  if (tone === "secondary") {
    return "bg-gradient-to-r from-violet-700 via-fuchsia-700 to-rose-700 text-white hover:brightness-110";
  }
  if (tone === "success") {
    return "bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 text-white hover:brightness-110";
  }
  return "border-slate-300/85 bg-white/95 text-slate-700 hover:border-cyan-500/60 hover:bg-cyan-100/70 hover:text-slate-900";
}

export function getSportVisualTheme(sportSlug: string): SportVisualTheme {
  return SPORT_THEMES[sportSlug] ?? DEFAULT_SPORT_THEME;
}

export function getBoardVisualTheme(boardType: BoardType): BoardVisualTheme {
  return BOARD_THEMES[boardType];
}
