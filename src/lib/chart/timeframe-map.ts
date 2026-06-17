// Mapeo entre los timeframe-strings de Pine Script y los códigos `Timeframe`
// de Binance (binance/types.ts). Pine usa 'D'/'W'/'M' y minutos puros
// ('60' = 60 minutos = 1h, '240' = 4h), mientras que Binance usa '1h','4h','1d',…
//
// Se usa en la mitad de app de la Fase D (MTF): request.security pide velas de
// otro timeframe; la app traduce el tf Pine al código Binance para fetchear, y
// el tf del chart (Binance) al string Pine para el RunContext.

import type { Timeframe } from "@/lib/binance/types";

/**
 * Pine timeframe-string → código Binance. `null` si el timeframe no es fetcheable
 * en Binance (request.security devolverá `na` sin romper el chart).
 *
 * Pine admite tanto minutos puros ('60','240') como sufijos de unidad ('1h','4h',
 * 'D','1D','W','1W','M','1M'). Aquí cubrimos los más comunes; cualquier otro
 * (segundos, minutos sin equivalente en Binance, etc.) cae a `null`.
 */
export function pineToBinance(tf: string): Timeframe | null {
  const raw = tf.trim();
  if (raw === "") return null;

  // Sufijos de día/semana/mes (con o sin multiplicador 1).
  switch (raw) {
    case "D":
    case "1D":
    case "1d":
      return "1d";
    case "3D":
    case "3d":
      return "3d";
    case "W":
    case "1W":
    case "1w":
      return "1w";
    case "M":
    case "1M":
      return "1M";
  }

  // Minutos puros (semántica TradingView: el número son minutos).
  if (/^\d+$/.test(raw)) {
    const mins = parseInt(raw, 10);
    return minutesToBinance(mins);
  }

  // <número opcional><unidad>: '1m','15m','1h','4h','2h','12h',…
  const match = /^(\d*)\s*([a-zA-Z])$/.exec(raw);
  if (match) {
    const mult = match[1] === "" ? 1 : parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "m": // minuto
        return minutesToBinance(mult);
      case "h":
      case "H":
        return minutesToBinance(mult * 60);
    }
  }

  return null;
}

/** Minutos → código Binance, o `null` si no hay equivalente fetcheable. */
function minutesToBinance(mins: number): Timeframe | null {
  switch (mins) {
    case 1:
      return "1m";
    case 3:
      return "3m";
    case 5:
      return "5m";
    case 15:
      return "15m";
    case 30:
      return "30m";
    case 60:
      return "1h";
    case 120:
      return "2h";
    case 240:
      return "4h";
    case 360:
      return "6h";
    case 480:
      return "8h";
    case 720:
      return "12h";
    case 1440:
      return "1d";
    case 10080:
      return "1w";
    default:
      return null;
  }
}

/**
 * Código Binance → timeframe-string de Pine. Inverso de `pineToBinance` usando
 * las formas canónicas de Pine ('D'/'W'/'M' y minutos puros '60'/'240').
 */
export function binanceToPine(tf: Timeframe): string {
  switch (tf) {
    case "1m":
      return "1";
    case "3m":
      return "3";
    case "5m":
      return "5";
    case "15m":
      return "15";
    case "30m":
      return "30";
    case "1h":
      return "60";
    case "2h":
      return "120";
    case "4h":
      return "240";
    case "6h":
      return "360";
    case "8h":
      return "480";
    case "12h":
      return "720";
    case "1d":
      return "D";
    case "3d":
      return "3D";
    case "1w":
      return "W";
    case "1M":
      return "M";
  }
}
