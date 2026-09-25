import { describe, expect, it } from "vitest";
import { moveWatchlistSymbol, type WatchlistSection } from "@/lib/store/watchlist-sections";
import { resolveAssetDrop } from "../asset-drop";

const initial: WatchlistSection[] = [
  { id: "default", name: "Main", symbols: ["BTCUSDT", "TRXUSDT", "ETHUSDT"] },
  { id: "test", name: "Test", symbols: ["LTCUSDT"] },
  { id: "empty", name: "Empty", symbols: [] },
];

function drop(symbol: string, group: string, index: number, target = `asset:${symbol}`, canceled = false) {
  return { canceled, operation: { source: { id: `asset:${symbol}`, group, index }, target: { id: target } } };
}

function apply(sections: WatchlistSection[], event: ReturnType<typeof drop>) {
  const move = resolveAssetDrop(sections, event);
  return move ? moveWatchlistSymbol(sections, move.symbol, move.sectionId, move.beforeSymbol) : sections;
}

describe("watchlist asset drop", () => {
  it("moves into an occupied section when React owns the DOM order", () => {
    const second = apply(initial, drop("TRXUSDT", "default", 1, "asset:LTCUSDT"));
    expect(second[1].symbols).toEqual(["TRXUSDT", "LTCUSDT"]);
    expect(apply(second, drop("ETHUSDT", "default", 1, "asset:LTCUSDT"))[1].symbols).toEqual(["TRXUSDT", "ETHUSDT", "LTCUSDT"]);
  });

  it("reorders in both directions without optimistic DOM mutation", () => {
    const down = apply(initial, drop("BTCUSDT", "default", 0, "asset:ETHUSDT"));
    expect(down[0].symbols).toEqual(["TRXUSDT", "ETHUSDT", "BTCUSDT"]);
    expect(apply(down, drop("BTCUSDT", "default", 2, "asset:TRXUSDT"))[0].symbols).toEqual(initial[0].symbols);
  });

  it("commits a self-targeted second and third asset to an occupied section", () => {
    const second = apply(initial, drop("TRXUSDT", "test", 1));
    expect(second[1].symbols).toEqual(["LTCUSDT", "TRXUSDT"]);
    const third = apply(second, drop("ETHUSDT", "test", 1));
    expect(third[1].symbols).toEqual(["LTCUSDT", "ETHUSDT", "TRXUSDT"]);
    expect(third[0].symbols).toEqual(["BTCUSDT"]);
    expect(initial[1].symbols).toEqual(["LTCUSDT"]);
  });

  it.each([
    ["BTCUSDT", 2, ["TRXUSDT", "ETHUSDT", "BTCUSDT"]],
    ["ETHUSDT", 0, ["ETHUSDT", "BTCUSDT", "TRXUSDT"]],
  ] as const)("reorders %s to index %i using the final index after removal", (symbol, index, expected) => {
    expect(apply(initial, drop(symbol, "default", index))[0].symbols).toEqual(expected);
  });

  it("uses the final sortable position even when the target is another asset", () => {
    expect(apply(initial, drop("TRXUSDT", "test", 1, "asset:LTCUSDT"))[1].symbols).toEqual(["LTCUSDT", "TRXUSDT"]);
  });

  it("supports a plain empty container without projected sortable metadata", () => {
    expect(apply(initial, drop("TRXUSDT", "default", 1, "section-assets:empty"))[2].symbols).toEqual(["TRXUSDT"]);
  });

  it("honors the final plain container instead of a previous optimistic group", () => {
    expect(apply(initial, drop("TRXUSDT", "test", 1, "section-assets:empty"))[2].symbols).toEqual(["TRXUSDT"]);
  });

  it("ignores canceled, unchanged, missing-target and non-asset drops", () => {
    expect(apply(initial, drop("TRXUSDT", "test", 1, "asset:TRXUSDT", true))).toBe(initial);
    expect(apply(initial, drop("TRXUSDT", "default", 1))).toBe(initial);
    const event = drop("TRXUSDT", "test", 1);
    expect(resolveAssetDrop(initial, { ...event, operation: { ...event.operation, target: null } })).toBeNull();
    expect(resolveAssetDrop(initial, { ...event, operation: { source: { id: "section:default" }, target: { id: "section:test" } } })).toBeNull();
  });

  it("ignores removed assets and unknown destinations", () => {
    expect(resolveAssetDrop(initial, drop("MISSING", "test", 0))).toBeNull();
    expect(resolveAssetDrop(initial, drop("TRXUSDT", "missing", 0))).toBeNull();
    expect(resolveAssetDrop(initial, drop("TRXUSDT", "default", 1, "section-assets:missing"))).toBeNull();
  });
});
