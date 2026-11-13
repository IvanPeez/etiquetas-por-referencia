/**
 * Lee la primera hoja de `data/Producto - etiquetas por referencia.xlsx` (solo lectura)
 * y genera `src/data/catalog.json` minificado. Falla si:
 *  - faltan las columnas Nombre / Referencia interna / Código de barras,
 *  - algún identificador viene como número o en notación científica,
 *  - algún valor a codificar no es válido para Code 128,
 *  - los conteos no son 4.538 / 906×4 / 914 / 53.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import {
  CONTEOS_ESPERADOS,
  construirCatalogo,
  contar,
  esCode128Valido,
  pareceNotacionCientifica,
  type FilaCruda,
} from '../src/catalog-rules.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXCEL = resolve(raiz, 'data/Producto - etiquetas por referencia.xlsx');
const SALIDA = resolve(raiz, 'src/data/catalog.json');
const COLUMNAS = ['Nombre', 'Referencia interna', 'Código de barras'] as const;

const errores: string[] = [];
const fallar = (msg: string): never => {
  console.error(`\n✖ build-catalog: ${msg}`);
  process.exit(1);
};

// Lectura en memoria: el Excel nunca se escribe.
const wb = XLSX.read(readFileSync(EXCEL), { type: 'buffer', cellDates: false, cellNF: false });
const nombreHoja = wb.SheetNames[0];
const ws = wb.Sheets[nombreHoja];
if (!ws || !ws['!ref']) fallar(`la hoja "${nombreHoja}" está vacía`);
const rango = XLSX.utils.decode_range(ws['!ref']!);

// Encabezados → índice de columna
const col: Record<(typeof COLUMNAS)[number], number> = { Nombre: -1, 'Referencia interna': -1, 'Código de barras': -1 };
for (let c = rango.s.c; c <= rango.e.c; c++) {
  const celda = ws[XLSX.utils.encode_cell({ r: rango.s.r, c })];
  const titulo = celda ? String(celda.v).trim().normalize('NFC') : '';
  for (const nombre of COLUMNAS) if (titulo === nombre.normalize('NFC')) col[nombre] = c;
}
for (const nombre of COLUMNAS) if (col[nombre] < 0) fallar(`no se encontró la columna "${nombre}" en la hoja "${nombreHoja}"`);

/** Lee una celda como texto. Registra error si es numérica o parece notación científica. */
function texto(r: number, c: number, columna: string): string {
  const celda = ws[XLSX.utils.encode_cell({ r, c })];
  if (!celda || celda.t === 'z' || celda.v == null) return '';
  const fila = r + 1;
  if (celda.t !== 's') {
    errores.push(`fila ${fila}, "${columna}": la celda es de tipo "${celda.t}" (${celda.w ?? celda.v}); debe ser texto`);
    return String(celda.w ?? '');
  }
  const v = celda.v as string;
  if (pareceNotacionCientifica(v)) errores.push(`fila ${fila}, "${columna}": "${v}" está en notación científica`);
  return v;
}

const filas: FilaCruda[] = [];
for (let r = rango.s.r + 1; r <= rango.e.r; r++) {
  const nombre = texto(r, col.Nombre, 'Nombre');
  const ref = texto(r, col['Referencia interna'], 'Referencia interna');
  const barras = texto(r, col['Código de barras'], 'Código de barras');
  if (nombre === '' && ref === '' && barras === '') continue; // fila totalmente vacía
  if (ref === '') errores.push(`fila ${r + 1}: "Referencia interna" vacía (${nombre})`);
  if (nombre === '') errores.push(`fila ${r + 1}: "Nombre" vacío (${ref})`);
  filas.push({ fila: r + 1, nombre, ref, barras });
}

const { productos, duplicados, sufijosNoAsignados } = construirCatalogo(filas);

for (const p of productos) {
  if (!esCode128Valido(p.codigo)) errores.push(`ref "${p.ref}": "${p.codigo}" no se puede codificar en Code 128`);
}
if (errores.length) fallar(`${errores.length} error(es) en el Excel:\n  - ${errores.slice(0, 50).join('\n  - ')}`);

if (duplicados.length) {
  console.warn(`⚠ ${duplicados.length} referencia(s) duplicada(s); se usan IDs "ref#n":`);
  for (const d of duplicados) console.warn(`  - "${d.ref}" en filas ${d.filas.join(', ')}`);
}
if (sufijosNoAsignados.length) {
  console.warn(`⚠ ${sufijosNoAsignados.length} referencia(s) con sufijo que quedaron en Sin presentación:`);
  for (const s of sufijosNoAsignados.slice(0, 20)) console.warn(`  - fila ${s.fila}: "${s.ref}" / "${s.nombre}"`);
}

const conteos = contar(productos);
const tabla = (Object.keys(CONTEOS_ESPERADOS) as (keyof typeof CONTEOS_ESPERADOS)[]).map((k) => ({
  conteo: k,
  esperado: CONTEOS_ESPERADOS[k],
  obtenido: conteos[k],
  ok: CONTEOS_ESPERADOS[k] === conteos[k] ? '✔' : '✖',
}));
console.table(tabla);
if (tabla.some((t) => t.ok !== '✔')) fallar('los conteos no coinciden con los esperados (4.538 / 906×4 / 914 / 53)');

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify({ hoja: nombreHoja, conteos, productos }));
console.log(`✔ ${productos.length} productos → ${SALIDA.replace(raiz, '.')}`);
