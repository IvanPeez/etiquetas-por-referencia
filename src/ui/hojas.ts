import type { Producto } from '../catalog-rules.ts';
import { codificar, ETIQUETA, type Barras } from '../lib/barcode.ts';
import { COLUMNAS, type Hoja } from '../lib/layout.ts';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Plantillas de etiqueta por producto: se codifican una vez y cada etiqueta es un clon.
 * Un lote de 9.999 unidades son ~10.000 clones de un nodo pequeño (un solo <path>).
 */
const plantillas = new Map<string, HTMLElement>();

function crearEtiqueta(p: Producto): HTMLElement {
  const b: Barras = codificar(p.codigo);
  const el = document.createElement('div');
  el.className = 'label';

  const nombre = document.createElement('div');
  nombre.className = 'label__name';
  nombre.textContent = p.nombre.trim();

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'label__bars');
  svg.setAttribute('viewBox', `0 0 ${b.modulos.length} 1`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Código 128: ${p.codigo}`);
  // mm reales: ancho = módulos × ancho de módulo; el silencio queda a los lados
  svg.style.width = `${b.anchoBarras.toFixed(3)}mm`;
  svg.style.height = `${ETIQUETA.altoBarras}mm`;
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', b.path);
  path.setAttribute('shape-rendering', 'crispEdges');
  svg.append(path);

  const valor = document.createElement('div');
  valor.className = 'label__value';
  valor.textContent = p.codigo;

  el.append(nombre, svg, valor);
  return el;
}

export function etiqueta(p: Producto): HTMLElement {
  let t = plantillas.get(p.id);
  if (!t) {
    t = crearEtiqueta(p);
    plantillas.set(p.id, t);
  }
  return t.cloneNode(true) as HTMLElement;
}

function celdaVacia(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'label label--empty';
  return el;
}

/** Una hoja: 12 filas × 4 columnas; cada fila con n etiquetas y el resto vacío. */
export function crearHoja(hoja: Hoja, porId: ReadonlyMap<string, Producto>): HTMLElement {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  let llenasArriba = 0; // etiquetas de la fila anterior
  for (const fila of hoja) {
    const p = porId.get(fila.id);
    if (!p) throw new Error(`Referencia desconocida: ${fila.id}`);
    for (let c = 0; c < COLUMNAS; c++) {
      if (c >= fila.n) {
        sheet.append(celdaVacia());
        continue;
      }
      const el = etiqueta(p);
      // Guías de corte: cada línea se dibuja una sola vez. La etiqueta pone su línea
      // derecha e inferior; la superior solo si arriba no hay etiqueta (sino la pone la de arriba).
      if (c >= llenasArriba) el.classList.add('label--corte-arriba');
      sheet.append(el);
    }
    llenasArriba = fila.n;
  }
  return sheet;
}

/** Cede el hilo en una tarea nueva (no se frena con la pestaña oculta como rAF/setTimeout). */
function ceder(): Promise<void> {
  return new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(null);
  });
}

export interface OpcionesConstruccion {
  /** Llamada con (hojas hechas, total). */
  progreso?: (hechas: number, total: number) => void;
  /** Si devuelve true, se aborta (otra construcción tomó el turno). */
  cancelada?: () => boolean;
  /** Envuelve cada hoja (la vista previa la pone dentro de un «papel»). */
  envolver?: (sheet: HTMLElement, indice: number, total: number) => HTMLElement;
}

/**
 * Construye todas las hojas en `destino`, por bloques de ~12 ms para no congelar la pestaña.
 * Devuelve false si se canceló.
 */
export async function construirHojas(
  destino: HTMLElement,
  hojas: readonly Hoja[],
  porId: ReadonlyMap<string, Producto>,
  { progreso, cancelada, envolver }: OpcionesConstruccion = {},
): Promise<boolean> {
  destino.replaceChildren();
  let i = 0;
  while (i < hojas.length) {
    const frag = document.createDocumentFragment();
    const inicio = performance.now();
    do {
      const sheet = crearHoja(hojas[i], porId);
      frag.append(envolver ? envolver(sheet, i, hojas.length) : sheet);
      i++;
    } while (i < hojas.length && performance.now() - inicio < 12);
    destino.append(frag);
    progreso?.(i, hojas.length);
    if (i < hojas.length) {
      await ceder();
      if (cancelada?.()) return false;
    }
  }
  return true;
}

/** Versión síncrona (respaldo para Ctrl+P sin pasar por el botón). */
export function construirHojasSync(destino: HTMLElement, hojas: readonly Hoja[], porId: ReadonlyMap<string, Producto>): void {
  const frag = document.createDocumentFragment();
  for (const h of hojas) frag.append(crearHoja(h, porId));
  destino.replaceChildren(frag);
}
