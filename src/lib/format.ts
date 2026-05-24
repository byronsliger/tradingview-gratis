export function formatPrice(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function roundPrice(n: number): number {
  if (!isFinite(n)) return 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return Number(n.toFixed(2));
  if (abs >= 1) return Number(n.toFixed(4));
  if (abs >= 0.01) return Number(n.toFixed(6));
  return Number(n.toFixed(8));
}

export function getSeriesPriceFormat(maxAbs: number) {
  let precision = 2;
  if (maxAbs < 0.0001) precision = 8;
  else if (maxAbs < 0.01) precision = 6;
  else if (maxAbs < 1) precision = 4;
  
  return {
    type: "price" as const,
    precision,
    minMove: 1 / Math.pow(10, precision),
  };
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
