# Selector de etiquetas por referencia: brief del proyecto

## 1. Resumen
- **Qué es:** herramienta interna de producción para elegir referencias del catálogo, asignar unidades e imprimir etiquetas Code 128 en hojas carta.
- **Entrega:** un solo archivo `etiquetas.html` autónomo, con el catálogo y el generador de códigos incluidos. Se abre con doble clic en Chrome o Edge y funciona sin internet, servidor, cuenta ni macros.
- **Usuarios:** operarios de producción y bodega. Lo usan en un PC de escritorio con impresora láser o de inyección. `[supuesto]`
- **Acción clave:** armar el lote y pulsar **Imprimir etiquetas**.
- **Fuentes:** `Producto - etiquetas por referencia.xlsx` es el catálogo y se conserva intacto. `Imprimir etiquetas por referencia.html` sirve como referencia funcional si está disponible.

## 2. Alcance y funcionalidades

### Catálogo
- Se lee la primera hoja del Excel, con las columnas **Nombre**, **Referencia interna** y **Código de barras**.
- Todos los identificadores se tratan como **texto**. Se conservan los ceros a la izquierda, los espacios y los guiones. Si una celda viene como número o en notación científica, el build falla y muestra la fila.
- `codigo = Código de barras` si no está vacío. Si está vacío, se usa la **Referencia interna** y la fila se marca como `fallback`.
- **Presentación:** es el sufijo numérico de la referencia interna que coincide con el número final del nombre. Los valores válidos son 120, 250, 500 y 1000. Todo lo demás va a **Sin presentación**, incluidos los números del nombre comercial, como «EMIRATO 1 UNISEX». `[supuesto: la regla exacta del sufijo, que puede ser con guion o sin él, se confirma inspeccionando el Excel en la fase 1]`
- **El build se detiene si los conteos no coinciden:** 4.538 productos en total, 906 en cada una de 120, 250, 500 y 1000, 914 sin presentación y 53 con fallback.
- **ID estable:** se usa `referenciaInterna`. Si hubiera duplicados, se usa `referenciaInterna#n` y se reporta en el build.

### Interfaz
1. Arriba van el selector **Presentación** (120, 250, 500, 1000, Sin presentación y, como opción extra, «Todas» `[supuesto]`) y el campo **Buscar producto**.
2. **Búsqueda:**
   - Busca por nombre, referencia o código, con coincidencias parciales.
   - No distingue mayúsculas ni tildes (`normalize('NFD')` y quitar diacríticos).
   - Orden de los resultados: primero la referencia o el código exacto, luego los que empiezan por el texto buscado y después el resto.
3. **Tabla:** a la izquierda van Nombre, Referencia y Código. A la derecha va el campo **Unidades** (`type=number`, enteros de 0 a 9.999), uno por fila.
   - Un campo vacío o con 0 saca la referencia del lote.
   - Un valor no entero, negativo o mayor que 9.999 se marca en rojo y bloquea la vista previa y la impresión.
4. **Estado del lote:**
   - Es un `Map<id, cantidad>` que guarda el orden de selección (orden de inserción).
   - Si una referencia pasa a 0 y luego vuelve a tener cantidad, se agrega al final.
   - El estado vive en memoria durante la sesión y se conserva al cambiar de filtro o de búsqueda.
   - Un mismo lote puede mezclar presentaciones.
5. **Barra de acciones:** **Mostrar solo referencias con cantidad**, **Vaciar lista** (con confirmación), **Vista previa** e **Imprimir etiquetas**.
6. **Resumen siempre visible:** «N etiquetas · M hojas · K referencias».
7. **Aviso fijo junto a Imprimir:** «Papel carta · Escala 100 % / tamaño real · Desactivar encabezados y pies de página».

### Fuera de alcance
- Usuarios, guardado permanente del lote, edición del catálogo desde la app y conexión a internet.

## 3. Stack técnico

| Tecnología | Uso | Por qué |
|---|---|---|
| **Vite + TypeScript (vanilla)** | App y build | No hace falta un framework para una sola pantalla. Da un build rápido y tipos para la lógica de distribución. |
| **vite-plugin-singlefile** | Salida `dist/etiquetas.html` | Mete JS, CSS y datos en un solo HTML que abre con `file://`. |
| **SheetJS (xlsx, CDN oficial)** | `scripts/build-catalog.ts` | Lee el Excel en el build y genera `src/data/catalog.json`. En tiempo de uso no se lee ningún Excel. |
| **JsBarcode** | Code 128 en SVG | Calcula el checksum y elige el set A/B/C automáticamente. Al ser vectorial, imprime nítido. Va dentro del bundle, sin CDN. |
| **@fontsource/plus-jakarta-sans** | Tipografía de la UI | Va incrustada en el HTML, así que funciona sin internet. |
| **CSS con variables y unidades físicas (mm)** | UI (vidrio) e impresión | Medidas exactas de la etiqueta. Se descarta Tailwind porque no aporta nada a un solo archivo de impresión. |
| **GSAP** (config. fija) | Solo microtransiciones de UI (resumen y filas del lote) | Va en el bundle local. Se desactiva con `prefers-reduced-motion` y nunca se usa en las hojas de impresión. Lenis no aplica. |
| **Vitest** | Pruebas de distribución, agrupación y búsqueda | Cubre las verificaciones del enunciado. |
| **Playwright** | Exportar un PDF de prueba en tamaño carta | Permite verificar las páginas y las medidas de forma automática. |

Hosting: no aplica. Se entrega como archivo local.

## 4. Lineamientos visuales: dashboard oscuro con glassmorphism
Dirección: un dashboard nocturno azul marino con paneles de vidrio esmerilado, brillos azules suaves y tipografía limpia (ver las referencias en la sección 5). Sigue siendo una herramienta de trabajo, así que el efecto vidrio va en los **paneles**, nunca en cada fila de la tabla. Todo debe leerse a un metro de distancia.

### Fondo
- `--bg-base: #060B26`.
- Encima, dos o tres manchas de luz difusas con `radial-gradient`, fijas detrás de todo:
  - Azul `#1E40FF` al 35 % de opacidad, arriba a la izquierda.
  - Índigo `#4318FF` al 25 %, al centro y a la derecha.
  - Un toque cálido opcional `#FF7A3D` al 15 %, abajo a la derecha (como en la referencia 1).
- Opcional: un ruido sutil en SVG base64 al 3 % para evitar bandas en el degradado.

### Paleta (tokens)
| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#060B26` | Fondo base |
| `--glass-bg` | `linear-gradient(127deg, rgba(6,11,40,.78) 19%, rgba(10,14,35,.55) 77%)` | Paneles (filtros, resumen, tabla, vista previa) |
| `--glass-border` | `rgba(255,255,255,.08)`; borde superior `rgba(255,255,255,.14)` | Filo de luz del vidrio |
| `--glass-blur` | `blur(24px) saturate(140%)` | `backdrop-filter` de los paneles |
| `--glass-shadow` | `0 8px 32px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)` | Profundidad |
| `--color-fg` | `#F4F6FF` | Texto principal |
| `--color-muted` | `#A0AEC0` | Texto secundario y encabezados de tabla (AA sobre el vidrio) |
| `--color-primary` | `#0075FF` | Botón Imprimir, foco y selección |
| `--grad-primary` | `linear-gradient(135deg, #0075FF, #4318FF)` | Botón principal y valores clave del resumen |
| `--glow-primary` | `0 0 24px rgba(0,117,255,.45)` | Halo del botón Imprimir y del input con foco |
| `--color-accent` | `rgba(0,117,255,.14)` y barra izquierda de 3 px `#0075FF` | Filas con cantidad > 0 |
| `--color-success` | `#01B574` | Estado «lote listo» |
| `--color-warning` | `#FFB547` | Avisos (papel carta, escala 100 %) |
| `--color-danger` | `#FF5A5F` | Cantidad inválida (con texto, no solo color) |
| `--label-ink` / `--label-paper` | `#000000` / `#FFFFFF` | Etiqueta. Fijos, nunca se tematizan. |

### Componentes
- **Paneles:** `border-radius: 20px`, padding de 20 a 24 px, con `--glass-bg`, `--glass-blur`, `--glass-border` y `--glass-shadow`.
- **Layout de pantalla en grid de tarjetas:**
  - Rail lateral estrecho (64 px) con el logo y los iconos de Etiquetas y Ayuda de impresión. `[supuesto]`
  - Fila superior con tres tarjetas KPI:
    - **Etiquetas** (número grande con degradado).
    - **Hojas**, con un anillo de progreso que muestra el llenado de la última hoja (estilo de la referencia 1, «78 %»).
    - **Referencias en el lote**, con un desglose por presentación en mini barras verticales (estilo «Weekly Activity»).
  - Debajo, la tarjeta grande de la tabla y, a la derecha, la tarjeta **Lote actual**: lista ordenada de referencias con su cantidad, en el estilo de la lista «Tasks» o «Your assets».
- **Selector de presentación:** pills segmentadas (`120 · 250 · 500 · 1000 · Sin pres. · Todas`), con la activa en `--grad-primary`, como los filtros de la referencia 3 (1D/2D/7D/1M).
- **Buscador:** input de vidrio con icono de lupa y radio de 14 px. Con foco aplica `--glow-primary`.
- **Tabla:**
  - Va dentro de un solo panel de vidrio; las filas son transparentes, con divisor `rgba(255,255,255,.06)` y hover `rgba(255,255,255,.04)`.
  - Los encabezados van en mayúsculas pequeñas `--color-muted`.
  - El input **Unidades** es oscuro sólido (`rgba(255,255,255,.06)`), con números tabulares.
- **Botones:**
  - Primario **Imprimir etiquetas**: píldora `--grad-primary` con `--glow-primary`.
  - Secundarios: vidrio con borde.
  - **Vaciar lista**: con texto `--color-danger`.
- **Aviso de impresión:** chip `--color-warning` con icono, junto al botón Imprimir.
- **Vista previa:** modal a pantalla completa sobre un velo `rgba(6,11,38,.7)` con blur. Las hojas se ven **blancas, como papel real**, con sombra, escaladas para caber en pantalla.

### Tipografía
- Fuente **Plus Jakarta Sans** (400, 500, 700), incluida localmente con `@fontsource/plus-jakarta-sans` en woff2. El build la incrusta en el HTML, así que funciona offline.
- Respaldo: `system-ui, "Segoe UI", sans-serif`.
- Códigos y referencias en `ui-monospace, Consolas, monospace`, con `font-variant-numeric: tabular-nums`.
- Escala:
  - `--fs-xs: .75rem`, `--fs-sm: .8125rem`, `--fs-base: clamp(.9375rem, .9rem + .2vw, 1rem)`, `--fs-lg: 1.25rem`.
  - `--fs-kpi: clamp(2rem, 1.6rem + 1.5vw, 2.75rem)`, en 700.
- Etiqueta impresa:
  - Nombre en 7 pt, negrita, en la fuente del sistema, con máximo 2 líneas y elipsis.
  - Valor bajo el código en 7 pt monoespaciada.

### Espaciado y grid
- Escala de 4 px: `--space-1` a `--space-8` (4, 8, 12, 16, 24, 32, 48, 64 px).
- Grid de 12 columnas, `max-width: 1440px` y gap de 20 px.
  - KPIs: 3 tarjetas de 4 columnas cada una.
  - Tabla: 8 columnas; Lote actual: 4 columnas.
- La barra de filtros y KPIs queda fija (sticky) y el encabezado de la tabla también.
- Breakpoints:
  - Menos de 1280 px: Lote actual pasa debajo de la tabla.
  - Menos de 768 px: una sola columna y el rail se oculta.
- El uso principal es escritorio, pero el CSS se escribe mobile-first.

### Tono visual
- Adjetivos: nocturno, preciso, tecnológico, sereno, legible.
- Evitar:
  - Neones saturados y degradados arcoíris.
  - Blur sobre las filas de la tabla.
  - Texto gris sobre el vidrio por debajo del contraste AA.
  - Fotos de fondo; solo manchas de luz.
  - Cualquier tema oscuro o color dentro de la impresión.

## 5. Referencias
| Fuente | Qué se toma |
|---|---|
| [Vision UI Dashboard: Billing](https://demos.creative-tim.com/vision-ui-dashboard-react/#/billing) | Sistema base: fondo azul marino profundo, tarjetas con degradado translúcido a 127°, radio de 20 px, azul `#0075FF` y verde `#01B574`, tipografía Plus Jakarta y sidebar con iconos en cápsulas. `[valores tomados del sistema público de Vision UI; la demo es una app de JS y no se pudo leer su CSS directamente, así que se confirman abriéndola en el navegador]` |
| Referencia 1 (dashboard vertical «Good Evening») | Tarjetas KPI con número grande, anillo de progreso y mini gráfica de barras con píldora de valor; rail lateral de iconos; mancha cálida naranja en la esquina para dar profundidad. |
| Referencia 2 (G.Take «Make Things Simple») | Encabezado con título en degradado azul, filtros en píldoras con chevron, botón primario con halo, la tarjeta destacada con brillo azul inferior (para la fila o tarjeta seleccionada) y una barra de progreso rayada. |
| Referencia 3 (dashboard cripto) | Vidrio sobre fondo índigo, toggles de segmento (1D/7D/1M) para el selector de presentación, botones píldora en degradado, listas con valor alineado a la derecha (para el Lote actual) y barras con degradado vertical. |
| `Imprimir etiquetas por referencia.html` (si existe) | Su comportamiento funcional. Las imágenes integradas se usan solo si se verifica que cada una corresponde a su referencia. |
| Hojas de etiquetas del Excel | Validación visual del formato de etiqueta. |

No se copian textos, logos ni assets de estas referencias. Solo se toman los patrones descritos arriba.

## 6. Estructura (una sola pantalla)
1. **Encabezado:** título y aviso de impresión.
2. **Barra de filtros:** Presentación, Buscar y el interruptor «Solo con cantidad».
3. **Resumen y acciones:** total de etiquetas y hojas, Vaciar, Vista previa e Imprimir.
4. **Tabla de productos.**
   - Se renderiza por presentación (unas 900 filas).
   - Con «Todas» o con una búsqueda amplia se usa render por bloques o virtualización para mantener la escritura fluida.
5. **Vista previa:** modal o panel a pantalla completa con las mismas `.sheet` de impresión, escaladas solo en pantalla.
6. **Contenedor `#print-root`:** solo visible en `@media print`.

## 7. Distribución de impresión (la regla crítica)
- `@page { size: letter portrait; margin: 12mm; }`
- El área útil mide 191,9 × 255,4 mm.
- Grid por hoja: `grid-template-columns: repeat(4, 45mm)`, `grid-auto-rows: 20mm`, `column-gap: 3.9mm`, `row-gap: 1.3mm`. Ocupa 191,7 × 254,3 mm, dentro del área útil.
- Cada `.sheet`:
  - Tiene `break-after: page`, salvo la última (`:last-child { break-after: auto }`).
  - Tiene altura fija menor que el área útil, para evitar páginas vacías.
  - Usa `overflow: hidden` en la etiqueta y `break-inside: avoid`.
- **Algoritmo, en una función pura `layout(lote) → Sheet[]`:**
  ```
  filas = []
  para cada (id, qty) en orden de selección:
      para i en 0..ceil(qty/4)-1:
          filas.push( n etiquetas de id, n = min(4, qty - 4i) )   // espacios restantes vacíos
  hojas = trocear(filas, 12)          // una referencia puede seguir en la hoja siguiente
  totalHojas = ceil(filas.length / 12)
  ```
- **Etiqueta de 45 × 20 mm:**
  - Padding de 1,5 mm.
  - Nombre arriba.
  - SVG Code 128 en el centro, de unos 9 mm de alto. El ancho del módulo se ajusta para que quepa en 42 mm, con un margen de silencio de al menos 10 módulos a cada lado y nunca menos de 2 mm.
  - Valor codificado debajo.
  - Siempre negro sobre blanco. Se usa `print-color-adjust: exact`.
- **Al imprimir** se ocultan la app y la vista previa; solo queda `#print-root`.
- **Antes de llamar a `window.print()`:**
  - Se generan todos los SVG del lote.
  - Se espera a `document.fonts.ready` y a dos `requestAnimationFrame`.
  - Mientras tanto, se muestra «Preparando N etiquetas…».
- **Animaciones (solo en pantalla):**
  - Los contadores de los KPI cuentan hasta el nuevo valor (GSAP, 0,3 s).
  - El anillo de hojas se rellena con `stroke-dashoffset` en el SVG.
  - Al asignar una cantidad, la fila tiene un pulso de brillo suave.
  - Al cargar, las tarjetas entran escalonadas (stagger de 40 ms, opacidad y `translateY` de 8 px).
  - La vista previa se abre con un fundido y escala de 0,98 a 1.
  - Se usan solo `transform` y `opacity`, nunca en `@media print`.
  - Con `prefers-reduced-motion` se desactivan por completo.

## 8. Rendimiento y accesibilidad
- Debe abrir en menos de 2 s con el catálogo de 4.538 filas. Para lograrlo:
  - El JSON va minificado.
  - El índice de búsqueda se precalcula con los textos normalizados.
  - La búsqueda espera 120 ms después de la última tecla (debounce).
- Navegación:
  - Se puede usar solo con teclado: Tab entre los campos Unidades y Enter para bajar a la fila siguiente.
  - El foco siempre es visible.
- Contraste AA en toda la UI, medido sobre el peor punto del vidrio, encima de la mancha de luz más brillante.
- Rendimiento del vidrio:
  - `backdrop-filter` solo en 4 a 6 paneles, nunca en filas.
  - Las manchas de luz son `position: fixed` estáticas.
  - Si `@supports not (backdrop-filter)`, se usa un fondo sólido `rgba(10,14,35,.92)`.
- Cada campo tiene `aria-label` del tipo «Unidades de {nombre} {ref}».
- Las cantidades inválidas se señalan con texto, no solo con color.
- Un lote de 9.999 unidades (unas 209 hojas) debe generarse sin congelar la pestaña: el render se hace por bloques y con indicador de progreso.

## 9. Plan de construcción por fases
1. **Setup y datos:**
   - Crear el proyecto Vite y las dependencias.
   - Escribir `scripts/build-catalog.ts`.
   - Inspeccionar el Excel, confirmar la regla del sufijo y validar los conteos (4.538 / 906×4 / 914 / 53).
2. **Lógica pura con pruebas Vitest:** normalización y búsqueda, agrupación, estado del lote y `layout()`.
3. **UI:** filtros, tabla, campos Unidades, resumen, acciones y validación.
4. **Etiqueta e impresión:** componente de etiqueta, CSS de impresión, vista previa idéntica y flujo de espera antes de imprimir.
5. **Pulido:** tokens de vidrio, KPIs, accesibilidad, microanimaciones y revisión con las skills Emil, Impeccable y Taste.
6. **QA, con la checklist del enunciado:**
   - Las 5 presentaciones y la agrupación completa.
   - Búsqueda por código exacto.
   - Cantidades que se conservan entre filtros.
   - Lote 3A + 2B: el cuarto espacio de la fila 1 queda vacío y B empieza en la fila 2.
   - Lote 45A + 2B: 12 filas, B empieza en la hoja 2 y el resumen dice «47 etiquetas · 2 hojas».
   - Lote de 49: 48 + 1.
   - Un 0 quita la referencia del lote, una cantidad inválida bloquea y Vaciar reinicia.
   - PDF carta de Playwright: medidas al 100 % y sin páginas vacías.
   - Prueba física: escanear códigos con un lector real.
7. **Entrega:**
   - `npm run build`, que genera `dist/etiquetas.html`.
   - Probar con doble clic, sin red, en Chrome y Edge.
   - El Excel queda intacto en `data/`.
