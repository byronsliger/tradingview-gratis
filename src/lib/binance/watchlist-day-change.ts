import type { TradingDayTicker } from "./rest";

const DAY_MS = 86_400_000;

export interface WatchlistDayRow {
  symbol: string;
  price?: number;
  priceDay?: number;
  openPrice?: number;
  dayStart?: number;
  pct?: number;
}

export function utcDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

export function untilNextUtcDay(now: number): number {
  return Math.max(1, utcDayStart(now) + DAY_MS - now);
}

export function utcDayRetryDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 5));
}

export function changeFromOpen(price: number, openPrice: number): number | undefined {
  if (!Number.isFinite(price) || !Number.isFinite(openPrice) || openPrice <= 0) return undefined;
  return ((price - openPrice) / openPrice) * 100;
}

export function invalidatePreviousDay(
  rows: Record<string, WatchlistDayRow>, dayStart: number,
): Record<string, WatchlistDayRow> {
  return Object.fromEntries(Object.entries(rows).map(([symbol, row]) => [symbol,
    row.dayStart === dayStart ? row : { ...row, dayStart, openPrice: undefined, pct: undefined },
  ]));
}

export function applyLivePrice(
  rows: Record<string, WatchlistDayRow>, symbol: string, price: number, now: number,
): Record<string, WatchlistDayRow> {
  if (!Number.isFinite(price) || price <= 0) return rows;
  const dayStart = utcDayStart(now);
  const previous = rows[symbol];
  const openPrice = previous?.dayStart === dayStart ? previous.openPrice : undefined;
  return { ...rows, [symbol]: {
    symbol, price, priceDay: dayStart, dayStart, openPrice,
    pct: openPrice === undefined ? undefined : changeFromOpen(price, openPrice),
  } };
}

export function applyTradingDaySnapshot(
  rows: Record<string, WatchlistDayRow>, tickers: TradingDayTicker[],
  requestedDay: number, now: number,
): Record<string, WatchlistDayRow> {
  if (utcDayStart(now) !== requestedDay) return rows;
  const next = { ...rows };
  for (const ticker of tickers) {
    if (ticker.openTime !== requestedDay) continue;
    const current = next[ticker.symbol];
    const price = current?.priceDay === requestedDay && current.price !== undefined
      ? current.price : ticker.lastPrice;
    next[ticker.symbol] = {
      symbol: ticker.symbol, price, priceDay: requestedDay,
      dayStart: requestedDay, openPrice: ticker.openPrice,
      pct: changeFromOpen(price, ticker.openPrice),
    };
  }
  return next;
}
