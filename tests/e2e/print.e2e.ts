import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ARCHIVO = resolve(import.meta.dirname, '../../dist/etiquetas.html');
const PX_POR_MM = 96 / 25.4;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  if (!existsSync(ARCHIVO)) throw new Error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(ARCHIVO).href);
  await page.locator('.segmented label:has(input[value="todas"])').click();
  // window.print se intercepta: el flujo del botón se ejecuta igual
  await page.evaluate(() => {
    (window as unknown as { __impresiones: number }).__impresiones = 0;
    window.print = () => {
      (window as unknown as { __impresiones: number }).__impresiones++;
    };
  });
});

async function poner(ref: string, cantidad: string) {
  await page.fill('#buscar', ref);
  await page.waitForFunction((t) => (document.querySelector('#filas') as HTMLElement).dataset.consulta === t, ref);
  await page.locator('#filas tr', { has: page.locator(`td.col-ref:text-is("${ref}")`) }).locator('.qty').fill(cantidad);
}

async function imprimir() {
  await page.click('#btn-imprimir');
  await page.waitForFunction(() => (window as unknown as { __impresiones: number }).__impresiones > 0);
}

/** Matriz de cada hoja de #print-root (o de la vista previa): por fila, el valor codificado o null. */
function hojas(selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(`${sel} .sheet`)].map((sheet) => {
      const celdas = [...sheet.children].map((c) =>
        c.classList.contains('label--empty') ? null : c.querySelector('.label__value')!.textContent,
      );
      const filas: (string | null)[][] = [];
      for (let i = 0; i < celdas.length; i += 4) filas.push(celdas.slice(i, i + 4));
      return filas;
    });
  }, selector);
}

const A = '2278 -120'; // código 770999003221
const B = '0252 -120'; // código 770999000542
const CA = '770999003221';
const CB = '770999000542';

describe('distribución impresa (#print-root)', () => {
  it('3A + 2B: el 4.º espacio de la fila 1 queda vacío y B empieza en la fila 2', async () => {
    await poner(A, '3');
    await poner(B, '2');
    await imprimir();
    expect(await hojas('#print-root')).toEqual([
      [
        [CA, CA, CA, null],
        [CB, CB, null, null],
      ],
    ]);
  });

  it('45A + 2B: 12 filas en la hoja 1 y B empieza en la hoja 2', async () => {
    await poner(A, '45');
    await poner(B, '2');
    expect(await page.locator('.head__summary').textContent()).toBe('47 etiquetas · 2 hojas · 2 referencias');
    await imprimir();
    const h = await hojas('#print-root');
    expect(h).toHaveLength(2);
    expect(h[0]).toHaveLength(12);
    expect(h[0][11]).toEqual([CA, null, null, null]);
    expect(h[1]).toEqual([[CB, CB, null, null]]);
  });

  it('49 unidades: 48 + 1', async () => {
    await poner(A, '49');
    await imprimir();
    const h = await hojas('#print-root');
    expect(h.map((s) => s.flat().filter(Boolean).length)).toEqual([48, 1]);
  });

  it('fallback: sin código de barras codifica la referencia interna', async () => {
    await poner('2878', '1');
    await imprimir();
    expect(await hojas('#print-root')).toEqual([[['2878', null, null, null]]]);
    expect(await page.locator('#print-root .label__bars').getAttribute('aria-label')).toBe('Código 128: 2878');
  });

  it('en modo impresión solo queda #print-root, con medidas reales', async () => {
    await poner(A, '5');
    await imprimir();
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => {
      const visibles = [...document.body.children].filter(
        (e) => e.id !== 'print-root' && getComputedStyle(e).display !== 'none',
      ).length;
      const label = document.querySelector('#print-root .label')!.getBoundingClientRect();
      const sheet = document.querySelector('#print-root .sheet')!;
      const st = getComputedStyle(sheet);
      return { visibles, w: label.width, h: label.height, bg: st.backgroundColor, color: st.color };
    });
    expect(r.visibles).toBe(0);
    expect(r.w / PX_POR_MM).toBeCloseTo(45, 1);
    expect(r.h / PX_POR_MM).toBeCloseTo(20, 1);
    expect(r.bg).toBe('rgb(255, 255, 255)');
    expect(r.color).toBe('rgb(0, 0, 0)');
  });

  it('el nombre más largo del catálogo cabe en 2 líneas sin tapar el código', async () => {
    await poner('2299 -1000', '1'); // INCANDESCENT CONSTELLATION UNISEX 1000
    await imprimir();
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => {
      const l = document.querySelector('#print-root .label')!;
      const [lab, nom, bar, val] = [l, l.querySelector('.label__name')!, l.querySelector('.label__bars')!, l.querySelector('.label__value')!].map(
        (e) => e.getBoundingClientRect(),
      );
      return { lab: [lab.top, lab.bottom], nom: [nom.top, nom.bottom], bar: [bar.top, bar.bottom], val: [val.top, val.bottom] };
    });
    expect(r.nom[1]).toBeLessThanOrEqual(r.bar[0] + 0.5);
    expect(r.bar[1]).toBeLessThanOrEqual(r.val[0] + 0.5);
    expect(r.val[1]).toBeLessThanOrEqual(r.lab[1]);
  });

  it('PDF carta: una página por hoja, sin páginas vacías', async () => {
    await poner(A, '45');
    await poner(B, '2');
    await imprimir();
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    expect((pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length).toBe(2);
    expect(pdf).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/);
  });

  it('cantidad inválida: Imprimir bloqueado y nada se imprime', async () => {
    await poner(A, '3');
    await poner(B, '-1');
    await expect(page.locator('#btn-imprimir').isDisabled()).resolves.toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __impresiones: number }).__impresiones)).toBe(0);
  });

  it('Ctrl+P sin pasar por el botón también imprime el lote (beforeprint)', async () => {
    await poner(A, '6');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    expect(await hojas('#print-root')).toEqual([[[CA, CA, CA, CA], [CA, CA, null, null]]]);
  });
});

describe('vista previa', () => {
  it('muestra las mismas hojas que la impresión, en papel blanco', async () => {
    await poner(A, '45');
    await poner(B, '2');
    await page.click('#btn-vista');
    await page.waitForFunction(() => document.querySelectorAll('#vista-hojas .sheet').length === 2);
    const vista = await hojas('#vista-hojas');
    expect(await page.locator('#vista-previa [data-vista-resumen]').textContent()).toBe('47 etiquetas · 2 hojas · 2 referencias');
    expect(await page.locator('#vista-hojas figcaption').allTextContents()).toEqual(['Hoja 1 de 2', 'Hoja 2 de 2']);
    expect(await page.locator('#vista-hojas .paper').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');

    // Imprimir desde la vista previa: cierra el modal e imprime lo mismo
    await page.click('#vista-imprimir');
    await page.waitForFunction(() => (window as unknown as { __impresiones: number }).__impresiones > 0);
    expect(await page.locator('#vista-previa').isVisible()).toBe(false);
    expect(await hojas('#print-root')).toEqual(vista);
  });

  it('Escape cierra la vista previa', async () => {
    await poner(A, '1');
    await page.click('#btn-vista');
    await page.keyboard.press('Escape');
    expect(await page.locator('#vista-previa').isVisible()).toBe(false);
  });
});

describe('lote grande', () => {
  it('9.999 unidades → 209 hojas sin congelar la pestaña', async () => {
    await poner(A, '9999');
    expect(await page.locator('.head__summary').textContent()).toBe('9.999 etiquetas · 209 hojas · 1 referencia');
    // Mide el bloqueo más largo del hilo principal mientras se prepara
    await page.evaluate(() => {
      const w = window as unknown as { __maxGap: number; __tick: number; __on: boolean };
      w.__maxGap = 0;
      w.__on = true;
      let last = performance.now();
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        const now = performance.now();
        w.__maxGap = Math.max(w.__maxGap, now - last);
        last = now;
        if (w.__on) setTimeout(() => ch.port2.postMessage(null), 0);
      };
      ch.port2.postMessage(null);
    });
    const t0 = Date.now();
    await page.click('#btn-imprimir');
    await expect(page.locator('#preparando').isVisible()).resolves.toBe(true);
    await page.waitForFunction(() => (window as unknown as { __impresiones: number }).__impresiones > 0, null, { timeout: 30_000 });
    const ms = Date.now() - t0;
    const maxGap = await page.evaluate(() => {
      (window as unknown as { __on: boolean }).__on = false;
      return (window as unknown as { __maxGap: number }).__maxGap;
    });
    expect(await page.locator('#print-root .sheet').count()).toBe(209);
    expect(await page.locator('#preparando').isVisible()).toBe(false);
    console.log(`9.999 etiquetas preparadas en ${ms} ms; bloqueo máximo ${maxGap.toFixed(0)} ms`);
    expect(maxGap).toBeLessThan(200);
  });
});
