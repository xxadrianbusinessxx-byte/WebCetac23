# INFORME — PROMPT I · La UI estrena guardián: ninguna pieza se define dos veces

> Ejecutado el 2026-09-20 sobre `feature/uis-pendientes` (HEAD `c0705ff`), siguiendo
> `docs/historial/prompts/PROMPT_CLINE_I_PIEZAS_DUPLICADAS.md`.
>
> **Las dos partes, hechas.** `test-orden.mjs` tiene la regla **C11** como trinquete en **21**,
> ORDEN.md declara la norma, `scripts/README.md` y `MATRIZ-UX.md` §7 quedan al día, el panel la
> recoge (`orden.C11`) y la regla **se vio fallar** a propósito antes de darla por buena.
>
> **No se unificó ninguna pieza**: cero cambios en `app/components/**`. Eso es F-UX1.

---

## 1 · El número

**21 definiciones sobrantes, en 6 nombres.** La medición del prompt decía 13, con tres nombres;
la diferencia tiene tres causas, y las tres son información:

| Pieza | Copias | Sobran | Archivos |
|---|---|---|---|
| `GreyActionPill` | 7 | **6** | calendario-escolar-panel · cambio-clave-forzado · documentos-panel · justificaciones-admin · roster-alumnos-panel · tutores-panel · (+ calendario-asistencia-alumno, que conserva la copia) |
| **`Aviso`** | 7 | **6** | actividades-panel · administracion-panel · mensajes-internos-panel · sesiones-programadas-panel · contenido-alumno-oceano · contenido-directivo-oceano · contenido-docente-oceano |
| `PanelTab` | 6 | **5** | calendario-escolar-panel · documentos-panel · justificaciones-admin · roster-alumnos-panel · tutores-panel |
| `PillButton` | 3 | **2** | asistencias-panel · etiquetas-dinamicas-panel · horario-escolar-panel |
| **`Boton`** | 2 | **1** | administracion-panel (+ 1) |
| **`Campo`** | 2 | **1** | administracion-panel · home-login-form |

`6 + 6 + 5 + 2 + 1 + 1 = 21`.

**Por qué no son 13.** El prompt hizo `grep -rl "function <nombre>"` sobre **tres** nombres
—los de `MATRIZ-UX` §5.2— y esos tres suman exactamente los 13 que anunciaba. El detector no
buscaba nombres: buscó **toda** declaración de componente en `app/` y encontró tres más:

- **`Aviso`, con 7 copias: es la pieza MÁS copiada del repo** y no aparece en `MATRIZ-UX` §5 (ni
  en §5.2 ni en el catálogo). Una pieza repetida en siete archivos que ningún documento había
  contado.
- `Boton` (2) y `Campo` (2): dos pares. `Campo` son dos componentes **distintos** que comparten
  nombre — `home-login-form.tsx:18` es un campo con etiqueta y variante;
  `administracion-panel.tsx:77` es un envoltorio de `<input>`—, así que unificarlos no es copiar
  y pegar: es decidir cuál es `Campo` y renombrar el otro. El detector mide colisiones de
  nombre, y esa colisión es real aunque la intención fuera otra.

También importa lo que **no** cuenta: 85 componentes de `app/` están definidos una sola vez
aunque algunos se importen en diez sitios. Eso es exactamente lo que la regla quiere proteger, y
no suma nada al marcador.

---

## 2 · La regla

Añadida a `scripts/test-orden.mjs` con el formato de las otras diez (`comprobar(id, texto,
umbral, fn, deuda)`, `--json`, `--detalle`), y reutilizando `codigoDesnudo()` — el limpiador que
ya existía porque el grep ingenuo daba falsos positivos. **No hay un segundo limpiador**: eso
habría sido la duplicación que la propia regla persigue.

**Qué es un componente.** Una declaración, exportada o no, cuyo nombre empieza por mayúscula:
`function X(`, `function X<…>(`, `const X = (`, `const X: FC… = (`. No es un parser y no
pretende serlo; con esas formas cubre lo que hay en el repo.

**Qué se excluye, y por qué:**

- `app/components/ui/**` — es el **destino** de F-UX1, no el problema.
- `app/_borrador/**` — la cuarentena, ya ignorada por `eslint.config.mjs`.
- Comentarios y literales de cadena: se mide sobre `codigoDesnudo()`, así que **mencionar**
  `GreyActionPill` en un comentario o en un mensaje no lo define. Probado: `Aviso` cuenta 7 y no
  10, y las tres que no cuentan son un `const aviso = …` en minúscula y dos comentarios que
  nombran el aviso del diseño.

**Cómo se cuenta.** Copias menos una por nombre. Con «nombres duplicados» (serían 6), retirar
seis de las siete copias de `GreyActionPill` no movería el marcador; con definiciones sobrantes,
sí.

**Umbral: 21, modo trinquete**, con la deuda apuntando a `MATRIZ-UX` §7 (F-UX1). No en 0: eso
dejaría el CI rojo el primer día y la regla se desactivaría al día siguiente.

Salida completa (`node scripts/test-orden.mjs --detalle`), las 21 líneas:

```
ok     C11  ningún componente de app/ se define a mano en más de un archivo  ·  21/21
app/components/administracion-panel.tsx             —  definición sobrante de Aviso (7 copias)
app/components/mensajes-internos-panel.tsx          —  definición sobrante de Aviso (7 copias)
app/components/oceano/contenido-alumno-oceano.tsx   —  definición sobrante de Aviso (7 copias)
app/components/oceano/contenido-directivo-oceano.tsx — definición sobrante de Aviso (7 copias)
app/components/oceano/contenido-docente-oceano.tsx  —  definición sobrante de Aviso (7 copias)
app/components/sesiones-programadas-panel.tsx       —  definición sobrante de Aviso (7 copias)
app/components/administracion-panel.tsx             —  definición sobrante de Boton (2 copias)
app/components/home-login-form.tsx                  —  definición sobrante de Campo (2 copias)
app/components/calendario-escolar-panel.tsx         —  definición sobrante de GreyActionPill (7 copias)
app/components/cambio-clave-forzado.tsx             —  definición sobrante de GreyActionPill (7 copias)
app/components/documentos-panel.tsx                 —  definición sobrante de GreyActionPill (7 copias)
app/components/justificaciones-admin.tsx            —  definición sobrante de GreyActionPill (7 copias)
app/components/roster-alumnos-panel.tsx             —  definición sobrante de GreyActionPill (7 copias)
app/components/tutores-panel.tsx                    —  definición sobrante de GreyActionPill (7 copias)
app/components/calendario-escolar-panel.tsx         —  definición sobrante de PanelTab (6 copias)
app/components/documentos-panel.tsx                 —  definición sobrante de PanelTab (6 copias)
app/components/justificaciones-admin.tsx            —  definición sobrante de PanelTab (6 copias)
app/components/roster-alumnos-panel.tsx             —  definición sobrante de PanelTab (6 copias)
app/components/tutores-panel.tsx                    —  definición sobrante de PanelTab (6 copias)
app/components/etiquetas-dinamicas-panel.tsx        —  definición sobrante de PillButton (3 copias)
app/components/horario-escolar-panel.tsx            —  definición sobrante de PillButton (3 copias)
```

---

## 3 · La prueba de que falla

Dupliqué a propósito `Titulo` —un componente definido **una sola vez** en todo `app/`
(`app/components/actividades-panel.tsx`)— en un archivo temporal
`app/components/zz-prueba-c11.tsx`:

```tsx
// PRUEBA TEMPORAL DE LA REGLA C11 — se borra en el mismo turno.
function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold">{children}</h2>;
}
```

`node scripts/test-orden.mjs` → **exit 1**, con la línea que importa:

```
SUBIÓ  C11  ningún componente de app/ se define a mano en más de un archivo  ·  22/21
         …
         deuda declarada: docs/sistema/MATRIZ-UX.md §7 (F-UX1) es el plan que las unifica en app/components/ui/
1 regla(s) incumplida(s). Una regla DURA no admite excepciones;
un TRINQUETE solo falla si la deuda sube, y bajarla es el trabajo, no el obstáculo.
```

Y deshecho —archivo borrado— vuelve a `ok  C11 … 21/21`, `Todo en orden: 11 reglas comprobadas`,
exit 0. La regla no solo está escrita: **se la vio fallar y volver**.

---

## 4 · Que se vea (Parte 2)

- **`docs/normativo/ORDEN.md` → HAY UN HALLAZGO.** El prompt pedía una fila de C11 «en la
  sección que lista las reglas», y **esa sección no existe**: ORDEN.md no inventaría las reglas
  mecánicas —ni las diez que ya había— en ningún sitio. Su `--json` y `scripts/README.md` son el
  inventario real, y cada regla cita en su texto la sección de ORDEN de la que nace. Inventariar
  las reglas dentro de ORDEN habría creado una segunda fuente de la misma verdad (R6), que es
  justo lo que el repo evita.
  Lo que **sí** se hizo, y en el sitio donde la norma sí encaja: un **punto nuevo en §1 «Reglas
  de ruta»** que declara la norma —una pieza de presentación se define una vez y se importa; lo
  vigila C11; el plan es F-UX1— junto a la fila que ya decía dónde vive una pieza sin dominio
  (`app/components/ui/`). ORDEN sigue siendo la fuente: la regla existe porque esa norma está
  escrita, no al revés.
- **`scripts/README.md`** — la fila decía «Diez reglas: siete **duras** y tres **trinquete**», y
  **ya estaba mal antes de este prompt**: desde que C8 y C9 pasaron a duras son nueve duras y
  solo C10 era trinquete. Ahora dice «Once reglas: nueve **duras** y dos **trinquete**» y
  menciona la composición de UI en lo que el script mide.
- **`docs/sistema/MATRIZ-UX.md` §7** — junto a F-UX1: hay detector, el número de partida es 21,
  el reparto por nombre, el aviso de que la cifra de §5.2 (2026-09-08) es anterior y no manda, y
  el recordatorio de apretar el umbral al bajar el número. El pendiente
  `matriz-ux-anterior-al-shell` **no se tocó**: sigue abierto, como pedía el prompt.
- **`ESTADO-ACTUAL.md`** — «capas, nombres, scripts y raíz» → «capas, scripts, raíz, tamaño de
  archivo y composición de UI»: la descripción de lo que prueba `test-orden` tenía que incluir lo
  que ahora prueba. Es el paso que ORDEN §6 dice que siempre se olvida.
- **`RUMBO.md`** — `gen-rumbo --check` empezó a fallar en cuanto C11 existió, y con razón: una
  regla que no está en 0 tiene que aparecer en «Lo que más pesa hoy». Regenerado con
  `node scripts/gen-rumbo.mjs` (solo el bloque GENERADO). **Y no es un efecto colateral menor: es
  la prueba de que añadir una regla con deuda se propaga sola al documento que se lee para
  decidir.**
- **`scripts/verificar-docs.mjs`** — el aviso nuevo de `scripts/README.md` cita
  `scripts/.tmp-tests/`, una carpeta **efímera** (cada suite que se transpila sola la crea y la
  borra), y el verificador la señaló como ruta muerta. Se añadió a `AUSENTES_A_PROPOSITO` **con
  su motivo**, que es el mecanismo que el repo tiene para esto y que imprime la lista en cada
  ejecución; no se reescribió el aviso para esconder la cita.
- **El panel la recoge solo** — `npm run panel` → `.panel/estado.json` contiene `orden.C11`
  (`trinquete`, umbral 21, actual 21, estado `ok`, deuda F-UX1) y `.panel/panel.html` la pinta en
  la zona técnica: `<h3>C11 · ningún componente de app/ se define a mano en más de un
  archivo</h3>`. Sin tocar `gen-estado.mjs` ni `gen-panel.mjs`: ya leían `test-orden --json`.

---

## 5 · Validación

| Comando | Resultado |
|---|---|
| `node scripts/test-orden.mjs` | `Todo en orden: 11 reglas comprobadas` — C11 en `21/21`, exit 0 |
| `node scripts/test-orden.mjs --detalle` | las 21 líneas de §2 |
| `node scripts/test-orden.mjs --json` (y parseo) | C11 bien formada: `modo: trinquete`, `umbral: 21`, `actual: 21`, `estado: ok`, `deuda` = F-UX1; **11 reglas** en el JSON |
| `npm run panel` | `orden.C11` en `.panel/estado.json` (1 aparición) y en `.panel/panel.html` |
| `node scripts/verificar-docs.mjs` | `OK: el sistema de documentación está sano` · arranque **10 004 / 10 500** tokens |
| `npm run test:ci` | **exit 0** — suites 39/39 · invariantes «Al día» · rumbo «Al día» · ESTADO-ACTUAL al día · docs sanas |
| `npx tsc --noEmit` | 0 errores |
| `npm run lint` | 0 errores, 1 warning preexistente (`scripts/gen-panel.mjs:41`) |
| `npm run build` | exit 0 (ejecutado con la regla ya puesta, en la validación del PROMPT H) |

La prueba de que la regla falla (§3) se hizo además con la regla ya en su umbral: 21 → 22 → 21.

---

## 6 · Qué se tocó y qué NO

**Tocado (6 archivos):** `scripts/test-orden.mjs` (regla C11 + una línea de comentario que decía
«diez reglas» y nombraba un consumidor que no existe, `gen-panel-repo.mjs`, y que ahora dice
`gen-estado.mjs`), `docs/normativo/ORDEN.md` (§1, punto nuevo), `scripts/README.md` (fila del
script + dos avisos: `test-fechas` ya no compila y las tandas en paralelo), `ESTADO-ACTUAL.md`
(qué prueba `test-orden`), `docs/sistema/MATRIZ-UX.md` (§7, junto a F-UX1),
`scripts/verificar-docs.mjs` (una excepción con su motivo), y `RUMBO.md` (bloque generado).

**NO tocado, pudiendo haberlo hecho:**

- **Ni un `.tsx` de `app/components/**`**, ni `app/globals.css`, ni `app/**/*-client.tsx`. No se
  creó `app/components/ui/pill.tsx` ni `tab.tsx`: eso es F-UX1, y hacerlo aquí habría dejado el
  detector midiendo el trabajo a medias de otro prompt.
- **Las otras diez reglas**: ni un umbral bajado. C10 sigue en 34 y C9 en 1000 líneas.
- El pendiente `matriz-ux-anterior-al-shell` sigue abierto: §5.2 sigue siendo del 2026-09-08 y no
  se reauditó — solo se anotó, al lado, que el detector manda sobre esa cifra.
- **Cero dependencias nuevas.** La regla vive en `test-orden.mjs` con las demás.



