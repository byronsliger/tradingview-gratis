export const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#008eff",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
} as const;

export const TV_COLORS_LIGHT = {
  bg: "#ffffff",
  panel: "#f0f3fa",
  border: "#e0e3eb",
  text: "#131722",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#008eff",
  blue: "#2962ff",
  yellow: "#f57c00",
  purple: "#ab47bc",
  grid: "#f0f3fa",
} as const;

export type ChartColors = {
  readonly bg: string;
  readonly panel: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly green: string;
  readonly red: string;
  readonly blue: string;
  readonly yellow: string;
  readonly purple: string;
  readonly grid: string;
};

export function getChartColors(theme: "dark" | "light"): ChartColors {
  return theme === "light" ? TV_COLORS_LIGHT : TV_COLORS;
}
