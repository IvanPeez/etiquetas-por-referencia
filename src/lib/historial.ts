/**
 * Historial de impresión. Lógica pura (sin DOM); la persistencia se inyecta.
 * - Cada impresión guarda sus referencias en el orden en que salieron en la hoja.
 * - La «última referencia impresa» es la última del último trabajo.
 * - Se guarda el nombre y la referencia al imprimir, por si el catálogo cambia después.
 */

export interface ItemImpreso {
  id: string;
  nombre: string;
  ref: string;
  cantidad: number;
}

export interface Trabajo {
  /** Fecha ISO de la impresión. */
  fecha: string;
  items: ItemImpreso[];
}

export interface ReferenciaImpresa {
  id: string;
  nombre: string;
  ref: string;
  /** Total de etiquetas impresas de esta referencia en todo el historial. */
  cantidad: number;
  /** Veces que apareció en una impresión. */
  veces: number;
  /** Fecha ISO de la impresión más reciente que la incluyó. */
  ultima: string;
}

export interface ResumenHistorial {
  /** Referencias, la impresa más recientemente primero. */
  referencias: ReferenciaImpresa[];
  ultima: (ItemImpreso & { fecha: string }) | null;
  etiquetas: number;
  impresiones: number;
}

export interface Almacen {
  leer(): string | null;
  escribir(valor: string): void;
  borrar(): void;
}

/** Tope de trabajos guardados (los más viejos se descartan). */
export const MAX_TRABAJOS = 500;
const VERSION = 1;

function esTrabajo(t: unknown): t is Trabajo {
  if (!t || typeof t !== 'object') return false;
  const o = t as Trabajo;
  return (
    typeof o.fecha === 'string' &&
    Array.isArray(o.items) &&
    o.items.every(
      (i) =>
        i &&
        typeof i.id === 'string' &&
        typeof i.nombre === 'string' &&
        typeof i.ref === 'string' &&
        Number.isInteger(i.cantidad) &&
        i.cantidad > 0,
    )
  );
}

export class Historial {
  #trabajos: Trabajo[] = [];
  readonly #almacen: Almacen | null;
  readonly #oyentes = new Set<() => void>();

  constructor(almacen: Almacen | null = null) {
    this.#almacen = almacen;
    this.#cargar();
  }

  #cargar(): void {
    try {
      const crudo = this.#almacen?.leer();
      if (!crudo) return;
      const datos = JSON.parse(crudo) as { v?: number; trabajos?: unknown[] };
      if (datos.v !== VERSION || !Array.isArray(datos.trabajos)) return;
      this.#trabajos = datos.trabajos.filter(esTrabajo);
    } catch {
      this.#trabajos = []; // datos corruptos o almacenamiento bloqueado: se empieza vacío
    }
  }

  #guardar(): void {
    try {
      if (this.#trabajos.length === 0) this.#almacen?.borrar();
      else this.#almacen?.escribir(JSON.stringify({ v: VERSION, trabajos: this.#trabajos }));
    } catch {
      // sin almacenamiento (modo privado, cuota llena): el historial vive solo en memoria
    }
  }

  #notificar(): void {
    this.#guardar();
    for (const fn of this.#oyentes) fn();
  }

  /** Registra una impresión. Ignora cantidades ≤ 0; no registra trabajos vacíos. */
  registrar(items: readonly ItemImpreso[], fecha: Date = new Date()): void {
    const validos = items.filter((i) => Number.isInteger(i.cantidad) && i.cantidad > 0).map((i) => ({ ...i }));
    if (validos.length === 0) return;
    this.#trabajos.push({ fecha: fecha.toISOString(), items: validos });
    if (this.#trabajos.length > MAX_TRABAJOS) this.#trabajos.splice(0, this.#trabajos.length - MAX_TRABAJOS);
    this.#notificar();
  }

  /** Quita la última impresión (p. ej. si se canceló el cuadro de impresión). */
  deshacerUltima(): Trabajo | undefined {
    const t = this.#trabajos.pop();
    if (t) this.#notificar();
    return t;
  }

  borrar(): void {
    if (this.#trabajos.length === 0) return;
    this.#trabajos = [];
    this.#notificar();
  }

  get trabajos(): readonly Trabajo[] {
    return this.#trabajos;
  }

  resumen(): ResumenHistorial {
    const porId = new Map<string, ReferenciaImpresa>();
    let etiquetas = 0;
    // Recorrido del más viejo al más nuevo: los datos más recientes sobrescriben.
    for (const t of this.#trabajos) {
      for (const i of t.items) {
        etiquetas += i.cantidad;
        const r = porId.get(i.id);
        if (r) {
          r.cantidad += i.cantidad;
          r.veces++;
          r.ultima = t.fecha;
          r.nombre = i.nombre;
          r.ref = i.ref;
          porId.delete(i.id); // reinsertar para que el orden refleje la recencia
          porId.set(i.id, r);
        } else {
          porId.set(i.id, { id: i.id, nombre: i.nombre, ref: i.ref, cantidad: i.cantidad, veces: 1, ultima: t.fecha });
        }
      }
    }
    const ultimoTrabajo = this.#trabajos.at(-1);
    const ultimoItem = ultimoTrabajo?.items.at(-1);
    return {
      referencias: [...porId.values()].reverse(),
      ultima: ultimoItem ? { ...ultimoItem, fecha: ultimoTrabajo!.fecha } : null,
      etiquetas,
      impresiones: this.#trabajos.length,
    };
  }

  alCambiar(fn: () => void): () => void {
    this.#oyentes.add(fn);
    return () => this.#oyentes.delete(fn);
  }
}

/** Almacén sobre localStorage, tolerante a que no exista o esté bloqueado. */
export function almacenLocal(clave: string): Almacen | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return {
      leer: () => ls.getItem(clave),
      escribir: (v) => ls.setItem(clave, v),
      borrar: () => ls.removeItem(clave),
    };
  } catch {
    return null;
  }
}
