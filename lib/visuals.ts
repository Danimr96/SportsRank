export function getSportEmoji(sportSlug: string): string {
  if (sportSlug === "soccer") return "⚽";
  if (sportSlug === "basketball") return "🏀";
  if (sportSlug === "tennis") return "🎾";
  if (sportSlug === "golf") return "⛳";
  if (sportSlug === "motor") return "🏎️";
  if (sportSlug === "american-football") return "🏈";
  if (sportSlug === "baseball") return "⚾";
  if (sportSlug === "hockey") return "🏒";
  if (sportSlug === "combat") return "🥊";
  return "🎯";
}

export function getBoardEmoji(boardType: "daily" | "weekly" | "other"): string {
  if (boardType === "daily") return "☀️";
  if (boardType === "weekly") return "📅";
  return "🧩";
}

export function getLeagueEmoji(leagueName: string): string {
  const normalized = leagueName.toLowerCase();
  if (normalized.includes("premier") || normalized.includes("liga") || normalized.includes("serie a") || normalized.includes("uefa")) {
    return "⚽";
  }
  if (normalized.includes("nba") || normalized.includes("euroleague") || normalized.includes("ncaab")) {
    return "🏀";
  }
  if (normalized.includes("atp") || normalized.includes("wta")) {
    return "🎾";
  }
  if (normalized.includes("pga") || normalized.includes("masters")) {
    return "⛳";
  }
  if (normalized.includes("f1") || normalized.includes("formula")) {
    return "🏎️";
  }
  return "🏟️";
}

const COUNTRY_TO_ISO: Record<string, string> = {
  England: "GB",
  "United Kingdom": "GB",
  Spain: "ES",
  Italy: "IT",
  Germany: "DE",
  France: "FR",
  Europe: "EU",
  "United States": "US",
  USA: "US",
  International: "UN",
  General: "UN",
  Portugal: "PT",
  Netherlands: "NL",
  Belgium: "BE",
  Brazil: "BR",
  Argentina: "AR",
  Mexico: "MX",
  Turkey: "TR",
  Saudi: "SA",
  "Saudi Arabia": "SA",
  Japan: "JP",
  Australia: "AU",
  Chile: "CL",
  Colombia: "CO",
  Uruguay: "UY",
  Scotland: "GB",
  Wales: "GB",
  Ireland: "IE",
};

function toRegionalIndicator(char: string): string {
  return String.fromCodePoint(char.charCodeAt(0) + 127397);
}

function isoToFlag(iso: string): string {
  if (iso === "EU") return "🇪🇺";
  if (iso === "UN") return "🌍";
  if (iso.length !== 2) return "🏳️";
  const upper = iso.toUpperCase();
  return `${toRegionalIndicator(upper[0] ?? "U")}${toRegionalIndicator(upper[1] ?? "N")}`;
}

export function getCountryFlag(countryName: string): string {
  const iso = COUNTRY_TO_ISO[countryName];
  if (iso) {
    return isoToFlag(iso);
  }
  return "🏳️";
}
