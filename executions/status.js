// executions/status.js — estado vivo del proyecto Pine Script
// Cada sesión LEE este archivo al empezar y lo ACTUALIZA al terminar (o antes de agotar tokens).
// Plan completo: plans/pine-script-engine.md
module.exports = {
  updatedAt: "2026-06-11T09:20:00Z",
  currentPhase: 1,
  done: [
    "Plan aprobado y guardado en plans/pine-script-engine.md",
    "Carpeta executions/ creada con este archivo de estado",
    "Fase 1 COMPLETA: src/lib/pine/ (errors, types, tokens, lexer, ast, parser, analyze, index) + runtime/ (series, context, interpreter, builtins-core/math/ta)",
    "Fase 1: vitest configurado (vitest.config.ts, script npm test) — 56 tests verdes en 4 suites (lexer, parser, interpreter, ta-golden)",
    "Fase 1: golden tests vs src/lib/indicators/{rsi,ema,sma}.ts pasan con tolerancia relativa 1e-8 (mismo nº de puntos)",
    "Fase 1: npm run lint limpio y npx tsc --noEmit limpio",
  ],
  inProgress: [],
  pending: [
    "Fase 2: integración en chart (useUserScriptPanes, store.scripts, PriceChart, useKlineData, IndicatorMenu)",
    "Fase 3: editor CodeMirror 6 + CRUD de scripts",
    "Fase 4: inputs autogenerados, estilos de plot, legend pills",
    "Fase 5: control de flujo, funciones de usuario, builtins ampliados (paridad copy/paste)",
    "Fase 6: Drive sync v2, badges de error, autocomplete",
  ],
  notes: [
    "API pública: compile(source) → {ok,script|diagnostics}; runScript(script, candles, inputs?, options?) → ScriptResult; runScript LANZA PineRuntimeError (runtime/fuel) — el caller de Fase 2 debe capturarlo",
    "RunOptions { maxFuelPerBar, maxFuelTotal } expone los límites de fuel (defaults 50k/5M en runtime/context.ts); los tests los bajan para probar el aborto",
    "Semántica implementada: aritmética con na→na, división/módulo por 0→na, comparación con na→false, and/or/not y ternario evalúan AMBOS lados/ramas (estado ta.* consistente, sin cortocircuito), truthiness na/false/0/\"\"→false",
    "var carry-forward: el init de `var` solo corre en barra 0; en barras siguientes arrastra series[bar-1]; `:=` exige slot declarado",
    "builtin `time` devuelve milisegundos UNIX (semántica Pine; Candle.time está en segundos)",
    "hist sobre expresiones no-identificador usa serie oculta por nodeId (ctx.getHiddenSeries); se evalúa la base en cada barra aunque el offset sea na",
    "ta.tr funciona también como variable (member sin llamada) con estado por nodeId — mismo contador que callSiteId en el parser, sin colisiones",
    "analyze(): meta de indicator() (title/shorttitle/overlay literales), PlotSpec por plot() (id=callSiteId, title posicional/nombrado, color de color.* o literal), inputs=[] (estructura lista para Fase 4); falta de indicator()/plot() genera warnings, no errores",
    "Tests golden usan velas sintéticas mulberry32(seed=42), 300 velas, en el propio test (sin fixtures)",
    "Limitación conocida: `not na` → true (Pine real da na); strings usan truthiness estilo JS; input.*/hline/plotshape lanzan error claro 'llega en fase posterior'",
  ],
};
