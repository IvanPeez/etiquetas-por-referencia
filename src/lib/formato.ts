import type { Resumen } from './lote.ts';

const nf = new Intl.NumberFormat('es-CO');

/** 4538 → «4.538». */
export const numero = (n: number): string => nf.format(n);

const plural = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;

/** «N etiquetas · M hojas · K referencias», con singular cuando corresponde. */
export function textoResumen(r: Pick<Resumen, 'etiquetas' | 'hojas' | 'referencias'>): string {
  return [
    plural(r.etiquetas, 'etiqueta', 'etiquetas'),
    plural(r.hojas, 'hoja', 'hojas'),
    plural(r.referencias, 'referencia', 'referencias'),
  ].join(' · ');
}

const hora = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

/** «hoy 14:32», «ayer 09:10» o «12 nov 14:32» (hora local). */
export function fechaCorta(iso: string, ahora: Date = new Date()): string {
  const f = new Date(iso);
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const t = f.getTime();
  const h = hora.format(f);
  if (t >= inicioHoy) return `hoy ${h}`;
  if (t >= inicioHoy - 86_400_000) return `ayer ${h}`;
  return `${dia.format(f).replace('.', '')} ${h}`;
}
