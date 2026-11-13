# Selector de etiquetas por referencia

Lineamientos completos en PROJECT_BRIEF.md.

## Stack
Vite + TypeScript (vanilla), vite-plugin-singlefile, SheetJS (solo en el build), JsBarcode (Code 128), GSAP (solo microanimaciones en pantalla), Vitest y Playwright.

## Setup inicial
```bash
npm create vite@latest . -- --template vanilla-ts
npm i jsbarcode gsap @fontsource/plus-jakarta-sans
npm i -D vite-plugin-singlefile vitest playwright tsx https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npx playwright install chromium
npx skills add emilkowalski/skills
npx skills add pbakaus/impeccable
npx skills add Leonxlnx/taste-skill --skill "design-taste-frontend"
```
Coloca `Producto - etiquetas por referencia.xlsx` (y el HTML de referencia si existe) en `data/`. No modifiques el Excel.

## Comandos
- `npm run catalog`: `tsx scripts/build-catalog.ts`. Genera `src/data/catalog.json` y falla si los conteos no son 4.538 / 906×4 / 914 / 53.
- `npm run dev`: servidor de desarrollo.
- `npm test`: Vitest (layout, agrupación, búsqueda y lote).
- `npm run build`: corre `catalog` y luego `vite build`. Genera `dist/etiquetas.html` (un solo archivo que abre con `file://`).
- `npm run pdf`: Playwright exporta `dist/prueba.pdf` en tamaño carta para la QA.

## Reglas
- Los identificadores siempre son texto; nunca uses `Number()`. Si el código de barras está vacío, usa la referencia interna.
- Cero dependencias en tiempo de ejecución desde la red: nada de CDN, fuentes web ni fetch. Todo va en el bundle.
- `layout()` es una función pura y probada:
  - Cada referencia empieza en la columna 1 de una fila nueva.
  - Filas por referencia = `ceil(qty/4)`; 12 filas por hoja.
  - Se respeta el orden de selección.
- La vista previa y la impresión usan el mismo componente `.sheet`.
- Impresión:
  - `@page letter portrait`, margen de 12 mm.
  - Etiqueta de 45 × 20 mm en mm reales.
  - Sin páginas vacías y nada de la UI en `@media print`.
- La etiqueta es negro sobre blanco, con margen de silencio de al menos 10 módulos, y nunca se tematiza.
- UI: dashboard oscuro con glassmorphism (brief, sección 4).
  - `backdrop-filter` solo en los paneles, nunca en las filas de la tabla.
  - Ten siempre un respaldo sólido para navegadores sin `backdrop-filter`.
  - Contraste AA sobre el vidrio.
- La impresión y las hojas de la vista previa son siempre blancas, como papel real.
- Usa los tokens del brief; no escribas colores ni tamaños directamente (excepto los mm de la etiqueta).
- Mobile-first en CSS, aunque el uso principal sea escritorio.
- Anima solo `transform` y `opacity`; respeta `prefers-reduced-motion`; nunca animes la tabla ni la impresión.
- Antes de cerrar cada fase de UI, revisa con las skills: Emil (motion), Impeccable (jerarquía y layout) y Taste (dirección visual).
- Una fase se da por cerrada cuando sus pruebas de la checklist del brief (sección 9) están en verde.
