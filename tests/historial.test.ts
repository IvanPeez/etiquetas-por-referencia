import { describe, expect, it, vi } from 'vitest';
import { Historial, MAX_TRABAJOS, type Almacen, type ItemImpreso } from '../src/lib/historial.ts';

const item = (id: string, cantidad: number): ItemImpreso => ({ id, nombre: `Producto ${id}`, ref: id, cantidad });
const memoria = (inicial: string | null = null): Almacen & { valor: string | null } => {
  const a = {
    valor: inicial,
    leer: () => a.valor,
    escribir: (v: string) => void (a.valor = v),
    borrar: () => void (a.valor = null),
  };
  return a;
};
const fecha = (min: number) => new Date(Date.UTC(2026, 10, 13, 14, min));

describe('Historial', () => {
  it('vacío al inicio', () => {
    expect(new Historial().resumen()).toEqual({ referencias: [], ultima: null, etiquetas: 0, impresiones: 0 });
  });

  it('acumula cantidades por referencia y la más reciente va primero', () => {
    const h = new Historial();
    h.registrar([item('A', 45), item('B', 2)], fecha(0));
    h.registrar([item('C', 3), item('A', 5)], fecha(10));
    const r = h.resumen();
    expect(r.referencias.map((x) => [x.id, x.cantidad, x.veces])).toEqual([
      ['A', 50, 2],
      ['C', 3, 1],
      ['B', 2, 1],
    ]);
    expect(r.etiquetas).toBe(55);
    expect(r.impresiones).toBe(2);
  });

  it('la última referencia impresa es la última del último trabajo', () => {
    const h = new Historial();
    h.registrar([item('A', 45), item('B', 2)], fecha(0));
    expect(h.resumen().ultima).toMatchObject({ id: 'B', cantidad: 2, fecha: fecha(0).toISOString() });
    h.registrar([item('C', 3)], fecha(5));
    expect(h.resumen().ultima?.id).toBe('C');
  });

  it('deshacer quita solo la última impresión', () => {
    const h = new Historial();
    h.registrar([item('A', 4)], fecha(0));
    h.registrar([item('B', 8)], fecha(1));
    expect(h.deshacerUltima()?.items[0].id).toBe('B');
    expect(h.resumen()).toMatchObject({ etiquetas: 4, impresiones: 1, ultima: { id: 'A' } });
    h.deshacerUltima();
    expect(h.deshacerUltima()).toBeUndefined();
    expect(h.resumen().ultima).toBeNull();
  });

  it('ignora cantidades ≤ 0 y trabajos vacíos', () => {
    const h = new Historial();
    h.registrar([item('A', 0)]);
    h.registrar([]);
    expect(h.resumen().impresiones).toBe(0);
  });

  it('persiste y se recupera del almacén', () => {
    const a = memoria();
    const h1 = new Historial(a);
    h1.registrar([item('0252 -120', 2)], fecha(0));
    const h2 = new Historial(a);
    expect(h2.resumen()).toMatchObject({ etiquetas: 2, ultima: { id: '0252 -120', ref: '0252 -120' } });
    h2.borrar();
    expect(a.valor).toBeNull();
    expect(new Historial(a).resumen().impresiones).toBe(0);
  });

  it('datos corruptos o de otra versión → empieza vacío', () => {
    expect(new Historial(memoria('{no es json')).resumen().impresiones).toBe(0);
    expect(new Historial(memoria(JSON.stringify({ v: 99, trabajos: [] }))).resumen().impresiones).toBe(0);
    const mezcla = JSON.stringify({ v: 1, trabajos: [{ fecha: 'x', items: [item('A', 1)] }, { basura: true }] });
    expect(new Historial(memoria(mezcla)).resumen().impresiones).toBe(1);
  });

  it('si el almacenamiento falla, sigue en memoria', () => {
    const roto: Almacen = {
      leer: () => {
        throw new Error('bloqueado');
      },
      escribir: () => {
        throw new Error('cuota');
      },
      borrar: () => {},
    };
    const h = new Historial(roto);
    h.registrar([item('A', 1)]);
    expect(h.resumen().etiquetas).toBe(1);
  });

  it(`guarda como máximo ${MAX_TRABAJOS} impresiones`, () => {
    const h = new Historial();
    for (let i = 0; i < MAX_TRABAJOS + 5; i++) h.registrar([item(`R${i}`, 1)]);
    expect(h.trabajos).toHaveLength(MAX_TRABAJOS);
    expect(h.trabajos[0].items[0].id).toBe('R5');
  });

  it('notifica cambios', () => {
    const h = new Historial();
    const fn = vi.fn();
    h.alCambiar(fn);
    h.registrar([item('A', 1)]);
    h.deshacerUltima();
    h.borrar(); // ya vacío: no notifica
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
