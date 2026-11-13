import { describe, expect, it } from 'vitest';
import { ETIQUETA, MODULO_MIN_RECOMENDADO, anchoModulo, codificar, pathDeModulos } from '../src/lib/barcode.ts';
import { productos } from '../src/catalog.ts';

/** Decodificador Code 128 mínimo (set B y C) para verificar lo que generamos. */
const PATRONES = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000',
  '10011000100', '10001100100', '11001001000', '11001000100', '11000100100', '10110011100', '10011011100',
  '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', '11001001110',
  '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100',
  '11100110100', '11100110010', '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110',
  '11010001110', '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110',
  '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010',
  '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000',
  '11110111010', '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110', '11011110110',
  '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000',
  '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100',
];

function decodificar(modulos: string): string {
  const stop = '1100011101011';
  expect(modulos.endsWith(stop)).toBe(true);
  const cuerpo = modulos.slice(0, -stop.length);
  const valores: number[] = [];
  for (let i = 0; i < cuerpo.length; i += 11) valores.push(PATRONES.indexOf(cuerpo.slice(i, i + 11)));
  expect(valores.every((v) => v >= 0)).toBe(true);
  const [inicio, ...resto] = valores;
  const check = resto.pop()!;
  const suma = inicio + resto.reduce((s, v, i) => s + v * (i + 1), 0);
  expect(suma % 103).toBe(check);

  let set = inicio === 105 ? 'C' : inicio === 104 ? 'B' : 'A';
  let out = '';
  for (const v of resto) {
    // En el set C, 0–99 son pares de dígitos (99 = «99», no un cambio de set).
    if (set === 'C' && v < 100) out += String(v).padStart(2, '0');
    else if (v === 99) set = 'C';
    else if (v === 100) set = 'B';
    else if (v === 101) set = 'A';
    else if (set === 'B') out += String.fromCharCode(v + 32);
    else out += String.fromCharCode(v < 64 ? v + 32 : v - 64);
  }
  return out;
}

describe('Code 128', () => {
  it.each(['770999003221', '2278 -1000', '2878', '0252', '252'])('«%s» se decodifica igual (texto, ceros incluidos)', (v) => {
    expect(decodificar(codificar(v).modulos)).toBe(v);
  });

  it('todo el catálogo se codifica y cabe en 42 mm con silencio ≥ 10 módulos y ≥ 2 mm', () => {
    let peor = Infinity;
    for (const p of productos) {
      const b = codificar(p.codigo);
      expect(decodificar(b.modulos)).toBe(p.codigo);
      expect(b.silencio).toBeGreaterThanOrEqual(10 * b.modulo - 1e-9);
      expect(b.silencio).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(b.anchoBarras + 2 * b.silencio).toBeLessThanOrEqual(ETIQUETA.anchoUtil + 1e-9);
      peor = Math.min(peor, b.modulo);
    }
    expect(peor).toBeGreaterThanOrEqual(MODULO_MIN_RECOMENDADO);
  });
});

describe('anchoModulo', () => {
  it('101 módulos (12 dígitos) → 42/121 mm', () => {
    expect(anchoModulo(101)).toBeCloseTo(42 / 121, 6);
  });

  it('códigos largos: manda el mínimo de 2 mm', () => {
    const m = anchoModulo(400);
    expect(10 * m).toBeLessThan(2);
    expect(400 * m + 4).toBeCloseTo(42, 6);
  });
});

describe('pathDeModulos', () => {
  it('un rectángulo por racha de barras', () => {
    expect(pathDeModulos('1101')).toBe('M0 0h2v1h-2zM3 0h1v1h-1z');
    expect(pathDeModulos('000')).toBe('');
  });
});
