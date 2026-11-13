import type { Historial } from '../lib/historial.ts';
import { fechaCorta, numero } from '../lib/formato.ts';
import { abrirModal } from './movimiento.ts';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const plural = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;

/** Pestañas del panel derecho (patrón ARIA tabs: flechas, Inicio y Fin). */
function iniciarPestanas(): (id: string) => void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.lote-panel [role="tab"]')];
  const activar = (id: string, foco = false) => {
    for (const t of tabs) {
      const sel = t.id === id;
      t.setAttribute('aria-selected', String(sel));
      t.tabIndex = sel ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !sel;
      if (sel && foco) t.focus();
    }
  };
  for (const t of tabs) {
    t.addEventListener('click', () => activar(t.id));
    t.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(t);
      const destino =
        e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
        : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
        : e.key === 'Home' ? tabs[0]
        : e.key === 'End' ? tabs.at(-1)
        : null;
      if (!destino) return;
      e.preventDefault();
      activar(destino.id, true);
    });
  }
  return (id) => activar(id, true);
}

export function iniciarPanelHistorial(historial: Historial): void {
  const lista = $<HTMLOListElement>('#hist-lista');
  const vacio = $<HTMLElement>('#hist-vacio');
  const tpl = $<HTMLTemplateElement>('#tpl-hist');
  const dialogo = $<HTMLDialogElement>('#dialogo-borrar-historial');
  const irA = iniciarPestanas();

  function pintar(): void {
    const r = historial.resumen();
    const ahora = new Date();

    $('[data-hist="conteo"]').textContent = r.referencias.length ? numero(r.referencias.length) : '';
    $('[data-hist="totales"]').textContent = r.impresiones
      ? `${plural(r.etiquetas, 'etiqueta', 'etiquetas')} · ${plural(r.impresiones, 'impresión', 'impresiones')}`
      : '';

    lista.replaceChildren(
      ...r.referencias.map((ref) => {
        const li = tpl.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
        li.dataset.id = ref.id;
        li.querySelector('.lote-list__name')!.textContent = ref.nombre;
        li.querySelector('.lote-list__ref')!.textContent = `${ref.ref} · ${fechaCorta(ref.ultima, ahora)}`;
        li.querySelector('.lote-list__qty')!.textContent = numero(ref.cantidad);
        li.title = `${plural(ref.veces, 'impresión', 'impresiones')}; última: ${fechaCorta(ref.ultima, ahora)}`;
        return li;
      }),
    );
    lista.hidden = r.referencias.length === 0;
    vacio.hidden = r.referencias.length > 0;
    $<HTMLElement>('[data-hist="acciones"]').hidden = r.impresiones === 0;

    const u = r.ultima;
    $<HTMLElement>('[data-hist="ultima"]').hidden = !u;
    $<HTMLElement>('[data-hist="ultima-vacia"]').hidden = Boolean(u);
    if (u) {
      $('[data-hist="ultima-nombre"]').textContent = u.nombre;
      $('[data-hist="ultima-meta"]').textContent = `${u.ref} · ${plural(u.cantidad, 'etiqueta', 'etiquetas')} · ${fechaCorta(u.fecha, ahora)}`;
    }
  }

  historial.alCambiar(pintar);

  $('#btn-deshacer-impresion').addEventListener('click', () => historial.deshacerUltima());

  $('#btn-borrar-historial').addEventListener('click', () => {
    const r = historial.resumen();
    $('[data-borrar-hist-texto]').textContent =
      `Se borrarán ${plural(r.referencias.length, 'referencia', 'referencias')} ` +
      `(${plural(r.etiquetas, 'etiqueta', 'etiquetas')} en ${plural(r.impresiones, 'impresión', 'impresiones')}) ` +
      'guardadas en este equipo. No se puede deshacer.';
    dialogo.showModal();
    abrirModal(dialogo);
  });
  dialogo.querySelector('form')!.addEventListener('submit', (e) => {
    if ((e.submitter as HTMLButtonElement | null)?.value === 'borrar') historial.borrar();
  });

  for (const b of document.querySelectorAll<HTMLElement>('[data-ir-tab]')) {
    b.addEventListener('click', () => {
      irA(b.dataset.irTab!);
      document.querySelector('.lote-panel')!.scrollIntoView({ block: 'nearest' });
    });
  }

  // Las fechas relativas («hoy», «ayer») se refrescan cada minuto.
  setInterval(pintar, 60_000);
  pintar();
}
