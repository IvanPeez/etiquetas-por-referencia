/**
 * QA de impresión: abre dist/etiquetas.html (file://), arma un lote por la UI,
 * pulsa «Imprimir etiquetas» (window.print interceptado) y exporta dist/prueba.pdf en carta.
 * Verifica: nº de páginas = hojas del resumen, tamaño carta, medidas de etiqueta a 100 %.
 * También guarda dist/prueba-hoja-N.png (render de impresión a 300 dpi aprox.) para revisar a ojo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';

const raiz = resolve(import.meta.dirname, '..');
const HTML = resolve(raiz, 'dist/etiquetas.html');
const PDF = resolve(raiz, 'dist/prueba.pdf');

/** Lote de QA: [referencia, unidades]. Cubre fila incompleta, cruce de hoja, fallback y 49 = 48 + 1. */
const LOTE: [string, string][] = [
  ['2278 -120', '45'], // 11 filas llenas + 1 con 1 → llena la hoja 1
  ['0252 -120', '2'], // empieza en la hoja 2, fila 1
  ['2878', '3'], // sin código de barras: codifica la referencia (fallback)
  ['2278 -1000', '49'], // 12 filas + 1 → cruza a la hoja 3
];

const PX_POR_MM = 96 / 25.4;
const fallos: string[] = [];
const verificar = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✔' : '✖'} ${msg}`);
  if (!ok) fallos.push(msg);
};

async function poner(page: Page, ref: string, cantidad: string) {
  await page.fill('#buscar', ref);
  await page.waitForFunction((t) => (document.querySelector('#filas') as HTMLElement).dataset.consulta === t, ref);
  const fila = page.locator('#filas tr', { has: page.locator(`td.col-ref:text-is("${ref}")`) });
  await fila.locator('.qty').fill(cantidad);
}

if (!existsSync(HTML)) {
  console.error('Falta dist/etiquetas.html: corre `npm run build` primero.');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(HTML).href);
  await page.locator('.segmented label:has(input[value="todas"])').click();
  for (const [ref, q] of LOTE) await poner(page, ref, q);

  const resumen = (await page.locator('.head__summary').textContent())!;
  const hojas = Number(/(\d+) hojas?/.exec(resumen)![1]);
  console.log(`Lote: ${resumen}`);

  // Flujo real del botón; window.print se intercepta para exportar con page.pdf
  await page.evaluate(() => {
    (window as unknown as { __impreso: boolean }).__impreso = false;
    window.print = () => {
      (window as unknown as { __impreso: boolean }).__impreso = true;
    };
  });
  await page.click('#btn-imprimir');
  await page.waitForFunction(() => (window as unknown as { __impreso: boolean }).__impreso, null, { timeout: 30_000 });

  await page.emulateMedia({ media: 'print' });

  // Medidas en el render de impresión
  // Sin funciones con nombre dentro de evaluate: tsx inyecta __name(), que no existe en la página.
  const medidas = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('#print-root .sheet')];
    const label = document.querySelector('#print-root .label:not(.label--empty)')!;
    const bars = label.querySelector('.label__bars')!;
    const visibles = [...document.body.children].filter(
      (e) => e.id !== 'print-root' && getComputedStyle(e).display !== 'none',
    );
    const [rs, rl, rb] = [sheets[0], label, bars].map((el) => el.getBoundingClientRect());
    return {
      sheets: sheets.length,
      sheet: { w: rs.width, h: rs.height },
      label: { w: rl.width, h: rl.height },
      bars: { w: rb.width, h: rb.height },
      etiquetas: document.querySelectorAll('#print-root .label:not(.label--empty)').length,
      uiVisible: visibles.map((e) => e.tagName + (e.id ? '#' + e.id : '')),
    };
  });
  const mm = (px: number) => px / PX_POR_MM;
  const cerca = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
  verificar(medidas.sheets === hojas, `#print-root tiene ${medidas.sheets} hojas (resumen: ${hojas})`);
  verificar(medidas.etiquetas === 99, `${medidas.etiquetas} etiquetas en #print-root (esperadas 99)`);
  verificar(cerca(mm(medidas.label.w), 45) && cerca(mm(medidas.label.h), 20), `etiqueta ${mm(medidas.label.w).toFixed(2)} × ${mm(medidas.label.h).toFixed(2)} mm`);
  verificar(cerca(mm(medidas.sheet.w), 191.7) && cerca(mm(medidas.sheet.h), 254.3), `hoja ${mm(medidas.sheet.w).toFixed(2)} × ${mm(medidas.sheet.h).toFixed(2)} mm`);
  verificar(mm(medidas.bars.w) <= 42 - 4 + 0.01, `barras ${mm(medidas.bars.w).toFixed(2)} × ${mm(medidas.bars.h).toFixed(2)} mm (silencio ≥ 2 mm por lado en 42 mm)`);
  verificar(medidas.uiVisible.length === 0, `UI oculta al imprimir${medidas.uiVisible.length ? ': ' + medidas.uiVisible.join(', ') : ''}`);

  // Capturas de las hojas tal como se imprimen (para revisar a ojo)
  const sheets = page.locator('#print-root .sheet');
  for (let i = 0; i < Math.min(hojas, 3); i++) {
    await sheets.nth(i).screenshot({ path: resolve(raiz, `dist/prueba-hoja-${i + 1}.png`) });
  }

  await page.pdf({ path: PDF, preferCSSPageSize: true, printBackground: true });

  // Verificación del PDF: nº de páginas y tamaño carta (612 × 792 pt)
  const bytes = readFileSync(PDF).toString('latin1');
  const paginas = (bytes.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  const cajas = [...bytes.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  verificar(paginas === hojas, `PDF con ${paginas} páginas (hojas: ${hojas}, sin páginas vacías)`);
  verificar(cajas.length > 0 && cajas.every(([w, h]) => cerca(w, 612, 1) && cerca(h, 792, 1)), `tamaño carta 612 × 792 pt (${cajas[0]?.join(' × ')})`);
  console.log(`→ ${PDF}`);

  mkdirSync(resolve(raiz, 'docs'), { recursive: true });
  // ---------- Hoja de prueba de escaneo (una etiqueta por referencia, 12 casos) ----------
  const catalogo: { productos: { id: string; nombre: string; ref: string; codigo: string; pres: string | null; fallback: boolean }[] } =
    JSON.parse(readFileSync(resolve(raiz, 'src/data/catalog.json'), 'utf8'));
  const porRef = new Map(catalogo.productos.map((p) => [p.ref, p]));
  const casos: [string, string][] = [
    ['2278 -120', 'Presentación 120'],
    ['0252 -250', 'Presentación 250'],
    ['0509 -500', 'Presentación 500'],
    ['2299 -1000', 'Presentación 1000, nombre más largo del catálogo'],
    ['2554 -1000', 'Nombre con guion pegado («-1000»)'],
    ['2278', 'Sin presentación'],
    ['252', 'Sin presentación, referencia de 3 dígitos'],
    ['0723', 'Sin presentación (otra familia)'],
    [catalogo.productos.find((p) => p.nombre.includes('É'))!.ref, 'Nombre con tilde'],
    ['2878', 'Sin código de barras: codifica la referencia'],
    ['2875', 'Sin código de barras: codifica la referencia'],
    [catalogo.productos.filter((p) => p.fallback).at(-1)!.ref, 'Sin código de barras: codifica la referencia'],
  ];
  for (const [ref] of casos) if (!porRef.has(ref)) throw new Error(`Caso de escaneo sin producto: ${ref}`);

  const scan = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await scan.goto(pathToFileURL(HTML).href);
  await scan.locator('.segmented label:has(input[value="todas"])').click();
  for (const [ref] of casos) await poner(scan, ref, '1');
  await scan.evaluate(() => {
    (window as unknown as { __impreso: boolean }).__impreso = false;
    window.print = () => {
      (window as unknown as { __impreso: boolean }).__impreso = true;
    };
  });
  await scan.click('#btn-imprimir');
  await scan.waitForFunction(() => (window as unknown as { __impreso: boolean }).__impreso);
  const PDF_SCAN = resolve(raiz, 'dist/prueba-escaneo.pdf');
  await scan.pdf({ path: PDF_SCAN, preferCSSPageSize: true, printBackground: true });
  const paginasScan = (readFileSync(PDF_SCAN).toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  verificar(paginasScan === 1, `hoja de escaneo: ${paginasScan} página con ${casos.length} referencias`);

  const filas = casos.map(([ref, caso], i) => {
    const p = porRef.get(ref)!;
    return `| ${i + 1} | ${p.nombre.trim()} | \`${p.ref}\` | \`${p.codigo}\` | ${caso} | |`;
  });
  writeFileSync(
    resolve(raiz, 'docs/escaneo-esperado.md'),
    [
      '# Prueba física de escaneo',
      '',
      'Imprime `dist/prueba-escaneo.pdf` en papel carta, **escala 100 %**, sin encabezados ni pies de página.',
      'Cada fila de la hoja tiene una sola etiqueta (columna 1). Escanea cada una con el lector en un editor de texto',
      'y compara con la columna «Debe leer». Marca ✔ o ✖ en «Resultado».',
      '',
      'Antes de escanear, mide con regla una etiqueta: debe dar **45 × 20 mm** (si no, la escala no estaba al 100 %).',
      '',
      '| Fila | Nombre | Referencia | Debe leer | Caso | Resultado |',
      '|---|---|---|---|---|---|',
      ...filas,
      '',
    ].join('\n'),
  );
  console.log(`→ ${PDF_SCAN}\n→ docs/escaneo-esperado.md`);
} finally {
  await browser.close();
}

if (fallos.length) {
  console.error(`\n✖ ${fallos.length} verificación(es) fallaron`);
  process.exit(1);
}
console.log('\n✔ PDF de prueba OK');
