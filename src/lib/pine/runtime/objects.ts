import type { Expr } from "../ast";
import type { EvalValue } from "./values";

/** Descriptor de un campo de un UDT (extraído de la declaración `type`). */
export interface FieldDef {
  name: string;
  /** Anotación de tipo cruda (informativa). */
  typeRef: string;
  /** Default opcional, evaluado perezosamente en cada `.new()` (en la barra actual). */
  default: Expr | null;
}

/** Descriptor de un tipo definido por el usuario. */
export interface TypeDescriptor {
  name: string;
  fields: FieldDef[];
}

/**
 * Instancia de un UDT en runtime. Referencia mutable (semántica de Pine): mutar
 * un campo afecta a todas las variables que apunten al mismo objeto. `na` de tipo
 * objeto se representa con `null` (como el resto de los valores Pine).
 */
export class PineObject {
  constructor(
    readonly typeName: string,
    readonly fields: Map<string, EvalValue>,
  ) {}
}
