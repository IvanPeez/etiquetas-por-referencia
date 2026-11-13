# Etiquetas por referencia

Herramienta interna para elegir referencias del catálogo, asignar unidades e imprimir etiquetas Code 128 de 45 × 20 mm en hojas carta (4 por fila, 12 filas, 48 por hoja).

**Entregable:** `dist/etiquetas.html`, un único archivo autónomo con el catálogo y el generador de códigos incluidos. Se abre con doble clic en Chrome o Edge y funciona sin internet, sin servidor y sin instalar nada.

---

## Uso (operarios)

1. Abre `etiquetas.html` con doble clic. Puedes copiarlo a cualquier carpeta o a una memoria USB.
2. Elige la **Presentación** (120, 250, 500, 1000, Sin pres. o Todas) o escribe en **Buscar producto** el nombre, la referencia o el código. También puedes escanear un código en el buscador.
   - `/` lleva al buscador.
   - **Enter** en el buscador salta al primer resultado.
3. Escribe las **Unidades** junto a cada referencia.
   - **Enter** baja a la fila siguiente; **Shift+Enter** sube.
   - Un campo vacío o en 0 saca la referencia del lote.
   - Las cantidades se conservan aunque cambies de filtro o de búsqueda, y un lote puede mezclar presentaciones.
4. Revisa el resumen (*N etiquetas · M hojas · K referencias*) y el panel **Lote actual**. El orden de impresión es el orden en que agregaste las referencias.
5. Pulsa **Vista previa** para ver las hojas tal como saldrán, o directamente **Imprimir etiquetas**.
6. En el cuadro de impresión:
   - **Papel carta**, vertical.
   - **Escala 100 %** o **Tamaño real**. Nunca uses «Ajustar a la página».
   - **Desactiva encabezados y pies de página.**

Reglas de distribución: cada referencia empieza en una fila nueva y los espacios sobrantes de su última fila quedan en blanco. Una referencia puede continuar en la hoja siguiente.

**Líneas de corte:** la hoja impresa trae guías grises finas en el centro del espacio entre etiquetas, así que se hace un solo corte por espacio. En el borde exterior de la hoja la guía va pegada a la etiqueta. Las guías no tocan el código de barras.

### Referencias impresas

En el panel derecho, la pestaña **Impresas** (o el icono de reloj en la barra lateral) muestra cada referencia impresa con el total de etiquetas acumulado, la más reciente primero. Al pie del panel, siempre visible, aparece la **última referencia impresa**, con su cantidad y la hora.

- El historial se guarda **en este equipo y en este navegador**. Sobrevive a cerrar el archivo, pero no se comparte entre PCs ni entre Chrome y Edge.
- El navegador no avisa si se canceló el cuadro de impresión, así que cada impresión se registra al cerrarse ese cuadro. Si cancelaste, usa **Deshacer última impresión**.
- **Borrar historial** lo vacía (pide confirmación).
- La vista previa no cuenta como impresión.

Si una cantidad sale en rojo (negativa, con decimales o mayor que 9.999), el texto explica el problema, y la vista previa y la impresión quedan bloqueadas hasta corregirla.

---

## Mantenimiento (desarrollo)

Requisitos: Node 22 o superior.

```bash
npm install
npx playwright install chromium
```

| Comando | Qué hace |
|---|---|
| `npm run catalog` | Lee `data/Producto - etiquetas por referencia.xlsx` (sin modificarlo) y genera `src/data/catalog.json`. Falla si los conteos no son los esperados. |
| `npm run dev` | Servidor de desarrollo. |
| `npm test` | Pruebas unitarias (Vitest): catálogo, búsqueda, lote, `layout()` y Code 128. |
| `npm run build` | `catalog` + chequeo de tipos + `vite build` → `dist/etiquetas.html`. |
| `npm run test:e2e` | Build + pruebas e2e con Playwright sobre el archivo real (`file://`): UI, impresión, movimiento, accesibilidad, rendimiento, Chrome y Edge sin red. |
| `npm run pdf` | Exporta `dist/prueba.pdf` (lote de QA de 3 hojas) y `dist/prueba-escaneo.pdf` (12 casos para el lector), y verifica medidas y páginas. |
| `npm run qa` | Todo lo anterior en orden. |

### Cuando cambie el catálogo

1. Reemplaza `data/Producto - etiquetas por referencia.xlsx` por el nuevo archivo. Debe tener la misma estructura: primera hoja con las columnas **Nombre**, **Referencia interna** y **Código de barras**.
2. Corre `npm run catalog`. El build se detiene a propósito si los conteos cambian, para que nadie publique un catálogo incompleto sin darse cuenta.
   - Si el cambio es esperado (productos nuevos), actualiza `CONTEOS_ESPERADOS` en `src/catalog-rules.ts` con los valores que muestra la tabla del script.
   - Si aparece un error de celda numérica o en notación científica, corrige esa fila en Excel para que sea **texto**. El script indica la fila.
3. Corre `npm run qa` y entrega el nuevo `dist/etiquetas.html`.

### Reglas del catálogo

- Los identificadores son siempre texto: se conservan los ceros a la izquierda, los espacios y los guiones.
- Si el código de barras está vacío, se codifica la **referencia interna** (en la tabla aparece como «usa la referencia»).
- **Presentación:** es el sufijo de la referencia (`2278 -120`) cuando coincide con el número final del nombre, separado por espacio o guion. Los valores válidos son 120, 250, 500 y 1000. Todo lo demás va a *Sin presentación*.

### Estructura

```
data/                 Excel fuente (intacto) y HTML de referencia
scripts/              build-catalog.ts (Excel → JSON), pdf.ts (QA de impresión)
src/catalog-rules.ts  reglas puras del catálogo
src/lib/              lógica pura y probada: búsqueda, lote, layout(), Code 128, formato
src/ui/               interfaz: tabla, resumen, lote actual, hojas, impresión, movimiento
src/styles/           tokens.css (brief §4), app.css, sheet.css (etiqueta en mm), print.css
tests/                unitarias (Vitest) y e2e/ (Playwright)
docs/                 QA.md (checklist y resultados), escaneo-esperado.md
```

Lineamientos completos en `PROJECT_BRIEF.md`; reglas de trabajo en `CLAUDE.md`.
