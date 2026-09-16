# ESTADO ACTUAL — qué es verdad hoy

Este archivo sustituye a `contexto.feliz` como lectura de arranque.
`docs/historial/contexto.feliz.md` se conserva como bitácora histórica (PROMPT-5/B7:
movido fuera de la raíz, R8), pero **no describe el presente**: es
append-only desde mayo y contiene afirmaciones ya falsas.

Regla de mantenimiento: **este archivo se actualiza en el mismo cambio que lo vuelve
falso.** Si crece más de ~150 líneas, lo que sobra es historial y va a `docs/historial/`.

- **Última revisión:** 2026-09-16 (reconciliación de pendientes contra la base: 4 de los 8 ya estaban resueltos; ver docs/sistema/PENDIENTES-2026-09-16.md)
- **HEAD:** `de35eab` (2026-09-16) · árbol limpio

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
- **Rediseño Océano · Fase 0 (2026-09-10) — regla estructural.** El conjunto
  `directivo` de `lib/auth/permisos.ts` **ganó tres capacidades** del conjunto de
  `maestro`, por **decisión explícita del responsable** (2026-09-10), para sostener un
  rol de supervisión global que pueda operar sin depender de asignaciones (R-4). No es
  la reparación de un descuido: antes del cambio la §4 decía `X` en las tres filas, y la
  §4 es un espejo generado de `permisos.ts`. Hasta hoy estas actions respondían
  «no tienes permiso» al directivo:
  - `asistencia.subir` → `actionDescargarPlantillaAsistencia`,
    `actionPrevisualizarAsistencias`, `actionConfirmarAsistencias` (`asistencias.ts`).
  - `ciclo.ver` → `actionListarCiclosEscolares` (`calendario.ts`).
  - `justificacion.solicitar` → `actionSolicitarJustificacionAsistencia`,
    `actionSolicitarJustificacionConArchivo`, `actionObtenerMateriasJustificables`.
  Ninguna otra capacidad y ningún otro rol se tocó: **solo se editó la matriz**, ninguna
  action cambió su `exigir()` ni `capacidades.ts`. Es un cambio **puramente aditivo**
  (ningún rol pierde nada). §4 regenerada con `scripts/gen-seccion4.mjs`; la §5 no se
  movió (`npm run gen:matriz -- --check` = 0). Validado con `tsc --noEmit`,
  `test-permisos.mjs`, `test-auditoria-permisos.mjs` y `next build`.
  **Consecuencia anotada (no descubrirla después):** directivo ya tenía
  `justificacion.resolver`; con `justificacion.solicitar` puede **solicitar y aprobar la
  misma justificación**. Es intencionado (supervisión global sin depender de
  asignaciones), no un efecto colateral.
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

> Reconciliado contra la base el **2026-09-16** con `scripts/diag-sql-aplicado.mjs`.
> Se retiraron 4 pendientes que ya estaban resueltos (el SQL de
> `grupo_materia_id`, las 9 FK, la atribución de profesor y «commitear»).
> De los 44 `.sql` del repo **solo 1 sigue sin aplicar**, y es un concepto
> abandonado: `agregar-periodo-vigente.sql` (`periodos.vigente`, sin uso en código).

1. **Ejecutar en el SQL Editor** (preparados, idempotentes, en este orden):
   - `supabase/crear-rpc-obtener-perfil-alumno.sql` — reemplaza la RPC con el
     filtro O-1 (`AND gm.grupo_id = v_grupo_id`). Sin él, cada materia del
     alumno devuelve una fila por ciclo y gana una al azar. Hoy no se nota
     (un solo ciclo); reaparece al crear 2027-2028.
   - `supabase/agregar-fk-calendario-periodo.sql` — última FK que faltaba
     (R5). La columna ya está poblada 77/77; el script reporta y aborta si
     encontrara huérfanos, nunca borra.
   - `supabase/agregar-indices-asistencia.sql` — único cuya aplicación no se
     puede verificar por PostgREST (los índices no salen en el spec). Con
     3 863 filas en `asistencia_alumnos` conviene confirmarlo a mano.
2. **Corregir las CLAVE duplicadas de `PROFESORES`.** La marca
   `debe_cambiar_credenciales=true` está puesta en 19 cuentas (PROMPT-5/A1);
   cada profesor la cambia al entrar (flujo A4). Medición 2026-09-16:
   **15 de 21 aún comparten clave**.
3. Rotar la contraseña de Supabase y eliminar cualquier copia en texto plano
   fuera del repo.
4. Decidir qué hacer con las **68 filas** de `asistencia_alumnos` sin
   `periodo_id` (de 3 863; fechas fuera del rango del operativo). Son
   históricas del clon; se conservan sin atribuir.
5. **Estrenar el traspaso de materia**: `asignaciones_profesor` sigue en **0
   filas**. La consola del técnico está lista y el Prompt D tiene 26 casos
   puros, pero nadie ha subido una plantilla todavía. Es el código sin
   estrenar de mayor riesgo del sistema.
6. PROMPT-4/T4: si el técnico deshace un paso sobre datos reales de un ciclo
   BORRADOR, hacerlo con la previsualización del panel.

Las 81 filas históricas de `clases_impartidas` con clave `4321` tienen **autoría
irrecuperable**: no se backfillea `profesor_id`, inventar la atribución sería peor.

## 7. Estructura del repositorio

Reorganizado el 2026-09-06. Dónde va cada cosa: `docs/normativo/ORDEN.md`.

```
app/      actions/ · components/ (paneles) · components/ui/ (primitivas) · components/oceano/ (shell Fase 1) · _borrador/
app/oceano/  previsualización del shell Océano (no sustituye a ninguna ruta viva)
lib/      escolar/<7 familias> + transversales en la raíz · auth/ · supabase/ · _borrador/
scripts/  vivos · _peligrosos/ (no ejecutar) · _archivo/ (no re-ejecutar)
docs/     normativo/ (obliga) · sistema/ (el presente) · historial/ (el pasado)
```

Red de pruebas al 2026-09-07: **36 suites** (30 + `test-permisos` y
`test-auditoria-permisos` del PROMPT-2 + `test-reactivacion-inscripciones`
del PROMPT-4/T1 + `test-borrar-paso` del PROMPT-4/T4), 0 fallos;
`npx tsc --noEmit` en 0 errores; `next build` completa con **9 rutas**.
`test-permisos.mjs` compara el código contra la §4 de
`docs/sistema/MATRIZ-PERMISOS.md` con los **5 roles** (475 checks).
Desde PROMPT-5/B6 hay un runner único (`npm run test:suites` →
`scripts/correr-todas-las-suites.mjs`) y un workflow de CI
(`.github/workflows/verificacion.yml`: tsc · compilar · 36 suites ·
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

**Rediseño Océano — Fase 1: tokens y shell único (2026-09-10).**
- **Tokens.** Los 17 `--oc-*` de `docs/sistema/TOKENS-OCEANO.css` entran en
  `app/globals.css` en un bloque **aditivo**: los `--app-bg-*` no se tocan (R8) y la
  fuente versionada sigue siendo ese archivo de `docs/` (no se importa ni se borra). Dos
  reglas que viajan con los tokens: `--oc-alert` es **solo punto** (2.24:1 sobre
  `--oc-surface`), el estado en texto usa `--oc-alert-text`; y los componentes referencian
  el **papel** (`var(--oc-surface)`), nunca el hex — un hex literal reabre la deuda D11.
- **Shell.** Un solo shell parametrizado por rol en `app/components/oceano/`
  (`shell-oceano.tsx` es el ÚNICO `"use client"`; nav-superior, sidebar, barra-modo y
  contenido-marcador son presentacionales) con los **tres niveles** del diseño: barra
  superior por rol (1), sidebar de apartados con el activo en **primera posición** y borde
  de 1 px (2) y barra de modo arriba a la derecha (3). **No consulta datos ni decide
  dominio**: pestañas, apartados, modos, apagados y orden salen del módulo puro
  `lib/navegacion/mapa-navegacion.ts`, que no se reescribió ni se duplicó. «Denegado por
  capacidad» no se dibuja: lo decide la **ausencia** en el mapa.
- **Ruta.** `/oceano` es **previsualización** y no sustituye a ninguna ruta viva (R8).
  `app/components/ui/barra-navegacion.tsx` gana una condición para no pintarse en
  `/oceano` y no apilar dos barras; en el resto de rutas el comportamiento es el de antes.
- **Validación.** `npx tsc --noEmit` = 0 · `node scripts/test-rediseno-oceano.mjs`
  **140/140** (sin modificarla) · `npm run test:suites` **36/36 en verde** · `next build` = 0
  (la ruta `/oceano` aparece en el build) · `node scripts/diag-restyle-oceano.mjs --fase=1`:
  `--oc-*` **0 → 93** y Fase 1 **11 claro / 0 oscuro → 11 claro / 93 oscuro**. El «claro» de
  la Fase 1 no baja porque sus 11 ocurrencias están todas en `app/page.tsx`
  (portada/login), que esta fase no puede reestructurar; queda anotado en
  `docs/sistema/MATRIZ-UX.md` §7 (su invariante).
- **Fase 1.1 (corrección visual, mismo día).** Cuatro divergencias de PRESENTACIÓN
  corregidas contra los PNG de Figma, sin tocar arquitectura, lógica ni datos: (1) la
  pestaña activa de la barra superior es **texto menta sin fondo** (era una píldora menta
  rellena, que hacía dominar el acento y le quitaba sitio al CTA primario); (2) el rail
  lateral queda **anclado al borde izquierdo (x=0) y a todo el alto** en vez de flotar
  indentado; (3) el chip de usuario pasa a **dos líneas** —nombre en `--oc-text` con peso
  fuerte y rol en `--oc-muted` menor— y pierde el `uppercase` que repetía el texto
  («PROFESOR PROFESOR»: `nombreProfesor()` devuelve el nombre crudo de la BD y el rol se
  forzaba a mayúsculas); (4) las pestañas se **reparten a lo ancho** de la barra con el
  chip al extremo derecho. Verificado contra el mapa: `/oceano` con sesión de alumno = 4
  pestañas y 6 apartados en Perfil; de profesor = 2 pestañas y 3 apartados en Materias.
- ~~**Pendiente (no se cierra aquí).** «Cerrar sesión» se dibuja **deshabilitado y con el
  motivo a la vista**: hoy **no existe ninguna acción de cierre de sesión** en el sistema
  (ni `actionCerrarSesion` ni route de logout) y esta fase no toca `app/actions/`.~~
  **SALDADO (2026-09-11), con autorización explícita del responsable.**
  `limpiarPortalSessionCookie()` en `lib/auth/session.ts` —al lado de su inverso, que es
  quien decide el nombre y el `path` de la cookie— y `actionCerrarSesion()` en
  `app/actions/login.ts`, que la borra y redirige a `/login`. El botón es un `<form>` con
  Server Action: la cookie es `httpOnly`, solo el servidor puede retirarla. **No llama a
  `exigir()`** y está declarado como excepción en `test-auditoria-permisos`: opera sobre la
  credencial de quien llama, no sobre datos de nadie, y exigir una capacidad dejaría
  encerrada a una sesión rota.

**Rediseño Océano — Fase 2: reubicar lo que ya funciona + restyle oscuro (2026-09-10).**
- **PASO 0 (layout del shell).** E1 — las pestañas del nivel 1 llevan **separación
  fija** con el grupo sin tocar el borde y el chip al extremo derecho (`ml-auto`); se
  retiró el `justify-between`, que con 2 pestañas (profesor) dejaba un hueco de ~1500 px.
  E2 — el **grupo de apartados del rail flota verticalmente centrado** (`lg:justify-center`
  en el aside; se centra el grupo, no cada ítem).
- **Piezas reubicadas en el shell** (`/oceano`), sin cambiar props ni contratos:
  `Materias › Calificación` ← `MateriaSelector` + `MateriaCalificacionesAlumno`;
  `Calendario › Horario escolar` ← `HorarioAlumnoResumen`;
  `Calendario › Calendario escolar` ← `CalendarioAsistenciaAlumno` (vista mensual);
  `Perfil › Información personal` ← `EtiquetasDinamicasPanel`;
  `Perfil › Estatus académico` ← `MateriaTablaVistaPanel` (lo que servían «Estatus» y
  «Boleta», con la fila del alumno destacada). La decisión hueco→pieza vive en el módulo
  puro **`lib/navegacion/contenido-alumno.ts`**; el shell solo pregunta por el hueco activo.
- **Datos**: `app/oceano/page.tsx` llama a **`actionObtenerPerfilAlumno`** —la MISMA
  Server Action que usa `/perfil`, no una consulta nueva— y **solo con sesión de alumno**
  (es la audiencia de esas piezas y el único rol que resuelve su perfil sin elegir alumno).
  Tutor/maestro/directivo necesitan selector de alumno: entran en su fase (4 y 5-6), y su
  hueco muestra el marcador con la nota «pieza reubicada, falta cableado de datos».
- **Restyle a tokens.** Los 6 componentes compartidos pasan de glass claro a Océano
  oscuro referenciando el **papel** (`var(--oc-surface)`, `--oc-input`, `--oc-text`,
  `--oc-muted`, `--oc-border`, `--oc-border-active`), el CTA primario a `--oc-mint` +
  `--oc-mint-ink`, y los estados al par `--oc-ok` / `--oc-alert` (fondo o borde) +
  `--oc-alert-text` (texto). Ningún hex literal nuevo.
- **Validación.** `npx tsc --noEmit` = 0 · `test-rediseno-oceano.mjs` **140/140** (sin
  modificarla) · `npm run test:suites` **36/36 en verde** · `next build` = 0 (con
  `/oceano`) · `diag-restyle-oceano.mjs`: Fase 2 **214 claro / 0 oscuro → 81 claro /
  222 oscuro** y total de claro **905 → 772**. **Es la primera fase donde el invariante se
  cumple entero: el claro BAJA (214→81) y `--oc-*` SUBE (0→222).** El claro de la Fase 1
  sigue en 11, como exige el prompt.
- **Pendiente de esta fase (decisiones, no olvidos).** (1) Los **81 claro** que quedan son
  todos de `app/perfil/perfil-client.tsx`, que esta fase **conserva a propósito** (R8: «no
  se borra en esta fase… su retiro es una decisión posterior y explícita»): restylearlo
  sería trabajo que se tira al retirarlo, y sus piezas ya son oscuras. (2)
  `Perfil › Notificaciones` (comentarios + justificaciones) y `Calendario › Asistencia`
  quedan con marcador: componen dos fuentes y son **contenido nuevo** (Fase 3), no
  reubicación.

**Rediseño Océano — Fase 3: contenido nuevo, cero Supabase (2026-09-10).**
- **A · Seguimiento médico e Información personal.** Los dos apartados renderizan su
  grupo de campos **estructurados** con `camposDeGrupo("personal"|"medico")` del módulo
  puro `lib/escolar/alumno/grupos-campos-personales.ts` y las etiquetas amigables de
  `informacion-personal.ts`. **No hay ninguna condición de dominio en el componente**: qué
  campo es médico lo decide el módulo. `CAMPOS_PERSONALES_PRIMARIOS` no se tocó.
- **B · Seguimiento semestral.** Lista de solo lectura de las materias, sobre el array
  `materias` que ya venía cargado. Sin consulta y sin interacción.
- **C · Asistencia › Datos crudos.** La tabla y el desglose salen del módulo puro
  `lib/escolar/asistencia/asistencia-tabular.ts` (`vistaTabularAsistencia` +
  `detallePorParcial`): el porcentaje global se recalcula desde los conteos (no se
  promedian porcentajes) y un parcial sin clases registradas muestra guion. **El
  componente no calcula nada.**
- **D · Notificaciones.** Una sola lista con **comentarios + justificaciones**. La
  decisión «qué entra y en qué orden» vive en el módulo puro nuevo
  `lib/navegacion/notificaciones-alumno.ts` (fecha descendente · lo pendiente primero ·
  sin fecha al final · desempate estable), con **29 pruebas nuevas** en
  `scripts/test-rediseno-oceano.mjs` (140 → **169**). El aviso destacado usa `--oc-alert`
  como punto y `--oc-alert-text` para el estado escrito.
- **E · Asistencia › sub-vistas.** «Calendario visual» reutiliza el MISMO
  `CalendarioAsistenciaAlumno`; «Datos crudos» es C. Las dos son excluyentes y comparten la
  **misma** `actionObtenerEstadosAsistenciaAlumno`: no hay segunda vía de asistencia (R6).
- **Lecturas.** Cero consultas nuevas: los comentarios ya vienen en
  `actionObtenerPerfilAlumno`; las justificaciones, de `actionObtenerJustificacionesDeAlumno`
  (la que ya usaba el calendario). `app/actions/` no ganó una línea.
- **Seguridad.** Para una sesión de **alumno**, `resolverAccesoAlumno` devuelve
  `puedeEditarEtiquetas/puedeEditarDatosPersonales/puedeSubirFoto = false` (solo lectura)
  y la CURP solo puede ser la suya. Los campos médicos se muestran por la misma vía que ya
  los mostraba `/perfil`: **no se amplió la visibilidad a ningún rol**.
- **Validación.** `npx tsc --noEmit` = 0 · `test-rediseno-oceano.mjs` **169/169** ·
  `npm run test:suites` **36/36 en verde** · `next build` = 0 (con `/oceano`) ·
  `diag-restyle-oceano.mjs`: claro **772 → 772** (sin cambios, como exige la fase), oscuro
  **326 → 359**, avance 30 % → 32 %; Fase 1 sigue en 11 y **Fase 2 sigue en 81**.

**Rediseño Océano — Fase 3.1: cierre del alumno (2026-09-10).**
- **Mapa (una línea).** `act("asistencia", "Asistencia")` pierde sus dos modos: el apartado
  es la **tabla de datos crudos** y el calendario visual vive, **único**, en «Calendario
  escolar». Era un error del mapa (dos entradas a la misma vista), no del cableado. La
  aserción de la suite que refleja el estado nuevo (`modos === []`) es lo único que se
  actualizó allí: **170/170**.
- **Shell.** `lib/navegacion/contenido-alumno.ts` renombra la pieza
  `asistencia-subvistas` → `asistencia-tabular` y `contenido-alumno-oceano.tsx` pierde la
  rama que montaba «Calendario visual» (ya no hay modos que elegir).
- **Los cuatro datos** de `Perfil › Información personal`, todos del payload de la MISMA
  acción (cero consultas nuevas, cero actions nuevas): **foto de perfil** (con marcador
  explícito si no hay URL o la imagen no carga), **identidad** —CLAVE y CURP, solo
  lectura—, **contacto del tutor** (nombre, teléfono, correo; si no hay vínculo lo dice con
  una frase) y **comentario personal** del alumno, solo lectura.
- **Validación.** `npx tsc --noEmit` = 0 · `test-rediseno-oceano.mjs` **170/170** ·
  `npm run test:suites` **36/36 en verde** · `next build` = 0 (con `/oceano`) ·
  `diag-restyle-oceano.mjs`: **claro 772 → 772** y **Fase 2 81 → 81** (no se movieron,
  como exige la fase), oscuro 359 → 370.
- **Consecuencia:** la lista de «cosas que `/perfil` hace para un alumno y `/oceano` no» ya
  está **vacía**. `/perfil` sigue en pie y sin restylear (sus 81 claro): su retiro es un
  cambio propio y posterior (Fase 9), y ya no hay pérdida que lo justifique.

**Rediseño Océano — Fase 4: shell del tutor (2026-09-10).**
- **PASO 0 — hueco de alcance CERRADO (antes de tocar interfaz).**
  `actionObtenerVistaMateria` exigía `calificacion.ver` (que el tutor tiene) pero solo filtraba
  por fila al **alumno**: un tutor caía al camino de vista COMPLETA y recibía las
  calificaciones de **todo el grupo**. Ahora recibe un `curpConsulta` opcional y, si la sesión
  es de tutor, valida la relación contra `listarCurpsDeTutor` y devuelve **solo la fila de ese
  alumno** (mismo criterio CURP + nombre normalizado que el alumno, reutilizando
  `leerVistaMateriaAlumno`/`buscarIndiceFilaAlumno`). Un CURP ajeno se **niega**. Mismo patrón
  que `actionObtenerHorarioAlumno`. **La matriz no se tocó**: `test-permisos` sigue 475/0.
- **PASO 1 — selector de alumno vinculado** (`selector-alumno-oceano.tsx`), en el sidebar por
  encima de los apartados. Cambiar de alumno es una **navegación** (`?alumno=CURP`) y el
  servidor trae sus datos; la pestaña y el apartado activos se conservan (estado del shell).
  Con un solo alumno se elige solo; sin ninguno lo dice con una frase. La lista la resuelve el
  servidor (`actionListarAlumnosDelTutor`), **una vez por navegación**: la UI no decide sobre
  qué alumno se puede consultar.
- **PASO 2 — datos cableados** sin duplicar nada: las piezas del alumno reciben el `curp` del
  alumno elegido (no el de la sesión) y el rol **no entra en el JSX**. Los flags de edición
  vienen de la action: para el tutor `puedeEditarDatosPersonales`/`puedeEditarEtiquetas` son
  `true`, así que **Información personal** y **Seguimiento médico** editan por grupo (el
  guardado envía solo las claves de su grupo: `patchCamposPersonales` no toca las demás) y el
  panel de etiquetas queda editable. La opción «permitir justificación» del calendario se
  declara **en el hueco** (`opcionesDePieza`), no por rol.
- **Validación.** `npx tsc --noEmit` = 0 · `test-permisos.mjs` **475/0** y
  `test-auditoria-permisos.mjs` **229/0** (sin modificar) · `test-rediseno-oceano.mjs`
  **180/180** (se amplió con el criterio de fila: +10) · `test:suites` **36/36** · `next build`
  = 0 · `diag-restyle-oceano.mjs`: claro **772 → 772** y Fase 4 **51 → 51** (no se movieron),
  oscuro 370 → 392. Prueba de alcance: `scripts/diag-alcance-tutor.mjs` (ver informe).
- **Nota:** se amplió la suite pura (`test-rediseno-oceano.mjs`) con `buscar-en-filas` porque
  ese módulo pasó a formar parte del **camino de seguridad** del PASO 0; el prompt lo autoriza
  cuando el PASO 0 añade/usa módulo puro.

**Rediseño Océano — Fase 4.1: alcance de `actionObtenerVistaRegistro` (2026-09-10).**
- **El segundo hueco de alcance, hermano del de la Fase 4.** `actionObtenerVistaRegistro`
  exigía `calificacion.ver` —capacidad que tienen **alumno, tutor, maestro y directivo**— y
  devolvía la **tabla COMPLETA** del grupo (`obtenerVistaMateria`, lectura cruda), sin ninguna
  guarda de alcance: **un alumno podía recibir las calificaciones de sus compañeros**.
- **Arreglo:** se NIEGA a quien no sea directivo ni maestro
  (`!esRol(sesion.rol,"directivo") && !esRol(sesion.rol,"maestro")`), el mismo patrón de
  `actionObtenerHorarioAlumno`. **No** se filtra por fila a propósito: ningún flujo legítimo de
  alumno ni de tutor pasa por aquí (hoy solo la llama `directivo-client`), así que ese filtrado
  sería código muerto.
- **La capacidad no cambia** (`calificacion.ver`): esto es ALCANCE, no permiso. `permisos.ts` y
  `capacidades.ts` intactos; `test-permisos` **475/0** y `gen:matriz -- --check` **«Al día»**
  (la §5 no se mueve).
- **Roles que PIERDEN acceso: `alumno` y `tutor`** (un acceso que nunca debieron tener).
  **Ninguno gana nada**: maestro y directivo siguen exactamente igual y técnico ya estaba
  negado por `exigir()`. **Este cambio NO es aditivo, y es intencionado** —autorizado
  explícitamente en su prompt—.
- **Validación:** `tsc` = 0 · `test-permisos` 475/0 · `test-auditoria-permisos` 229/0 ·
  `gen:matriz --check` «Al día» · `test-rediseno-oceano` **180/180** · `test:suites` **36/36** ·
  `next build` = 0 · diag **idéntico** (772 claro / 392 oscuro: la fase no toca interfaz).

## 8. Cómo se valida un cambio

```bash
npx tsc --noEmit
npm run build
node scripts/<la suite pura del módulo>.mjs   # ver scripts/README.md
```

Si tocaste un módulo puro, antes de la suite: `npm run test:compilar`.

Checklist completo de aceptación: `docs/normativo/CONTRATO-DE-CAMBIO.md`.
