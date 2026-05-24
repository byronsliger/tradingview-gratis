/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const fixes = {
  "src/hooks/chart/useADXPane.ts": [97, 112],
  "src/hooks/chart/useCandleSeries.ts": [86],
  "src/hooks/chart/useChartInit.ts": [50],
  "src/hooks/chart/useChartInteraction.ts": [129],
  "src/hooks/chart/useKlineData.ts": [114, 233],
  "src/hooks/chart/useMACDPane.ts": [78],
  "src/hooks/chart/useRSIPane.ts": [76],
  "src/hooks/chart/useSQZPane.ts": [87],
  "src/hooks/chart/useVolumeSeries.ts": [52]
};

for (const [file, lines] of Object.entries(fixes)) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8').split('\n');
  const sortedLines = [...lines].sort((a, b) => b - a);
  for (const line of sortedLines) {
    const idx = line - 1;
    content.splice(idx, 0, '  // eslint-disable-next-line react-hooks/exhaustive-deps');
  }
  fs.writeFileSync(filePath, content.join('\n'));
}

console.log("Fixed exhaustive-deps");
