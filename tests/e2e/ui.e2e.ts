import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ARCHIVO = resolve(import.meta.dirname, '../../dist/etiquetas.html');
const URL_APP = pathToFileURL(ARCHIVO).href;

let browser: Browser;
let page: Page;
const erroresConsola: string[] = [];
const peticionesExternas: string[] = [];

beforeAll(async () => {
  if (!existsSync(ARCHIVO)) throw new Error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  browser = await chromium.launch();
});
afterAll(async () => browser?.close());

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('console', (m) => m.type() === 'error' && erroresConsola.push(m.text()));
  page.on('pageerror', (e) => erroresConsola.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) peticionesExternas.push(u);
  });
  await page.goto(URL_APP);
  await page.waitForSelector('#filas tr');
});

// ---- utilidades ----
const resumen = () => page.locator('.head__summary').textContent();
const conteo = () => page.locator('#conteo-resultados').textContent();
const filtrar = (v: string) => page.locator(`.segmented label:has(input[value="${v}"])`).click();
const fila = (ref: string) => page.locator('#filas tr', { has: page.locator(`td.col-ref:text-is("${ref}")`) });
const unidades = (ref: string) => fila(ref).locator('.qty');
async function buscar(texto: string) {
  await page.fill('#buscar', texto);
  // espera a que la búsqueda (debounce 120 ms) se aplique de verdad
  await page.waitForFunction((t) => document.querySelector<HTMLElement>('#filas')!.dataset.consulta === t, texto);
}
async function poner(ref: string, valor: string) {
  await buscar(ref);
  await unidades(ref).fill(valor);
}

describe('carga', () => {
  it('abre con file:// sin red y sin errores', async () => {
    expect(await page.title()).toBe('Etiquetas por referencia');
    expect(peticionesExternas).toEqual([]);
    expect(erroresConsola).toEqual([]);
  });

  it('arranca en 120 con 906 referencias y el lote vacío', async () => {
    expect(await conteo()).toBe('906 referencias');
    expect(await resumen()).toBe('0 etiquetas · 0 hojas · 0 referencias');
    await expect(page.locator('#btn-imprimir').isDisabled()).resolves.toBe(true);
    await expect(page.locator('#btn-vista').isDisabled()).resolves.toBe(true);
    await expect(page.locator('#btn-vaciar').isDisabled()).resolves.toBe(true);
  });
});

describe('presentaciones y búsqueda', () => {
  it.each([
    ['120', '906 referencias'],
    ['250', '906 referencias'],
    ['500', '906 referencias'],
    ['1000', '906 referencias'],
    ['sin', '914 referencias'],
    ['todas', '4.538 referencias'],
  ])('filtro %s → %s', async (v, esperado) => {
    await filtrar(v);
    expect(await conteo()).toBe(esperado);
  });

  it('«Todas» termina de pintar las 4.538 filas', async () => {
    await filtrar('todas');
    await page.waitForFunction(() => document.querySelectorAll('#filas tr').length === 4538, null, { timeout: 5000 });
  });

  it('búsqueda por código exacto: ese producto primero', async () => {
    await filtrar('todas');
    await buscar('770999003224');
    expect(await page.locator('#filas tr').first().locator('td.col-ref').textContent()).toBe('2278 -1000');
  });

  it('sin tildes ni mayúsculas y con espacios dobles', async () => {
    await filtrar('sin');
    await buscar('bose hm');
    await expect(page.locator('#filas tr .name').first().textContent()).resolves.toContain('BOSÉ');
  });

  it('sin resultados explica el filtro', async () => {
    await buscar('770999003224'); // es de 1000, estamos en 120
    expect(await conteo()).toBe('0 referencias');
    await expect(page.locator('#sin-resultados').textContent()).resolves.toContain('Prueba con «Todas»');
  });

  it('Enter en el buscador lleva al primer campo Unidades', async () => {
    await page.fill('#buscar', '770999003221');
    await page.press('#buscar', 'Enter');
    const foco = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(foco).toBe('Unidades de A MILKSHAKE PLEASE DM 120 2278 -120');
  });
});

describe('lote', () => {
  it('3A + 2B → 5 etiquetas · 2 filas · 1 hoja', async () => {
    await poner('2278 -120', '3');
    await poner('0252 -120', '2');
    expect(await resumen()).toBe('5 etiquetas · 1 hoja · 2 referencias');
  });

  it('45A + 2B → «47 etiquetas · 2 hojas»', async () => {
    await poner('2278 -120', '45');
    await poner('0252 -120', '2');
    expect(await resumen()).toBe('47 etiquetas · 2 hojas · 2 referencias');
    expect(await page.locator('[data-kpi="ultima-hoja"]').textContent()).toBe('Última hoja: 1 de 12 filas');
    await expect(page.locator('#btn-imprimir').isEnabled()).resolves.toBe(true);
  });

  it('las cantidades se conservan entre filtros y búsquedas, y el lote mezcla presentaciones', async () => {
    await poner('2278 -120', '7');
    await filtrar('1000');
    await poner('2278 -1000', '3');
    await buscar('');
    await filtrar('120');
    expect(await unidades('2278 -120').inputValue()).toBe('7');
    await filtrar('1000');
    expect(await unidades('2278 -1000').inputValue()).toBe('3');
    expect(await page.locator('#lote-lista li .lote-list__ref').allTextContents()).toEqual(['2278 -120', '2278 -1000']);
    expect(await page.locator('[data-kpi="referencias"]').textContent()).toBe('2');
  });

  it('respeta el orden de selección; 0 saca la referencia y al volver entra al final', async () => {
    await poner('2278 -120', '1');
    await poner('0252 -120', '1');
    await poner('2278 -120', '0');
    await poner('2278 -120', '4');
    expect(await page.locator('#lote-lista li .lote-list__ref').allTextContents()).toEqual(['0252 -120', '2278 -120']);
  });

  it('vacío y 0 sacan la referencia del lote', async () => {
    await poner('2278 -120', '5');
    await unidades('2278 -120').fill('');
    expect(await resumen()).toBe('0 etiquetas · 0 hojas · 0 referencias');
    await unidades('2278 -120').fill('0');
    expect(await page.locator('#lote-lista li').count()).toBe(0);
  });

  it.each([
    ['-2', 'No puede ser negativo'],
    ['1.5', 'Debe ser un número entero'],
    ['10000', 'Máximo 9.999'],
  ])('cantidad inválida %s → texto «%s» y bloquea', async (valor, mensaje) => {
    await poner('0252 -120', '4');
    await poner('2278 -120', valor);
    expect(await fila('2278 -120').locator('.qty__error').textContent()).toBe(mensaje);
    expect(await unidades('2278 -120').getAttribute('aria-invalid')).toBe('true');
    await expect(page.locator('#btn-imprimir').isDisabled()).resolves.toBe(true);
    await expect(page.locator('#btn-vista').isDisabled()).resolves.toBe(true);
    await expect(page.locator('#estado-lote').textContent()).resolves.toContain('Corrige 1 cantidad marcada');
    await unidades('2278 -120').fill('3');
    await expect(page.locator('#btn-imprimir').isEnabled()).resolves.toBe(true);
  });

  it('Vaciar pide confirmación: Cancelar conserva, Vaciar reinicia', async () => {
    await poner('2278 -120', '5');
    await page.click('#btn-vaciar');
    await expect(page.locator('#dialogo-vaciar').isVisible()).resolves.toBe(true);
    await page.click('#dialogo-vaciar button[value="cancelar"]');
    expect(await resumen()).toBe('5 etiquetas · 1 hoja · 1 referencia');

    await page.click('#btn-vaciar');
    await page.click('#dialogo-vaciar button[value="vaciar"]');
    expect(await resumen()).toBe('0 etiquetas · 0 hojas · 0 referencias');
    expect(await unidades('2278 -120').inputValue()).toBe('');
    await expect(page.locator('#btn-vaciar').isDisabled()).resolves.toBe(true);
  });

  it('Quitar desde «Lote actual» limpia el campo en la tabla', async () => {
    await poner('2278 -120', '5');
    await page.click('#lote-lista li button');
    expect(await unidades('2278 -120').inputValue()).toBe('');
    expect(await resumen()).toBe('0 etiquetas · 0 hojas · 0 referencias');
  });
});

describe('teclado y filtro «solo con cantidad»', () => {
  it('Enter baja a la fila siguiente y Shift+Enter sube', async () => {
    const primera = page.locator('#filas tr .qty').first();
    await primera.fill('2');
    await primera.press('Enter');
    let foco = await page.evaluate(() => document.activeElement?.closest('tr')?.rowIndex);
    expect(foco).toBe(2);
    await page.keyboard.press('Shift+Enter');
    foco = await page.evaluate(() => document.activeElement?.closest('tr')?.rowIndex);
    expect(foco).toBe(1);
  });

  it('«/» enfoca el buscador', async () => {
    await page.locator('body').click();
    await page.keyboard.press('/');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('buscar');
  });

  it('solo con cantidad: todo el lote en orden, sin importar la presentación', async () => {
    await filtrar('1000');
    await poner('2278 -1000', '3');
    await buscar('');
    await filtrar('120');
    await poner('2278 -120', '1');
    await buscar('');
    await page.locator('label.switch').click();
    expect(await conteo()).toBe('2 referencias');
    expect(await page.locator('#filas td.col-ref').allTextContents()).toEqual(['2278 -1000', '2278 -120']);
    await expect(page.locator('input[name=pres]').first().isDisabled()).resolves.toBe(true);

    // poner 0 la deja visible mientras se edita y la quita al salir del campo
    await unidades('2278 -120').fill('0');
    expect(await page.locator('#filas tr').count()).toBe(2);
    await page.locator('#buscar').focus();
    expect(await page.locator('#filas tr').count()).toBe(1);
  });
});

describe('responsive', () => {
  it('390 px: sin scroll horizontal y acciones visibles abajo', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(ancho).toBeLessThanOrEqual(390);
    const caja = await page.locator('#btn-imprimir').boundingBox();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(844);
    await expect(page.locator('.rail').isVisible()).resolves.toBe(false);
  });

  it('1024 px: Lote actual debajo de la tabla', async () => {
    await page.setViewportSize({ width: 1024, height: 800 });
    const tabla = await page.locator('.table-panel').boundingBox();
    const lote = await page.locator('.lote-panel').boundingBox();
    expect(lote!.y).toBeGreaterThan(tabla!.y + tabla!.height - 1);
  });

  it('1440 px: tabla y lote lado a lado; la página no se desplaza', async () => {
    const tabla = await page.locator('.table-panel').boundingBox();
    const lote = await page.locator('.lote-panel').boundingBox();
    expect(lote!.x).toBeGreaterThan(tabla!.x + tabla!.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900);
  });
});

describe('accesibilidad básica', () => {
  it('cada campo Unidades tiene aria-label «Unidades de {nombre} {ref}»', async () => {
    const labels = await page.locator('#filas .qty').evaluateAll((els) => els.slice(0, 50).map((e) => e.getAttribute('aria-label')));
    for (const l of labels) expect(l).toMatch(/^Unidades de .+ \S+/);
  });

  it('sin backdrop-filter en filas de la tabla', async () => {
    const conBlur = await page.locator('#filas tr, #filas td').evaluateAll((els) =>
      els.slice(0, 40).filter((e) => getComputedStyle(e).backdropFilter !== 'none').length,
    );
    expect(conBlur).toBe(0);
  });

  it('a lo sumo 6 paneles con backdrop-filter', async () => {
    const n = await page.evaluate(
      () => [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).backdropFilter !== 'none').length,
    );
    expect(n).toBeLessThanOrEqual(6);
  });
});
