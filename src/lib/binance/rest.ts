import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";

const BASE = "https://api.binance.com/api/v3";

export interface TradingDayTicker {
  symbol: string;
  openPrice: number;
  lastPrice: number;
  openTime: number;
}

/** Binance accepts at most 100 symbols per trading-day request. */
export async function fetchUtcTradingDayTickers(
  symbols: string[], expectedDayStart: number, signal?: AbortSignal,
): Promise<TradingDayTicker[]> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  if (unique.length === 0) return [];

  const batches: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += 100) batches.push(unique.slice(offset, offset + 100));

  const responses = await Promise.all(batches.map(async (batch) => {
    const query = new URLSearchParams({ symbols: JSON.stringify(batch), timeZone: "0" });
    const response = await fetch(`${BASE}/ticker/tradingDay?${query}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`tradingDay ${response.status}`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid trading-day ticker response");
    const requested = new Set(batch);
    const seen = new Set<string>();
    const tickers: TradingDayTicker[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) throw new Error("Invalid trading-day ticker");
      const raw = item as Record<string, unknown>;
      const symbol = raw.symbol;
      if (typeof symbol !== "string" || !requested.has(symbol) || seen.has(symbol)) {
        throw new Error("Invalid trading-day ticker symbol");
      }
      seen.add(symbol);
      if ((typeof raw.openPrice !== "string" && typeof raw.openPrice !== "number")
        || (typeof raw.lastPrice !== "string" && typeof raw.lastPrice !== "number")
        || (typeof raw.openPrice === "string" && raw.openPrice.trim() === "")
        || (typeof raw.lastPrice === "string" && raw.lastPrice.trim() === "")) {
        throw new Error("Invalid trading-day ticker price");
      }
      const openPrice = Number(raw.openPrice);
      const lastPrice = Number(raw.lastPrice);
      const openTime = raw.openTime;
      if (!Number.isFinite(openPrice) || openPrice < 0
        || !Number.isFinite(lastPrice) || lastPrice < 0
        || typeof openTime !== "number" || openTime !== expectedDayStart) {
        throw new Error("Invalid or stale trading-day ticker");
      }
      // Binance can return zero prices for inactive symbols; keep the rest of the batch.
      if (openPrice > 0 && lastPrice > 0) tickers.push({ symbol, openPrice, lastPrice, openTime });
    }
    if (seen.size !== batch.length) {
      throw new Error("Incomplete trading-day ticker response");
    }
    return tickers;
  }));
  return responses.flat();
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  endTime?: number, // Unix timestamp in milliseconds
): Promise<Candle[]> {
  let url = `${BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  if (endTime !== undefined) url += `&endTime=${endTime}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const url = `${BASE}/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const url = `${BASE}/ticker/24hr?symbols=${encodeURIComponent(arr)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`tickers ${res.status}`);
  const data = await res.json();
  return data.map((t: Record<string, string>) => ({
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

let cachedSymbols: SymbolInfo[] | null = null;
export async function fetchExchangeSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  const res = await fetch(`${BASE}/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = await res.json();
  cachedSymbols = data.symbols
    .filter(
      (s: { status: string; quoteAsset: string }) =>
        s.status === "TRADING" && s.quoteAsset === "USDT",
    )
    .map((s: { symbol: string; baseAsset: string; quoteAsset: string; status: string }) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
    }));
  return cachedSymbols!;
}
