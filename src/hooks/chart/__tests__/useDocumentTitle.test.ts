import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistDayRow } from "@/lib/binance/watchlist-day-change";
import { applyLivePrice, applyTradingDaySnapshot } from "@/lib/binance/watchlist-day-change";
import { formatPct } from "@/lib/format";
import { useDocumentTitle } from "../useDocumentTitle";

const shared = vi.hoisted(() => ({ rows: {} as Record<string, WatchlistDayRow>, cleanups: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useContext: () => ({ rows: shared.rows, flash: {} }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) shared.cleanups.push(cleanup);
  },
}));

const renderTitle = (symbol: string, candlePct = -25) => {
  // Old candle data deliberately disagrees with the shared UTC-day quote.
  Reflect.apply(useDocumentTitle, null, [symbol, { value: 80, pct: candlePct }]);
  return document.title;
};

beforeEach(() => {
  shared.rows = {};
  shared.cleanups = [];
  vi.stubGlobal("document", { title: "" });
});
afterEach(() => vi.unstubAllGlobals());

describe("browser title uses the watchlist UTC-day quote", () => {
  it.each([5.1234, -2.5678, 0])("matches WL formatting for %s regardless of candle timeframe", (pct) => {
    shared.rows.BTCUSDT = { symbol: "BTCUSDT", price: 105, pct };
    const title = renderTitle("BTCUSDT");
    expect(title).toContain(`105.00 ${pct >= 0 ? "▲" : "▼"} ${formatPct(pct)}`);
    expect(renderTitle("BTCUSDT", 42)).toBe(title);
  });

  it("uses the same updated row after a live price changes", () => {
    const day = Date.UTC(2026, 8, 24);
    shared.rows = applyTradingDaySnapshot({}, [{ symbol: "BTCUSDT", openPrice: 100, lastPrice: 105, openTime: day }], day, day + 1);
    shared.rows = applyLivePrice(shared.rows, "BTCUSDT", 110, day + 2);
    expect(renderTitle("BTCUSDT")).toContain(formatPct(shared.rows.BTCUSDT.pct!));
  });

  it("does not leak the previous symbol or candle percentage while loading", () => {
    shared.rows.BTCUSDT = { symbol: "BTCUSDT", price: 105, pct: 5 };
    renderTitle("BTCUSDT");
    expect(renderTitle("ETHUSDT")).toBe("ETHUSDT — TradingView Gratis");
    shared.rows.ETHUSDT = { symbol: "ETHUSDT", price: 95 };
    expect(renderTitle("ETHUSDT")).toBe("ETHUSDT 95.00 — TradingView Gratis");
  });

  it("restores the static title when unmounted", () => {
    renderTitle("BTCUSDT");
    shared.cleanups.forEach((cleanup) => cleanup());
    expect(document.title).toBe("TradingView Gratis — Crypto charts open source");
  });
});
