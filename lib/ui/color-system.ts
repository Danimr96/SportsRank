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
    sectionClassName: "border-emerald-500/55 bg-emerald-100/85",
    accentClassName: "from-emerald-600/32 via-emerald-700/90 to-cyan-600/34",
    chipClassName: "border-emerald-500/45 bg-emerald-100 text-emerald-900",
  },
  basketball: {
    sectionClassName: "border-orange-500/55 bg-orange-100/85",
    accentClassName: "from-amber-600/34 via-orange-700/90 to-rose-600/34",
    chipClassName: "border-orange-500/45 bg-orange-100 text-orange-900",
  },
  tennis: {
    sectionClassName: "border-cyan-500/55 bg-cyan-100/85",
    accentClassName: "from-cyan-600/34 via-blue-700/88 to-indigo-600/32",
    chipClassName: "border-cyan-500/45 bg-cyan-100 text-cyan-900",
  },
  golf: {
    sectionClassName: "border-lime-500/55 bg-lime-100/85",
    accentClassName: "from-lime-600/34 via-emerald-700/88 to-cyan-600/30",
    chipClassName: "border-lime-500/45 bg-lime-100 text-lime-900",
  },
  motor: {
    sectionClassName: "border-violet-500/55 bg-violet-100/85",
    accentClassName: "from-violet-600/34 via-fuchsia-700/88 to-blue-700/32",
    chipClassName: "border-violet-500/45 bg-violet-100 text-violet-900",
  },
};

const DEFAULT_SPORT_THEME: SportVisualTheme = {
  sectionClassName: "border-fuchsia-500/50 bg-fuchsia-100/80",
  accentClassName: "from-fuchsia-600/30 via-violet-700/90 to-cyan-600/30",
  chipClassName: "border-fuchsia-500/45 bg-fuchsia-100 text-fuchsia-900",
};

const BOARD_THEMES: Record<BoardType, BoardVisualTheme> = {
  daily: {
    panelClassName: "border-emerald-500/55 bg-emerald-100/80",
    badgeClassName: "border-emerald-500/60 bg-emerald-200 text-emerald-900",
    dotClassName: "text-emerald-700",
    statCardClassName:
      "border-emerald-500/50 bg-emerald-100/85 shadow-[0_16px_34px_-24px_rgba(5,150,105,0.5)]",
  },
  weekly: {
    panelClassName: "border-violet-500/55 bg-violet-100/80",
    badgeClassName: "border-violet-500/60 bg-violet-200 text-violet-900",
    dotClassName: "text-violet-700",
    statCardClassName:
      "border-violet-500/50 bg-violet-100/85 shadow-[0_16px_34px_-24px_rgba(109,40,217,0.5)]",
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
