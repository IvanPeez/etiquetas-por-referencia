/**
 * Distribución de etiquetas en hojas carta (regla crítica, brief §7).
 * - Cada referencia empieza en la columna 1 de una fila nueva.
 * - Filas por referencia = ceil(qty / 4); los espacios sobrantes de la fila quedan vacíos.
 * - 12 filas por hoja; una referencia puede continuar en la hoja siguiente.
 * - Se respeta el orden de selección.
 */

export const COLUMNAS = 4;
export const FILAS_POR_HOJA = 12;

/** Una fila de la hoja: `n` etiquetas (1–4) de la referencia `id`, el resto vacío. */
export interface Fila {
  readonly id: string;
  readonly n: number;
}

/** Una hoja: de 1 a 12 filas. */
export type Hoja = readonly Fila[];

function validar(id: string, qty: number): void {
  if (!Number.isInteger(qty) || qty < 0) throw new RangeError(`Cantidad inválida para ${id}: ${qty}`);
}

/** Número de filas que ocupa el lote. */
export function totalFilas(lote: Iterable<readonly [string, number]>): number {
  let filas = 0;
  for (const [id, qty] of lote) {
    validar(id, qty);
    filas += Math.ceil(qty / COLUMNAS);
  }
  return filas;
}

/** Función pura: lote (orden de selección) → hojas. Las cantidades 0 se ignoran. */
export function layout(lote: Iterable<readonly [string, number]>): Hoja[] {
  const filas: Fila[] = [];
  for (const [id, qty] of lote) {
    validar(id, qty);
    for (let i = 0; i < qty; i += COLUMNAS) filas.push({ id, n: Math.min(COLUMNAS, qty - i) });
  }
  const hojas: Hoja[] = [];
  for (let i = 0; i < filas.length; i += FILAS_POR_HOJA) hojas.push(filas.slice(i, i + FILAS_POR_HOJA));
  return hojas;
}

/** Celdas de una fila expandidas a 4 posiciones: id o null (vacío). */
export function celdas(fila: Fila): (string | null)[] {
  return Array.from({ length: COLUMNAS }, (_, i) => (i < fila.n ? fila.id : null));
}
