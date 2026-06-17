"use client";

import { useRef, useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import type { Timeframe } from "@/lib/binance/types";
import { fetchExchangeSymbols } from "@/lib/binance/rest";

import { useChartInit } from "@/hooks/chart/useChartInit";
import { usePaneLayout } from "@/hooks/chart/usePaneLayout";
import { useCandleSeries } from "@/hooks/chart/useCandleSeries";
import { useVolumeSeries } from "@/hooks/chart/useVolumeSeries";
import { useRSIPane } from "@/hooks/chart/useRSIPane";
import { useMACDPane } from "@/hooks/chart/useMACDPane";
import { useSQZPane } from "@/hooks/chart/useSQZPane";
import { useADXPane } from "@/hooks/chart/useADXPane";
import { useUserScriptPanes, type ScriptPill } from "@/hooks/chart/useUserScriptPanes";
import { useScriptHtf } from "@/hooks/chart/useScriptHtf";
import { useVRVPSeries } from "@/hooks/chart/useVRVPSeries";
import { usePriceLines } from "@/hooks/chart/usePriceLines";
import { usePriceLineDrag } from "@/hooks/chart/usePriceLineDrag";
import { useSelectedPriceLineHandle } from "@/hooks/chart/useSelectedPriceLineHandle";
import { useMeasureTool } from "@/hooks/chart/useMeasureTool";
import { useChartInteraction } from "@/hooks/chart/useChartInteraction";
import { useKlineData } from "@/hooks/chart/useKlineData";
import { useTrendLineTool } from "@/hooks/chart/useTrendLineTool";
import { useTrendLinePrimitives } from "@/hooks/chart/useTrendLinePrimitives";
import { useTrendLineInteraction } from "@/hooks/chart/useTrendLineInteraction";
import { useRectangleTool } from "@/hooks/chart/useRectangleTool";
import { useRectanglePrimitives } from "@/hooks/chart/useRectanglePrimitives";
import { useRectangleInteraction } from "@/hooks/chart/useRectangleInteraction";
import { useIndicatorDoubleClick } from "@/hooks/chart/useIndicatorDoubleClick";
import { useLogScale } from "@/hooks/chart/useLogScale";
import { useDocumentTitle } from "@/hooks/chart/useDocumentTitle";
import { formatPrice } from "@/lib/format";

import { SymbolHeader } from "./overlay/SymbolHeader";
import { ChartLegend } from "./overlay/ChartLegend";
import { SubPaneLegend } from "./overlay/SubPaneLegend";
import { TrendLinesLayer } from "./overlay/TrendLinesLayer";
import { RectangleLayer } from "./overlay/RectangleLayer";
import { LogScaleToggle } from "./overlay/LogScaleToggle";

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<Candle[]>([]);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const theme = useChartStore((s) => s.theme);
  const scripts = useChartStore((s) => s.scripts);

  useEffect(() => {
    // Prefetch symbol dictionary in the background on load
    fetchExchangeSymbols().catch(console.error);
  }, []);

  const { chartRef, chartReady } = useChartInit(containerRef, theme);
  useLogScale(chartRef, chartReady);
  const { paneOffsets, recomputePaneOffsets } = usePaneLayout(chartRef, containerRef);

  const { candleSeriesRef, ema20Ref, ema50Ref, ema200Ref, updateEMAs, lastEMA20, lastEMA50, lastEMA200, lastVolume } =
    useCandleSeries(chartRef, candlesRef, indicators, hidden, config, theme);
  const { volumeSeriesRef } = useVolumeSeries(chartRef, candlesRef, indicators, hidden, recomputePaneOffsets);
  const { updateRSI, rsiRef, lastRSI } = useRSIPane(chartRef, candlesRef, indicators, hidden, config, recomputePaneOffsets);
  const { updateMACD, macdRef, macdSignalRef, macdHistRef, lastMACD, lastMACDSignal, lastMACDHist } = useMACDPane(chartRef, candlesRef, indicators, hidden, config, recomputePaneOffsets);
  const { updateSQZ, sqzmomHistRef, sqzmomDotRef, lastSQZ } = useSQZPane(chartRef, candlesRef, indicators, hidden, config, recomputePaneOffsets);
  const { updateADX, adxRef, lastADX, lastPlusDI, lastMinusDI } = useADXPane(chartRef, candlesRef, indicators, hidden, config, recomputePaneOffsets);
  const { updateVRVP, vrvpSeriesRef } = useVRVPSeries(chartRef, candlesRef, indicators, hidden, config);

  usePriceLines(candleSeriesRef, symbol);
  // Trend line hooks must add their capture listeners BEFORE usePriceLineDrag so that
  // useTrendLineInteraction.onPointerDown can call stopImmediatePropagation when a
  // line is hit, preventing usePriceLineDrag from deselecting drawings.
  const { inProgress } = useTrendLineTool(containerRef, chartRef, candleSeriesRef, candlesRef, tool, symbol);
  const { primitivesRef } = useTrendLinePrimitives(candleSeriesRef, symbol, candlesRef);
  useTrendLineInteraction(containerRef, chartRef, primitivesRef, candlesRef, symbol, tool);
  const { inProgress: rectInProgress } = useRectangleTool(containerRef, chartRef, candleSeriesRef, candlesRef, tool, symbol);
  const { primitivesRef: rectPrimitivesRef } = useRectanglePrimitives(candleSeriesRef, symbol, candlesRef);
  useRectangleInteraction(containerRef, chartRef, rectPrimitivesRef, candlesRef, symbol, tool);
  usePriceLineDrag(containerRef, candleSeriesRef, symbol, tool);
  const { handleY } = useSelectedPriceLineHandle(chartRef, candleSeriesRef);

  const { setMeasure, measureRef, measureRender } = useMeasureTool(chartRef, candleSeriesRef, candlesRef, tool);
  const { hover } = useChartInteraction(containerRef, chartRef, candleSeriesRef, volumeSeriesRef, tool, symbol, measureRef, setMeasure, updateVRVP);

  const rsiPaneIdx = indicators.rsi ? 1 : -1;
  const macdPaneIdx = indicators.macd ? (indicators.rsi ? 2 : 1) : -1;
  const sqzmomAdxPaneIdx = (indicators.sqzmom || indicators.adx) ? (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1 : -1;
  // Los sub-panes de scripts Pine del usuario se apilan después de los builtin
  const scriptBasePaneIdx =
    1 +
    (indicators.rsi ? 1 : 0) +
    (indicators.macd ? 1 : 0) +
    (indicators.sqzmom || indicators.adx ? 1 : 0);

  const { updateUserScripts, scriptLastValues, scriptErrors, scriptMeta, runCtxRef } = useUserScriptPanes(
    chartRef,
    candlesRef,
    scripts,
    scriptBasePaneIdx,
    recomputePaneOffsets,
  );

  // Fase D (MTF): fetch de velas HTF para request.security; rellena runCtxRef y
  // re-ejecuta los scripts cuando llegan los datos.
  useScriptHtf(symbol, timeframe, scripts, runCtxRef, updateUserScripts);

  const seriesPaneIndices = {
    ema20: 0,
    ema50: 0,
    ema200: 0,
    volume: 0,
    vrvp: 0,
    rsi: rsiPaneIdx,
    macd: macdPaneIdx,
    sqzmom: sqzmomAdxPaneIdx,
    adx: sqzmomAdxPaneIdx,
  };

  const { selectedIndicatorKey } = useIndicatorDoubleClick(
    chartRef, containerRef, tool,
    { ema20Ref, ema50Ref, ema200Ref, rsiRef, macdRef, macdSignalRef, macdHistRef, sqzmomHistRef, sqzmomDotRef, adxRef, vrvpSeriesRef },
    paneOffsets,
    seriesPaneIndices
  );

  const { lastPrice, isLoadingHistory } = useKlineData(symbol, timeframe, chartRef, candlesRef, {
    candleSeriesRef,
    volumeSeriesRef,
    updateEMAs,
    updateRSI,
    updateMACD,
    updateSQZ,
    updateADX,
    updateVRVP,
    updateUserScripts,
    recomputePaneOffsets,
  });

  useDocumentTitle(symbol, lastPrice);

  const lastValues = {
    ema20: lastEMA20,
    ema50: lastEMA50,
    ema200: lastEMA200,
    volume: lastVolume,
    rsi: lastRSI,
    macd: lastMACD,
    macdSignal: lastMACDSignal,
    macdHist: lastMACDHist,
    sqzmom: lastSQZ,
    adx: lastADX,
    plusDI: lastPlusDI,
    minusDI: lastMinusDI,
  };

  const leftOffset = 12;
  const mainPaneTop = paneOffsets[0]?.top ?? 0;

  // Pills de scripts Pine: overlay → ChartLegend, sub-pane → SubPaneLegend.
  const scriptPills: ScriptPill[] = scripts
    .filter((s) => s.onChart)
    .map((s) => {
      const meta = scriptMeta[s.id];
      const last = scriptLastValues[s.id];
      return {
        id: s.id,
        name: meta?.title || s.name,
        color: meta?.color ?? "#2962ff",
        value: typeof last === "number" ? formatPrice(last) : undefined,
        hidden: s.hidden,
        error: scriptErrors[s.id],
        paneIndex: meta?.paneIndex ?? 0,
      };
    });
  const overlayScriptPills = scriptPills.filter((p) => (scriptMeta[p.id]?.overlay ?? true));
  const subPaneScriptPills = scriptPills.filter((p) => !(scriptMeta[p.id]?.overlay ?? true));

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {measureRender}

      <TrendLinesLayer
        chartRef={chartRef}
        candleSeriesRef={candleSeriesRef}
        candlesRef={candlesRef}
        inProgress={inProgress}
        chartReady={chartReady}
      />

      <RectangleLayer
        chartRef={chartRef}
        candleSeriesRef={candleSeriesRef}
        candlesRef={candlesRef}
        inProgress={rectInProgress}
        chartReady={chartReady}
      />

      <LogScaleToggle
        containerRef={containerRef}
        chartRef={chartRef}
        mainPaneBottom={(paneOffsets[0]?.top ?? 0) + (paneOffsets[0]?.height ?? 0)}
      />

      {handleY !== null && (
        <div
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ top: handleY }}
        >
          <div className="h-2.5 w-2.5 rounded-sm border-2 border-[#2962ff] bg-tv-bg shadow-sm" />
        </div>
      )}

      {isLoadingHistory && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 rounded bg-tv-panel/90 px-2.5 py-1 text-[10px] text-tv-text-muted backdrop-blur">
          Cargando historial…
        </div>
      )}

      <SymbolHeader
        symbol={symbol}
        timeframe={timeframe}
        hover={hover}
        lastPrice={lastPrice}
        top={mainPaneTop + 12}
        left={leftOffset}
      />

      <ChartLegend
        indicators={indicators}
        hidden={hidden}
        config={config}
        lastValues={lastValues}
        selectedIndicatorKey={selectedIndicatorKey}
        scriptPills={overlayScriptPills}
        top={mainPaneTop + 52}
        left={leftOffset}
      />

      <SubPaneLegend
        indicators={indicators}
        hidden={hidden}
        config={config}
        lastValues={lastValues}
        selectedIndicatorKey={selectedIndicatorKey}
        scriptPills={subPaneScriptPills}
        paneOffsets={paneOffsets}
        left={leftOffset}
      />
    </div>
  );
}
