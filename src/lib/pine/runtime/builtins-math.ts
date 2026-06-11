import type { PineValue } from "../types";

/** Builtin puro: sin estado, sin acceso al contexto. */
export interface PureBuiltin {
  params: string[];
  required: number;
  variadic?: boolean;
  fn: (args: (PineValue | undefined)[]) => PineValue;
}

function num(v: PineValue | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** NaN/±Infinity se normalizan a na. */
function clean(v: number): PineValue {
  return Number.isFinite(v) ? v : null;
}

function unary(f: (x: number) => number): PureBuiltin {
  return {
    params: ["number"],
    required: 1,
    fn: (args) => {
      const x = num(args[0]);
      return x === null ? null : clean(f(x));
    },
  };
}

function variadic(f: (values: number[]) => number, required: number): PureBuiltin {
  return {
    params: ["number1", "number2"],
    required,
    variadic: true,
    fn: (args) => {
      const values: number[] = [];
      for (const a of args) {
        const n = num(a);
        if (n === null) return null;
        values.push(n);
      }
      return clean(f(values));
    },
  };
}

export const mathBuiltins: Record<string, PureBuiltin> = {
  abs: unary(Math.abs),
  sqrt: unary(Math.sqrt),
  log: unary(Math.log),
  exp: unary(Math.exp),
  floor: unary(Math.floor),
  ceil: unary(Math.ceil),
  round: {
    params: ["number", "precision"],
    required: 1,
    fn: (args) => {
      const x = num(args[0]);
      if (x === null) return null;
      const p = num(args[1]);
      if (p === null || p <= 0) return clean(Math.round(x));
      const factor = Math.pow(10, Math.floor(p));
      return clean(Math.round(x * factor) / factor);
    },
  },
  pow: {
    params: ["base", "exponent"],
    required: 2,
    fn: (args) => {
      const b = num(args[0]);
      const e = num(args[1]);
      return b === null || e === null ? null : clean(Math.pow(b, e));
    },
  },
  max: variadic((vs) => Math.max(...vs), 2),
  min: variadic((vs) => Math.min(...vs), 2),
  avg: variadic((vs) => vs.reduce((acc, v) => acc + v, 0) / vs.length, 1),
};
