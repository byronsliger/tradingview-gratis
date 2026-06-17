// Utilidades de timeframe: parseo de strings (Binance/TradingView) → segundos y
// metadatos (multiplier, unidad, isdaily/isweekly/ismonthly). Compartido por el
// runtime de los builtins timeframe.* y por request.security (alineación HTF).

export type TimeframeUnit = "minute" | "day" | "week" | "month";

export interface TimeframeInfo {
  /** Número de segundos de un periodo del timeframe. */
  seconds: number;
  /** Multiplicador del timeframe (p. ej. 240→4 en formato "4h", 15→15). */
  multiplier: number;
  unit: TimeframeUnit;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = 604_800;
// Mes "calendario" aproximado a 30 días (Pine usa periodos de calendario; aquí
// solo necesitamos un nº de segundos para in_seconds() y para detectar cambios
// de periodo por agrupación temporal).
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY;

/**
 * Parsea un timeframe-string al estilo TradingView/Binance → info.
 *
 * Formatos soportados:
 *  - minutos puros: "1", "5", "15", "60", "240" (número = minutos, como en TV).
 *  - con sufijo de unidad: "1m"/"3m" (minuto), "1h"/"4h" (hora), "1D"/"D" (día),
 *    "1W"/"W" (semana), "1M"/"M" (mes). El sufijo "S" (segundos) se soporta como
 *    aproximación (multiplier en segundos).
 *
 * Devuelve null si no se puede resolver (timeframe dinámico/desconocido).
 */
export function parseTimeframe(tf: string): TimeframeInfo | null {
  const raw = tf.trim();
  if (raw === "") return null;

  // Número puro → minutos (semántica TradingView: "60" = 60 minutos).
  if (/^\d+$/.test(raw)) {
    const mult = parseInt(raw, 10);
    if (mult <= 0) return null;
    return { seconds: mult * SECONDS_PER_MINUTE, multiplier: mult, unit: "minute" };
  }

  // <número opcional><unidad>. Unidad: S/m/h/H/D/W/M (M=mes, m=minuto).
  const match = /^(\d*)\s*([a-zA-Z])$/.exec(raw);
  if (!match) {
    // Binance compuestos del proyecto: "1m","3m","5m","15m","30m","1h","2h",… ya
    // los cubre el regex de arriba. Cualquier otro patrón → no resoluble.
    return null;
  }
  const mult = match[1] === "" ? 1 : parseInt(match[1], 10);
  if (mult <= 0) return null;
  const unitChar = match[2];

  switch (unitChar) {
    case "S": // segundos (aproximación; no usado por el SMC)
      return { seconds: mult, multiplier: mult, unit: "minute" };
    case "m": // minuto (minúscula)
      return { seconds: mult * SECONDS_PER_MINUTE, multiplier: mult, unit: "minute" };
    case "h":
    case "H": // hora → se expresa en minutos como multiplier (TV usa minutos)
      return {
        seconds: mult * SECONDS_PER_HOUR,
        multiplier: mult * 60,
        unit: "minute",
      };
    case "D":
    case "d":
      return { seconds: mult * SECONDS_PER_DAY, multiplier: mult, unit: "day" };
    case "W":
    case "w":
      return { seconds: mult * SECONDS_PER_WEEK, multiplier: mult, unit: "week" };
    case "M":
      return { seconds: mult * SECONDS_PER_MONTH, multiplier: mult, unit: "month" };
    default:
      return null;
  }
}

/** Segundos de un timeframe-string; null si no es resoluble. */
export function timeframeSeconds(tf: string): number | null {
  return parseTimeframe(tf)?.seconds ?? null;
}

/**
 * Identificador de periodo de un timestamp (segundos UNIX) para un timeframe dado.
 * Dos tiempos en el MISMO periodo del tf comparten id. Se usa para timeframe.change()
 * (true cuando el periodo de la barra actual difiere del de la anterior).
 *
 * Para minutos/día/semana usamos floor(time/seconds) (alineado a la época UNIX, que
 * cae en jueves — suficiente para detectar transiciones de periodo). Para mes usamos
 * el par año-mes calendario (UTC) para que el cambio caiga en el día 1.
 */
export function periodId(timeSec: number, info: TimeframeInfo): number {
  if (info.unit === "month") {
    const d = new Date(timeSec * 1000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  }
  return Math.floor(timeSec / info.seconds);
}
