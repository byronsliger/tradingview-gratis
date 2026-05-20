export interface TrendLinePoint {
  time: number;   // UNIX timestamp seconds
  price: number;
}

export interface TrendLineDrawing {
  id: string;
  symbol: string;
  type: "trendline";
  a: TrendLinePoint;
  b: TrendLinePoint;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: number;   // 0=solid 1=dotted 2=dashed 3=large-dashed
  extendLeft: boolean;
  extendRight: boolean;
}

export interface RectangleDrawing {
  id: string;
  symbol: string;
  type: "rectangle";
  a: TrendLinePoint;   // first corner
  b: TrendLinePoint;   // opposite corner
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: number;   // 0=solid 1=dotted 2=dashed 3=large-dashed
  fillColor: string;   // hex with alpha e.g. "#2962ff33"
  fillVisible: boolean;
}

// Union — add future drawing types here
export type Drawing = TrendLineDrawing | RectangleDrawing;
