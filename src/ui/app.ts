import { porId, productos } from '../catalog.ts';
import type { Producto } from '../catalog-rules.ts';
import { buscar, construirIndice, type FiltroPresentacion } from '../lib/busqueda.ts';
import { debounce } from '../lib/debounce.ts';
import { numero } from '../lib/formato.ts';
import { Lote } from '../lib/lote.ts';
import { iniciarImpresion } from './impresion.ts';
import { Historial, almacenLocal } from '../lib/historial.ts';
import { iniciarPanelHistorial } from './panel-historial.ts';
import { abrirModal, entradaInicial } from './movimiento.ts';
import { pintarPanelLote } from './panel-lote.ts';
import { pintarResumen } from './resumen.ts';
import { Tabla } from './tabla.ts';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const NOMBRE_FILTRO: Record<FiltroPresentacion, string> = {
  '120': 'Presentación 120',
  '250': 'Presentación 250',
  '500': 'Presentación 500',
  '1000': 'Presentación 1000',
  sin: 'Sin presentación',
  todas: 'todas las presentaciones',
};

export interface App {
  lote: Lote;
  historial: Historial;
}

export function iniciarApp(): App {
  const lote = new Lote();
  const indice = construirIndice(productos);

  const tbody = $<HTMLTableSectionElement>('#filas');
  const scroller = $<HTMLElement>('.table-scroll');
  const tabla = new Tabla(tbody, $<HTMLTemplateElement>('#tpl-fila'), lote);
  const buscador = $<HTMLInputElement>('#buscar');
  const filtroPres = $<HTMLFieldSetElement>('#filtro-presentacion');
  const soloCantidad = $<HTMLInputElement>('#solo-cantidad');
  const conteo = $<HTMLElement>('#conteo-resultados');
  const sinResultados = $<HTMLElement>('#sin-resultados');
  const listaLote = $<HTMLOListElement>('#lote-lista');
  const dialogoVaciar = $<HTMLDialogElement>('#dialogo-vaciar');

  const filtro = (): FiltroPresentacion =>
    (filtroPres.querySelector<HTMLInputElement>('input:checked')?.value ?? '120') as FiltroPresentacion;

  /** Productos visibles según filtro, búsqueda y «solo con cantidad». */
  function calcularLista(): Producto[] {
    const q = buscador.value;
    if (!soloCantidad.checked) return buscar(indice, q, filtro());

    // Solo con cantidad: todo el lote (mezcla presentaciones), en orden de selección.
    const ids = lote.entradas().map(([id]) => id);
    for (const id of lote.idsInvalidos()) if (!lote.tiene(id)) ids.push(id);
    if (q.trim() === '') return ids.map((id) => porId.get(id)!).filter(Boolean);
    const enLote = new Set(ids);
    return buscar(indice, q, 'todas').filter((p) => enLote.has(p.id));
  }

  function pintarConteo(): void {
    const n = tabla.visibles;
    conteo.textContent = `${numero(n)} ${n === 1 ? 'referencia' : 'referencias'}`;
  }

  function mostrar(): void {
    buscarConEspera.cancelar();
    const lista = calcularLista();
    tabla.mostrar(lista);
    // Consulta aplicada (útil para pruebas y depuración).
    tbody.dataset.consulta = buscador.value;
    scroller.scrollTop = 0;
    conteo.textContent = `${numero(lista.length)} ${lista.length === 1 ? 'referencia' : 'referencias'}`;

    sinResultados.hidden = lista.length > 0;
    if (lista.length === 0) {
      const q = buscador.value.trim();
      if (soloCantidad.checked && !q) sinResultados.textContent = 'Aún no hay referencias con cantidad.';
      else if (soloCantidad.checked) sinResultados.textContent = `Ninguna referencia del lote coincide con «${q}».`;
      else
        sinResultados.textContent =
          `No hay productos que coincidan con «${q}» en ${NOMBRE_FILTRO[filtro()]}.` +
          (filtro() === 'todas' ? '' : ' Prueba con «Todas».');
    }
  }

  const buscarConEspera = debounce(mostrar, 120);

  function alCambiarLote(): void {
    pintarResumen(lote, porId);
    pintarPanelLote(listaLote, $('#lote-vacio'), $<HTMLTemplateElement>('#tpl-lote'), lote, porId);
  }
  lote.alCambiar(alCambiarLote);

  // ---- Campo Unidades (delegado) ----
  tbody.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.classList.contains('qty')) return;
    const id = input.closest('tr')!.dataset.id!;
    // badInput: el navegador no entrega el texto (p. ej. «--»); se trata como no entero.
    lote.aplicar(id, input.validity.badInput ? '?' : input.value);
    tabla.sincronizar(id);
  });

  // Enter / Shift+Enter: fila siguiente / anterior
  tbody.addEventListener('keydown', (e) => {
    const input = e.target as HTMLInputElement;
    if (e.key !== 'Enter' || !input.classList.contains('qty')) return;
    e.preventDefault();
    const tr = input.closest('tr')!;
    const destino = (e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling) as HTMLTableRowElement | null;
    const siguiente = destino?.querySelector<HTMLInputElement>('.qty');
    if (siguiente) {
      siguiente.focus();
      siguiente.select();
    }
  });

  // La rueda del ratón desplaza la tabla en vez de cambiar el número enfocado.
  tbody.addEventListener(
    'wheel',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('qty') && t === document.activeElement) {
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
      }
    },
    { passive: false },
  );

  // Con «solo con cantidad», una fila que queda en 0 sale al abandonar el campo.
  tbody.addEventListener('focusout', (e) => {
    const input = e.target as HTMLInputElement;
    if (!soloCantidad.checked || !input.classList.contains('qty')) return;
    const id = input.closest('tr')!.dataset.id!;
    if (!lote.tiene(id) && !lote.invalido(id)) {
      tabla.ocultar(id);
      pintarConteo();
      if (tabla.visibles === 0) mostrar();
    }
  });

  // ---- Filtros ----
  filtroPres.addEventListener('change', mostrar);
  soloCantidad.addEventListener('change', () => {
    filtroPres.disabled = soloCantidad.checked;
    mostrar();
  });
  buscador.addEventListener('input', () => buscarConEspera());
  buscador.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    mostrar();
    const primero = tbody.querySelector<HTMLInputElement>('.qty');
    if (primero) {
      primero.focus();
      primero.select();
    }
  });

  // «/» enfoca el buscador
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable], dialog')) return;
    e.preventDefault();
    buscador.focus();
    buscador.select();
  });

  // ---- Lote actual: Quitar ----
  listaLote.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const li = btn.closest('li')!;
    const id = li.dataset.id!;
    const vecino = (li.nextElementSibling ?? li.previousElementSibling) as HTMLLIElement | null;
    const idVecino = vecino?.dataset.id;
    lote.fijar(id, 0); // la lista se repinta de forma síncrona
    tabla.sincronizar(id);
    if (soloCantidad.checked) mostrar();
    // El foco pasa al vecino en la lista; si ya no queda nada, vuelve al buscador.
    const destino = idVecino
      ? listaLote.querySelector<HTMLButtonElement>(`li[data-id="${CSS.escape(idVecino)}"] button`)
      : null;
    (destino ?? buscador).focus();
  });

  // ---- Vaciar con confirmación ----
  $('#btn-vaciar').addEventListener('click', () => {
    const r = lote.resumen();
    $('[data-vaciar-texto]').textContent =
      `Se quitarán ${numero(r.referencias)} ${r.referencias === 1 ? 'referencia' : 'referencias'} ` +
      `(${numero(r.etiquetas)} ${r.etiquetas === 1 ? 'etiqueta' : 'etiquetas'}) del lote. No se puede deshacer.`;
    dialogoVaciar.showModal();
    abrirModal(dialogoVaciar);
  });
  // «submit» ocurre en el mismo clic (el evento «close» llega en una tarea posterior).
  dialogoVaciar.querySelector('form')!.addEventListener('submit', (e) => {
    if ((e.submitter as HTMLButtonElement | null)?.value !== 'vaciar') return;
    lote.vaciar();
    tabla.sincronizarTodas();
    if (soloCantidad.checked) mostrar();
    buscador.focus();
  });

  // ---- Ayuda de impresión ----
  for (const b of document.querySelectorAll<HTMLElement>('[data-abrir]')) {
    b.addEventListener('click', () => {
      const d = $<HTMLDialogElement>(`#${b.dataset.abrir}`);
      d.showModal();
      abrirModal(d);
    });
  }

  // Historial de impresión, guardado en este equipo (localStorage del archivo).
  const historial = new Historial(almacenLocal('etiquetas.historial'));
  iniciarPanelHistorial(historial);
  iniciarImpresion(lote, porId, (impreso) =>
    historial.registrar(
      impreso.map(([id, cantidad]) => {
        const p = porId.get(id)!;
        return { id, nombre: p.nombre.trim(), ref: p.ref, cantidad };
      }),
    ),
  );

  mostrar();
  alCambiarLote();
  entradaInicial([...document.querySelectorAll('.kpis .panel, .filters, .table-panel, .lote-panel')]);
  return { lote, historial };
}
