/**
 * QA (brief §8 y §9): rendimiento de carga, teclado, respaldo sin backdrop-filter
 * y prueba de humo en Chrome y Edge instalados, sin red, abriendo el archivo con file://.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ARCHIVO = resolve(import.meta.dirname, '../../dist/etiquetas.html');
const URL_APP = pathToFileURL(ARCHIVO).href;
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(ARCHIVO)) throw new Error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

async function poner(page: Page, ref: string, cantidad: string) {
  await page.fill('#buscar', ref);
  await page.waitForFunction((t) => (document.querySelector('#filas') as HTMLElement).dataset.consulta === t, ref);
  await page.locator('#filas tr', { has: page.locator(`td.col-ref:text-is("${ref}")`) }).locator('.qty').fill(cantidad);
}

describe('rendimiento de carga (< 2 s con 4.538 productos)', () => {
  it.each([
    ['CPU normal', 1],
    ['CPU 4× más lenta (PC de oficina)', 4],
  ])('%s', async (_, factor) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: factor });
    await page.goto(URL_APP);
    await page.waitForSelector('#filas tr');
    const t = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return { listo: nav.domContentLoadedEventEnd, carga: nav.loadEventEnd, filas: document.querySelectorAll('#filas tr').length };
    });
    console.log(`${_}: interactivo ${t.listo.toFixed(0)} ms, carga ${t.carga.toFixed(0)} ms`);
    expect(t.filas).toBeGreaterThan(0);
    expect(t.listo).toBeLessThan(2000);
    await page.close();
  });

  it('escribir en el buscador no se traba (cada consulta < 200 ms con CPU 4×, ≈ 50 ms a velocidad normal)', async () => {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(URL_APP);
    await page.locator('.segmented label:has(input[value="todas"])').click();
    // Enter aplica la búsqueda sin esperar el debounce: mide buscar + pintar el primer bloque
    const ms = await page.evaluate(async () => {
      const b = document.querySelector('#buscar') as HTMLInputElement;
      const tiempos: number[] = [];
      for (const q of ['d', 'dm', 'dm 1', '7709', 'bose']) {
        b.value = q;
        const t0 = performance.now();
        b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        tiempos.push(performance.now() - t0);
      }
      return Math.max(...tiempos);
    });
    console.log(`búsqueda más lenta con CPU 4×: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(50 * 4);
    await page.close();
  });
});

describe('teclado', () => {
  it('Tab pasa de un campo Unidades al de la fila siguiente', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(URL_APP);
    const primero = page.locator('#filas .qty').first();
    await primero.focus();
    await page.keyboard.press('Tab');
    const fila = await page.evaluate(() => (document.activeElement as HTMLElement).closest('tr')?.rowIndex);
    expect(fila).toBe(2);
    await page.close();
  });
});

describe('vidrio', () => {
  it('hay respaldo sólido para navegadores sin backdrop-filter', async () => {
    const page = await browser.newPage();
    await page.goto(URL_APP);
    const r = await page.evaluate(() => {
      let base = '';
      let soportes = false;
      for (const hoja of [...document.styleSheets])
        for (const regla of [...hoja.cssRules]) {
          if (regla instanceof CSSStyleRule && regla.selectorText === '.panel') base = regla.style.background || base;
          if (regla instanceof CSSSupportsRule && regla.conditionText.includes('backdrop-filter')) soportes = true;
        }
      return { base, soportes };
    });
    expect(r.base).toBe('var(--glass-fallback)');
    expect(r.soportes).toBe(true);
    await page.close();
  });
});

describe.each([
  ['Chrome', 'chrome'],
  ['Edge', 'msedge'],
])('%s instalado, sin red, con file://', (nombre, canal) => {
  let nav: Browser | undefined;
  beforeAll(async () => {
    nav = await chromium.launch({ channel: canal }).catch(() => undefined);
  });
  afterAll(async () => nav?.close());

  it('abre, arma 45A + 2B, muestra la vista previa e imprime 2 hojas carta', async (ctx) => {
    if (!nav) return ctx.skip();
    const contexto = await nav.newContext({ offline: true, reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
    const page = await contexto.newPage();
    const externas: string[] = [];
    const errores: string[] = [];
    page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && externas.push(r.url()));
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(URL_APP);
    console.log(`${nombre} ${nav.version()}`);

    await page.locator('.segmented label:has(input[value="todas"])').click();
    await poner(page, '2278 -120', '45');
    await poner(page, '0252 -120', '2');
    expect(await page.locator('.head__summary').textContent()).toBe('47 etiquetas · 2 hojas · 2 referencias');

    await page.click('#btn-vista');
    await page.waitForFunction(() => document.querySelectorAll('#vista-hojas .sheet').length === 2);
    await page.keyboard.press('Escape');

    await page.evaluate(() => {
      (window as unknown as { __p: boolean }).__p = false;
      window.print = () => ((window as unknown as { __p: boolean }).__p = true);
    });
    await page.click('#btn-imprimir');
    await page.waitForFunction(() => (window as unknown as { __p: boolean }).__p);
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    expect((pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length).toBe(2);
    expect(externas).toEqual([]);
    expect(errores).toEqual([]);
    await contexto.close();
  });
});
