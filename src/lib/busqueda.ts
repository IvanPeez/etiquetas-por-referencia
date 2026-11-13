import type { Presentacion, Producto } from '../catalog-rules.ts';

/** Filtro del selector Presentación. */
export type FiltroPresentacion = Presentacion | 'sin' | 'todas';

/**
 * Normaliza para comparar: sin tildes (NFD + quitar marcas), minúsculas,
 * espacios colapsados y recortados. «BOSÉ  HM» → «bose hm».
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Versión sin espacios, para que «2278-120» encuentre «2278 -120». */
const compactar = (t: string) => t.replace(/\s/g, '');

export interface EntradaIndice {
  readonly producto: Producto;
  readonly nombre: string;
  readonly ref: string;
  readonly codigo: string;
  readonly refCompacta: string;
  readonly codigoCompacto: string;
  /** nombre + ref + código, para coincidencias parciales y por palabras. */
  readonly texto: string;
}

export type Indice = readonly EntradaIndice[];

/** Precalcula los textos normalizados una sola vez (al cargar). */
export function construirIndice(productos: readonly Producto[]): Indice {
  return productos.map((producto) => {
    const nombre = normalizar(producto.nombre);
    const ref = normalizar(producto.ref);
    const codigo = normalizar(producto.codigo);
    return {
      producto,
      nombre,
      ref,
      codigo,
      refCompacta: compactar(ref),
      codigoCompacto: compactar(codigo),
      texto: `${nombre} ${ref} ${codigo}`,
    };
  });
}

export function cumpleFiltro(p: Producto, filtro: FiltroPresentacion): boolean {
  if (filtro === 'todas') return true;
  if (filtro === 'sin') return p.pres === null;
  return p.pres === filtro;
}

/**
 * Busca por nombre, referencia o código, sin distinguir mayúsculas ni tildes.
 * Orden: 1) referencia o código exacto, 2) empieza por el texto, 3) contiene el texto,
 * 4) contiene todas las palabras. Dentro de cada grupo se respeta el orden del catálogo.
 * Con la consulta vacía devuelve todo lo que cumple el filtro.
 */
export function buscar(indice: Indice, consulta: string, filtro: FiltroPresentacion = 'todas'): Producto[] {
  const q = normalizar(consulta);
  if (q === '') return indice.filter((e) => cumpleFiltro(e.producto, filtro)).map((e) => e.producto);

  const qc = compactar(q);
  const palabras = q.split(' ');
  const grupos: Producto[][] = [[], [], [], []];

  for (const e of indice) {
    if (!cumpleFiltro(e.producto, filtro)) continue;
    let g: number;
    if (e.ref === q || e.codigo === q || e.refCompacta === qc || e.codigoCompacto === qc) g = 0;
    else if (
      e.nombre.startsWith(q) ||
      e.ref.startsWith(q) ||
      e.codigo.startsWith(q) ||
      e.refCompacta.startsWith(qc) ||
      e.codigoCompacto.startsWith(qc)
    )
      g = 1;
    else if (e.texto.includes(q) || e.refCompacta.includes(qc) || e.codigoCompacto.includes(qc)) g = 2;
    else if (palabras.length > 1 && palabras.every((w) => e.texto.includes(w))) g = 3;
    else continue;
    grupos[g].push(e.producto);
  }
  return grupos.flat();
}
