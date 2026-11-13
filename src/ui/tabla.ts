import type { Producto } from '../catalog-rules.ts';
import type { Lote } from '../lib/lote.ts';

/** Filas que se pintan de inmediato; el resto entra por bloques en las siguientes tareas. */
const PRIMER_BLOQUE = 150;
/** Tiempo máximo por bloque, para que escribir siga fluido mientras se completa la tabla. */
const PRESUPUESTO_MS = 8;

/**
 * Cede el hilo y continúa en una tarea nueva. MessageChannel en vez de rAF/setTimeout:
 * rAF se pausa con la pestaña oculta y los setTimeout encadenados se frenan a 1 s.
 */
const canal = new MessageChannel();
const pendientes: (() => void)[] = [];
canal.port1.onmessage = () => pendientes.shift()?.();
function ceder(fn: () => void): void {
  pendientes.push(fn);
  canal.port2.postMessage(null);
}

/**
 * Tabla de productos. Las filas se crean una sola vez por producto y se reutilizan
 * al cambiar de filtro o búsqueda, así el cambio es instantáneo y el estado del
 * campo Unidades nunca se pierde.
 */
export class Tabla {
  readonly #tbody: HTMLTableSectionElement;
  readonly #tpl: HTMLTemplateElement;
  readonly #lote: Lote;
  readonly #filas = new Map<string, HTMLTableRowElement>();
  #turno = 0;
  #secuencia = 0;

  constructor(tbody: HTMLTableSectionElement, tpl: HTMLTemplateElement, lote: Lote) {
    this.#tbody = tbody;
    this.#tpl = tpl;
    this.#lote = lote;
  }

  /** Reemplaza las filas visibles. El primer bloque es síncrono; el resto, por frames. */
  mostrar(lista: readonly Producto[]): void {
    const turno = ++this.#turno;
    this.#tbody.replaceChildren(...lista.slice(0, PRIMER_BLOQUE).map((p) => this.#fila(p)));
    let i = PRIMER_BLOQUE;
    const paso = () => {
      if (turno !== this.#turno || i >= lista.length) return;
      const frag = document.createDocumentFragment();
      const inicio = performance.now();
      while (i < lista.length && performance.now() - inicio < PRESUPUESTO_MS) frag.append(this.#fila(lista[i++]));
      this.#tbody.append(frag);
      ceder(paso);
    };
    ceder(paso);
  }

  /** Lleva el estado del lote a la fila (si ya existe). */
  sincronizar(id: string): void {
    const tr = this.#filas.get(id);
    if (tr) this.#pintar(tr, id);
  }

  sincronizarTodas(): void {
    for (const [id, tr] of this.#filas) this.#pintar(tr, id);
  }

  /** Quita una fila del DOM visible (sin destruirla). */
  ocultar(id: string): void {
    this.#filas.get(id)?.remove();
  }

  get visibles(): number {
    return this.#tbody.rows.length;
  }

  #fila(p: Producto): HTMLTableRowElement {
    let tr = this.#filas.get(p.id);
    if (tr) return tr;

    tr = this.#tpl.content.firstElementChild!.cloneNode(true) as HTMLTableRowElement;
    tr.dataset.id = p.id;
    const [celNombre, celRef, celCodigo] = tr.cells;
    celNombre.querySelector('.name')!.textContent = p.nombre;
    celNombre.querySelector('.sub')!.textContent = `${p.ref} · ${p.codigo}`;
    celRef.textContent = p.ref;
    celCodigo.textContent = p.codigo;
    if (p.fallback) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'usa la referencia';
      tag.title = 'Sin código de barras: se codifica la referencia interna';
      celCodigo.append(tag);
    }

    const input = tr.querySelector<HTMLInputElement>('.qty')!;
    const error = tr.querySelector<HTMLElement>('.qty__error')!;
    const errorId = `qty-err-${++this.#secuencia}`;
    error.id = errorId;
    input.setAttribute('aria-label', `Unidades de ${p.nombre.trim()} ${p.ref}`);
    input.setAttribute('aria-describedby', errorId);

    this.#filas.set(p.id, tr);
    this.#pintar(tr, p.id);
    return tr;
  }

  #pintar(tr: HTMLTableRowElement, id: string): void {
    const input = tr.querySelector<HTMLInputElement>('.qty')!;
    const error = tr.querySelector<HTMLElement>('.qty__error')!;
    const invalido = this.#lote.invalido(id);
    const q = this.#lote.cantidad(id);

    // No se reescribe el campo mientras la persona escribe en él.
    if (document.activeElement !== input) {
      if (invalido) {
        if (input.value === '') input.value = invalido.crudo;
      } else {
        input.value = q > 0 ? String(q) : '';
      }
    }

    if (invalido) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = invalido.error;
    } else {
      input.removeAttribute('aria-invalid');
      error.textContent = '';
    }
    tr.classList.toggle('is-invalid', Boolean(invalido));
    tr.classList.toggle('has-qty', !invalido && q > 0);
  }
}
