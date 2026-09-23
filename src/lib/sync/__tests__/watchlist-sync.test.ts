import { describe, expect, it } from "vitest";
import { useChartStore } from "@/lib/store/chart-store";
import { DEFAULT_SECTION_ID } from "@/lib/store/watchlist-sections";
import { useSyncStore } from "@/lib/store/sync-store";
import { applyRemote, buildSnapshot, migrateDocument, shouldPushChartChange, watchlistChanged } from "../drive-sync";

describe("watchlist Drive sync", () => {
  it("includes sections in the uploaded snapshot and migrates old flat documents", () => {
    const snapshot = buildSnapshot();
    expect(snapshot.watchlistSections?.[0].symbols).toEqual(snapshot.watchlist);
    const migrated = migrateDocument({
      version: 2,
      updatedAt: 1,
      state: { ...snapshot, watchlist: ["ETHUSDT", "BTCUSDT", "ETHUSDT"], watchlistSections: undefined },
    });
    expect(migrated.state.watchlist).toEqual(["ETHUSDT", "BTCUSDT"]);
    expect(migrated.state.watchlistSections).toEqual([
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["ETHUSDT", "BTCUSDT"] },
    ]);
    expect(migrated.state.config).toEqual(snapshot.config);
  });

  it("schedules a push for section-only edits and keeps unrelated state unchanged on continuous pull", () => {
    const original = useChartStore.getState();
    const originalSync = useSyncStore.getState();
    const remoteSections = [
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT"] },
      { id: "watch", name: "Favorites", symbols: ["ETHUSDT"] },
    ];
    expect(shouldPushChartChange({ ...original, watchlistSections: remoteSections }, original)).toBe(true);
    expect(shouldPushChartChange({ ...original, watchlist: ["ETHUSDT"] }, original)).toBe(true);
    expect(shouldPushChartChange({ ...original, symbol: "ETHUSDT" }, original)).toBe(false);

    try {
      useSyncStore.getState().setWatchlistDirty(false);
      applyRemote({ version: 2, updatedAt: 2, state: {
        ...buildSnapshot(),
        theme: original.theme === "dark" ? "light" : "dark",
        watchlist: ["BTCUSDT", "ETHUSDT"],
        watchlistSections: remoteSections,
      } }, false);
      expect(useChartStore.getState().watchlistSections).toEqual(remoteSections);
      expect(useChartStore.getState().watchlist).toEqual(["BTCUSDT", "ETHUSDT"]);
      expect(useChartStore.getState().theme).toBe(original.theme);
    } finally {
      useChartStore.setState(original);
      useSyncStore.setState(originalSync);
    }
  });

  it("keeps a newer local offline watchlist edit through reconnect pull and the following push snapshot", () => {
    const original = useChartStore.getState();
    const originalSync = useSyncStore.getState();
    const remoteSections = [{ id: DEFAULT_SECTION_ID, name: "Main", symbols: ["ETHUSDT"] }];
    const localSections = [{ id: DEFAULT_SECTION_ID, name: "Main", symbols: ["SOLUSDT"] }];
    const remote = { version: 2 as const, updatedAt: 2, state: {
      ...buildSnapshot(), watchlist: ["ETHUSDT"], watchlistSections: remoteSections,
      indicatorsHidden: !original.indicatorsHidden,
    } };

    try {
      // The device was synced at t1; at t2 Drive changed, then at t3 it was edited offline.
      useChartStore.setState({ watchlist: ["SOLUSDT"], watchlistSections: localSections });
      expect(watchlistChanged(useChartStore.getState(), original)).toBe(true);
      useSyncStore.getState().setWatchlistDirty(true);
      applyRemote(remote, false); // reconnect pulls t2 before it pushes t3

      expect(useChartStore.getState().watchlistSections).toEqual(localSections);
      expect(useChartStore.getState().watchlist).toEqual(["SOLUSDT"]);
      expect(useChartStore.getState().indicatorsHidden).toBe(!original.indicatorsHidden);
      expect(buildSnapshot().watchlistSections).toEqual(localSections);
      expect(useSyncStore.getState().watchlistDirty).toBe(true);
    } finally {
      useChartStore.setState(original);
      useSyncStore.setState(originalSync);
    }
  });
});
