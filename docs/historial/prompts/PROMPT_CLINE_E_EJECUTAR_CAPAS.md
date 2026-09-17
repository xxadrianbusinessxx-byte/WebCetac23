# PROMPT CLINE — E · Bajar el I/O a `lib/` y partir los siete gigantes

> Ejecuta `docs/normativo/PROMPT_E_CAPAS_Y_TAMANO.md`. Ese documento tiene el
> **qué** y el porqué; este tiene el **cómo**, la secuencia y las paradas.
> Medición rehecha el 2026-09-16 sobre `feature/capas-y-tamano`.

---

## ANTES DE NADA — genera tu propio contexto

No leas el repo entero. Corre esto y lee **solo** lo que salga:

```bash
node scripts/gen-contexto-cline.mjs --tarea=crear,arquitectura \
  app/actions/asistencias.ts app/actions/justificaciones.ts \
  lib/escolar/asistencia/asistencias.ts lib/escolar/horario/horario-importar.ts \
  lib/escolar/ciclo/contexto-ciclo.ts lib/escolar/tutores/tutores.ts \
  lib/escolar/catalogo/catalogo-academico.ts
```

Devuelve el presupuesto de lectura, la capa de cada archivo y qué exige, las
suites que lo cubren y los términos del glosario que aplican. Si con eso no
alcanza, dilo — no cargues documentación «por si acaso».

---

## MEDICIÓN INICIAL (pegada, para que no la repitas)

Medido hoy sobre esta rama. **No re-investigar.**

### C8 · trece actions hablan con Supabase directamente

| Archivo | Líneas | `.from()` | `exigir()` |
|---|---|---|---|
| `justificaciones.ts` | 857 | **20** | 13 |
| `asistencias.ts` | 1 157 | **15** | 11 |
| `documentos.ts` | 442 | 9 | 11 |
| `materias.ts` | 585 | 4 | 10 |
| `profesores.ts` | 210 | 4 | 4 |
| `asignaciones-profesor.ts` | 224 | 3 | 6 |
| `carga-academica.ts` | 214 | 2 | 3 |
| `contexto-ciclo.ts` | 207 | 2 | 6 |
| `escolar.ts` | 1 038 | 2 | 21 |
| `etiquetas-dinamicas.ts` · `evaluaciones.ts` · `horario.ts` · `noticias.ts` | 41–378 | 1 c/u | 1–10 |

**64 llamadas `.from()` en total.** Las dos primeras filas son la mitad.

### C9 · siete archivos por encima de 1 000 líneas

```
1705  lib/escolar/asistencia/asistencias.ts
1267  lib/escolar/horario/horario-importar.ts
1157  app/actions/asistencias.ts
1133  lib/escolar/ciclo/contexto-ciclo.ts
1064  lib/escolar/tutores/tutores.ts
1046  lib/escolar/catalogo/catalogo-academico.ts      ← nuevo desde el 09-08
1038  app/actions/escolar.ts
```

Eran **4** el 09-08 y hoy son **7**: crecen solos.

### Punto de partida que no puede empeorar

```
tsc --noEmit ............ 0 errores
npm run test:ci ......... 37/37 suites + ESTADO-ACTUAL al día
test:permisos ........... 475 + 229 pasadas, 0 fallidas
gen:matriz --check ...... exit 0
test-orden .............. 10/10 (C8=13/13, C9=7/7)
npm run lint ............ 17 errores · 40 warnings
npm run build ........... 9 rutas
```

> **Corrección a un dato que circula.** `docs/sistema/pendientes.json` dice que
> el lint «subió a 151 errores». Eso ya se arregló en `6809024` excluyendo
> `scripts/**/*.mjs`: hoy `npm run lint` da **17 errores / 40 warnings**. El
> techo de este prompt son esos 17, no 151.

---

## EL MEDIDOR DE ESTE TRABAJO YA EXISTE

`scripts/test-orden.mjs` mide exactamente lo que este prompt tiene que bajar:

- **C8** = actions con `.from()` → hoy 13, meta **0**
- **C9** = archivos > 1 000 líneas → hoy 7, meta **0**

Son *trinquetes*: fallan si el número sube. **Al terminar cada parte, baja su
umbral en `scripts/test-orden.mjs`** para que lo ganado quede clavado y no se
pueda perder.

> **La única vez que tocar un umbral es correcto.** Bajarlo DESPUÉS de que la
> deuda bajó de verdad es cerrar el trinquete. Subirlo, o bajar la meta, para
> que el CI pase es apagar el guardián — y eso no se hace nunca. Si no puedes
> con un archivo, déjalo y dilo en el informe; no ajustes el número.

---

## SECUENCIA — cuatro partes, con parada entre cada una

Es el cambio con más superficie del repo. Hacerlo de una vez y validar al final
hace imposible localizar qué lo rompió. **Para después de cada parte, valida y
reporta.** No encadenes.

### Parte 1 · las nueve actions pequeñas (calentamiento)

`etiquetas-dinamicas` · `evaluaciones` · `horario` · `noticias` ·
`carga-academica` · `contexto-ciclo` · `asignaciones-profesor` · `profesores` ·
`escolar`

Son 17 de las 64 llamadas. Por cada una: la consulta baja a la familia de
`lib/escolar/` que le corresponda y la action queda en `exigir()` → validar →
delegar → devolver.

**Aunque la consulta sea trivial y de un solo uso, múdala igual.** El criterio
es la capa, no el tamaño — si el criterio fuera el tamaño, nunca se movería
ninguna.

Cierre: `test-orden` debe dar **C8 = 4**. Baja el umbral a 4. Valida. Para.

### Parte 2 · `documentos` y `materias`

13 llamadas. Mismo criterio. `documentos.ts` tiene 9 `.from()` y 11 `exigir()`:
revisa que al mover no se pierda ninguna guarda.

Cierre: **C8 = 2**. Baja el umbral. Valida. Para.

### Parte 3 · los dos grandes: `justificaciones` y `asistencias`

35 llamadas, más de la mitad del total. Aquí `asistencias.ts` (1 157 líneas)
además cruza con C9: al bajar su I/O debería caer por debajo de 1 000 solo.

Cierre: **C8 = 0** y C9 ≤ 6. Baja los dos umbrales. Valida. Para.

### Parte 4 · partir los gigantes que queden

Por **responsabilidad**, no por número de líneas. Orientación (ajústala si el
código dice otra cosa):

| Archivo | Corte sugerido |
|---|---|
| `asistencia/asistencias.ts` (1 705) | plantilla · análisis de subida · estados derivados · repositorio |
| `horario/horario-importar.ts` (1 267) | lectura del Excel · validación · aplicación |
| `ciclo/contexto-ciclo.ts` (1 133) | clonación · carga desde catálogo · reparación de `tabla_legacy` |
| `tutores/tutores.ts` (1 064) | credenciales · relación tutor↔alumno · generación masiva |
| `catalogo/catalogo-academico.ts` (1 046) | decidir al abrirlo |

**Los re-exports se conservan.** Ningún import existente puede romperse: el
archivo original queda re-exportando lo que movió. Si un `import` de `app/`
tiene que cambiar, el corte está mal hecho.

Cierre: **C9 = 0**. Baja el umbral. Valida. Informe final.

---

## REGLAS

1. **Refactor puro: cero cambios de comportamiento.** Ninguna suite cambia de
   resultado. **Si tienes que tocar una suite, para**: significa que cambiaste
   semántica, no que la suite estuviera mal.
2. **Nada destructivo** (R8). `FALLBACK_TODAS_LAS_MATERIAS` y los
   `FALLBACK_LEGACY_*` se quedan. No se retira legacy «de paso».
3. **No crear caminos paralelos** (R6). Si ya hay un módulo para ese dominio,
   la consulta va ahí. No inventes `<dominio>-datos.ts` junto a `<dominio>.ts`.
4. **Sin SQL ni migraciones.** Este prompt no toca la base.
5. **Imports relativos dentro de `lib/escolar/`.** Nunca `@/`: rompe las suites
   sin romper el build, así que falla en el sitio equivocado. C1 lo vigila.
6. **El `exigir()` no se mueve.** Se queda en la action, y con la misma
   capacidad. `test:permisos` debe seguir dando 475 y 229, y
   `gen:matriz --check` exit 0.

---

## LÍMITES

- ❌ No toques `app/_borrador/` ni `lib/_borrador/` (es el Prompt F).
- ❌ No arregles los 17 errores de lint (Prompt F). Que no **suban**.
- ❌ No toques el rediseño Océano ni ninguna UI.
- ❌ No toques `scripts/gen-estado.mjs`, `scripts/gen-panel.mjs` ni
  `docs/sistema/pendientes.json`.
- ❌ No cambies permisos ni capacidades.

---

## VALIDACIÓN — al cierre de CADA parte

```bash
npx tsc --noEmit
npm run test:ci                       # 37/37 + ESTADO-ACTUAL al día
npm run test:permisos                 # 475 y 229, exactos
node scripts/gen-matriz-permisos.mjs --check
node scripts/test-orden.mjs           # C8 y C9 en su nuevo umbral
npm run lint                          # no más de 17 errores
npm run build                         # 9 rutas
npm run panel                         # deja el estado a la vista
```

Pega el antes/después de `test-orden` en cada parte. Es la prueba de que la
deuda bajó, y es la única que no depende de tu palabra.

---

## INFORME FINAL

### Implementado
Qué quedó funcionando, parte por parte.

### Archivos principales
Qué se movió y a dónde.

### Arquitectura
Por qué cada consulta acabó en la familia donde acabó, y por qué cada gigante
se partió por donde se partió.

### Seguridad
Que los `exigir()` siguen donde estaban, con la misma capacidad. Cifras de
`test:permisos`.

### Validación
La tabla antes/después de `test-orden`, más tsc, suites, lint y build.

### Legacy
Qué fallbacks siguen en pie y por qué.

### Pendiente
Solo lo que de verdad requiera otra intervención. Si un archivo no se pudo
partir sin cambiar comportamiento, **dilo**: es información, no un fallo.

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
