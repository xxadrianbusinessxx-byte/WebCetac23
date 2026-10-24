# INFORME — Iconos y assets de la portada pública

**Fecha:** 2026-10-24 · **Base:** `4fd8e81` · **Pedido por el usuario en chat** (sin prompt
archivado: es un encargo directo de UI y assets, no un PROMPT de dominio).

---

## 1. Qué se hizo

Tres cosas, en este orden:

1. **Normalizar los cuatro iconos de red de la portada** (TikTok, WhatsApp, Facebook,
   Gmail) para que se vean del mismo tamaño en la misma caja, y bajar el peso de los
   ocho PNG de la portada.
2. **Sustituir el logo de WhatsApp de contorno por el relleno**, para que pese lo mismo
   a la vista que TikTok y Facebook.
3. **Rescatar de `docs/sistema/MATRIZ-UX.md` lo único que seguía sirviendo** y tirar el
   resto: el mapa de rutas que tenía había caducado al rehacerse la portada.

Archivos tocados:

| Archivo | Qué cambió |
|---|---|
| `decoraciones imagenes/*.png` (8) | reemplazados por la versión normalizada (origen) |
| `public/decoraciones-imagenes/*.png` (8) | salida de `npm run sync:decoraciones` |
| `app/page.tsx` | se borra el parche `escala`/`transform: scale(1.6)`; `LOGOS_OFICIALES` toma las dimensiones reales de los archivos nuevos |
| `docs/sistema/MATRIZ-UX.md` | 459 → 118 líneas: solo la deuda viva y las tres reglas |
| `docs/00-INDICE.md` | las dos entradas de MATRIZ-UX, reescritas |
| `.claude/launch.json` | nuevo, sin versionar: para levantar el dev server de la sesión |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** No intervino Cline ni ningún subagente. El reparto habitual
(Claude diagnostica, Cline implementa) no aplica aquí: el grueso del trabajo es
procesamiento de imagen, no código.

| Pudo | No pudo / no hizo |
|---|---|
| Medir, convertir y verificar los 8 PNG con `sharp` (ya estaba en `node_modules`, viene con Next) | No corrió `next build`: había otro dev server trabajando en la carpeta y el build le habría pisado `.next` |
| Derivar el WhatsApp relleno del **mismo archivo original** (componentes conexas + relleno de huecos), sin traer arte de fuera | No sustituyó el icono por uno descargado: no hizo falta y habría metido una marca que nadie eligió |
| Verificar en el navegador la portada real (cabecera, pie y logos oficiales) | No revisó la barra del portal, donde también se usa `CetacLogo.png`: su geometría no cambió, solo la codificación |

## 3. Cómo se ejecutó y se midió (antes → después)

**Medición previa** (`sharp.trim()` da la caja real del dibujo dentro del lienzo):

| Icono | Lienzo | Dibujo real | Lo que se veía |
|---|---|---|---|
| TikTok | 500×500 | 439×439 — 88 % | ~28 px en caja de 32 |
| WhatsApp | 1600×1136 | 958×964 — **60 % del ancho** | ~19 px → de ahí el `scale(1.6)` |
| Facebook | 2084×2084 | a sangre | 32 px |
| Gmail | 2000×1500 | a sangre, 4:3 | 32 × 24 px |

**Tratamiento.** Iconos de red: recorte del margen, ajuste al lienzo cuadrado por el
lado largo, 128 × 128 (4× del mayor tamaño en que se usan), PNG de paleta. Logos
oficiales: recorte y bajada a 160 px de alto (se ven a 48–64), **conservando su
proporción** — son marcas, no se cuadran. `CetacLogo.png`: geometría intacta (es la
marca de agua de la portada y el sello de la barra), solo re-codificado.

**Que los cuatro pesen igual a la vista** no se dejó al ojo: se midió el relleno de cada
dibujo dentro de su caja. TikTok 78 %, Facebook 79 % — el badge redondeado y el círculo
ya pesaban igual, así que no hizo falta ningún factor de corrección. WhatsApp estaba en
**34 %** (era de contorno): al rellenarlo pasó a **78 %**, la misma cifra que los otros dos.

**Peso, antes → después:**

| Archivo | Antes | Después | |
|---|---|---|---|
| CetacLogo.png | 377.0 KB | 43.1 KB | −89 % |
| TikTokLogo.png | 84.6 KB | 1.3 KB | −98 % |
| WhatsAppLogo.png | 74.4 KB | 1.3 KB | −98 % |
| SEMSLogo.png | 73.2 KB | 5.3 KB | −93 % |
| FacebookLogo.png | 51.8 KB | 1.1 KB | −98 % |
| SEPLogo.png | 39.5 KB | 10.4 KB | −74 % |
| GmailLogo.png | 18.8 KB | 1.0 KB | −95 % |
| DGTAyCMLogo.png | 18.7 KB | 8.4 KB | −55 % |
| **TOTAL** | **738.1 KB** | **71.9 KB** | **−90 %** |

**Verificación:** `npx tsc --noEmit` limpio · `npm run test:ci` en verde (exit 0) ·
portada levantada en el navegador y revisada en cabecera (24 px), pie (32 px) y la fila
de logos oficiales, sin errores de consola. Antes de reemplazar ningún archivo se
compuso una hoja de comparación original-contra-convertido a 128 px de alto: los logos
con texto fino (DGTAyCM, SEP) y el sello CETAC salen indistinguibles.

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| Alcance | Solo portada y assets. El único código tocado es el parche que el propio arreglo deja sin sentido |
| R8 — no borrar legacy de paso | Dos entradas de `NOMBRES_AUSENTES_A_PROPOSITO` en `verificar-docs.mjs` quedaron con un motivo que ya no case (§7); **no se tocaron** (ver §7 de este informe) |
| R6 — no duplicar fuentes | El WhatsApp relleno se deriva del archivo que ya estaba, no se añade una segunda marca |
| Nada a `public/` a mano | Todo salió de `npm run sync:decoraciones` (`ORDEN.md` §1) |
| Verificación | `test:ci` en verde; medición antes y después con el mismo script |
| Documentación | `MATRIZ-UX.md` y `00-INDICE.md` actualizados en el mismo cambio |
| Scripts peligrosos | Ninguno de `_peligrosos/` ni `_archivo/` se ejecutó |

No aplican: capas, datos, identidad, `gen:matriz` (no hay Server Actions nuevas ni
cambios de esquema).

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Una fuente única por concepto | **Sí.** El tamaño visible de un icono ahora lo decide el archivo, no un número mágico repartido por el CSS |
| La documentación describe el presente | **Sí, y mejor que antes.** `MATRIZ-UX.md` pasó de describir pantallas inexistentes a describir lo que hay |
| Medir antes de modificar | **Sí.** Caja real, relleno y peso medidos antes de convertir, y otra vez después |
| Salida generada, nunca a mano | **Sí.** Origen en `decoraciones imagenes/`, `public/` por script |

## 6. Desviaciones y decisiones propias

- **Se ampliaron los 4 iconos a 8 archivos.** El encargo decía «cada icono de la pantalla
  de inicio»; se incluyeron los tres logos oficiales y `CetacLogo.png` porque están en la
  misma pantalla y concentraban el peso (el sello solo ya eran 377 KB de los 738).
- **Los logos oficiales NO se cuadraron.** Se ven a la misma altura, no al mismo ancho:
  cuadrarlos habría deformado tres marcas de gobierno.
- **El verde del WhatsApp relleno es el del propio archivo (`#00a859`)**, no el
  `#25D366` de la marca: se respeta el color que la escuela ya tenía.
- **No se corrió `next build`** (motivo en §2). `tsc` limpio y `test:ci` en verde.
- **Se creó `.claude/launch.json`**, sin versionar, para levantar el servidor de la
  sesión. Si estorba, se borra.

## 7. Lo no verificado / pendiente

- **`next build`** no se ejecutó en esta sesión.
- **`verificar-docs.mjs`** conserva dos excepciones (`perfil/perfil-client.tsx`,
  `tutor-client.tsx`) cuyo motivo apunta a un «MATRIZ-UX §7» que ya no existe, y otras
  dos (`ui/pill.tsx`, `ui/tab.tsx`) que ahora cuelgan de §2 y no de §7. El CI las imprime
  con su motivo en cada ejecución, así que no se esconden; se dejan para quien toque esa
  lista (R8: no limpiar de paso).
- **La barra del portal** (`CetacLogo.png` a 2.5 rem) no se revisó en navegador; la
  geometría del archivo no cambió.
- **Deuda viva que este cambio no toca:** las 16 copias a mano de `GreyActionPill`,
  `PanelTab` y `PillButton` (`docs/sistema/MATRIZ-UX.md` §2).
