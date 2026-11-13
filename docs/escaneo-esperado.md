# Prueba física de escaneo

Imprime `dist/prueba-escaneo.pdf` en papel carta, **escala 100 %**, sin encabezados ni pies de página.
Cada fila de la hoja tiene una sola etiqueta (columna 1). Escanea cada una con el lector en un editor de texto
y compara con la columna «Debe leer». Marca ✔ o ✖ en «Resultado».

Antes de escanear, mide con regla una etiqueta: debe dar **45 × 20 mm** (si no, la escala no estaba al 100 %).

| Fila | Nombre | Referencia | Debe leer | Caso | Resultado |
|---|---|---|---|---|---|
| 1 | A MILKSHAKE PLEASE DM 120 | `2278 -120` | `770999003221` | Presentación 120 | |
| 2 | ACQUA FRESCA  HM 250 | `0252 -250` | `770999000543` | Presentación 250 | |
| 3 | ADDICTIVE VIBE HM 500 | `0509 -500` | `770999000021` | Presentación 500 | |
| 4 | INCANDESCENT CONSTELLATION UNISEX 1000 | `2299 -1000` | `770999003256` | Presentación 1000, nombre más largo del catálogo | |
| 5 | JEQUE ARABIANS II -1000 | `2554 -1000` | `770999003504` | Nombre con guion pegado («-1000») | |
| 6 | A MILKSHAKE PLEASE DM | `2278` | `200387590583` | Sin presentación | |
| 7 | ACQUA FRESCA  HM | `252` | `200929893051` | Sin presentación, referencia de 3 dígitos | |
| 8 | ADELINE DM | `0723` | `200515926087` | Sin presentación (otra familia) | |
| 9 | BOSÉ  HM | `0407` | `200365490619` | Nombre con tilde | |
| 10 | CANDIED YOGUI DM | `2878` | `2878` | Sin código de barras: codifica la referencia | |
| 11 | CANDY BLUSH DM | `2875` | `2875` | Sin código de barras: codifica la referencia | |
| 12 | ZAHIRA DM | `2940` | `2940` | Sin código de barras: codifica la referencia | |
