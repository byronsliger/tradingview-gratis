import type { Candle } from "@/lib/binance/types";
import type { ADXPoint } from "./types";

function rma(source: number[], length: number, startIndex = 0): number[] {
  const out: number[] = new Array(source.length).fill(0);
  if (source.length - startIndex < length) return out;
  
  let sum = 0;
  for (let i = startIndex; i < startIndex + length; i++) {
    sum += source[i];
  }
  out[startIndex + length - 1] = sum / length;
  
  const alpha = 1 / length;
  for (let i = startIndex + length; i < source.length; i++) {
    out[i] = alpha * source[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

export function adx(
  candles: Candle[],
  adxlen = 14,
  dilen = 14
): ADXPoint[] {
  const n = candles.length;
  if (n < Math.max(adxlen, dilen)) return [];

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  const tr = new Array(n).fill(0);
  const up = new Array(n).fill(0);
  const down = new Array(n).fill(0);
  
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
    
    up[i] = highs[i] - highs[i - 1];
    down[i] = lows[i - 1] - lows[i];
  }

  const plusSrc = new Array(n).fill(0);
  const minusSrc = new Array(n).fill(0);
  
  for (let i = 0; i < n; i++) {
    plusSrc[i] = (up[i] > down[i] && up[i] > 0) ? up[i] : 0;
    minusSrc[i] = (down[i] > up[i] && down[i] > 0) ? down[i] : 0;
  }

  const trRma = rma(tr, dilen, 0);
  const plusRma = rma(plusSrc, dilen, 0);
  const minusRma = rma(minusSrc, dilen, 0);

  const plusDI = new Array(n).fill(0);
  const minusDI = new Array(n).fill(0);
  
  let lastPlus = 0;
  let lastMinus = 0;
  for (let i = 0; i < n; i++) {
    if (trRma[i] === 0 || i < dilen - 1) {
      plusDI[i] = lastPlus;
      minusDI[i] = lastMinus;
    } else {
      lastPlus = 100 * plusRma[i] / trRma[i];
      lastMinus = 100 * minusRma[i] / trRma[i];
      plusDI[i] = lastPlus;
      minusDI[i] = lastMinus;
    }
  }

  const dxSrc = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i < dilen - 1) continue;
    const sum = plusDI[i] + minusDI[i];
    dxSrc[i] = Math.abs(plusDI[i] - minusDI[i]) / (sum === 0 ? 1 : sum);
  }

  const adxRma = rma(dxSrc, adxlen, dilen - 1);
  
  const out: ADXPoint[] = [];
  const warmup = dilen + adxlen - 2;
  for (let i = warmup; i < n; i++) {
    out.push({
      time: candles[i].time,
      adx: 100 * adxRma[i],
      plusDI: plusDI[i],
      minusDI: minusDI[i],
    });
  }

  return out;
}
