import { Candle } from "../binance/types";

export interface VRVPBin {
  low: number;
  high: number;
  totalVolume: number;
  upVolume: number;
  downVolume: number;
  isInsideVA: boolean;
}

export interface VRVPResult {
  bins: VRVPBin[];
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
}

/**
 * Calculates the Volume Profile Visible Range (VRVP) for a list of candles.
 * Splits the price range into bins, accumulates volume, and computes the Value Area.
 * 
 * @param candles The visible candles to calculate on
 * @param rowLayout Whether to use "rows" or "ticks" layout
 * @param rowSize Number of rows or ticks per row
 * @param valueAreaVolumePct Target percentage of volume for Value Area (e.g. 70)
 */
export function calculateVRVP(
  candles: Candle[],
  rowLayout: "rows" | "ticks",
  rowSize: number,
  valueAreaVolumePct: number
): VRVPResult {
  if (!candles || candles.length === 0) {
    return { bins: [], pocPrice: 0, vahPrice: 0, valPrice: 0 };
  }

  // 1. Find the absolute price boundaries
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  if (minPrice === Infinity || maxPrice === -Infinity || minPrice === maxPrice) {
    // If prices are invalid or flat, fallback to single bin
    const price = minPrice === Infinity ? 0 : minPrice;
    return {
      bins: [{ low: price * 0.99, high: price * 1.01, totalVolume: 0, upVolume: 0, downVolume: 0, isInsideVA: true }],
      pocPrice: price,
      vahPrice: price * 1.01,
      valPrice: price * 0.99,
    };
  }

  // 2. Determine bin count and bin step size
  let binStep = 0;
  let binCount = 24;

  if (rowLayout === "rows") {
    binCount = Math.max(5, Math.min(1000, rowSize));
    binStep = (maxPrice - minPrice) / binCount;
  } else {
    // "ticks" layout - we estimate a tick size based on price range
    let tickSize = 0.01;
    if (minPrice > 10000) tickSize = 1;
    else if (minPrice > 1000) tickSize = 0.1;
    else if (minPrice > 10) tickSize = 0.01;
    else if (minPrice > 1) tickSize = 0.001;
    else tickSize = 0.0001;

    binStep = Math.max(tickSize, rowSize * tickSize);
    binCount = Math.ceil((maxPrice - minPrice) / binStep);
    binCount = Math.max(5, Math.min(1000, binCount));
    // Recalculate binStep to fit the range exactly if it was capped
    binStep = (maxPrice - minPrice) / binCount;
  }

  // 3. Initialize bins
  const bins: VRVPBin[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      low: minPrice + i * binStep,
      high: minPrice + (i + 1) * binStep,
      totalVolume: 0,
      upVolume: 0,
      downVolume: 0,
      isInsideVA: false,
    });
  }

  // Ensure top bin high is exactly maxPrice to avoid precision loss
  if (bins.length > 0) {
    bins[bins.length - 1].high = maxPrice;
  }

  // 4. Allocate candle volume to bins
  let totalVolumeAll = 0;
  for (const c of candles) {
    const vol = c.volume || 0;
    if (vol <= 0) continue;

    const isUp = c.close >= c.open;
    const cLow = c.low;
    const cHigh = c.high;

    if (cHigh === cLow) {
      // Put all volume into the single bin containing the price
      const idx = Math.min(binCount - 1, Math.max(0, Math.floor((c.close - minPrice) / binStep)));
      bins[idx].totalVolume += vol;
      if (isUp) {
        bins[idx].upVolume += vol;
      } else {
        bins[idx].downVolume += vol;
      }
      totalVolumeAll += vol;
    } else {
      // Distribute volume proportionally to overlapping bins
      const cRange = cHigh - cLow;
      for (let i = 0; i < binCount; i++) {
        const bin = bins[i];
        // Calculate overlap range between [bin.low, bin.high] and [cLow, cHigh]
        const overlapLow = Math.max(bin.low, cLow);
        const overlapHigh = Math.min(bin.high, cHigh);
        const overlap = overlapHigh - overlapLow;

        if (overlap > 0) {
          const distributedVol = vol * (overlap / cRange);
          bin.totalVolume += distributedVol;
          if (isUp) {
            bin.upVolume += distributedVol;
          } else {
            bin.downVolume += distributedVol;
          }
          totalVolumeAll += distributedVol;
        }
      }
    }
  }

  // 5. Find Point of Control (POC)
  let maxVol = -1;
  let pocIdx = 0;
  for (let i = 0; i < binCount; i++) {
    if (bins[i].totalVolume > maxVol) {
      maxVol = bins[i].totalVolume;
      pocIdx = i;
    }
  }

  const pocPrice = (bins[pocIdx].low + bins[pocIdx].high) / 2;

  // 6. Calculate Value Area (VAH / VAL)
  // Value Area Volume defaults to 70% of total volume
  const targetVolume = totalVolumeAll * (valueAreaVolumePct / 100);
  let currentVolume = bins[pocIdx].totalVolume;
  bins[pocIdx].isInsideVA = true;

  let aboveIdx = pocIdx + 1;
  let belowIdx = pocIdx - 1;

  while (currentVolume < targetVolume && (aboveIdx < binCount || belowIdx >= 0)) {
    // Look at next two rows above
    let volAbove = 0;
    if (aboveIdx < binCount) volAbove += bins[aboveIdx].totalVolume;
    if (aboveIdx + 1 < binCount) volAbove += bins[aboveIdx + 1].totalVolume;

    // Look at next two rows below
    let volBelow = 0;
    if (belowIdx >= 0) volBelow += bins[belowIdx].totalVolume;
    if (belowIdx - 1 >= 0) volBelow += bins[belowIdx - 1].totalVolume;

    if (aboveIdx >= binCount) {
      // No more rows above, take below
      currentVolume += bins[belowIdx].totalVolume;
      bins[belowIdx].isInsideVA = true;
      belowIdx--;
    } else if (belowIdx < 0) {
      // No more rows below, take above
      currentVolume += bins[aboveIdx].totalVolume;
      bins[aboveIdx].isInsideVA = true;
      aboveIdx++;
    } else if (volAbove >= volBelow) {
      // Volume above is greater, expand up
      currentVolume += bins[aboveIdx].totalVolume;
      bins[aboveIdx].isInsideVA = true;
      aboveIdx++;
    } else {
      // Volume below is greater, expand down
      currentVolume += bins[belowIdx].totalVolume;
      bins[belowIdx].isInsideVA = true;
      belowIdx--;
    }
  }

  // Find VAH and VAL limits
  let vahPrice = maxPrice;
  let valPrice = minPrice;

  // VAH is the top of the highest bin inside the Value Area
  for (let i = binCount - 1; i >= 0; i--) {
    if (bins[i].isInsideVA) {
      vahPrice = bins[i].high;
      break;
    }
  }

  // VAL is the bottom of the lowest bin inside the Value Area
  for (let i = 0; i < binCount; i++) {
    if (bins[i].isInsideVA) {
      valPrice = bins[i].low;
      break;
    }
  }

  return {
    bins,
    pocPrice,
    vahPrice,
    valPrice,
  };
}
