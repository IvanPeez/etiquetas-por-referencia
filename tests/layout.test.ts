import { describe, expect, it } from 'vitest';
import { celdas, layout, totalFilas } from '../src/lib/layout.ts';
import { resumenDe } from '../src/lib/lote.ts';
import { textoResumen } from '../src/lib/formato.ts';

describe('layout()', () => {
  it('lote vacío → sin hojas', () => {
    expect(layout([])).toEqual([]);
    expect(layout([['A', 0]])).toEqual([]);
  });

  it('3A + 2B: el 4.º espacio de la fila 1 queda vacío y B empieza en la fila 2', () => {
    const hojas = layout([
      ['A', 3],
      ['B', 2],
    ]);
    expect(hojas).toHaveLength(1);
    expect(hojas[0]).toEqual([
      { id: 'A', n: 3 },
      { id: 'B', n: 2 },
    ]);
    expect(celdas(hojas[0][0])).toEqual(['A', 'A', 'A', null]);
    expect(celdas(hojas[0][1])).toEqual(['B', 'B', null, null]);
  });

  it('45A + 2B: 12 filas en la hoja 1, B empieza en la hoja 2 · «47 etiquetas · 2 hojas»', () => {
    const lote: [string, number][] = [
      ['A', 45],
      ['B', 2],
    ];
    const hojas = layout(lote);
    expect(hojas).toHaveLength(2);
    expect(hojas[0]).toHaveLength(12);
    expect(hojas[0].every((f) => f.id === 'A')).toBe(true);
    expect(hojas[0][11]).toEqual({ id: 'A', n: 1 }); // 11×4 + 1 = 45
    expect(hojas[1]).toEqual([{ id: 'B', n: 2 }]);
    const r = resumenDe(lote);
    expect(r).toMatchObject({ etiquetas: 47, hojas: 2, referencias: 2 });
    expect(textoResumen(r)).toBe('47 etiquetas · 2 hojas · 2 referencias');
  });

  it('lote de 49: 48 en la hoja 1 + 1 en la hoja 2', () => {
    const hojas = layout([['A', 49]]);
    expect(hojas).toHaveLength(2);
    expect(hojas[0].reduce((s, f) => s + f.n, 0)).toBe(48);
    expect(hojas[1]).toEqual([{ id: 'A', n: 1 }]);
  });

  it('48 exactas llenan una sola hoja (sin hoja vacía al final)', () => {
    const hojas = layout([['A', 48]]);
    expect(hojas).toHaveLength(1);
    expect(hojas[0]).toHaveLength(12);
  });

  it('cada referencia empieza en una fila nueva, aunque la anterior deje huecos', () => {
    const hojas = layout([
      ['A', 1],
      ['B', 1],
      ['C', 5],
    ]);
    expect(hojas[0]).toEqual([
      { id: 'A', n: 1 },
      { id: 'B', n: 1 },
      { id: 'C', n: 4 },
      { id: 'C', n: 1 },
    ]);
  });

  it('respeta el orden de selección (no ordena por id)', () => {
    const hojas = layout([
      ['Z', 4],
      ['A', 4],
      ['M', 4],
    ]);
    expect(hojas[0].map((f) => f.id)).toEqual(['Z', 'A', 'M']);
  });

  it('una referencia que cruza de hoja continúa en la siguiente, sin repetir ni perder etiquetas', () => {
    const lote: [string, number][] = [
      ['A', 30],
      ['B', 30],
      ['C', 7],
    ];
    const hojas = layout(lote);
    // A: 8 filas, B: 8 filas, C: 2 filas = 18 filas → 2 hojas
    expect(hojas.map((h) => h.length)).toEqual([12, 6]);
    expect(hojas[0].slice(8).map((f) => f.id)).toEqual(['B', 'B', 'B', 'B']);
    expect(hojas[1].slice(0, 4).map((f) => f.id)).toEqual(['B', 'B', 'B', 'B']);
    const cuenta: Record<string, number> = {};
    for (const h of hojas) for (const f of h) cuenta[f.id] = (cuenta[f.id] ?? 0) + f.n;
    expect(cuenta).toEqual({ A: 30, B: 30, C: 7 });
  });

  it('propiedades: hojas = ceil(Σceil(q/4)/12); ninguna hoja vacía ni > 12 filas', () => {
    let semilla = 42;
    const rnd = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let caso = 0; caso < 200; caso++) {
      const lote: [string, number][] = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => [
        `R${i}`,
        Math.floor(rnd() * 120),
      ]);
      const hojas = layout(lote);
      const filas = lote.reduce((s, [, q]) => s + Math.ceil(q / 4), 0);
      expect(hojas.length).toBe(Math.ceil(filas / 12));
      expect(totalFilas(lote)).toBe(filas);
      for (const h of hojas) {
        expect(h.length).toBeGreaterThan(0);
        expect(h.length).toBeLessThanOrEqual(12);
        for (const f of h) expect(f.n).toBeGreaterThanOrEqual(1);
      }
      expect(resumenDe(lote).hojas).toBe(hojas.length);
    }
  });

  it('9.999 unidades → 2.500 filas → 209 hojas', () => {
    const hojas = layout([['A', 9999]]);
    expect(hojas).toHaveLength(209);
    expect(hojas.at(-1)).toHaveLength(4);
    expect(hojas.at(-1)!.at(-1)).toEqual({ id: 'A', n: 3 });
  });

  it('rechaza cantidades no enteras o negativas', () => {
    expect(() => layout([['A', 1.5]])).toThrow(RangeError);
    expect(() => layout([['A', -1]])).toThrow(RangeError);
  });

  it('no muta la entrada', () => {
    const lote: [string, number][] = [['A', 5]];
    const copia = structuredClone(lote);
    layout(lote);
    expect(lote).toEqual(copia);
  });
});
