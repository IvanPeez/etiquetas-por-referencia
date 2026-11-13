/**
 * Microanimaciones de pantalla (brief §7). Solo transform y opacity, salvo los contadores
 * (texto) y el anillo de hojas (stroke-dashoffset, pedido explícitamente por el brief).
 * - Nunca en la tabla ni en la impresión.
 * - Con prefers-reduced-motion todo se aplica al instante.
 */
import { gsap } from 'gsap';
import { numero } from '../lib/formato.ts';

const reducido = matchMedia('(prefers-reduced-motion: reduce)');
export const sinMovimiento = () => reducido.matches;

const EASE = 'power3.out';

/** Valor mostrado por cada contador (para retomar desde donde va si se interrumpe). */
const valores = new WeakMap<HTMLElement, { v: number }>();

/** Cuenta hasta `destino` en 0,3 s. Interrumpible: un nuevo valor retoma desde el actual. */
export function contar(el: HTMLElement, destino: number): void {
  let estado = valores.get(el);
  if (!estado) {
    estado = { v: Number(el.dataset.valor ?? 0) };
    valores.set(el, estado);
  }
  el.dataset.valor = String(destino);
  gsap.killTweensOf(estado);
  if (sinMovimiento() || estado.v === destino) {
    estado.v = destino;
    el.textContent = numero(destino);
    return;
  }
  gsap.to(estado, {
    v: destino,
    duration: 0.3,
    ease: EASE,
    onUpdate: () => {
      el.textContent = numero(Math.round(estado.v));
    },
    onComplete: () => {
      el.textContent = numero(destino);
    },
  });
}

/** Entrada escalonada de las tarjetas al cargar: 40 ms entre cada una, opacidad + 8 px. */
export function entradaInicial(elementos: Element[]): void {
  if (sinMovimiento()) return;
  gsap.from(elementos, {
    opacity: 0,
    y: 8,
    duration: 0.32,
    ease: EASE,
    stagger: 0.04,
    clearProps: 'opacity,transform',
  });
}

/** Aparición de un elemento nuevo en la lista Lote actual. */
export function entradaItem(el: Element): void {
  if (sinMovimiento()) return;
  gsap.from(el, { opacity: 0, y: 4, duration: 0.18, ease: EASE, clearProps: 'opacity,transform' });
}

/** Apertura de un modal: fundido + escala 0,98 → 1 del contenido (los modales quedan centrados). */
export function abrirModal(contenido: Element): void {
  if (sinMovimiento()) return;
  gsap.fromTo(
    contenido,
    { opacity: 0, scale: 0.98 },
    { opacity: 1, scale: 1, duration: 0.22, ease: EASE, clearProps: 'opacity,transform' },
  );
}
