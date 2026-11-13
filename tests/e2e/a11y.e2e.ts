import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ARCHIVO = resolve(import.meta.dirname, '../../dist/etiquetas.html');
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(ARCHIVO)) throw new Error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

interface Violacion {
  id: string;
  impact: string;
  help: string;
  nodes: { target: string[]; failureSummary: string }[];
}

async function auditar(page: Page, contexto = 'body'): Promise<Violacion[]> {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async (ctx) => {
    const axe = (window as unknown as { axe: { run: (c: string, o: object) => Promise<{ violations: Violacion[] }> } }).axe;
    return axe.run(ctx, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  }, contexto);
  return r.violations.map((v) => ({ ...v, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, failureSummary: n.failureSummary })) }));
}

const resumen = (vs: Violacion[]) => vs.map((v) => `${v.id} (${v.impact}): ${v.help} → ${JSON.stringify(v.nodes.map((n) => n.target))}`).join('\n');

async function abrir(ancho = 1440, alto = 900) {
  const page = await browser.newPage({ viewport: { width: ancho, height: alto }, reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(ARCHIVO).href);
  await page.waitForSelector('#filas tr');
  return page;
}

async function cargarLote(page: Page) {
  const inputs = page.locator('#filas .qty');
  await inputs.nth(0).fill('45');
  await inputs.nth(1).fill('2');
  await inputs.nth(2).fill('-1'); // estado de error visible
}

describe('WCAG 2.1 AA (axe-core)', () => {
  it('pantalla inicial sin violaciones', async () => {
    const page = await abrir();
    const v = await auditar(page);
    expect(v, resumen(v)).toEqual([]);
    await page.close();
  });

  it('con lote, errores y «solo con cantidad» sin violaciones', async () => {
    const page = await abrir();
    await cargarLote(page);
    await page.locator('label.switch').click();
    const v = await auditar(page);
    expect(v, resumen(v)).toEqual([]);
    await page.close();
  });

  it('vista previa sin violaciones', async () => {
    const page = await abrir();
    const inputs = page.locator('#filas .qty');
    await inputs.nth(0).fill('6');
    await page.click('#btn-vista');
    await page.waitForSelector('#vista-hojas .sheet');
    const v = await auditar(page, '#vista-previa');
    expect(v, resumen(v)).toEqual([]);
    await page.close();
  });

  it('diálogos de ayuda y Vaciar sin violaciones', async () => {
    const page = await abrir();
    await page.click('[data-abrir="ayuda"]');
    let v = await auditar(page, '#ayuda');
    expect(v, resumen(v)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('#filas .qty').first().fill('2');
    await page.click('#btn-vaciar');
    v = await auditar(page, '#dialogo-vaciar');
    expect(v, resumen(v)).toEqual([]);
    await page.close();
  });

  it('pestaña «Impresas» con historial sin violaciones', async () => {
    const page = await abrir();
    await page.evaluate(() => (window.print = () => void window.dispatchEvent(new Event('afterprint'))));
    await page.locator('#filas .qty').first().fill('4');
    await page.click('#btn-imprimir');
    await page.waitForSelector('[data-hist="ultima"]:not([hidden])');
    await page.click('#tab-impresas');
    const v = await auditar(page, '.lote-panel');
    expect(v, resumen(v)).toEqual([]);
    await page.close();
  });

  it('móvil 390 px sin violaciones', async () => {
    const page = await abrir(390, 844);
    await cargarLote(page);
    const v = await auditar(page);
    expect(v, resumen(v)).toEqual([]);
    await page.close();
  });
});

/**
 * Contraste medido en píxeles reales: se oculta el texto, se captura la pantalla y se toma,
 * dentro de la caja de cada texto, el píxel de fondo MÁS CLARO (peor caso sobre las manchas de luz).
 */
async function contrastePeorCaso(page: Page, selectores: string[]) {
  const cajas = await page.evaluate((sels) => {
    const out: { sel: string; color: string; x: number; y: number; w: number; h: number }[] = [];
    for (const sel of sels)
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        // caja de los glifos (no del elemento con su padding)
        const rango = document.createRange();
        rango.selectNodeContents(el);
        const r = rango.getBoundingClientRect();
        if (!r.width || !r.height || r.top < 0 || r.bottom > innerHeight) continue;
        // texto tapado por otra capa (p. ej. la barra fija del móvil): no se ve, no se mide
        const encima = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!encima || !(el.contains(encima) || encima.contains(el))) continue;
        out.push({ sel, color: getComputedStyle(el).color, x: r.x, y: r.y, w: r.width, h: r.height });
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      }
    // los iconos tampoco cuentan como fondo
    for (const svg of document.querySelectorAll<SVGElement>('svg.icon')) svg.style.visibility = 'hidden';
    return out;
  }, selectores);
  const png = await page.screenshot();
  const lector = await browser.newPage();
  const fondos = await lector.evaluate(
    async ({ b64, cajas }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return cajas.map((k) => {
        const d = ctx.getImageData(Math.round(k.x), Math.round(k.y), Math.max(1, Math.round(k.w)), Math.max(1, Math.round(k.h))).data;
        let max = 0;
        for (let i = 0; i < d.length; i += 4) max = Math.max(max, 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
        return max;
      });
    },
    { b64: png.toString('base64'), cajas },
  );
  await lector.close();
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return cajas.map((k, i) => {
    const [r, g, b] = k.color.match(/[\d.]+/g)!.map(Number);
    const lf = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const lb = fondos[i];
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    return { sel: k.sel, ratio: Math.round(ratio * 100) / 100 };
  });
}

describe('contraste sobre el vidrio (peor punto)', () => {
  it.each([
    [1440, 900],
    [390, 844],
  ])('%i px: textos secundarios y de estado ≥ 4,5:1', async (w, h) => {
    const page = await abrir(w, h);
    await cargarLote(page);
    const r = await contrastePeorCaso(page, [
      '.head__summary',
      '.kpi__label',
      '.kpi__hint',
      '.bars__k',
      '.filters__label',
      '.segmented span',
      '.switch > span:last-child',
      '.panel__meta',
      '.table th',
      '.col-name .name',
      '.col-ref',
      '.col-code',
      '.col-name .sub',
      '.qty__error',
      '.chip--warning span',
      '.actions__status',
      '.lote-list__ref',
      '.lote-list__pos',
      '.btn--primary',
      '.btn--danger',
      '.kpi__value:not(.kpi__value--grad)',
    ]);
    const malos = r.filter((x) => x.ratio < 4.5);
    console.log(`${w}px peor contraste:`, [...r].sort((a, b) => a.ratio - b.ratio).slice(0, 4));
    expect(malos).toEqual([]);
    await page.close();
  });
});

describe('teclado', () => {
  it('el primer Tab llega al enlace «Saltar al buscador» y lo usa', async () => {
    const page = await abrir();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Saltar al buscador');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('buscar');
    await page.close();
  });

  it('todo control enfocable muestra un indicador de foco', async () => {
    const page = await abrir();
    await page.locator('#filas .qty').first().fill('2');
    const sinFoco: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el || el === document.body) return null;
        // el indicador puede estar en el propio control o en su «visual» hermano (radio/switch)
        const candidatos = [el, el.nextElementSibling as HTMLElement | null].filter(Boolean) as HTMLElement[];
        const visible = candidatos.some((c) => {
          const s = getComputedStyle(c);
          return s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && s.outlineWidth !== '0px');
        });
        return { visible, desc: el.tagName + (el.id ? '#' + el.id : '') + ' ' + (el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)) };
      });
      if (r && !r.visible) sinFoco.push(r.desc);
    }
    expect(sinFoco).toEqual([]);
    await page.close();
  });
});
