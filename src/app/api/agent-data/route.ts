import { NextResponse } from "next/server";
import { fetchKlines } from "@/lib/binance/rest";
import type { Timeframe } from "@/lib/binance/types";
import { ema, squeezeMomentum, adx, calculateVRVP } from "@/lib/indicators";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const symbol = searchParams.get("symbol")?.toUpperCase() || "BTCUSDT";
  const timeframe = (searchParams.get("timeframe") || "1d") as Timeframe;
  const limit = parseInt(searchParams.get("limit") || "200", 10);
  
  const emaFastPeriod = parseInt(searchParams.get("emaFast") || "10", 10);
  const emaSlowPeriod = parseInt(searchParams.get("emaSlow") || "55", 10);

  try {
    const candles = await fetchKlines(symbol, timeframe, limit);

    // Run indicators
    const emaFastData = ema(candles, emaFastPeriod);
    const emaSlowData = ema(candles, emaSlowPeriod);
    const sqzData = squeezeMomentum(candles, 20, 2.0, 20, 1.5);
    const adxData = adx(candles, 14);
    
    // VRVP applies to the entire fetched visible range
    const vrvpData = calculateVRVP(candles, "rows", 24, 70);

    // Helper to map arrays by time (Unix timestamp)
    const mapByTime = <T extends { time: number }>(arr: T[]) => {
      const map = new Map<number, T>();
      for (const item of arr) map.set(item.time, item);
      return map;
    };

    const emaFastMap = mapByTime(emaFastData);
    const emaSlowMap = mapByTime(emaSlowData);
    const sqzMap = mapByTime(sqzData);
    const adxMap = mapByTime(adxData);

    const merged = candles.map(c => {
      const t = c.time;
      return {
        ...c,
        emaFast: emaFastMap.get(t)?.value || null,
        emaSlow: emaSlowMap.get(t)?.value || null,
        sqz: sqzMap.get(t) || null,
        adx: adxMap.get(t) || null,
      };
    });

    return NextResponse.json({
      symbol,
      timeframe,
      vrvp: {
        pocPrice: vrvpData.pocPrice,
        vahPrice: vrvpData.vahPrice,
        valPrice: vrvpData.valPrice,
        // Omit bins for brevity unless the agent needs the full profile histogram
      },
      data: merged
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
