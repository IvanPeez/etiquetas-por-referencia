import { describe, expect, it, vi } from 'vitest';
import { Lote, parseCantidad, resumenDe } from '../src/lib/lote.ts';
import { textoResumen } from '../src/lib/formato.ts';
import { porId, productos } from '../src/catalog.ts';

describe('parseCantidad', () => {
  it.each([
    ['', 0],
    ['  ', 0],
    ['0', 0],
    ['7', 7],
    ['007', 7],
    ['9999', 9999],
  ])('«%s» → %i', (crudo, valor) => {
    expect(parseCantidad(crudo)).toEqual({ ok: true, valor });
  });

  it.each([
    ['-1', 'No puede ser negativo'],
    ['1.5', 'Debe ser un número entero'],
    ['1,5', 'Debe ser un número entero'],
    ['1e3', 'Debe ser un número entero'],
    ['abc', 'Debe ser un número entero'],
    ['10000', 'Máximo 9.999'],
  ])('«%s» → error «%s»', (crudo, error) => {
    expect(parseCantidad(crudo)).toEqual({ ok: false, error });
  });
});

describe('Lote', () => {
  it('guarda el orden de selección', () => {
    const l = new Lote();
    l.aplicar('C', '1');
    l.aplicar('A', '2');
    l.aplicar('B', '3');
    expect(l.entradas()).toEqual([
      ['C', 1],
      ['A', 2],
      ['B', 3],
    ]);
  });

  it('cambiar la cantidad conserva la posición', () => {
    const l = new Lote();
    l.aplicar('A', '1');
    l.aplicar('B', '1');
    l.aplicar('A', '9');
    expect(l.entradas()).toEqual([
      ['A', 9],
      ['B', 1],
    ]);
  });

  it('0 o vacío saca la referencia; al volver a tener cantidad entra al final', () => {
    const l = new Lote();
    l.aplicar('A', '1');
    l.aplicar('B', '1');
    l.aplicar('A', '0');
    expect(l.tiene('A')).toBe(false);
    l.aplicar('C', '1');
    l.aplicar('A', '5');
    expect(l.entradas().map(([id]) => id)).toEqual(['B', 'C', 'A']);
    l.aplicar('B', '');
    expect(l.entradas().map(([id]) => id)).toEqual(['C', 'A']);
  });

  it('un valor inválido bloquea (listo = false), conserva el texto y no altera la cantidad vigente', () => {
    const l = new Lote();
    l.aplicar('A', '4');
    const r = l.aplicar('A', '-3');
    expect(r.ok).toBe(false);
    expect(l.listo).toBe(false);
    expect(l.hayInvalidos).toBe(true);
    expect(l.invalido('A')).toEqual({ crudo: '-3', error: 'No puede ser negativo' });
    expect(l.cantidad('A')).toBe(4);
    l.aplicar('A', '6');
    expect(l.listo).toBe(true);
    expect(l.invalido('A')).toBeUndefined();
    expect(l.entradas()).toEqual([['A', 6]]);
  });

  it('un inválido en otra referencia también bloquea', () => {
    const l = new Lote();
    l.aplicar('A', '4');
    l.aplicar('B', '10000');
    expect(l.listo).toBe(false);
    l.aplicar('B', '');
    expect(l.listo).toBe(true);
  });

  it('lote vacío no está listo', () => {
    expect(new Lote().listo).toBe(false);
  });

  it('Vaciar reinicia cantidades e inválidos', () => {
    const l = new Lote();
    l.aplicar('A', '4');
    l.aplicar('B', 'x');
    l.vaciar();
    expect(l.entradas()).toEqual([]);
    expect(l.hayInvalidos).toBe(false);
    expect(l.resumen()).toEqual({ etiquetas: 0, hojas: 0, referencias: 0, filasUltimaHoja: 0 });
  });

  it('el estado no depende del filtro ni la búsqueda: es por id', () => {
    // La UI solo cambia qué filas muestra; el lote se consulta por id.
    const l = new Lote();
    l.aplicar(productos[0].id, '3');
    expect(l.cantidad(productos[0].id)).toBe(3);
  });

  it('fijar() valida y notifica a los oyentes', () => {
    const l = new Lote();
    const fn = vi.fn();
    const cancelar = l.alCambiar(fn);
    l.fijar('A', 2);
    l.aplicar('B', '1');
    l.vaciar();
    expect(fn).toHaveBeenCalledTimes(3);
    cancelar();
    l.fijar('A', 1);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(() => l.fijar('A', 1.5)).toThrow(RangeError);
    expect(() => l.fijar('A', 10000)).toThrow(RangeError);
  });

  it('puede mezclar presentaciones; desglose por presentación cuenta referencias', () => {
    const l = new Lote();
    const de = (pres: string | null) => productos.find((p) => p.pres === pres)!;
    l.aplicar(de('120').id, '2');
    l.aplicar(de('1000').id, '5');
    l.aplicar(de(null).id, '1');
    expect(l.desglose(porId)).toEqual({ '120': 1, '250': 0, '500': 0, '1000': 1, sin: 1 });
  });

  it('resumen: etiquetas, hojas, referencias y llenado de la última hoja', () => {
    const l = new Lote();
    l.aplicar('A', '45');
    l.aplicar('B', '2');
    expect(l.resumen()).toEqual({ etiquetas: 47, hojas: 2, referencias: 2, filasUltimaHoja: 1 });
    expect(l.hojas()).toHaveLength(2);
    expect(resumenDe([['A', 48]]).filasUltimaHoja).toBe(12);
  });
});

describe('textoResumen', () => {
  it('singular y separador de miles es-CO', () => {
    expect(textoResumen({ etiquetas: 1, hojas: 1, referencias: 1 })).toBe('1 etiqueta · 1 hoja · 1 referencia');
    expect(textoResumen({ etiquetas: 0, hojas: 0, referencias: 0 })).toBe('0 etiquetas · 0 hojas · 0 referencias');
    expect(textoResumen({ etiquetas: 9999, hojas: 209, referencias: 1 })).toBe(
      '9.999 etiquetas · 209 hojas · 1 referencia',
    );
  });
});
