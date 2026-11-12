# PROMPT AC — Perfiles de visualización: el alumno de prueba no se cuela en las listas

**Fecha:** 2026-11-12 · **Redacta:** Claude · **Implementa:** Cline ·
**Peso:** `diag-peso-cambio` 2/14 → Cline (el esquema ya lo decidió Claude: §4).

---

## 1. OBJETIVO

Que exista un **alumno de prueba** (con su tutor) para ver el portal como alumno y como
tutor, inscrito en un grupo REAL, y que **no aparezca en ninguna lista con la que trabaja
el personal**: padrón del ciclo y sus descargas, Datos incompletos, plantillas de
asistencia, boletas por grupo y padrón de calificaciones de una materia.

Al terminar: con `ALUMNOS.es_prueba = true` en un alumno, esas cinco lecturas lo omiten;
con la columna sin aplicar o sin nadie marcado, **todas devuelven exactamente lo mismo que
hoy**.

## 2. CONTEXTO (presupuesto acotado — no leer nada más)

Generado por `node scripts/gen-contexto.mjs --agente=cline`.

- **Cualquier cambio** → `AGENTS.md` · `ESTADO-ACTUAL.md` · `RUMBO.md` ·
  `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/INVARIANTES.md` ·
  `docs/normativo/GLOSARIO.md`
- **Crear un archivo, función, script o SQL nuevo** → + `docs/normativo/ORDEN.md`

Archivos en alcance (capa dominio: imports RELATIVOS, nunca `@/`; nunca importa `app/`):

| Archivo | Qué |
|---|---|
| `lib/escolar/alumno/alumnos-prueba-puro.ts` | **nuevo** — la decisión |
| `lib/escolar/alumno/alumnos-prueba.ts` | **nuevo** — la única lectura de quién es de prueba |
| `lib/escolar/alumno/roster-ciclo.ts` | filtrar `leerRosterDelCiclo` |
| `lib/escolar/alumno/datos-incompletos.ts` | filtrar `leerDatosIncompletosDelCiclo` |
| `lib/escolar/asistencia/asistencia-configuracion.ts` | filtrar `obtenerCurpsInscritasGrupo` |
| `lib/escolar/asistencia/asistencia-plantillas.ts` | leer el conjunto UNA vez y pasarlo al bucle |
| `lib/escolar/materia/calificaciones.ts` | filtrar `curpsDelGrupoMateria` |
| `scripts/test-alumnos-prueba.mjs` | **nueva** suite del módulo puro |
| `scripts/diag-alumnos-prueba.mjs` | **nuevo** diagnóstico de SOLO LECTURA (+ su fila en `scripts/README.md`) |

Red de seguridad — correr **antes y después**; si cambia de resultado, cambiaste semántica:
`node scripts/test-auditoria-ciclo-f1.mjs` · `node scripts/test-calificaciones-io.mjs` ·
`node scripts/test-datos-incompletos.mjs` · `node scripts/test-plantilla-roster.mjs`.

Términos (tal cual, `GLOSARIO.md`): `inscripciones_alumno` · `inscripciones_alumno.activo` ·
`grupos` · `grupo_materias` · `periodos.id` · `«ciclo operativo»` · `CURP`.

## 3. ESTADO ACTUAL (verificado por Claude el 2026-11-12 — no re-investigar)

- `ALUMNOS` tiene 6 columnas: `CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE, numero_control`.
  **No hay ninguna marca de prueba.** 481 filas; `inscripciones_alumno` 454; `grupos` 24.
- Las cuentas genéricas de personal ya existen como filas de `PROFESORES`: PROFESOR (19),
  TECNICO (21), ADMINISTRACION ESCOLAR (22), SERVICIO ESCOLAR (23). Alumno y tutor no viven
  ahí: un alumno es fila de `ALUMNOS` + inscripción + tutor.
- El alta manual (PROMPT W, `alta-manual-alumno.ts`) ya crea alumno + inscripción + tutor
  en un paso. **No hay que tocarla**: el alumno de prueba se da de alta por ella.
- Las cinco lecturas que listan alumnos para el personal (clasificadas una a una sobre los 29
  archivos que leen `TABLA_ALUMNOS` / `TABLA_INSCRIPCIONES_ALUMNO`):
  1. `roster-ciclo.ts › leerRosterDelCiclo` — LA lectura del padrón. La consumen la pantalla
     de Servicio Escolar (`app/actions/roster.ts`), la plantilla `.xlsx` del roster
     (`plantilla-roster.ts`) y la descarga de etiquetas y situación médica
     (`etiquetas-exportar.ts`). Filtrar aquí cubre las tres.
  2. `datos-incompletos.ts › leerDatosIncompletosDelCiclo` — Notificaciones de Administración.
  3. `asistencia-configuracion.ts › obtenerCurpsInscritasGrupo` — la usan
     `asistencia-plantillas.ts` (en un BUCLE por grupo, línea ~105) y `administracion/boleta.ts`
     (boletas por grupo, una llamada).
  4. `calificaciones.ts › curpsDelGrupoMateria` — padrón contra el que se valida la subida de
     calificaciones (`app/actions/calificaciones-normalizadas.ts`, dos llamadas).
- La sincronización del roster **nunca borra** (solo agrega y completa): un alumno que no está
  en el Excel no corre peligro.

## 4. DECISIONES TOMADAS (cerradas — no reabrir)

1. **Fuente de verdad: `ALUMNOS.es_prueba boolean not null default false`.** La crea
   `supabase/agregar-alumno-de-prueba.sql` (ya escrito por Claude; lo aplica la persona).
   Nada de CURP reservada en el código, nombre convenido ni lista en un `.ts` (R6).
2. **El código tolera que la columna no exista.** Si la lectura falla con `42703` / «does not
   exist», el conjunto de prueba es vacío y todo se comporta como hoy (mismo patrón aditivo que
   `decision_manual` en `ciclo-estado.ts › sincronizarInscripcionesOperativo`). Cualquier OTRO
   error también da conjunto vacío: lo peor que pasa es que el alumno de prueba se vea, nunca
   que un alumno real desaparezca.
3. **Se filtra SOLO en las cinco lecturas del §3.** Se quedan SIN filtro, a propósito:
   - buscadores por clave/CURP/nombre (`alumnos.ts`) y `acceso-alumno.ts`: el directivo y
     Administración deben poder abrir su expediente para verlo;
   - login, RPCs (`obtener_perfil_alumno`, candidatos de login): el alumno de prueba tiene que
     poder entrar;
   - `inscripciones-borrador.ts`, `roster-borrado.ts`, `ciclo-estado.ts`, `tutores-*`: son las
     herramientas del técnico para administrarlo;
   - `alumnos-estrella.ts`: sale de calificaciones, y el alumno de prueba no tiene.
4. **Un conjunto, una consulta.** `leerCurpsDePrueba` hace UNA consulta
   (`select CURP where es_prueba`). En `asistencia-plantillas.ts` se lee una vez antes del bucle
   y se pasa: `obtenerCurpsInscritasGrupo` recibe un tercer parámetro OPCIONAL con el conjunto;
   si no llega, lo lee ella. Las firmas existentes siguen compilando sin cambios en los demás
   llamadores.
5. **La cuenta DIRECTIVO** (`supabase/crear-cuenta-directivo-de-prueba.sql`) y Administración
   (se reusa la 22) **no son parte de este prompt**: no hay código que tocar para ellas.

## 5. MEDICIÓN

Crear primero `scripts/diag-alumnos-prueba.mjs` (SOLO LECTURA, `.env.local` + REST, como los
demás `diag-`; nunca imprime CURP completa: solo los últimos 4 caracteres enmascarados). Debe
decir:

- si la columna `es_prueba` existe (intentar `select=es_prueba&limit=1`; 42703 → «no aplicada»);
- cuántos alumnos tienen `es_prueba = true`;
- cuántas filas da el padrón del ciclo operativo (inscripciones activas en grupos de
  `periodos.id` operativo) **con** y **sin** los de prueba.

Correrlo ANTES de tocar nada y pegar la salida. Lo esperado hoy: «columna no aplicada», 0, y el
mismo número en las dos cuentas.

## 6. RESULTADO ESPERADO

- `alumnos-prueba-puro.ts` exporta
  `quitarAlumnosDePrueba<T>(filas: readonly T[], curpDe: (f: T) => string, curpsPrueba: ReadonlySet<string>): T[]`
  — compara CURP con `trim().toUpperCase()`; conjunto vacío → devuelve una copia igual.
  Y `quitarCurpsDePrueba(curps: Iterable<string>, curpsPrueba): Set<string>` para los dos
  lectores que trabajan con `Set<string>`.
- `alumnos-prueba.ts` (con `import "server-only"`, como `roster-ciclo.ts`) exporta
  `leerCurpsDePrueba(supabase): Promise<Set<string>>` con la regla 2 del §4.
- Los cinco lectores del §3 llaman a esas dos piezas; ninguno escribe su propio `.eq("es_prueba", …)`.
- `scripts/test-alumnos-prueba.mjs`: conjunto vacío no cambia nada; quita por CURP sin importar
  mayúsculas/espacios; conserva el orden; no muta la entrada; `quitarCurpsDePrueba` devuelve un
  `Set` nuevo. La recoge sola `correr-todas-las-suites.mjs` (verificar que aparece).
- Las cuatro suites de la red de seguridad dan **el mismo resultado** antes y después.

## 7. REGLAS / SEGURIDAD / RENDIMIENTO

- Ninguna CURP en código, suites, informe ni salida de consola (la clave del alumno son sus
  últimos 6 caracteres).
- Ninguna consulta extra dentro de un bucle (decisión 4). `leerRosterDelCiclo` y
  `leerDatosIncompletosDelCiclo` leen el conjunto una vez por llamada.
- No tocar `lib/auth/`, `app/actions/`, la matriz de permisos ni ningún `.sql`.

## 8. ALCANCE

**SÍ:** los 9 archivos de la tabla del §2 y la fila de `scripts/README.md`.

**NO:** el SQL (ya está escrito), el alta manual, los buscadores, login/RPCs, tutores,
inscripciones-borrador, ciclo-estado, `ESTADO-ACTUAL.md`, `pendientes.json` (los actualiza
Claude cuando se aplique el SQL).

## 9. VALIDACIÓN

```bash
node scripts/diag-alumnos-prueba.mjs
node scripts/test-alumnos-prueba.mjs
node scripts/test-auditoria-ciclo-f1.mjs
node scripts/test-calificaciones-io.mjs
node scripts/test-datos-incompletos.mjs
node scripts/test-plantilla-roster.mjs
node scripts/test-orden.mjs
npm run test:ci
```

## 10. INFORME

`docs/historial/informes/INFORME-PROMPT-AC.md`, con: qué se hizo · quién lo ejecutó y qué pudo
y no pudo hacer · cómo se ejecutó y se midió (diag antes → después) · qué normas respetó
(CONTRATO §2) · veredicto frente a la filosofía y la arquitectura · desviaciones y decisiones
propias · lo no verificado (al menos: el filtro con un alumno REALMENTE marcado, que exige el
SQL aplicado y el alta hecha).

Commit local por parte (1: módulo puro + suite; 2: lectura + cinco lectores; 3: diag + README).
`npm run test:ci` antes de cada commit.

## 11. CONTRATO

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
5. Validar: npm run test:ci (el CI completo) + la suite del módulo.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

---

## Retroalimentación (2026-11-12, al ejecutarlo Claude en lugar de Cline)

El usuario pidió ejecutarlo con el conector. Lo que la ejecución corrigió de este prompt:

1. **Columna nullable.** §4.1 decía `not null default false`; el CONTRATO §2 pide columnas nuevas
   nullable. Se aplicó `boolean default false` (nulo y false significan lo mismo para la app).
2. **Sin `server-only`.** §6 lo pedía en `alumnos-prueba.ts`, pero `test-calificaciones-io` importa
   `calificaciones.ts` en Node y el paquete lanzaría.
3. **No había bucle en `asistencia-plantillas.ts`.** La iteración por grupo está en
   `app/actions/asistencias.ts` (`Promise.all`); se aceptó +1 consulta por índice por vuelta en
   vez de tocar la action.
4. **La identidad de `PROFESORES.ID` iba atrasada** (la 23 se insertó con ID explícito): el primer
   INSERT chocó en la clave y el reintento recibió el 24.

Informe: `docs/historial/informes/INFORME-PROMPT-AC.md`.
