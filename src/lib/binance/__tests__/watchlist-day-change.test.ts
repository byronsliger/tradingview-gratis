import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUtcTradingDayTickers } from "../rest";
import {
  applyLivePrice, applyTradingDaySnapshot, changeFromOpen, invalidatePreviousDay,
  untilNextUtcDay, utcDayRetryDelay, utcDayStart,
} from "../watchlist-day-change";

const day = Date.UTC(2026, 8, 24);
const ticker = (symbol: string, openTime = day) => ({
  symbol, openPrice: "100", lastPrice: "105", openTime,
});

afterEach(() => vi.unstubAllGlobals());

describe("watchlist UTC-day change", () => {
  it("uses the UTC midnight boundary regardless of local timezone", () => {
    expect(utcDayStart(day - 1)).toBe(day - 86_400_000);
    expect(utcDayStart(day)).toBe(day);
    expect(untilNextUtcDay(day - 1)).toBe(1);
    expect(untilNextUtcDay(day)).toBe(86_400_000);
  });

  it("calculates change from the UTC open and rejects unusable baselines", () => {
    expect(changeFromOpen(105, 100)).toBe(5);
    expect(changeFromOpen(95, 100)).toBe(-5);
    expect(changeFromOpen(100, 0)).toBeUndefined();
    expect(changeFromOpen(Number.NaN, 100)).toBeUndefined();
  });

  it("clears yesterday's percentage immediately but keeps the last known price", () => {
    const previous = applyTradingDaySnapshot({}, [{ symbol: "BTCUSDT", openPrice: 100, lastPrice: 125, openTime: day - 86_400_000 }], day - 86_400_000, day - 1);
    const next = invalidatePreviousDay(previous, day);
    expect(next.BTCUSDT).toMatchObject({ price: 125, dayStart: day });
    expect(next.BTCUSDT.pct).toBeUndefined();
    expect(next.BTCUSDT.openPrice).toBeUndefined();
    const liveAfterMidnight = applyLivePrice(previous, "BTCUSDT", 126, day + 1);
    expect(liveAfterMidnight.BTCUSDT).toMatchObject({ price: 126, dayStart: day });
    expect(liveAfterMidnight.BTCUSDT.pct).toBeUndefined();
  });

  it("does not overwrite a newer WebSocket price with a slower REST response", () => {
    const live = applyLivePrice({}, "BTCUSDT", 110, day + 1_000);
    const loaded = applyTradingDaySnapshot(live, [{ symbol: "BTCUSDT", openPrice: 100, lastPrice: 105, openTime: day }], day, day + 2_000);
    expect(loaded.BTCUSDT).toMatchObject({ price: 110, pct: 10, openPrice: 100 });
  });

  it("ignores a response from a previous day, even when it arrives after midnight", () => {
    const previousDay = day - 86_400_000;
    const current = applyLivePrice({}, "BTCUSDT", 120, day + 1_000);
    const stale = applyTradingDaySnapshot(current, [{ symbol: "BTCUSDT", openPrice: 100, lastPrice: 105, openTime: previousDay }], previousDay, day + 2_000);
    expect(stale).toBe(current);
  });

  it("recomputes percentages on live ticks and caps retry backoff", () => {
    const baseline = applyTradingDaySnapshot({}, [{ symbol: "BTCUSDT", openPrice: 100, lastPrice: 105, openTime: day }], day, day + 1);
    expect(applyLivePrice(baseline, "BTCUSDT", 120, day + 2).BTCUSDT.pct).toBe(20);
    expect(utcDayRetryDelay(1)).toBe(1_000);
    expect(utcDayRetryDelay(2)).toBe(2_000);
    expect(utcDayRetryDelay(100)).toBe(30_000);
  });
});

describe("Binance UTC trading-day REST client", () => {
  it("requests timeZone=0, batches after 100 symbols, and parses both batches", async () => {
    const symbols = Array.from({ length: 101 }, (_, index) => `ASSET${index}USDT`);
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.pathname).toBe("/api/v3/ticker/tradingDay");
      expect(url.searchParams.get("timeZone")).toBe("0");
      const batch = JSON.parse(url.searchParams.get("symbols") ?? "[]") as string[];
      expect(batch.length).toBeLessThanOrEqual(100);
      return new Response(JSON.stringify(batch.map((symbol) => ticker(symbol))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const tickers = await fetchUtcTradingDayTickers(symbols, day);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tickers).toHaveLength(101);
    expect(tickers[100]).toEqual({ symbol: symbols[100], openPrice: 100, lastPrice: 105, openTime: day });
  });

  it("rejects an old-day baseline and corrupt prices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([ticker("BTCUSDT", day - 86_400_000)]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT"], day)).rejects.toThrow("stale");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ ...ticker("BTCUSDT"), openPrice: "-1" }]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT"], day)).rejects.toThrow("Invalid");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ ...ticker("BTCUSDT"), openPrice: null }]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT"], day)).rejects.toThrow("Invalid");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ ...ticker("BTCUSDT"), openPrice: " " }]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT"], day)).rejects.toThrow("Invalid");
  });

  it("skips an unavailable zero-price ticker without discarding valid symbols", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      ticker("BTCUSDT"),
      { ...ticker("MATICUSDT"), openPrice: "0", lastPrice: "0" },
    ]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT", "MATICUSDT"], day)).resolves.toEqual([
      { symbol: "BTCUSDT", openPrice: 100, lastPrice: 105, openTime: day },
    ]);
  });

  it("still rejects stale zero-price tickers and missing requested symbols", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      ticker("BTCUSDT"),
      { ...ticker("MATICUSDT", day - 86_400_000), openPrice: "0", lastPrice: "0" },
    ]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT", "MATICUSDT"], day)).rejects.toThrow("stale");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([ticker("BTCUSDT")]))));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT", "MATICUSDT"], day)).rejects.toThrow("Incomplete");
  });

  it("rejects incomplete or failed responses so the caller can retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT"], day)).rejects.toThrow("Incomplete");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 429 })));
    await expect(fetchUtcTradingDayTickers(["BTCUSDT"], day)).rejects.toThrow("429");
  });
});
