import JsBarcode from 'jsbarcode';

/** Medidas de la etiqueta en mm (brief §7). */
export const ETIQUETA = {
  ancho: 45,
  alto: 20,
  padding: 1.5,
  /** Ancho disponible para el código + márgenes de silencio. */
  anchoUtil: 42,
  altoBarras: 8.8,
  silencioModulos: 10,
  silencioMinMm: 2,
} as const;

/** Por debajo de ~0,19 mm (7,5 mil) muchas impresoras y lectores fallan. */
export const MODULO_MIN_RECOMENDADO = 0.19;

export interface Barras {
  /** Patrón binario: 1 = barra, 0 = espacio. */
  modulos: string;
  /** Path SVG en unidades de módulo (alto 1). */
  path: string;
  /** Ancho de un módulo en mm. */
  modulo: number;
  /** Ancho total de las barras en mm (sin silencio). */
  anchoBarras: number;
  /** Margen de silencio a cada lado en mm. */
  silencio: number;
}

/**
 * Ancho de módulo (mm) más grande que cabe en `anchoUtil` con un silencio de
 * al menos 10 módulos y nunca menos de 2 mm a cada lado.
 */
export function anchoModulo(n: number, anchoUtil: number = ETIQUETA.anchoUtil): number {
  const { silencioModulos: q, silencioMinMm: min } = ETIQUETA;
  // Caso 1: el silencio de 10 módulos ya mide ≥ 2 mm.
  const m1 = anchoUtil / (n + 2 * q);
  if (q * m1 >= min) return m1;
  // Caso 2: manda el mínimo de 2 mm.
  return (anchoUtil - 2 * min) / n;
}

export function silencioPara(modulo: number): number {
  return Math.max(ETIQUETA.silencioModulos * modulo, ETIQUETA.silencioMinMm);
}

/** Convierte el patrón binario en un path (un rectángulo por cada racha de 1). */
export function pathDeModulos(modulos: string): string {
  let d = '';
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] === '1') {
      const inicio = i;
      while (modulos[i] === '1') i++;
      d += `M${inicio} 0h${i - inicio}v1h${-(i - inicio)}z`;
    } else i++;
  }
  return d;
}

/** Codifica `valor` en Code 128 (JsBarcode elige A/B/C y calcula el checksum). */
export function codificar(valor: string): Barras {
  const datos: { encodings?: { data: string }[] } = {};
  JsBarcode(datos, valor, { format: 'CODE128' });
  const modulos = (datos.encodings ?? []).map((e) => e.data).join('');
  if (!modulos) throw new Error(`No se pudo codificar «${valor}» en Code 128`);
  const modulo = anchoModulo(modulos.length);
  return {
    modulos,
    path: pathDeModulos(modulos),
    modulo,
    anchoBarras: modulo * modulos.length,
    silencio: silencioPara(modulo),
  };
}
