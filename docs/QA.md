# QA: selector de etiquetas por referencia

Ejecución completa: `npm run qa` (Vitest + build + e2e con Playwright + `npm run pdf`).
Último resultado: **82 unitarias + 66 e2e en verde; PDF de prueba OK** (2026-11-13, Chrome 157 y Edge 157 en Windows 11).

## Checklist del brief (§9, fase 6)

| # | Verificación | Dónde se prueba | Resultado |
|---|---|---|---|
| 1 | Las 5 presentaciones y la agrupación completa (906×4 / 914; cada producto en un solo grupo; las 906 familias completas) | `npm run catalog` (falla si no cuadra), `tests/catalog.test.ts`, `tests/busqueda.test.ts`, `tests/e2e/ui.e2e.ts` «presentaciones» | ✔ |
| 2 | Búsqueda por código exacto (sale primero) | `tests/busqueda.test.ts`, `tests/e2e/ui.e2e.ts` | ✔ |
| 3 | Las cantidades se conservan entre filtros y búsquedas | `tests/e2e/ui.e2e.ts` «se conservan entre filtros» | ✔ |
| 4 | 3A + 2B: el 4.º espacio de la fila 1 queda vacío y B empieza en la fila 2 | `tests/layout.test.ts`, `tests/e2e/print.e2e.ts` (en `#print-root`) | ✔ |
| 5 | 45A + 2B: 12 filas, B empieza en la hoja 2, «47 etiquetas · 2 hojas» | `tests/layout.test.ts`, `tests/e2e/ui.e2e.ts`, `tests/e2e/print.e2e.ts`, PDF de 2 páginas | ✔ |
| 6 | Lote de 49: 48 + 1 | `tests/layout.test.ts`, `tests/e2e/print.e2e.ts`, `dist/prueba.pdf` (hoja 3) | ✔ |
| 7 | Un 0 quita la referencia; una cantidad inválida bloquea (con texto); Vaciar reinicia (con confirmación) | `tests/lote.test.ts`, `tests/e2e/ui.e2e.ts`, `tests/e2e/print.e2e.ts` | ✔ |
| 8 | PDF carta de Playwright: medidas al 100 % y sin páginas vacías | `npm run pdf`: etiqueta 45,00 × 20,00 mm, hoja 191,70 × 254,30 mm, 3 páginas = 3 hojas, 612 × 792 pt | ✔ |
| 9 | Prueba física: escanear con un lector real | `dist/prueba-escaneo.pdf` + `docs/escaneo-esperado.md` (12 casos). Verificado por software: las 4.538 referencias decodifican de vuelta a su valor (`tests/barcode.test.ts`) | ✔ (confirmado por el usuario el 2026-11-13: las 12 filas leyeron bien) |

## Requisitos de rendimiento y accesibilidad (§8)

| Verificación | Resultado medido | Prueba |
|---|---|---|
| Abre en < 2 s con 4.538 productos | 136 ms interactivo (CPU normal); 790 ms con CPU 4× más lenta | `tests/e2e/qa.e2e.ts` |
| Búsqueda fluida (debounce 120 ms, índice precalculado) | consulta más lenta 115 ms con CPU 4× (≈ 30 ms normal) | `tests/e2e/qa.e2e.ts`, `tests/busqueda.test.ts` |
| Lote de 9.999 sin congelar la pestaña, con progreso | 209 hojas en ~210 ms; bloqueo máximo del hilo 51 ms | `tests/e2e/print.e2e.ts` |
| Solo teclado: Tab entre Unidades, Enter baja, foco visible | ✔ (25 controles recorridos con Tab) | `tests/e2e/ui.e2e.ts`, `qa.e2e.ts`, `a11y.e2e.ts` |
| Contraste AA sobre el peor punto del vidrio | peor caso 5,08:1 (medido en píxeles reales) | `tests/e2e/a11y.e2e.ts` |
| WCAG 2.1 A/AA (axe-core) | 0 violaciones en 6 estados de pantalla, incluido móvil | `tests/e2e/a11y.e2e.ts` |
| `backdrop-filter` solo en paneles (≤ 6), nunca en filas; respaldo sólido | ✔ | `tests/e2e/ui.e2e.ts`, `qa.e2e.ts` |
| `aria-label` «Unidades de {nombre} {ref}» | ✔ | `tests/e2e/ui.e2e.ts` |
| Animaciones solo en pantalla, nunca en tabla ni impresión; `prefers-reduced-motion` | ✔ | `tests/e2e/motion.e2e.ts` |
| Sin red: abre con `file://` en Chrome y Edge, sin peticiones externas | ✔ Chrome 157, Edge 157 (contexto offline) | `tests/e2e/qa.e2e.ts`, `ui.e2e.ts` |

## Funciones agregadas después de la entrega

| Verificación | Prueba | Resultado |
|---|---|---|
| Historial: referencias impresas con cantidad acumulada, la más reciente primero, y última referencia impresa | `tests/historial.test.ts` (10), `tests/e2e/historial.e2e.ts` | ✔ |
| Historial: se conserva al reabrir el archivo, se puede deshacer la última impresión, borrar (con confirmación) y registrar también con Ctrl+P; la vista previa no cuenta | `tests/e2e/historial.e2e.ts` | ✔ |
| Líneas de corte en el centro de cada espacio, un solo trazo por línea, bordes exteriores pegados, nada en celdas vacías y sin página extra con hoja llena | `tests/e2e/historial.e2e.ts` «líneas de corte», `npm run pdf` | ✔ |
| Pestaña «Impresas» accesible (axe) y navegable con flechas | `tests/e2e/a11y.e2e.ts`, `historial.e2e.ts` | ✔ |

## Decisiones tomadas durante la construcción

- **Historial** en `localStorage` (por equipo y navegador). Se registra en `afterprint` porque el navegador no informa si se canceló el cuadro de impresión; para eso existe «Deshacer última impresión». Va como pestaña del panel derecho para no pasar de 6 paneles con `backdrop-filter`.
- **Líneas de corte**: 0,1 mm pedidos, que Chrome imprime a 1 px CSS (≈ 0,26 mm), en gris `#b3b3b3`. Cada línea la dibuja una sola etiqueta para que no salga doble.

- **Regla de presentación:** sufijo de la referencia (`2278 -120`) que coincide con el número final del nombre, separado por espacio **o guion** (caso real: `JEQUE ARABIANS II -1000`).
- **Pulso de brillo** al asignar cantidad: va en la lista *Lote actual*, no en la fila de la tabla (CLAUDE.md prohíbe animar la tabla).
- **Anillo de hojas:** única animación fuera de transform/opacity (`stroke-dashoffset`), pedida explícitamente por el brief.
- **Código 128:** módulo de 0,347 mm para los 4.485 códigos de 12 dígitos y 0,545 mm para los 53 de referencia; silencio ≥ 10 módulos y ≥ 2 mm.
