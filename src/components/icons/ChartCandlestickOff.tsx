import { createLucideIcon, type IconNode } from "lucide-react";

/**
 * ChartCandlestick + la diagonal "off" que usa lucide en EyeOff/PencilOff (m2 2 20 20).
 * No existe una variante oficial "ChartCandlestickOff" en lucide-react.
 */
const iconNode: IconNode = [
  ["path", { d: "M9 5v4" }],
  ["rect", { width: "4", height: "6", x: "7", y: "9", rx: "1" }],
  ["path", { d: "M9 15v2" }],
  ["path", { d: "M17 3v2" }],
  ["rect", { width: "4", height: "8", x: "15", y: "5", rx: "1" }],
  ["path", { d: "M17 13v3" }],
  ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16" }],
  ["path", { d: "m2 2 20 20" }],
];

export const ChartCandlestickOff = createLucideIcon("chart-candlestick-off", iconNode);
