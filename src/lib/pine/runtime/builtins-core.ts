// Constantes y tablas compartidas entre analyze y el runtime.

/** Constantes color.* (paleta de Pine v5; hex compatible con lightweight-charts). */
export const COLOR_CONSTANTS: Record<string, string> = {
  aqua: "#00BCD4",
  black: "#000000",
  blue: "#2962FF",
  fuchsia: "#E040FB",
  gray: "#787B86",
  green: "#089981",
  lime: "#00E676",
  maroon: "#880E4F",
  navy: "#311B92",
  olive: "#808000",
  orange: "#FF9800",
  purple: "#9C27B0",
  red: "#F23645",
  silver: "#B2B5BE",
  teal: "#008080",
  white: "#FFFFFF",
  yellow: "#FDD835",
};

export const DEFAULT_PLOT_COLOR = COLOR_CONSTANTS.blue;

/** Series virtuales sobre el array de velas. */
export const SERIES_BUILTINS = new Set([
  "open",
  "high",
  "low",
  "close",
  "volume",
  "time",
  "bar_index",
  "hl2",
  "hlc3",
  "ohlc4",
]);

/** Parámetros aceptados por plot(); en Fase 1 solo series/title/color tienen efecto. */
export const PLOT_PARAMS = [
  "series",
  "title",
  "color",
  "linewidth",
  "style",
  "trackprice",
  "histbase",
  "offset",
  "display",
];

/** Parámetros aceptados por indicator(); solo title/shorttitle/overlay tienen efecto. */
export const INDICATOR_PARAMS = [
  "title",
  "shorttitle",
  "overlay",
  "format",
  "precision",
  "timeframe",
  "timeframe_gaps",
  "max_bars_back",
];
