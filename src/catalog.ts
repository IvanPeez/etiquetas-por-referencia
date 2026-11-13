import data from './data/catalog.json';
import type { Conteos, Producto } from './catalog-rules.ts';

export type { Producto, Presentacion, PresentacionOpt } from './catalog-rules.ts';

interface CatalogoJson {
  hoja: string;
  conteos: Conteos;
  productos: Producto[];
}

const catalogo = data as CatalogoJson;

export const productos: readonly Producto[] = catalogo.productos;
export const conteos: Readonly<Conteos> = catalogo.conteos;
export const porId: ReadonlyMap<string, Producto> = new Map(productos.map((p) => [p.id, p]));
