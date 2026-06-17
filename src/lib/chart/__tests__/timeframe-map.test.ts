import { describe, expect, it } from "vitest";
import type { Timeframe } from "@/lib/binance/types";
import { binanceToPine, pineToBinance } from "@/lib/chart/timeframe-map";

describe("pineToBinance", () => {
  it("maps day/week/month aliases", () => {
    expect(pineToBinance("D")).toBe("1d");
    expect(pineToBinance("1D")).toBe("1d");
    expect(pineToBinance("W")).toBe("1w");
    expect(pineToBinance("1W")).toBe("1w");
    expect(pineToBinance("M")).toBe("1M");
    expect(pineToBinance("1M")).toBe("1M");
    expect(pineToBinance("3D")).toBe("3d");
  });

  it("maps pure-minute strings (TradingView semantics)", () => {
    expect(pineToBinance("1")).toBe("1m");
    expect(pineToBinance("5")).toBe("5m");
    expect(pineToBinance("15")).toBe("15m");
    expect(pineToBinance("30")).toBe("30m");
    expect(pineToBinance("60")).toBe("1h");
    expect(pineToBinance("120")).toBe("2h");
    expect(pineToBinance("240")).toBe("4h");
    expect(pineToBinance("720")).toBe("12h");
    expect(pineToBinance("1440")).toBe("1d");
  });

  it("maps unit-suffixed strings", () => {
    expect(pineToBinance("1m")).toBe("1m");
    expect(pineToBinance("15m")).toBe("15m");
    expect(pineToBinance("1h")).toBe("1h");
    expect(pineToBinance("4h")).toBe("4h");
    expect(pineToBinance("2h")).toBe("2h");
  });

  it("returns null for non-fetchable timeframes", () => {
    expect(pineToBinance("")).toBeNull();
    expect(pineToBinance("45")).toBeNull(); // 45m no existe en Binance
    expect(pineToBinance("90")).toBeNull();
    expect(pineToBinance("10S")).toBeNull(); // segundos
    expect(pineToBinance("garbage")).toBeNull();
  });
});

describe("binanceToPine", () => {
  it("maps each Binance code to a canonical Pine string", () => {
    expect(binanceToPine("1d")).toBe("D");
    expect(binanceToPine("1h")).toBe("60");
    expect(binanceToPine("4h")).toBe("240");
    expect(binanceToPine("15m")).toBe("15");
    expect(binanceToPine("1w")).toBe("W");
    expect(binanceToPine("1M")).toBe("M");
    expect(binanceToPine("1m")).toBe("1");
    expect(binanceToPine("5m")).toBe("5");
    expect(binanceToPine("30m")).toBe("30");
  });
});

describe("round-trip binance → pine → binance", () => {
  const all: Timeframe[] = [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
  ];
  it("every Binance timeframe round-trips back to itself", () => {
    for (const tf of all) {
      expect(pineToBinance(binanceToPine(tf))).toBe(tf);
    }
  });
});
