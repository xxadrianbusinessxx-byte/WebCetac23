# PROMPT CLINE — I · La UI estrena guardián: ninguna pieza se define dos veces

## OBJETIVO — qué debe ser cierto al terminar

`scripts/test-orden.mjs` gana una regla **C11** que falla si un componente de
presentación está definido a mano en más de un archivo, y queda como trinquete
en el número de hoy.

**Por qué esto y por qué ahora.** Las diez reglas actuales miden imports, capas,
I/O, tamaño y scripts: todo greppable en módulos TypeScript. **Ninguna habla de
composición de UI**, y se nota en la medida: el dominio reutiliza de verdad
(`../tables` importado 36 veces, `../types` 16, `../nombres` 13) mientras la
presentación no reutiliza nada —**solo 3 de 65 `.tsx` importan algo de
`app/components/ui/`**, que son 152 líneas frente a las 10 114 de
`app/components/`—.

`MATRIZ-UX` §7 ya tiene escrito el plan para unificarlas (F-UX1). **Este prompt no
lo ejecuta**: construye el detector primero, para que cuando F-UX1 se haga, no se
deshaga solo tres semanas después. Es el mismo orden que funcionó con C8: la
regla dura llegó cuando el número ya estaba bajando.

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto.mjs --tarea=crear,apariencia scripts/
```

## MEDICIÓN INICIAL (pegada — no re-investigar)

Medido el 2026-09-20 con `grep -rl "function <nombre>" app --include=*.tsx`:

| Pieza | Definida en |
|---|---|
| `GreyActionPill` | **7 archivos** — `calendario-asistencia-alumno` · `calendario-escolar-panel` · `cambio-clave-forzado` · `documentos-panel` · `justificaciones-admin` · `roster-alumnos-panel` · `tutores-panel` |
| `PanelTab` | **6** — los mismos menos `cambio-clave-forzado` |
| `PillButton` | **3** — `asistencias-panel` · `etiquetas-dinamicas-panel` · `horario-escolar-panel` |

Son **16 definiciones para 3 nombres**. `MATRIZ-UX` §5.2 declara «5 nombres, 25
copias»: esa cifra es del 2026-09-08 y **no la des por buena** — mídela tú, que
para eso es el script.

---

## SECUENCIA — dos partes, con parada entre ellas

### Parte 1 · C11, la regla

En `scripts/test-orden.mjs`, junto a las otras diez y con su mismo formato
(`comprobar(id, texto, umbral, fn, deuda?)`, salida `--json`, `--detalle`).

**Qué cuenta como «la misma pieza definida dos veces»:** un identificador que se
declara como componente en más de un archivo bajo `app/`. Un componente, a
efectos de esta regla, es una declaración **exportada o no** cuyo nombre empieza
por mayúscula y que devuelve JSX. Con cubrir `function X(`, `const X = (` y
`const X: FC` tienes lo que hay en este repo; no montes un parser.

**Cómo se cuenta el número.** El valor de la regla es **cuántas definiciones
sobran**: para cada nombre repetido, las copias menos una. Con las cifras de
arriba serían `(7-1) + (6-1) + (3-1) = 13`. Ese es el número que solo puede
bajar. No cuentes «nombres duplicados» (serían 3) porque entonces retirar seis
de siete copias de `GreyActionPill` no movería el marcador y el trabajo real no
se vería.

**Reutiliza lo que ya hay.** `test-orden.mjs` tiene `codigoDesnudo()`, que
neutraliza comentarios y literales antes de medir; existe porque el grep ingenuo
daba falsos positivos reales. Úsalo. Si escribes tu propio limpiador, has creado
la segunda fuente que R6 prohíbe dentro del mismo archivo.

**Qué NO debe marcar la regla, y hay que probarlo:**

- el mismo nombre en un archivo y en un comentario o en una cadena
- un componente definido **una sola vez** aunque se importe en diez sitios: eso
  es exactamente lo que se quiere
- `app/components/ui/**`: es el destino, no el problema
- las rutas ya ignoradas por `eslint.config.mjs` (`_borrador/`, `_archivo/`,
  `_peligrosos/`)

**Umbral:** el número que midas, como **trinquete** —modo `"trinquete"`, igual
que C10—, con su texto de deuda apuntando a `MATRIZ-UX` §7 (F-UX1), que es el
plan que lo baja. No lo pongas en 0: dejarías el CI rojo y la regla se
desactivaría al día siguiente, que es como muere un guardián.

**PARA AQUÍ.** Enseña `node scripts/test-orden.mjs --detalle` con C11 dentro, y
la lista de las 13 definiciones sobrantes.

### Parte 2 · Que se vea

- Fila de C11 en `docs/normativo/ORDEN.md`, en la sección que lista las reglas.
  **ORDEN es normativo**: la regla existe porque ORDEN lo dice, no al revés. Si
  no encuentras dónde encaja, ese es un hallazgo.
- `scripts/README.md`: la fila de `test-orden.mjs` dice «Diez reglas: siete duras
  y tres trinquete». Actualízala.
- El panel la recoge solo (lee `test-orden --json`), pero **compruébalo**:
  `npm run panel` y mira que `orden.C11` sale en la zona técnica.
- `docs/sistema/MATRIZ-UX.md` §7: anota junto a F-UX1 que ahora hay detector y
  cuál es el número de partida. Esa sección tiene un pendiente abierto
  (`matriz-ux-anterior-al-shell`) — **no lo resuelvas aquí**, solo añade la línea.

---

## REGLAS

- **Esto construye el detector, no arregla la duplicación.** No unifiques ninguna
  pieza, no crees `ui/pill.tsx`, no toques un solo `.tsx` de `app/components/`.
  Eso es F-UX1 y es otro prompt, con capturas antes/después.
- Cero dependencias nuevas. La regla vive en `test-orden.mjs` con las demás.
- No bajes ningún umbral existente.

## LÍMITES — qué NO se toca

- Todo `app/components/**` y `app/**/*-client.tsx`
- `app/globals.css`
- Las otras diez reglas de `test-orden`
- `docs/historial/**`

## VALIDACIÓN

```bash
node scripts/test-orden.mjs
node scripts/test-orden.mjs --detalle
node scripts/test-orden.mjs --json | node -e "..."   # que C11 aparezca bien formada
npm run panel
node scripts/verificar-docs.mjs
npm run test:ci
npx tsc --noEmit
npm run lint
```

Y una prueba que quiero ver en el informe: **duplica a propósito** un componente
que hoy esté una sola vez, comprueba que C11 sube y falla, y deshazlo. Una regla
que no has visto fallar no sabes si funciona.

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-I-PIEZAS-DUPLICADAS.md`:

### El número
Cuántas definiciones sobrantes hay, por nombre y por archivo. Si no son 13, di
por qué difiere de la medición de este prompt — tu medida manda, pero la
diferencia es información.

### La regla
Qué cuenta como componente, qué se excluye y por qué. La salida de `--detalle`.

### La prueba de que falla
La salida con el componente duplicado a propósito.

### Validación
Los comandos, y la captura del panel con `orden.C11`.

---

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```
