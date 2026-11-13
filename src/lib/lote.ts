import type { Presentacion, Producto } from '../catalog-rules.ts';
import { layout, totalFilas, FILAS_POR_HOJA } from './layout.ts';

export const CANTIDAD_MAX = 9999;

export type ResultadoCantidad = { ok: true; valor: number } | { ok: false; error: string };

/**
 * Valida el texto del campo Unidades. Vacío = 0. Enteros de 0 a 9.999.
 * El mensaje de error se muestra como texto (no solo color).
 */
export function parseCantidad(crudo: string): ResultadoCantidad {
  const t = crudo.trim();
  if (t === '') return { ok: true, valor: 0 };
  if (/^-/.test(t)) return { ok: false, error: 'No puede ser negativo' };
  if (!/^\+?\d+$/.test(t)) return { ok: false, error: 'Debe ser un número entero' };
  const valor = Number.parseInt(t, 10);
  if (valor > CANTIDAD_MAX) return { ok: false, error: 'Máximo 9.999' };
  return { ok: true, valor };
}

export interface Resumen {
  etiquetas: number;
  hojas: number;
  referencias: number;
  /** Filas ocupadas en la última hoja (1–12), 0 si no hay hojas. */
  filasUltimaHoja: number;
}

export type DesglosePresentacion = Record<Presentacion | 'sin', number>;

/**
 * Estado del lote en memoria. Guarda el orden de selección (orden de inserción del Map):
 * - cambiar la cantidad de una referencia que ya está en el lote conserva su posición;
 * - pasar a 0 (o vacío) la saca del lote; si luego vuelve a tener cantidad, entra al final;
 * - un valor inválido queda registrado (bloquea vista previa e impresión) sin tocar la cantidad vigente.
 */
export class Lote {
  readonly #cantidades = new Map<string, number>();
  readonly #invalidos = new Map<string, { crudo: string; error: string }>();
  readonly #oyentes = new Set<() => void>();

  /** Aplica el texto crudo del campo Unidades. Devuelve el resultado de la validación. */
  aplicar(id: string, crudo: string): ResultadoCantidad {
    const r = parseCantidad(crudo);
    if (!r.ok) {
      this.#invalidos.set(id, { crudo, error: r.error });
    } else {
      this.#invalidos.delete(id);
      this.#fijar(id, r.valor);
    }
    this.#notificar();
    return r;
  }

  /** Fija una cantidad ya validada. */
  fijar(id: string, cantidad: number): void {
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > CANTIDAD_MAX) {
      throw new RangeError(`Cantidad inválida para ${id}: ${cantidad}`);
    }
    this.#invalidos.delete(id);
    this.#fijar(id, cantidad);
    this.#notificar();
  }

  #fijar(id: string, cantidad: number): void {
    if (cantidad === 0) this.#cantidades.delete(id);
    else this.#cantidades.set(id, cantidad); // en un Map existente conserva la posición
  }

  vaciar(): void {
    this.#cantidades.clear();
    this.#invalidos.clear();
    this.#notificar();
  }

  cantidad(id: string): number {
    return this.#cantidades.get(id) ?? 0;
  }

  /** Texto inválido y su error, si el campo tiene un valor no aceptado. */
  invalido(id: string): { crudo: string; error: string } | undefined {
    return this.#invalidos.get(id);
  }

  /** IDs con un valor inválido pendiente de corregir. */
  idsInvalidos(): string[] {
    return [...this.#invalidos.keys()];
  }

  tiene(id: string): boolean {
    return this.#cantidades.has(id);
  }

  /** Pares [id, cantidad] en orden de selección. */
  entradas(): [string, number][] {
    return [...this.#cantidades];
  }

  get referencias(): number {
    return this.#cantidades.size;
  }

  get hayInvalidos(): boolean {
    return this.#invalidos.size > 0;
  }

  /** Se puede previsualizar e imprimir: hay etiquetas y ningún campo inválido. */
  get listo(): boolean {
    return this.#cantidades.size > 0 && this.#invalidos.size === 0;
  }

  resumen(): Resumen {
    return resumenDe(this.entradas());
  }

  desglose(porId: ReadonlyMap<string, Producto>): DesglosePresentacion {
    const d: DesglosePresentacion = { '120': 0, '250': 0, '500': 0, '1000': 0, sin: 0 };
    for (const id of this.#cantidades.keys()) {
      const p = porId.get(id);
      if (p) d[p.pres ?? 'sin']++;
    }
    return d;
  }

  hojas() {
    return layout(this.entradas());
  }

  /** Suscribe a cambios; devuelve la función para cancelar. */
  alCambiar(fn: () => void): () => void {
    this.#oyentes.add(fn);
    return () => this.#oyentes.delete(fn);
  }

  #notificar(): void {
    for (const fn of this.#oyentes) fn();
  }
}

/** Resumen sin construir las hojas (barato para cada pulsación). */
export function resumenDe(entradas: Iterable<readonly [string, number]>): Resumen {
  let etiquetas = 0;
  let referencias = 0;
  const lista: [string, number][] = [];
  for (const [id, q] of entradas) {
    if (q <= 0) continue;
    etiquetas += q;
    referencias++;
    lista.push([id, q]);
  }
  const filas = totalFilas(lista);
  const hojas = Math.ceil(filas / FILAS_POR_HOJA);
  const filasUltimaHoja = hojas === 0 ? 0 : filas - (hojas - 1) * FILAS_POR_HOJA;
  return { etiquetas, hojas, referencias, filasUltimaHoja };
}
