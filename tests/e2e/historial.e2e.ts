import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const ARCHIVO = resolve(import.meta.dirname, '../../dist/etiquetas.html');
const URL_APP = pathToFileURL(ARCHIVO).href;
const PX_POR_MM = 96 / 25.4;

let browser: Browser;
let contexto: BrowserContext;
let page: Page;

beforeAll(async () => {
  if (!existsSync(ARCHIVO)) throw new Error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

beforeEach(async () => {
  await contexto?.close();
  // Contexto nuevo por prueba: localStorage limpio
  contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page = await contexto.newPage();
  await abrir();
});

async function abrir() {
  await page.goto(URL_APP);
  await page.locator('.segmented label:has(input[value="todas"])').click();
  // window.print se intercepta; el cuadro real dispara «afterprint» al cerrarse
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event('afterprint'));
    };
  });
}

async function poner(ref: string, cantidad: string) {
  await page.fill('#buscar', ref);
  await page.waitForFunction((t) => (document.querySelector('#filas') as HTMLElement).dataset.consulta === t, ref);
  await page.locator('#filas tr', { has: page.locator(`td.col-ref:text-is("${ref}")`) }).locator('.qty').fill(cantidad);
}

async function imprimir() {
  const antes = await page.locator('[data-hist="totales"]').textContent();
  await page.click('#btn-imprimir');
  await page.waitForFunction((t) => document.querySelector('[data-hist="totales"]')!.textContent !== t, antes);
}

/** Imprimir sin cerrar el cuadro (sin afterprint): #print-root queda armado para medirlo. */
async function prepararSinCerrar() {
  await page.evaluate(() => {
    (window as unknown as { __p: boolean }).__p = false;
    window.print = () => void ((window as unknown as { __p: boolean }).__p = true);
  });
  await page.click('#btn-imprimir');
  await page.waitForFunction(() => (window as unknown as { __p: boolean }).__p);
}

const historial = () =>
  page.locator('#hist-lista li').evaluateAll((lis) =>
    lis.map((li) => [li.querySelector('.lote-list__ref')!.textContent!.split(' · ')[0], li.querySelector('.lote-list__qty')!.textContent]),
  );

describe('historial de impresión', () => {
  it('vacío al inicio, con «Ninguna todavía»', async () => {
    await expect(page.locator('[data-hist="ultima-vacia"]').isVisible()).resolves.toBe(true);
    await page.click('#tab-impresas');
    await expect(page.locator('#hist-vacio').isVisible()).resolves.toBe(true);
  });

  it('registra referencias y cantidades; la última impresa es la última del lote', async () => {
    await poner('2278 -120', '45');
    await poner('0252 -120', '2');
    await imprimir();
    await page.click('#tab-impresas');
    expect(await historial()).toEqual([
      ['0252 -120', '2'],
      ['2278 -120', '45'],
    ]);
    expect(await page.locator('[data-hist="totales"]').textContent()).toBe('47 etiquetas · 1 impresión');
    expect(await page.locator('[data-hist="ultima-nombre"]').textContent()).toBe('ACQUA FRESCA  HM 120');
    expect(await page.locator('[data-hist="ultima-meta"]').textContent()).toMatch(/^0252 -120 · 2 etiquetas · hoy \d\d:\d\d$/);
    expect(await page.locator('#tab-impresas .tabs__n').textContent()).toBe('2');
  });

  it('acumula entre impresiones y la más reciente sube al inicio', async () => {
    await poner('2278 -120', '45');
    await poner('0252 -120', '2');
    await imprimir();
    await poner('0252 -120', '');
    await poner('2278 -120', '3');
    await imprimir();
    expect(await historial()).toEqual([
      ['2278 -120', '48'],
      ['0252 -120', '2'],
    ]);
    expect(await page.locator('[data-hist="totales"]').textContent()).toBe('50 etiquetas · 2 impresiones');
    expect(await page.locator('[data-hist="ultima-meta"]').textContent()).toMatch(/^2278 -120 · 3 etiquetas/);
  });

  it('la vista previa no cuenta como impresión', async () => {
    await poner('2278 -120', '5');
    await page.click('#btn-vista');
    await page.waitForSelector('#vista-hojas .sheet');
    await page.keyboard.press('Escape');
    expect(await page.locator('#hist-lista li').count()).toBe(0);
  });

  it('Ctrl+P (beforeprint/afterprint) también se registra', async () => {
    await poner('2278 -120', '4');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'));
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(await historial()).toEqual([['2278 -120', '4']]);
  });

  it('se conserva al cerrar y volver a abrir el archivo', async () => {
    await poner('2278 -120', '6');
    await imprimir();
    await page.reload();
    await abrir();
    expect(await historial()).toEqual([['2278 -120', '6']]);
    expect(await page.locator('[data-hist="ultima-nombre"]').textContent()).toBe('A MILKSHAKE PLEASE DM 120');
  });

  it('Deshacer última impresión quita solo la última', async () => {
    await poner('2278 -120', '6');
    await imprimir();
    await poner('0252 -120', '2');
    await imprimir();
    await page.click('#tab-impresas');
    await page.click('#btn-deshacer-impresion');
    expect(await historial()).toEqual([['2278 -120', '6']]);
  });

  it('Borrar historial pide confirmación', async () => {
    await poner('2278 -120', '6');
    await imprimir();
    await page.click('#tab-impresas');
    await page.click('#btn-borrar-historial');
    await page.click('#dialogo-borrar-historial button[value="cancelar"]');
    expect(await page.locator('#hist-lista li').count()).toBe(1);
    await page.click('#btn-borrar-historial');
    await page.click('#dialogo-borrar-historial button[value="borrar"]');
    expect(await page.locator('#hist-lista li').count()).toBe(0);
    await expect(page.locator('[data-hist="ultima-vacia"]').isVisible()).resolves.toBe(true);
    await page.reload();
    await abrir();
    expect(await page.locator('#hist-lista li').count()).toBe(0);
  });

  it('pestañas con teclado (flechas) y acceso desde el rail', async () => {
    await page.focus('#tab-lote');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tab-impresas');
    await expect(page.locator('#vista-impresas').isVisible()).resolves.toBe(true);
    await expect(page.locator('#vista-lote').isVisible()).resolves.toBe(false);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#vista-lote').isVisible()).resolves.toBe(true);
    await page.click('[data-ir-tab="tab-impresas"]');
    await expect(page.locator('#vista-impresas').isVisible()).resolves.toBe(true);
  });
});

describe('líneas de corte', () => {
  async function geometria() {
    await page.emulateMedia({ media: 'print' });
    return page.evaluate(() => {
      const labels = [...document.querySelectorAll('#print-root .sheet:first-child > .label')];
      return labels.map((l) => {
        const r = l.getBoundingClientRect();
        const s = getComputedStyle(l, '::before');
        return {
          vacia: l.classList.contains('label--empty'),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          borde: s.borderRightWidth,
          bordeArriba: parseFloat(s.borderTopWidth),
          color: s.borderTopColor,
          left: parseFloat(s.left),
          right: parseFloat(s.right),
          top: parseFloat(s.top),
          bottom: parseFloat(s.bottom),
          content: s.content,
        };
      });
    });
  }

  it('cada etiqueta tiene su guía; las interiores caen en el centro del espacio', async () => {
    await poner('2278 -120', '9'); // filas: 4, 4, 1
    await prepararSinCerrar();
    const g = await geometria();
    const mm = (px: number) => px / PX_POR_MM;
    const l = g.filter((x) => !x.vacia);
    expect(l).toHaveLength(9);
    for (const x of l) {
      expect(x.content).not.toBe('none');
      expect(x.color).toBe('rgb(179, 179, 179)');
      // 0,1 mm pedido; Chrome lo redondea a 1 px CSS (0,26 mm). Nunca doble.
      expect(parseFloat(x.borde)).toBeGreaterThan(0);
      expect(mm(parseFloat(x.borde))).toBeLessThanOrEqual(0.27);
    }
    // Columna 1: borde izquierdo pegado; columnas 2–4: a 1,95 mm (mitad del espacio de 3,9 mm)
    expect(mm(l[0].left)).toBeCloseTo(0, 2);
    expect(mm(-l[1].left)).toBeCloseTo(1.95, 2);
    expect(mm(-l[0].right)).toBeCloseTo(1.95, 2);
    expect(mm(l[3].right)).toBeCloseTo(0, 2); // columna 4: pegado a la derecha
    // Fila 1: arriba pegado; filas siguientes: 0,65 mm (mitad de 1,3 mm)
    expect(mm(l[0].top)).toBeCloseTo(0, 2);
    expect(mm(-l[4].top)).toBeCloseTo(0.65, 2);
    expect(mm(-l[0].bottom)).toBeCloseTo(0.65, 2);
    // Cada línea una sola vez: la fila 1 pone su línea superior; la fila 2 no (ya la puso la de arriba)
    expect(l[0].bordeArriba).toBeGreaterThan(0);
    expect(l[4].bordeArriba).toBe(0);
    expect(l[8].bordeArriba).toBe(0);
    // La línea entre columnas 1 y 2 coincide para ambas etiquetas
    const derechaDe1 = l[0].x + l[0].w - l[0].right;
    const izquierdaDe2 = l[1].x + l[1].left;
    expect(Math.abs(derechaDe1 - izquierdaDe2)).toBeLessThan(0.5);
  });

  it('debajo de una fila incompleta, la etiqueta sin vecina arriba pone su propia línea superior', async () => {
    await poner('2278 -120', '2'); // fila 1: 2 etiquetas
    await poner('0252 -120', '4'); // fila 2: 4 etiquetas
    await prepararSinCerrar();
    const l = (await geometria()).filter((x) => !x.vacia);
    // fila 1: ambas arriba (borde de hoja); fila 2: col 1–2 no (la pone la de arriba), col 3–4 sí
    expect(l.map((x) => x.bordeArriba > 0)).toEqual([true, true, false, false, true, true]);
  });

  it('las celdas vacías no llevan guía', async () => {
    await poner('2278 -120', '3');
    await prepararSinCerrar();
    const g = await geometria();
    expect(g.filter((x) => x.vacia)).toHaveLength(1);
    expect(await page.locator('#print-root .label--empty').evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');
  });

  it('con hoja llena, la guía inferior se imprime y no aparece una página extra', async () => {
    await poner('2278 -120', '48');
    await poner('0252 -120', '1');
    await prepararSinCerrar();
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => {
      const sheet = document.querySelector('#print-root .sheet')!;
      const ultima = sheet.lastElementChild!;
      const s = getComputedStyle(sheet);
      return { overflow: s.overflow, clipMargin: s.getPropertyValue('overflow-clip-margin'), bottom: parseFloat(getComputedStyle(ultima, '::before').bottom) };
    });
    expect(r.overflow).toBe('clip');
    expect(r.bottom / PX_POR_MM).toBeCloseTo(-0.65, 2);
    // page.pdf dispara afterprint (vacía #print-root), así que se exporta al final
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    expect((pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length).toBe(2);
  });

  it('la vista previa muestra las mismas guías', async () => {
    await poner('2278 -120', '5');
    await page.click('#btn-vista');
    await page.waitForSelector('#vista-hojas .label');
    const c = await page.locator('#vista-hojas .label').first().evaluate((l) => getComputedStyle(l, '::before').borderTopColor);
    expect(c).toBe('rgb(179, 179, 179)');
  });
});
