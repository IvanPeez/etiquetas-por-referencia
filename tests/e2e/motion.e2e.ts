import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ARCHIVO = resolve(import.meta.dirname, '../../dist/etiquetas.html');
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(ARCHIVO)) throw new Error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

async function abrir(reducedMotion: 'reduce' | 'no-preference'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
  await page.goto(pathToFileURL(ARCHIVO).href);
  await page.waitForSelector('#filas tr');
  return page;
}

/** Registra todas las propiedades que se animan (Web Animations + transiciones CSS). */
async function propiedadesAnimadas(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const props = new Set<string>();
    for (const a of document.getAnimations()) {
      const efecto = a.effect as KeyframeEffect | null;
      if (a instanceof CSSTransition) props.add(a.transitionProperty);
      else for (const k of efecto?.getKeyframes() ?? []) for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p);
    }
    return [...props];
  });
}

describe('microanimaciones', () => {
  it('los contadores KPI cuentan hasta el valor final en ~0,3 s', async () => {
    const page = await abrir('no-preference');
    const kpi = page.locator('[data-kpi="etiquetas"]');
    await page.locator('#filas .qty').first().fill('900');
    const intermedio = Number((await kpi.textContent())!.replace(/\./g, ''));
    expect(intermedio).toBeLessThan(900);
    await page.waitForFunction(() => document.querySelector('[data-kpi="etiquetas"]')!.textContent === '900', null, { timeout: 2000 });
    await page.close();
  });

  it('con prefers-reduced-motion los valores se aplican al instante y no hay animaciones JS', async () => {
    const page = await abrir('reduce');
    await page.locator('#filas .qty').first().fill('900');
    expect(await page.locator('[data-kpi="etiquetas"]').textContent()).toBe('900');
    const inline = await page.evaluate(() =>
      [...document.querySelectorAll('.panel, .lote-list li')].filter((e) => (e as HTMLElement).style.opacity !== '').length,
    );
    expect(inline).toBe(0);
    await page.close();
  });

  it('la tabla nunca se anima (ni filas ni campos)', async () => {
    const page = await abrir('no-preference');
    await page.locator('#filas .qty').first().fill('12');
    const enTabla = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target;
        return t instanceof Element && t.closest('#filas, .table');
      }).length,
    );
    expect(enTabla).toBe(0);
    const inlineTabla = await page.locator('#filas tr').evaluateAll((trs) => trs.filter((t) => (t as HTMLElement).style.transform || (t as HTMLElement).style.opacity).length);
    expect(inlineTabla).toBe(0);
    await page.close();
  });

  it('las transiciones CSS solo tocan transform, opacity o el anillo (stroke-dashoffset)', async () => {
    const page = await abrir('no-preference');
    await page.locator('#filas .qty').first().fill('30');
    const props = await propiedadesAnimadas(page);
    for (const p of props) expect(['transform', 'opacity', 'stroke-dashoffset']).toContain(p);
    await page.close();
  });

  it('la vista previa entra con fundido y escala desde 0,98', async () => {
    const page = await abrir('no-preference');
    await page.locator('#filas .qty').first().fill('3');
    await page.click('#btn-vista');
    const inicio = await page.evaluate(() => {
      const d = document.querySelector('#vista-previa') as HTMLElement;
      return { opacity: Number(getComputedStyle(d).opacity), transform: d.style.transform };
    });
    expect(inicio.opacity).toBeLessThan(1);
    expect(inicio.transform).toMatch(/scale\(0\.9[89]/);
    await page.waitForFunction(() => (document.querySelector('#vista-previa') as HTMLElement).style.opacity === '');
    await page.close();
  });

  it('en modo impresión no hay animaciones activas en #print-root', async () => {
    const page = await abrir('no-preference');
    await page.evaluate(() => (window.print = () => {}));
    await page.locator('#filas .qty').first().fill('5');
    await page.click('#btn-imprimir');
    await page.waitForSelector('#print-root .sheet', { state: 'attached' });
    await page.emulateMedia({ media: 'print' });
    const n = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target;
        return t instanceof Element && t.closest('#print-root');
      }).length,
    );
    expect(n).toBe(0);
    await page.close();
  });
});
