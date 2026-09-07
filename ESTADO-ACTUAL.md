# ESTADO ACTUAL — qué es verdad hoy

Este archivo sustituye a `contexto.feliz` como lectura de arranque.
`docs/historial/contexto.feliz.md` se conserva como bitácora histórica (PROMPT-5/B7:
movido fuera de la raíz, R8), pero **no describe el presente**: es
append-only desde mayo y contiene afirmaciones ya falsas.

Regla de mantenimiento: **este archivo se actualiza en el mismo cambio que lo vuelve
falso.** Si crece más de ~150 líneas, lo que sobra es historial y va a `docs/historial/`.

- **Última revisión:** 2026-09-07 (tras ejecutar PROMPT-1 a PROMPT-5)
- **HEAD:** `d631e4f` (2026-09-04) + cambios de PROMPT-1/2/3 sin commitear

---

## 1. Qué es el proyecto

Portal escolar del CETAC 23. Roles: **alumno**, **profesor** (rol `maestro`),
**directivo**, **tutor** y, desde el PROMPT-3, **técnico**.
Next.js 16.2.6 · React 19.2.4 · Supabase (PostgREST + Storage) · Cloudinary · SheetJS.

**No hay REST API propia.** No existe `app/api/`. Todo el transporte navegador→servidor
son Server Actions. Detalle completo en `docs/sistema/FLUJO-TECNICO.md`.

## 2. La raíz del sistema

Un ciclo escolar es una fila de **`periodos`** con un `uuid`. Todo lo académico cuelga
de `periodos.id`. La exclusividad de un solo ciclo operativo la impone PL/pgSQL
(`activar_ciclo_operativo`), no una convención de código.

**Tras PROMPT-1 (2026-09-06):** existe **un solo periodo** en `periodos`:
`2026-2027` = `7cf5cca7` (`activo=true`, `estado=operativo`), renombrado desde
`AGO2026-ENE2027`. Los ciclos `2026-2027` (duplicado del P0) y `BORRADOR` se
eliminaron con la RPC `eliminar_ciclo` tras retirar sus 490 inscripciones
históricas inactivas (duplicados cuyos CURPs ya viven en el operativo).

Fuentes únicas que **no** se duplican (regla R6):

| Concepto | Fuente única |
|---|---|
| Ciclo escolar | `periodos.id` |
| Alumno → grupo | `inscripciones_alumno` |
| Identidad de profesor | `PROFESORES.ID` |
| Identidad de materia | `idInterno` = nombre de la tabla física |
| Parciales | `periodos_evaluacion` |

## 3. Deudas estructurales vivas

Las tres, con su manifestación y ubicación, están en
`docs/sistema/MAPA-DEL-SISTEMA.md` §2. En resumen:

1. **Calendario con dos identidades** — tras PROMPT-1/T2 el calendario del
   operativo cuelga de `periodo_id` (bucket canónico `SEMESTRE AGO26-ENE27`,
   77 filas, ligadas a `7cf5cca7`). La columna texto `ciclo_escolar`
   (`@deprecated`) se conserva como legado (R8) y ya no se escribe por ella.
2. **Identidad del profesor** — 16 de 20 comparten CLAVE `4321`; `profesor_clave` queda como columna legacy.
3. **Una tabla física por materia** — nombres en texto, columnas creadas en caliente por RPC.

Ninguna se cierra «de paso»: cada una necesita su propia migración verificada (R8).

## 4. Seguridad — cómo está realmente

- Sesión: cookie httpOnly firmada con HMAC-SHA256, 7 días (`lib/auth/session.ts`).
- Tutores: scrypt + `timingSafeEqual`. Contraseña inicial derivada del CURP del hijo.
- **RLS no autoriza nada.** Las policies son `*_all USING (true)`. La autorización real
  vive en TypeScript. Desde el PROMPT-2, la decisión «qué puede un rol» está
  centralizada en `lib/auth/permisos.ts` (`exigir()` al inicio de cada Server Action);
  las decisiones de alcance «sobre quién» se conservan ortogonales
  (`resolverAccesoAlumno`, `nivelAccesoProfesor`). Es una decisión consciente, pero
  significa que **un bug de autorización en TS es un bug de seguridad sin red debajo**.
- Todo `scripts/` corre con `service_role` y salta RLS. No hay entorno de staging.

## 5. Estado de datos — última medición conocida

> Cifras medidas el **2026-09-06** tras ejecutar PROMPT-1 (`p0-diag-contexto.mjs`,
> `diag-calendario-periodo.mjs`, `probe-columnas-asistencia.mjs`,
> `diag-relaciones-supabase.mjs`). Antes de apoyarse en cualquiera: volver a
> correr el mismo script.

- **Un solo periodo**: `2026-2027` (`7cf5cca7`), operativo.
- Grupos / materias activas / inscripciones activas / bloques de horario:
  **24 / 241 / 357 / 168** (412 activas antes de T3 → −55 duplicadas).
- **0 CURPs con más de una inscripción activa** (eran 55).
- Calendario del operativo: **77 filas** ligadas por `periodo_id` (73 clase,
  3 descanso, 1 festivo; bucket textual canónico `SEMESTRE AGO26-ENE27`).
  Ya no hay buckets de texto solapados sin `periodo_id`.
- `asistencia_alumnos`: **3 863 filas** (conteo exacto) → **3 795 con
  `periodo_id`/`periodo_evaluacion_id`**; 68 filas históricas sin fecha dentro
  del rango del operativo quedan NULL (se reportan, no se inventó).
- `clases_impartidas`: 81 filas históricas **intactas** (T4: autoría
  irrecuperable, no se tocan).
- `justificaciones_asistencia`: pendiente humano aplicar el SQL de PROMPT-1/T1
  (`agregar-grupo-materia-justificaciones.sql`) para soportar la justificación
  por clase con `grupo_materia_id`.
- Huérfanos en las 9 FK de asistencia: **0**.
- **PROFESORES**: 21 filas (desde PROMPT-3). Una es el rol **técnico**:
  `ID 21 · "TECNICO" · Permisos='Tecnico' · debe_cambiar_credenciales=true`
  (clave inicial `TECNICO26`, se cambia en el primer acceso). Sigue pendiente
  humano corregir las CLAVE duplicadas de los 20 profesores.
- `asignaciones_profesor`: **0 filas** en el operativo a la fecha de esta
  revisión (el DDL C4.11 con `profesor_id` está aplicado). La consola de
  asignación del técnico (PROMPT-3/T3) está lista; poblar la atribución es
  tarea operativa del técnico desde la web (A2).
- `debe_cambiar_credenciales`: la cuenta técnica lo tiene en `true` (A4:
  cambio forzado en el primer acceso).

## 5b. Inscripciones — decisión humana congelada (PROMPT-4/T1, 2026-09-06)

**Resuelto.** La reactivación del ciclo YA NO invierte decisiones humanas. Antes,
`inscripciones_alumno.activo` significaba «pertenece al ciclo operativo» y
`sincronizarInscripcionesOperativo()` recalculaba ese estado en cada activación
eligiendo la fila más reciente por `created_at` — pisando la deduplicación por
roster del PROMPT-1/T3 (dos autoridades sobre el mismo dato; ganaba la última).

Opción A aplicada (columna aditiva `decision_manual` + `motivo` en
`inscripciones_alumno`; `.sql`: `supabase/agregar-decision-manual-inscripciones.sql`).
La sincronización ahora **no toca** las filas marcadas con `decision_manual=true`
y elige por fecha solo entre las no marcadas.

- Filas marcadas: **58** (57 CURPs con la más reciente inactiva + 1 fila extra en
  cascada de la CURP `AAGC080710HVZLRRA6`, que tiene 3 filas con el mismo
  `created_at` y necesitaba marcar dos inactivas).
- Riesgo de inversión al reactivar: **57 → 0** (`diag-inscripciones-reactivacion.mjs`).
- Suite nueva: `scripts/test-reactivacion-inscripciones.mjs` (16 checks, pura).
- Medición: 92 CURPs con más de una fila en el operativo; 0 con la más reciente
  (sin marca) inactiva.

## 5c. Credenciales — resuelto en A1 (PROMPT-5, 2026-09-07)

| Población | Antes (medición §3) | Después |
|---|---|---|
| `PROFESORES` | 21 cuentas, 4 claves distintas (16 + 3 compartiendo) | **19 de 21 con `debe_cambiar_credenciales=true`**; los 2 restantes (técnico ID 21 y 1 cuenta más) tienen clave única |
| `ALUMNOS` | 472 · 10 claves duplicadas (pares) · 0 CURPs duplicados | 472 · 10 pares siguen (decisión aparte, no entra en PROMPT-5) · **0 pares comparten nombre+clave** (no hay agujero real) |
| tutores | — | **0 duplicados** de usuario/clave_tutor |

**A1 aplicado:** `diag-credenciales-duplicadas.mjs` (LEE) midió las tres
poblaciones; `migrar-marcar-claves-compartidas-profesores.mjs --apply`
(autorizado) marcó a los 19 profesores con clave compartida (16 `4321` + 3
`8080`); el técnico ID 21 tiene clave única y no se tocó. No se inventó ninguna
clave: cada profesor la define al entrar (A4). **B1 tapó el hueco de la puerta**
(el layout raíz bloquea las 6 rutas, no solo 3).

Las 10 claves duplicadas de alumno **no son un agujero de autenticación**:
`validarAccesoPortal()` exige nombre + clave, no clave sola (0 pares
nombre+clave). Pero la clave son los últimos 6 caracteres del CURP; cambiar el
esquema de clave de 472 alumnos es decisión aparte y no entra en este prompt.


## 6. Pendiente humano (no lo puede hacer un agente)

1. Ejecutar en el SQL Editor de Supabase (PROMPT-1, en orden):
   - `supabase/agregar-grupo-materia-justificaciones.sql` (T1: habilita
     justificación por clase con `grupo_materia_id`). **Sustituye** a
     `supabase/agregar-materia-justificaciones.sql`, que quedó marcado
     SUPERSEDIDO y NO debe ejecutarse.
   - `supabase/agregar-fk-asistencia.sql` (T5: versión idempotente de las 9 FK,
     que ya existen en la BD con 0 huérfanos).
   - `supabase/agregar-indices-asistencia.sql` (T6: índices para el volumen de
     asistencia; el particionado queda fuera, ver PROMPT-1 §4 T6 paso 4).
   - `supabase/agregar-atribucion-profesor-asistencia.sql` (Prompt C, R-1:
     queda pendiente de ejecutar si la FK de `asistencia_alumnos.profesor_id`
     llegara a faltar en algún entorno).
2. Corregir las CLAVE duplicadas de `PROFESORES`. **PROMPT-5/A1 aplicó la marca**
   `debe_cambiar_credenciales=true` a los 19 profesores con clave compartida
   (16 con `4321` + 3 con `8080`; el técnico ID 21 no se tocó). Cada profesor la
   cambia al entrar (flujo A4).
3. Rotar la contraseña de Supabase y eliminar cualquier copia en texto plano fuera del repo.
4. Revisar las **68 filas** de `asistencia_alumnos` sin `periodo_id` (fechas
   fuera del rango del operativo 2026-08-31 → 2026-12-11): son históricas del
   clon `2026-2027` y se conservan sin atribuir; decidir si se archivan.
5. **Poblar `asignaciones_profesor` (A2)** desde la consola del técnico
   (PROMPT-3/T3) para que `p0-diag-contexto.mjs` muestre
   `asignacionesActivas > 0` en el ciclo operativo.
6. **Commitear** los cambios de PROMPT-1 a PROMPT-5 (todo en el working tree, sin
   commitear).
7. PROMPT-4/T4: si el técnico deshace un paso sobre datos reales de un ciclo
   BORRADOR, hacerlo con la previsualización del panel (los borrados del
   operativo quedan bloqueados por diseño).
8. **PROMPT-5 pendiente (Parte B, puntos de parada):** B3 (mover `.from()` de
   `justificaciones.ts` y `asistencias.ts` a `lib/`), B4 (partir en `-puro` los
   4 módulos con I/O importados desde cliente) y B5 (resolver
   `app/_borrador/` + `lib/_borrador/` con decisión por archivo y el chat
   retirado) se ejecutan en la siguiente sesión. La Parte A (A1+A2), B1, B2, B6
   y B7 ya están aplicados (ver «Cierre y verificación» más abajo).

Las 81 filas históricas de `clases_impartidas` con clave `4321` tienen **autoría
irrecuperable**: no se backfillea `profesor_id`, inventar la atribución sería peor.

## 7. Estructura del repositorio

Reorganizado el 2026-09-06. Dónde va cada cosa: `docs/normativo/ORDEN.md`.

```
app/      actions/ · components/ (paneles) · components/ui/ (primitivas) · _borrador/
lib/      escolar/<7 familias> + transversales en la raíz · auth/ · supabase/ · _borrador/
scripts/  vivos · _peligrosos/ (no ejecutar) · _archivo/ (no re-ejecutar)
docs/     normativo/ (obliga) · sistema/ (el presente) · historial/ (el pasado)
```

Red de pruebas al 2026-09-07: **34 suites** (30 + `test-permisos` y
`test-auditoria-permisos` del PROMPT-2 + `test-reactivacion-inscripciones`
del PROMPT-4/T1 + `test-borrar-paso` del PROMPT-4/T4), 0 fallos;
`npx tsc --noEmit` en 0 errores; `next build` completa con **9 rutas**.
`test-permisos.mjs` compara el código contra la §4 de
`docs/sistema/MATRIZ-PERMISOS.md` con los **5 roles** (475 checks).
Desde PROMPT-5/B6 hay un runner único (`npm run test:suites` →
`scripts/correr-todas-las-suites.mjs`) y un workflow de CI
(`.github/workflows/verificacion.yml`: tsc · compilar · 34 suites ·
permisos · gen:matriz --check · build).

**Chat global retirado (2026-09-06).** Decisión de producto; hay un reemplazo previsto
sin fecha. El código completo se conserva en `app/_borrador/chat/` y
`lib/_borrador/chat/`, y la tabla `COMENTARIOS` no se tocó. Detalle en
`app/_borrador/README.md`.

**Permisos — centralización hecha (PROMPT-2) y rol técnico aplicado (PROMPT-3, 2026-09-06).**
El código no pregunta por el rol: las 138 Server Actions activas empiezan por
`exigir("capacidad")` y la matriz `rol → capacidades` vive en el módulo puro
`lib/auth/permisos.ts`. Los **5 roles** son `alumno`, `maestro`, `directivo`,
`tutor` y `tecnico` (fila normal de `PROFESORES` con `Permisos='Tecnico'`; sin
segundo camino de autenticación). El PROMPT-3 aplicó la §4 de
`docs/sistema/MATRIZ-PERMISOS.md`: **directivo perdió la configuración** (ciclo,
catálogo en edición, asignaciones, roster, tutores-admin, calendario en
edición, credenciales de acceso) y **conserva lectura** (`materia.ver_catalogo`,
`semestre.ver`, `ciclo.ver_operativo`) y su operación diaria; **maestro/tutor/
alumno quedaron HOY** (decisión del directivo registrada en la §4 del documento).
La UI gobierna con `puede()` (barra, layout, páginas y paneles). Validación:
`test-permisos.mjs` (código ⇄ §4 con los 5 roles, 461 checks) y
`test-auditoria-permisos.mjs` (detector de regresión). Resumen de decisiones en
`docs/historial/informes/INFORME-PROMPT-3-ROL-TECNICO.md`.

**Configurador de ciclo — actualizar y deshacer (PROMPT-4, 2026-09-06).**
- **T1 (cerrado, opción A):** columna aditiva `inscripciones_alumno.decision_manual`
  + `motivo` (`.sql`: `supabase/agregar-decision-manual-inscripciones.sql`).
  `sincronizarInscripcionesOperativo()` no toca las filas marcadas; la decisión
  (qué activar/desactivar/intactas) vive en `ciclo-estado-puro.ts`. Aplicado a
  la BD real: 58 filas marcadas (57 CURPs + 1 en cascada) → riesgo de inversión
  al reactivar **57 → 0**. Suite `test-reactivacion-inscripciones.mjs` (16 checks).
- **T2 (aliases):** quitar un alias = `activo=false` nunca DELETE
  (`quitarNombreVisibleMateria` + `actionQuitarAliasMateria`, reutiliza
  `materia.editar_alias`). Edición en volumen con previsualizar→confirmar
  (`actionPrevisualizarAliasArchivo`/`actionAplicarAliasArchivo` +
  `AliasesVolumenPanel`). La materia vuelve a su `idInterno` sin romper UI.
- **T3 (roster):** baja/restauración por CURP con previsualización de arrastre
  (`lib/escolar/catalogo/roster-borrado.ts` + `BajaRosterPanel`). Baja =
  `activo=false` + `decision_manual=true` (T1). Capacidad nueva
  `alumno.borrar_roster` (§4: técnico ✅, resto X).
- **T4 (deshacer por paso):** borrado por paso (académico/calendario/horario/
  evaluaciones/roster) con previsualización de conteos y BLOQUEOS si arrastra
  datos derivados (`lib/escolar/ciclo/borrar-paso.ts` + `borrar-paso-puro.ts` +
  `DeshacerPasoPanel`). No reimplementa `eliminar_ciclo`. Capacidad nueva
  `ciclo.borrar_datos` (§4: técnico ✅, resto X).
- Capacidades nuevas incorporadas por la vía correcta: §4 → `capacidades.ts` →
  `permisos.ts` → `exigir()` → `gen:matriz` → `test-permisos` (475 checks).
  Auditoría: 146 Server Actions · 229 checks, 0 fallos. Detalle en
  `docs/historial/informes/INFORME-PROMPT-4-CONFIGURADOR-CICLO.md`.

**Cierre y verificación (PROMPT-5, 2026-09-07).**
- **A1 (hecho):** `diag-credenciales-duplicadas.mjs` (LEE) reporta 21 cuentas de
  PROFESORES · 4 claves · 2 grupos compartidos (16 con `4321`, 3 con `8080`);
  ALUMNOS 472 · 10 pares de clave, **0 pares nombre+clave** (no hay agujero);
  tutores sin duplicados. Marcados `debe_cambiar_credenciales=true` **19
  profesores** (`migrar-marcar-claves-compartidas-profesores.mjs`, autorizado).
  El técnico ID 21 tiene clave única y no se tocó. Las CLAVE las define cada
  profesor al entrar (flujo A4); no se inventó ninguna.
- **A2 (hecho):** `diag-inscripciones-vs-roster.mjs --roster "…/Alumnos CETAC"`
  (parámetro obligatorio) compara las 357 activas contra los 10 Excel.
  **Reporte 0/0/0/0** tras corregir el `S_APELLIDO` de `FIOK090228HGTGSVA3`
  (`OSORNIO` → `OSORIO`, autorizado; era el pendiente humano #5 de PROMPT-1).
  Base y `things/` **concuerdan**.
- **B1 (hecho):** la puerta del cambio forzado de clave ahora es **una sola**:
  el layout raíz (`app/layout.tsx`) muestra la pantalla de cambio en TODAS las
  rutas (antes solo /configuracion, /profesor y /directivo). Se retiró la
  comprobación repetida de las tres páginas.
- **B2 (hecho):** **0 `console.log`** en `app/` + `lib/` (se eliminaron los 23
  marcados `[6J-login]` de la ruta de login).
- **B6 (hecho):** workflow `.github/workflows/verificacion.yml` + runner
  `scripts/correr-todas-las-suites.mjs` + scripts npm `test:suites` /
  `test:permisos`. Todo solo lectura del filesystem; los `diag-*`/`probe-*` con
  Supabase NO van al CI.
- **B7 (hecho):** `docs/sistema/modulos/CALIFICACIONES-Y-BOLETAS.md` (por qué
  las ~240 tablas físicas son deliberadas; entrada cruzada en GLOSARIO);
  `contexto.feliz` movido a `docs/historial/contexto.feliz.md` (R8; ya estaba
  en `.clineignore`).
- **Pendiente (punto de parada):** B3 (mover `.from()` de
  `justificaciones.ts`/`asistencias.ts` a `lib/`), B4 (partir en `-puro` los 4
  módulos con I/O importados desde cliente) y B5 (resolver `app/_borrador/` +
  `lib/_borrador/` con decisión por archivo, chat retirado) quedan para la
  siguiente sesión con el contrato «mover, no reescribir».

## 8. Cómo se valida un cambio

```bash
npx tsc --noEmit
npm run build
node scripts/<la suite pura del módulo>.mjs   # ver scripts/README.md
```

Si tocaste un módulo puro, antes de la suite: `npm run test:compilar`.

Checklist completo de aceptación: `docs/normativo/CONTRATO-DE-CAMBIO.md`.
