import type { Producto } from '../catalog-rules.ts';
import { numero, textoResumen } from '../lib/formato.ts';
import type { Lote } from '../lib/lote.ts';
import { construirHojas, construirHojasSync } from './hojas.ts';
import { abrirModal } from './movimiento.ts';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

/** Ancho de una hoja carta en px CSS (215,9 mm a 96 dpi). */
const PAPEL_PX = (215.9 / 25.4) * 96;

/** Dos frames para que el navegador pinte antes de imprimir (con tope por si la pestaña está oculta). */
function dosFrames(): Promise<void> {
  const frames = new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  const tope = new Promise<void>((r) => setTimeout(r, 500));
  return Promise.race([frames, tope]);
}

const etiquetas = (n: number) => `${numero(n)} ${n === 1 ? 'etiqueta' : 'etiquetas'}`;

/**
 * @param alImprimir se llama después de cada impresión (evento afterprint) con las referencias
 *   y cantidades que estaban en #print-root, en orden de impresión.
 */
export function iniciarImpresion(
  lote: Lote,
  porId: ReadonlyMap<string, Producto>,
  alImprimir?: (impreso: [string, number][]) => void,
) {
  const raiz = $<HTMLElement>('#print-root');
  const preparando = $<HTMLElement>('#preparando');
  const textoPreparando = preparando.querySelector<HTMLElement>('[data-preparando-texto]')!;
  const barraPreparando = preparando.querySelector('progress')!;

  const vista = $<HTMLDialogElement>('#vista-previa');
  const vistaHojas = $<HTMLElement>('#vista-hojas');
  const vistaScroll = vista.querySelector<HTMLElement>('.preview__scroll')!;
  const vistaProgreso = vista.querySelector<HTMLProgressElement>('.preview__progress')!;

  let turnoImpresion = 0;
  let turnoVista = 0;
  /** El contenido de #print-root corresponde al lote actual. */
  let raizVigente = false;
  /** Lote que hay en #print-root ahora mismo (para registrarlo en el historial al imprimir). */
  let contenidoRaiz: [string, number][] | null = null;

  // Cualquier cambio del lote invalida lo ya preparado.
  lote.alCambiar(() => {
    raizVigente = false;
    contenidoRaiz = null;
    raiz.replaceChildren();
  });

  async function prepararImpresion(): Promise<boolean> {
    const turno = ++turnoImpresion;
    const r = lote.resumen();
    textoPreparando.textContent = `Preparando ${etiquetas(r.etiquetas)}…`;
    barraPreparando.value = 0;
    preparando.hidden = false;
    try {
      const ok = await construirHojas(raiz, lote.hojas(), porId, {
        progreso: (h, total) => {
          barraPreparando.value = h / total;
          textoPreparando.textContent = `Preparando ${etiquetas(r.etiquetas)}… ${Math.round((h / total) * 100)} %`;
        },
        cancelada: () => turno !== turnoImpresion,
      });
      if (!ok) return false;
      await document.fonts.ready;
      await dosFrames();
      raizVigente = true;
      contenidoRaiz = lote.entradas();
      return true;
    } finally {
      if (turno === turnoImpresion) preparando.hidden = true;
    }
  }

  async function imprimir(): Promise<void> {
    if (!lote.listo) return;
    if (await prepararImpresion()) window.print();
  }

  // Respaldo: Ctrl+P sin pasar por el botón. Se construye de forma síncrona.
  window.addEventListener('beforeprint', () => {
    if (raizVigente) return;
    if (lote.listo) {
      construirHojasSync(raiz, lote.hojas(), porId);
      raizVigente = true;
      contenidoRaiz = lote.entradas();
    } else {
      contenidoRaiz = null;
      raiz.replaceChildren();
    }
  });
  window.addEventListener('afterprint', () => {
    // El navegador no informa si el cuadro se canceló: se registra y el historial permite deshacer.
    if (contenidoRaiz?.length) alImprimir?.(contenidoRaiz);
    contenidoRaiz = null;
    raizVigente = false;
    raiz.replaceChildren(); // libera memoria en lotes grandes
  });

  // ---- Vista previa ----
  function ajustarZoom(): void {
    const disponible = vistaScroll.clientWidth - 32;
    vistaHojas.style.setProperty('--paper-zoom', String(Math.min(1, disponible / PAPEL_PX)));
  }

  async function abrirVista(): Promise<void> {
    if (!lote.listo) return;
    const turno = ++turnoVista;
    const r = lote.resumen();
    vista.querySelector('[data-vista-resumen]')!.textContent = textoResumen(r);
    vistaHojas.replaceChildren();
    vista.showModal();
    abrirModal(vista);
    vistaScroll.scrollTop = 0;
    ajustarZoom();
    vistaProgreso.hidden = false;
    vistaProgreso.value = 0;
    await construirHojas(vistaHojas, lote.hojas(), porId, {
      progreso: (h, total) => (vistaProgreso.value = h / total),
      cancelada: () => turno !== turnoVista || !vista.open,
      envolver: (sheet, i, total) => {
        const fig = document.createElement('figure');
        fig.className = 'paper-wrap';
        const cap = document.createElement('figcaption');
        cap.textContent = `Hoja ${numero(i + 1)} de ${numero(total)}`;
        const papel = document.createElement('div');
        papel.className = 'paper';
        papel.append(sheet);
        fig.append(cap, papel);
        return fig;
      },
    });
    if (turno === turnoVista) vistaProgreso.hidden = true;
  }

  vista.addEventListener('close', () => {
    turnoVista++;
    vistaHojas.replaceChildren();
  });
  vista.querySelector('[data-cerrar-vista]')!.addEventListener('click', () => vista.close());
  $('#vista-imprimir').addEventListener('click', () => {
    vista.close();
    void imprimir();
  });
  window.addEventListener('resize', () => vista.open && ajustarZoom());

  $('#btn-vista').addEventListener('click', () => void abrirVista());
  $('#btn-imprimir').addEventListener('click', () => void imprimir());

  return { imprimir, abrirVista, prepararImpresion };
}
