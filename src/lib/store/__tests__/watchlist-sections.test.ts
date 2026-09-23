import { describe, expect, it } from "vitest";
import { useChartStore } from "../chart-store";
import {
  DEFAULT_SECTION_ID,
  flattenWatchlist,
  moveWatchlistSection,
  moveWatchlistSymbol,
  normalizeWatchlistSections,
  type WatchlistSection,
} from "../watchlist-sections";

const sections: WatchlistSection[] = [
  { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"] },
  { id: "defi", name: "DeFi", symbols: [] },
];

describe("watchlist section migration", () => {
  it("migrates a flat list without losing its order or duplicating assets", () => {
    const result = normalizeWatchlistSections(undefined, ["BTCUSDT", "ETHUSDT", "BTCUSDT"]);
    expect(result).toEqual([{ id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT", "ETHUSDT"] }]);
  });

  it("repairs duplicate assets across sections and retains legacy-only assets", () => {
    const result = normalizeWatchlistSections([
      { id: "defi", name: " DeFi ", symbols: ["ETHUSDT", "BTCUSDT"] },
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT", "SOLUSDT"] },
    ], ["ETHUSDT", "SOLUSDT", "XRPUSDT"]);
    expect(result).toEqual([
      { id: "defi", name: "DeFi", symbols: ["ETHUSDT", "BTCUSDT"] },
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["SOLUSDT", "XRPUSDT"] },
    ]);
  });

});

describe("watchlist moves", () => {
  it("moves the first section to the last position with its assets in order", () => {
    const initial: WatchlistSection[] = [
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT", "ETHUSDT"] },
      { id: "defi", name: "DeFi", symbols: ["UNIUSDT", "AAVEUSDT"] },
      { id: "other", name: "Other", symbols: ["SOLUSDT"] },
    ];
    const moved = moveWatchlistSection(initial, DEFAULT_SECTION_ID, "other");
    expect(moved.map((section) => section.id)).toEqual(["defi", "other", DEFAULT_SECTION_ID]);
    expect(moved[2]).toBe(initial[0]);
    expect(flattenWatchlist(moved)).toEqual(["UNIUSDT", "AAVEUSDT", "SOLUSDT", "BTCUSDT", "ETHUSDT"]);
    expect(initial[0].symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("moves the last section to the first position and persists that order", () => {
    const initial: WatchlistSection[] = [sections[0], sections[1], { id: "other", name: "Other", symbols: ["XRPUSDT"] }];
    const original = useChartStore.getState();
    try {
      useChartStore.setState({ watchlistSections: initial, watchlist: flattenWatchlist(initial) });
      useChartStore.getState().moveWatchlistSection("other", DEFAULT_SECTION_ID);
      const moved = useChartStore.getState();
      expect(moved.watchlistSections.map((section) => section.id)).toEqual(["other", DEFAULT_SECTION_ID, "defi"]);
      expect(moved.watchlist).toEqual(["XRPUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT"]);
      expect(normalizeWatchlistSections(moved.watchlistSections, moved.watchlist)).toEqual(moved.watchlistSections);
    } finally {
      useChartStore.setState({ watchlistSections: original.watchlistSections, watchlist: original.watchlist });
    }
  });

  it("does nothing for a self-drop or unknown section", () => {
    expect(moveWatchlistSection(sections, DEFAULT_SECTION_ID, DEFAULT_SECTION_ID)).toBe(sections);
    expect(moveWatchlistSection(sections, "missing", DEFAULT_SECTION_ID)).toBe(sections);
    expect(moveWatchlistSection(sections, DEFAULT_SECTION_ID, "missing")).toBe(sections);
  });

  it("reorders within a section without adding or removing assets", () => {
    const result = moveWatchlistSymbol(sections, "BTCUSDT", DEFAULT_SECTION_ID, "SOLUSDT");
    expect(result[0].symbols).toEqual(["ETHUSDT", "BTCUSDT", "SOLUSDT"]);
    expect(flattenWatchlist(result)).toHaveLength(3);
    expect(sections[0].symbols[0]).toBe("BTCUSDT");
  });

  it("moves to an empty section and back without duplicates", () => {
    const moved = moveWatchlistSymbol(sections, "ETHUSDT", "defi");
    expect(moved[0].symbols).toEqual(["BTCUSDT", "SOLUSDT"]);
    expect(moved[1].symbols).toEqual(["ETHUSDT"]);
    const returned = moveWatchlistSymbol(moved, "ETHUSDT", DEFAULT_SECTION_ID);
    expect(flattenWatchlist(returned).sort()).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
  });

  it("ignores invalid targets and does not duplicate the source", () => {
    expect(moveWatchlistSymbol(sections, "BTCUSDT", "missing")).toBe(sections);
    expect(moveWatchlistSymbol(sections, "BTCUSDT", "defi", "SOLUSDT")).toBe(sections);
    expect(moveWatchlistSymbol(sections, "BTCUSDT", DEFAULT_SECTION_ID, "BTCUSDT")).toBe(sections);
  });

  it("keeps add and remove flows consistent with section membership", () => {
    const state = useChartStore.getState();
    useChartStore.setState({ watchlistSections: sections, watchlist: flattenWatchlist(sections) });
    try {
      state.addToWatchlist("XRPUSDT");
      state.addToWatchlist("XRPUSDT");
      expect(useChartStore.getState().watchlistSections[0].symbols).toContain("XRPUSDT");
      expect(useChartStore.getState().watchlist.filter((symbol) => symbol === "XRPUSDT")).toHaveLength(1);
      state.moveWatchlistSymbol("XRPUSDT", "defi");
      state.removeFromWatchlist("XRPUSDT");
      expect(flattenWatchlist(useChartStore.getState().watchlistSections)).not.toContain("XRPUSDT");
    } finally {
      useChartStore.setState({ watchlistSections: state.watchlistSections, watchlist: state.watchlist });
    }
  });
});
