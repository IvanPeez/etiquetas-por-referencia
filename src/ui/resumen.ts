import type { Producto } from '../catalog-rules.ts';
import { FILAS_POR_HOJA } from '../lib/layout.ts';
import type { Lote } from '../lib/lote.ts';
import { numero, textoResumen } from '../lib/formato.ts';
import { contar } from './movimiento.ts';

const $$ = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Pinta el resumen, los KPI, el estado de los botones y el mensaje de estado del lote. */
export function pintarResumen(lote: Lote, porId: ReadonlyMap<string, Producto>): void {
  const r = lote.resumen();
  const texto = textoResumen(r);
  for (const el of $$('[data-resumen]')) el.textContent = texto;

  contar($<HTMLElement>('[data-kpi="etiquetas"]'), r.etiquetas);
  contar($<HTMLElement>('[data-kpi="hojas"]'), r.hojas);
  contar($<HTMLElement>('[data-kpi="referencias"]'), r.referencias);

  // Anillo: llenado de la última hoja
  const llenado = r.hojas ? r.filasUltimaHoja / FILAS_POR_HOJA : 0;
  $<SVGCircleElement>('[data-kpi="ring"]').style.strokeDashoffset = String(100 - llenado * 100);
  $('[data-kpi="ring-text"]').textContent = `${Math.round(llenado * 100)} %`;
  $('[data-kpi="ultima-hoja"]').textContent = r.hojas
    ? `Última hoja: ${r.filasUltimaHoja} de ${FILAS_POR_HOJA} filas`
    : `Carta · ${FILAS_POR_HOJA} filas por hoja`;

  // Barras por presentación
  const d = lote.desglose(porId);
  const max = Math.max(1, ...Object.values(d));
  for (const li of $$<HTMLLIElement>('[data-kpi="barras"] li')) {
    const n = d[li.dataset.pres as keyof typeof d];
    li.querySelector('.bars__n')!.textContent = numero(n);
    li.querySelector<HTMLElement>('.bars__fill')!.style.transform = `scaleY(${n / max})`;
    li.setAttribute('aria-label', `${li.querySelector('.bars__k')!.textContent}: ${n}`);
  }

  $('[data-kpi="lote-meta"]').textContent = r.referencias
    ? `${numero(r.etiquetas)} ${plural(r.etiquetas, 'etiqueta', 'etiquetas')}`
    : '';

  // Botones y estado
  const invalidos = lote.idsInvalidos().length;
  $<HTMLButtonElement>('#btn-vista').disabled = !lote.listo;
  $<HTMLButtonElement>('#btn-imprimir').disabled = !lote.listo;
  $<HTMLButtonElement>('#btn-vaciar').disabled = r.referencias === 0 && invalidos === 0;

  const estado = $<HTMLElement>('#estado-lote');
  if (invalidos) {
    estado.dataset.tono = 'error';
    estado.textContent = `Corrige ${invalidos} ${plural(invalidos, 'cantidad marcada', 'cantidades marcadas')} en rojo para poder imprimir.`;
  } else if (r.referencias) {
    estado.dataset.tono = 'ok';
    estado.textContent = 'Lote listo para imprimir.';
  } else {
    delete estado.dataset.tono;
    estado.textContent = 'Escribe unidades junto a una referencia para empezar.';
  }
}
