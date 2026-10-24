# MATRIZ-UX — lo que sobrevive de la medición visual

Describe el **presente**, medido sobre el código (`docs/sistema/`, no normativo).

La primera versión de este archivo (2026-09-08) era un mapa completo de la UI: 459
líneas con el inventario de cada color, radio, sombra y zona de cada ruta. **Ese mapa
murió** cuando se rehízo la portada pública (PROMPT O y U) y con ella la capa de
estilos: describía pantallas que ya no existen. Mantener un mapa así al día cuesta más
de lo que da.

Lo que queda aquí es lo único que no caduca: **la medición re-hecha, la deuda que sigue
viva, y las tres reglas que nacieron de los fallos**. Si vuelve a hacer falta el mapa
completo, se regenera con §4 — no se escribe a mano.

- **Medición vigente:** 2026-10-24 · `app/**/*.tsx` (76 archivos, sin `app/_borrador/`).
- **Dónde va un archivo nuevo:** `docs/normativo/ORDEN.md` §1.
- **Síntoma → archivo:** `docs/sistema/MAPA-DEL-SISTEMA.md`.

---

## 1. Qué se saldó entre el 2026-09-08 y hoy

Sirve como prueba de que medir funciona: sin ninguna fase dedicada a «limpiar CSS», la
mitad de la deuda se fue sola al rehacer la portada con una capa de tokens.

| Medida | 2026-09-08 | 2026-10-24 | |
|---|---|---|---|
| Variables CSS declaradas | 23 (solo fondo/nav) | 39, de ellas **19 `--oc-*`** con papel propio | saldado |
| Sombras `shadow-[...]` distintas | 40 | **9** | saldado |
| Usos de `rose-*` compitiendo con `red-*` para «error» | 44 | **0** | saldado |
| Piezas visuales duplicadas a mano | 25 copias / 5 nombres | **16 copias / 3 nombres** | a medias |
| Radios distintos | 13 | 11 | a medias |
| Archivos `.tsx` de UI | 53 | 76 | — |

`MainTabButton`, `BubblePill`, `GlassShell` y `SectionPill` desaparecieron con las
pantallas que los copiaban. `ui/barra-navegacion.tsx` y `ui/glossy-nav-pill.tsx` ya no
existen: se retiraron en `8d17188`.

---

## 2. La deuda que sigue viva

### D2 — 16 copias a mano de 3 piezas

| Pieza | Copias | Archivos |
|---|---|---|
| `GreyActionPill` | 7 | `calendario-asistencia-alumno`, `calendario-escolar-panel`, `cambio-clave-forzado`, `documentos-panel`, `justificaciones-admin`, `roster-alumnos-panel`, `tutores-panel` |
| `PanelTab` | 6 | los mismos menos `cambio-clave-forzado` |
| `PillButton` | 3 | `asistencias-panel`, `etiquetas-dinamicas-panel`, `horario-escolar-panel` |

Todas viven **dentro** del archivo que las usa, y ya divergieron entre sí (una
`GreyActionPill` perdió la sombra exterior; una `PillButton` usa `disabled:opacity-50`
donde las otras usan `60`). Consecuencia práctica: **cambiar el color o la forma de un
botón del portal son 16 ediciones, y la que se olvide se queda distinta.**

Arreglo, cuando toque: `app/components/ui/pill.tsx` con las tres, imports en los 10
archivos, y como canónica la variante **con** sombra exterior. Aceptación:
`npx tsc --noEmit` y `next build` limpios, `grep -rc "^function GreyActionPill" app` = 0,
y capturas antes/después sin diferencia salvo el botón de `cambio-clave-forzado`, que
gana la sombra que le falta.

### D6 — la escala tipográfica del portal sigue comprimida

255 usos de `text-[10px]`, 245 de `text-xs`, 160 de `text-[11px]`, y 20 de
`text-[8px]`/`text-[9px]`. La portada pública ya tiene jerarquía real (`3xl`–`6xl`); las
rutas internas no: ahí la jerarquía la llevan el color y la forma de la pill, no el
tamaño. No es un bug — es la razón por la que el portal «se lee denso».

### D10 — foco

70 `focus:` frente a 8 `focus-visible:`. El anillo de foco aparece también al hacer clic
con el ratón, no solo al tabular.

---

## 3. Las tres reglas que nacieron de los fallos

Esto es lo que de verdad había que rescatar del documento viejo.

**R-UX1 — Una pieza visual sin dominio va en `app/components/ui/`, nunca dentro del
archivo que la usa.** Lo dice `ORDEN.md` §1; las 16 copias de §2 son exactamente el
coste de haberlo incumplido 16 veces. Copiar una pieza es barato el día que se copia y
caro cada día siguiente.

**R-UX2 — Un defecto del ARCHIVO no se compensa en CSS.** Caso real (corregido el
2026-10-24): los cuatro iconos de red de la portada traían cada uno su propio margen
vacío dentro del PNG — el de WhatsApp ocupaba el 60 % del ancho de su lienzo — así que
en la misma caja se veían de distinto tamaño. El parche fue un `transform: scale(1.6)`
sobre uno de ellos. Un parche así no se propaga: el siguiente icono vuelve a desentonar
y nadie recuerda por qué hay un número mágico. El arreglo correcto fue normalizar los
archivos (recortar el margen, ajustar el dibujo al lienzo cuadrado por su lado largo) y
borrar el `scale`. Mismo criterio para la forma: el logo de WhatsApp era de contorno
entre tres de relleno; se rellenó el archivo, no se tocó el CSS.

**R-UX3 — Un asset se publica a la resolución a la que se ve, no a la que llegó.** Los
mismos cuatro iconos se servían a 500–2084 px para verse a 24–32 px, y el sello CETAC
pesaba 377 KB. Normalizados a 128 px y re-codificados con paleta: **738 KB → 73 KB
(−90 %)**, sin diferencia visible. El origen vive en `decoraciones imagenes/` y
`npm run sync:decoraciones` lo copia a `public/` — nunca a mano (`ORDEN.md` §1).

---

## 4. Cómo se re-mide (solo lectura, sin Supabase)

Desde la raíz del repo. Si hace falta el inventario completo que tenía la versión vieja,
sale de aquí, no de reescribirlo a mano.

```bash
for n in GreyActionPill PanelTab PillButton; do echo "$n: $(grep -rlE "^function $n" app --include=*.tsx | grep -v _borrador | wc -l)"; done
grep -rhoE 'shadow-\[[^]]*\]' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE 'rounded-(\[[^]]*\]|[a-z0-9]+)' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE 'text-(\[[0-9]+px\]|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE '\b(bg|text|border|ring|from|via|to)-[a-z]+-[0-9]{2,3}' app --include=*.tsx | sed -E 's/^[a-z]+-//; s/-[0-9]+$//' | sort | uniq -c | sort -rn
```

Peso de los assets de la portada:

```bash
ls -l public/decoraciones-imagenes/ | sort -k5 -n -r | head
```

---

## 5. Bitácora

| Fecha | Cambio |
|---|---|
| 2026-09-08 | Primera medición completa del sistema visual (459 líneas, mapa de rutas incluido). |
| 2026-10-24 | El mapa de rutas queda obsoleto al rehacerse la portada. Se re-mide, se conserva solo la deuda viva y las tres reglas, y se documenta la normalización de los iconos de la portada. |
