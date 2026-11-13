/**
 * Reglas puras para construir el catálogo a partir de las filas del Excel.
 * Se usan en el build (scripts/build-catalog.ts) y se prueban con Vitest.
 * Los identificadores son siempre texto: aquí nunca se convierte nada a número.
 */

export const PRESENTACIONES = ['120', '250', '500', '1000'] as const;
export type Presentacion = (typeof PRESENTACIONES)[number];
/** `null` = Sin presentación. */
export type PresentacionOpt = Presentacion | null;

export interface Producto {
  /** ID estable: la referencia interna (o `ref#n` si estuviera duplicada). */
  id: string;
  nombre: string;
  ref: string;
  /** Valor que se codifica en Code 128: código de barras, o la referencia si está vacío. */
  codigo: string;
  pres: PresentacionOpt;
  /** true cuando `codigo` viene de la referencia interna porque el código de barras estaba vacío. */
  fallback: boolean;
}

/** Sufijo de la referencia interna: «2278 -120», «0252 -1000». Se tolera con o sin espacio/guion. */
const SUFIJO_REF = /^(.*?\S)\s*-\s*(\d+)$/;
/**
 * Número final del nombre, separado por espacio o guion:
 * «A MILKSHAKE PLEASE DM 120», «JEQUE ARABIANS II - 120», «JEQUE ARABIANS II -1000».
 */
const NUMERO_FINAL_NOMBRE = /(?:^|[\s-])(\d+)\s*$/;

/**
 * Presentación = sufijo numérico de la referencia interna que coincide con el número final
 * del nombre y pertenece a {120, 250, 500, 1000}. Todo lo demás es Sin presentación (null).
 */
export function presentacionDe(nombre: string, ref: string): PresentacionOpt {
  const mRef = SUFIJO_REF.exec(ref);
  const mNom = NUMERO_FINAL_NOMBRE.exec(nombre);
  if (!mRef || !mNom) return null;
  const sufijo = mRef[2];
  if (sufijo !== mNom[1]) return null;
  return (PRESENTACIONES as readonly string[]).includes(sufijo) ? (sufijo as Presentacion) : null;
}

/** Code 128 (set B) cubre ASCII imprimible 32–126. */
export function esCode128Valido(valor: string): boolean {
  return valor.length > 0 && /^[\x20-\x7E]+$/.test(valor);
}

/** Valores que delatan que Excel convirtió un identificador en número. */
export function pareceNotacionCientifica(valor: string): boolean {
  return /^[+-]?\d+(?:[.,]\d+)?E[+-]?\d+$/i.test(valor.trim());
}

export interface FilaCruda {
  /** Número de fila en Excel (1-based, contando el encabezado). */
  fila: number;
  nombre: string;
  ref: string;
  barras: string;
}

export interface ResultadoCatalogo {
  productos: Producto[];
  duplicados: { ref: string; filas: number[] }[];
  /** Filas con sufijo en la referencia que no se asignaron a una presentación (para revisión). */
  sufijosNoAsignados: { fila: number; nombre: string; ref: string }[];
}

export function construirCatalogo(filas: FilaCruda[]): ResultadoCatalogo {
  const vistos = new Map<string, number[]>();
  const productos: Producto[] = [];
  const sufijosNoAsignados: ResultadoCatalogo['sufijosNoAsignados'] = [];

  for (const f of filas) {
    const previas = vistos.get(f.ref) ?? [];
    previas.push(f.fila);
    vistos.set(f.ref, previas);
    const id = previas.length === 1 ? f.ref : `${f.ref}#${previas.length}`;

    const fallback = f.barras === '';
    const pres = presentacionDe(f.nombre, f.ref);
    if (pres === null && SUFIJO_REF.test(f.ref)) {
      sufijosNoAsignados.push({ fila: f.fila, nombre: f.nombre, ref: f.ref });
    }
    productos.push({
      id,
      nombre: f.nombre,
      ref: f.ref,
      codigo: fallback ? f.ref : f.barras,
      pres,
      fallback,
    });
  }

  const duplicados = [...vistos]
    .filter(([, fs]) => fs.length > 1)
    .map(([ref, fs]) => ({ ref, filas: fs }));

  return { productos, duplicados, sufijosNoAsignados };
}

export interface Conteos {
  total: number;
  '120': number;
  '250': number;
  '500': number;
  '1000': number;
  sinPresentacion: number;
  fallback: number;
}

export function contar(productos: Producto[]): Conteos {
  const c: Conteos = { total: 0, '120': 0, '250': 0, '500': 0, '1000': 0, sinPresentacion: 0, fallback: 0 };
  for (const p of productos) {
    c.total++;
    if (p.pres === null) c.sinPresentacion++;
    else c[p.pres]++;
    if (p.fallback) c.fallback++;
  }
  return c;
}

export const CONTEOS_ESPERADOS: Conteos = {
  total: 4538,
  '120': 906,
  '250': 906,
  '500': 906,
  '1000': 906,
  sinPresentacion: 914,
  fallback: 53,
};
