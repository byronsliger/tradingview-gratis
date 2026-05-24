import {
  ICustomSeriesPaneView,
  ICustomSeriesPaneRenderer,
  CustomData,
  CustomSeriesOptions,
  CustomSeriesPricePlotValues,
  PriceToCoordinateConverter,
  Time,
  PaneRendererCustomData
} from "lightweight-charts";
import { VRVPResult } from "./vrvp";

export interface VRVPBarData extends CustomData {
  vrvp?: VRVPResult;
  rowLayout: "rows" | "ticks";
  rowSize: number;
  valueAreaVolumePct: number;
  widthPercent: number; // e.g. 20
  placement: "Left" | "Right";
  volumeType: "total" | "updown"; // vrvpVolume
  showProfile: boolean;
  showPOC: boolean;
  showVAH: boolean;
  showVAL: boolean;
  colorUpVol: string;
  colorDnVol: string;
  colorUpVolVA: string;
  colorDnVolVA: string;
  colorPOC: string;
  colorVAH: string;
  colorVAL: string;
}

class VRVPRenderer implements ICustomSeriesPaneRenderer {
  private _data: PaneRendererCustomData<Time, VRVPBarData> | null = null;
  private _options: CustomSeriesOptions | null = null;

  public update(data: PaneRendererCustomData<Time, VRVPBarData>, options: CustomSeriesOptions): void {
    this._data = data;
    this._options = options;
  }

  public draw(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    priceConverter: PriceToCoordinateConverter,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _isHovered: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _hitTestData?: unknown
  ): void {
    if (!this._data || this._data.bars.length === 0) return;

    // Find the bar with the VRVP calculation results
    const activeBar = this._data.bars.find(b => b.originalData && b.originalData.vrvp !== undefined);
    if (!activeBar) return;

    const { vrvp, widthPercent, placement, volumeType, showProfile, showPOC, showVAH, showVAL,
      colorUpVol, colorDnVol, colorUpVolVA, colorDnVolVA, colorPOC, colorVAH, colorVAL } = activeBar.originalData;

    if (!vrvp || vrvp.bins.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      const { width } = scope.mediaSize;

      // 1. Draw the Volume Profile Bars
      if (showProfile) {
        const maxVol = Math.max(...vrvp.bins.map(b => b.totalVolume));
        if (maxVol > 0) {
          const maxAllowedWidth = width * (widthPercent / 100);

          for (const bin of vrvp.bins) {
            if (bin.totalVolume <= 0) continue;

            const yLow = priceConverter(bin.low);
            const yHigh = priceConverter(bin.high);
            if (yLow === null || yHigh === null) continue;

            const rectY = Math.min(yLow, yHigh);
            const rectHeight = Math.max(0.5, Math.abs(yLow - yHigh));

            // Calculate total width of this row
            const totalWidth = maxAllowedWidth * (bin.totalVolume / maxVol);

            let upWidth = totalWidth;
            let dnWidth = 0;

            if (volumeType === "updown") {
              const ratioUp = bin.upVolume / bin.totalVolume;
              upWidth = totalWidth * ratioUp;
              dnWidth = totalWidth - upWidth;
            }

            // Determine colors based on whether this bin is inside the Value Area
            const fillUp = bin.isInsideVA ? colorUpVolVA : colorUpVol;
            const fillDn = bin.isInsideVA ? colorDnVolVA : colorDnVol;

            if (placement === "Right") {
              // Draw Up volume segment (from right edge extending left)
              if (upWidth > 0) {
                ctx.fillStyle = fillUp;
                ctx.fillRect(width - upWidth, rectY, upWidth, rectHeight);
              }
              // Draw Down volume segment (extending further left from Up volume)
              if (dnWidth > 0) {
                ctx.fillStyle = fillDn;
                ctx.fillRect(width - totalWidth, rectY, dnWidth, rectHeight);
              }
            } else {
              // Left placement
              // Draw Up volume segment (from left edge extending right)
              if (upWidth > 0) {
                ctx.fillStyle = fillUp;
                ctx.fillRect(0, rectY, upWidth, rectHeight);
              }
              // Draw Down volume segment (extending further right from Up volume)
              if (dnWidth > 0) {
                ctx.fillStyle = fillDn;
                ctx.fillRect(upWidth, rectY, dnWidth, rectHeight);
              }
            }
          }
        }
      }

      // 2. Draw Value Area High (VAH) Line
      if (showVAH && vrvp.vahPrice > 0) {
        const yVah = priceConverter(vrvp.vahPrice);
        if (yVah !== null) {
          ctx.strokeStyle = colorVAH;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]); // dashed
          ctx.beginPath();
          ctx.moveTo(0, yVah);
          ctx.lineTo(width, yVah);
          ctx.stroke();
          ctx.setLineDash([]); // restore solid
        }
      }

      // 3. Draw Value Area Low (VAL) Line
      if (showVAL && vrvp.valPrice > 0) {
        const yVal = priceConverter(vrvp.valPrice);
        if (yVal !== null) {
          ctx.strokeStyle = colorVAL;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]); // dashed
          ctx.beginPath();
          ctx.moveTo(0, yVal);
          ctx.lineTo(width, yVal);
          ctx.stroke();
          ctx.setLineDash([]); // restore solid
        }
      }

      // 4. Draw Point of Control (POC) Line
      if (showPOC && vrvp.pocPrice > 0) {
        const yPoc = priceConverter(vrvp.pocPrice);
        if (yPoc !== null) {
          ctx.strokeStyle = colorPOC;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, yPoc);
          ctx.lineTo(width, yPoc);
          ctx.stroke();
        }
      }
    });
  }
}

export class VRVPSeriesPaneView implements ICustomSeriesPaneView<Time, VRVPBarData, CustomSeriesOptions> {
  private readonly _renderer: VRVPRenderer;

  constructor() {
    this._renderer = new VRVPRenderer();
  }

  public renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  public update(data: PaneRendererCustomData<Time, VRVPBarData>, seriesOptions: CustomSeriesOptions): void {
    this._renderer.update(data, seriesOptions);
  }

  public priceValueBuilder(plotRow: VRVPBarData): CustomSeriesPricePlotValues {
    // If VRVP calculations are present, use min/max price for auto-scaling bounds
    if (plotRow.vrvp) {
      return [
        plotRow.vrvp.vahPrice || 0,
        plotRow.vrvp.valPrice || 0,
        plotRow.vrvp.pocPrice || 0
      ];
    }
    return [0, 0, 0];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public isWhitespace(_data: VRVPBarData): _data is VRVPBarData {
    return false;
  }

  public defaultOptions(): CustomSeriesOptions {
    return {
      priceLineVisible: false,
      lastValueVisible: false,
    } as CustomSeriesOptions;
  }
}
