import { beforeEach, describe, expect, it } from "vitest";
import type { Drawing, RectangleDrawing, TrendLineDrawing } from "../../drawings/types";
import { useChartStore, type PriceLine } from "../chart-store";

const a = { time: 100, price: 10 };
const b = { time: 200, price: 20 };
const moved = { time: 300, price: 30 };

const trendline: TrendLineDrawing = {
  id: "trend", symbol: "BTCUSDT", type: "trendline", a, b,
  color: "#ffffff", lineWidth: 1, lineStyle: 0,
  extendLeft: false, extendRight: false,
};
const rectangle: RectangleDrawing = {
  id: "rect", symbol: "BTCUSDT", type: "rectangle", a, b,
  color: "#ffffff", lineWidth: 1, lineStyle: 0,
  fillColor: "#ffffff22", fillVisible: true,
};
const priceLine: PriceLine = { id: "price", symbol: "BTCUSDT", price: 10 };

beforeEach(() => {
  useChartStore.setState({ drawings: [{ ...trendline }, { ...rectangle }], priceLines: [{ ...priceLine }] });
});

const drawing = (id: string): Drawing => {
  const found = useChartStore.getState().drawings.find((item) => item.id === id);
  if (!found) throw new Error(`Missing drawing ${id}`);
  return found;
};

describe("per-object drawing geometry lock", () => {
  it.each(["trend", "rect"])("treats legacy %s records without locked as movable", (id) => {
    useChartStore.getState().updateDrawing(id, { a: moved });
    expect(drawing(id).a).toEqual(moved);
  });

  it.each(["trend", "rect"])("keeps %s coordinates fixed while locked, including unlock-and-move", (id) => {
    useChartStore.getState().updateDrawing(id, { locked: true, a: moved });
    expect(drawing(id).a).toEqual(a);
    expect(drawing(id).locked).toBe(true);

    useChartStore.getState().updateDrawing(id, { a: moved, b: moved, color: "#000000" });
    expect(drawing(id).a).toEqual(a);
    expect(drawing(id).b).toEqual(b);
    expect(drawing(id).color).toBe("#000000");

    useChartStore.getState().updateDrawing(id, { locked: false, a: moved });
    expect(drawing(id).a).toEqual(a);
    useChartStore.getState().updateDrawing(id, { a: moved });
    expect(drawing(id).a).toEqual(moved);
  });

  it("keeps locked horizontal price fixed and allows edits after unlock", () => {
    const store = useChartStore.getState();
    store.updatePriceLine("price", 11);
    expect(useChartStore.getState().priceLines[0].price).toBe(11);
    store.setPriceLineLocked("price", true);
    store.updatePriceLine("price", 12);
    expect(useChartStore.getState().priceLines[0].price).toBe(11);
    store.updatePriceLineOptions("price", { color: "#000000" });
    expect(useChartStore.getState().priceLines[0].color).toBe("#000000");
    store.setPriceLineLocked("price", false);
    store.updatePriceLine("price", 12);
    expect(useChartStore.getState().priceLines[0].price).toBe(12);
  });
});
