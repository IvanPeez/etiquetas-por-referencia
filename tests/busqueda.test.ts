import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscar, construirIndice, cumpleFiltro, normalizar } from '../src/lib/busqueda.ts';
import { debounce } from '../src/lib/debounce.ts';
import type { Producto } from '../src/catalog-rules.ts';
import { productos } from '../src/catalog.ts';

const indiceReal = construirIndice(productos);

const p = (id: string, nombre: string, codigo = `C${id}`, pres: Producto['pres'] = null): Producto => ({
  id,
  nombre,
  ref: id,
  codigo,
  pres,
  fallback: false,
});

describe('normalizar', () => {
  it('quita tildes, pasa a minúsculas y colapsa espacios', () => {
    expect(normalizar('BOSÉ  HM')).toBe('bose hm');
    expect(normalizar('  Ñandú\tÁGIL ')).toBe('nandu agil');
  });
});

describe('agrupación por presentación', () => {
  it.each([
    ['120', 906],
    ['250', 906],
    ['500', 906],
    ['1000', 906],
    ['sin', 914],
    ['todas', 4538],
  ] as const)('%s → %i productos', (filtro, n) => {
    expect(buscar(indiceReal, '', filtro)).toHaveLength(n);
  });

  it('cada producto cae exactamente en un grupo', () => {
    const grupos = ['120', '250', '500', '1000', 'sin'] as const;
    for (const prod of productos) expect(grupos.filter((g) => cumpleFiltro(prod, g))).toHaveLength(1);
  });

  it('la vista filtrada conserva el orden del catálogo', () => {
    const ids = buscar(indiceReal, '', '500').map((x) => x.id);
    const esperados = productos.filter((x) => x.pres === '500').map((x) => x.id);
    expect(ids).toEqual(esperados);
  });
});

describe('buscar', () => {
  const indice = construirIndice([
    p('0100', 'PERFUME 2278 ESPECIAL'), // contiene «2278» en el nombre
    p('2278 -120', 'A MILKSHAKE PLEASE DM 120', '770999003221', '120'),
    p('12278', 'OTRO'), // contiene «2278» en la ref
    p('2278', 'A MILKSHAKE PLEASE DM', '200387590583'),
    p('3000', 'BOSÉ  HM'),
  ]);
  const ids = (q: string, f: Parameters<typeof buscar>[2] = 'todas') => buscar(indice, q, f).map((x) => x.id);

  it('orden: exacto, luego empieza por, luego contiene', () => {
    expect(ids('2278')).toEqual(['2278', '2278 -120', '0100', '12278']);
  });

  it('código de barras exacto primero', () => {
    expect(ids('770999003221')[0]).toBe('2278 -120');
  });

  it('referencia con o sin espacio antes del guion', () => {
    expect(ids('2278-120')[0]).toBe('2278 -120');
    expect(ids('2278 -120')[0]).toBe('2278 -120');
  });

  it('sin distinguir mayúsculas ni tildes; espacios dobles no importan', () => {
    expect(ids('bose hm')).toEqual(['3000']);
    expect(ids('BOSE')).toEqual(['3000']);
    expect(ids('bosé')).toEqual(['3000']);
  });

  it('coincidencia parcial y por palabras sueltas', () => {
    expect(ids('shake')).toEqual(['2278 -120', '2278']);
    expect(ids('milkshake 120')).toEqual(['2278 -120']);
  });

  it('respeta el filtro de presentación', () => {
    expect(ids('milkshake', '120')).toEqual(['2278 -120']);
    expect(ids('milkshake', 'sin')).toEqual(['2278']);
  });

  it('sin resultados', () => {
    expect(ids('zzzz')).toEqual([]);
  });

  it('catálogo real: búsqueda por código exacto devuelve ese producto primero', () => {
    const muestra = [productos[0], productos[1234], productos.find((x) => x.fallback)!];
    for (const prod of muestra) {
      expect(buscar(indiceReal, prod.codigo)[0].id).toBe(prod.id);
      expect(buscar(indiceReal, prod.ref)[0].id).toBe(prod.id);
    }
  });

  it('catálogo real: rendimiento (4.538 filas) por debajo de 20 ms por consulta', () => {
    const t0 = performance.now();
    for (const q of ['a', 'dm', 'milk', '7709', 'bose hm 500']) buscar(indiceReal, q);
    expect((performance.now() - t0) / 5).toBeLessThan(20);
  });
});

describe('debounce', () => {
  afterEach(() => vi.useRealTimers());

  it('ejecuta una vez, 120 ms después de la última llamada', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 120);
    d('a');
    vi.advanceTimersByTime(100);
    d('ab');
    vi.advanceTimersByTime(119);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('ab');
    d('x');
    d.cancelar();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledOnce();
  });
});
