import { describe, expect, it } from 'vitest';
import {
  CONTEOS_ESPERADOS,
  construirCatalogo,
  contar,
  esCode128Valido,
  pareceNotacionCientifica,
  presentacionDe,
} from '../src/catalog-rules.ts';
import { porId, productos } from '../src/catalog.ts';

describe('presentacionDe', () => {
  it.each([
    ['A MILKSHAKE PLEASE DM 120', '2278 -120', '120'],
    ['A MILKSHAKE PLEASE DM 1000', '2278 -1000', '1000'],
    ['JEQUE ARABIANS II - 250', '2554 -250', '250'],
    ['JEQUE ARABIANS II -1000', '2554 -1000', '1000'],
    ['X 500', '0001-500', '500'],
  ])('%s / %s → %s', (nombre, ref, esperado) => {
    expect(presentacionDe(nombre, ref)).toBe(esperado);
  });

  it.each([
    ['A MILKSHAKE PLEASE DM', '2278'], // sin sufijo
    ['EMIRATO 1 UNISEX', '1234'], // número del nombre comercial
    ['PRODUCTO 120', '1234'], // número en el nombre, sin sufijo en la ref
    ['PRODUCTO 250', '1234 -120'], // sufijo y nombre no coinciden
    ['PRODUCTO 750', '1234 -750'], // sufijo fuera del conjunto válido
  ])('%s / %s → Sin presentación', (nombre, ref) => {
    expect(presentacionDe(nombre, ref)).toBeNull();
  });
});

describe('construirCatalogo', () => {
  it('usa la referencia cuando el código está vacío y marca fallback', () => {
    const { productos } = construirCatalogo([{ fila: 2, nombre: 'A', ref: '0042', barras: '' }]);
    expect(productos[0]).toMatchObject({ id: '0042', codigo: '0042', fallback: true });
  });

  it('asigna ref#n a duplicados y los reporta', () => {
    const r = construirCatalogo([
      { fila: 2, nombre: 'A', ref: '1', barras: 'x' },
      { fila: 3, nombre: 'B', ref: '1', barras: 'y' },
    ]);
    expect(r.productos.map((p) => p.id)).toEqual(['1', '1#2']);
    expect(r.duplicados).toEqual([{ ref: '1', filas: [2, 3] }]);
  });

  it('valida Code 128 y detecta notación científica', () => {
    expect(esCode128Valido('770999003221')).toBe(true);
    expect(esCode128Valido('2278 -120')).toBe(true);
    expect(esCode128Valido('')).toBe(false);
    expect(esCode128Valido('Ñ')).toBe(false);
    expect(pareceNotacionCientifica('7.70999E+11')).toBe(true);
    expect(pareceNotacionCientifica('770999003221')).toBe(false);
  });
});

describe('catalog.json generado', () => {
  it('cumple los conteos 4.538 / 906×4 / 914 / 53', () => {
    expect(contar([...productos])).toEqual(CONTEOS_ESPERADOS);
  });

  it('todos los identificadores son texto y conservan ceros a la izquierda', () => {
    for (const p of productos) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.ref).toBe('string');
      expect(typeof p.codigo).toBe('string');
    }
    expect(productos.some((p) => p.ref.startsWith('0'))).toBe(true);
  });

  it('IDs únicos', () => {
    expect(porId.size).toBe(productos.length);
  });

  it('fallback solo cuando codigo === ref', () => {
    for (const p of productos) if (p.fallback) expect(p.codigo).toBe(p.ref);
  });

  it('cada familia con presentación tiene las 4 presentaciones', () => {
    const familias = new Map<string, Set<string>>();
    for (const p of productos) {
      if (!p.pres) continue;
      const base = p.ref.replace(/\s*-\s*\d+$/, '');
      if (!familias.has(base)) familias.set(base, new Set());
      familias.get(base)!.add(p.pres);
    }
    expect(familias.size).toBe(906);
    for (const [, s] of familias) expect(s.size).toBe(4);
  });
});
