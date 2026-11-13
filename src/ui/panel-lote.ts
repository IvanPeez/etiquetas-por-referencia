import type { Producto } from '../catalog-rules.ts';
import type { Lote } from '../lib/lote.ts';
import { numero } from '../lib/formato.ts';
import { entradaItem } from './movimiento.ts';

/** IDs pintados la vez anterior: solo los nuevos se animan al entrar. */
let anteriores = new Set<string>();

/** Lista «Lote actual»: referencias en orden de selección, con su cantidad y botón Quitar. */
export function pintarPanelLote(
  lista: HTMLOListElement,
  vacio: HTMLElement,
  tpl: HTMLTemplateElement,
  lote: Lote,
  porId: ReadonlyMap<string, Producto>,
): void {
  const ids = lote.entradas().map(([id]) => id);
  for (const id of lote.idsInvalidos()) if (!lote.tiene(id)) ids.push(id);

  const nuevos: HTMLLIElement[] = [];
  const items = ids.map((id, i) => {
    const p = porId.get(id);
    const li = tpl.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
    li.dataset.id = id;
    const invalido = lote.invalido(id);
    li.classList.toggle('is-invalid', Boolean(invalido));
    li.querySelector('.lote-list__pos')!.textContent = String(i + 1);
    li.querySelector('.lote-list__name')!.textContent = p?.nombre ?? id;
    li.querySelector('.lote-list__ref')!.textContent = p?.ref ?? '';
    li.querySelector('.lote-list__qty')!.textContent = invalido ? 'Revisar' : numero(lote.cantidad(id));
    const btn = li.querySelector('button')!;
    btn.setAttribute('aria-label', `Quitar ${p?.nombre.trim() ?? id} del lote`);
    btn.title = 'Quitar del lote';
    if (!anteriores.has(id)) nuevos.push(li);
    return li;
  });

  lista.replaceChildren(...items);
  vacio.hidden = items.length > 0;
  lista.hidden = items.length === 0;
  for (const li of nuevos) entradaItem(li);
  anteriores = new Set(ids);
}
