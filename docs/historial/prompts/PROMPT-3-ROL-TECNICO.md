# PROMPT 3 — Rol técnico

> Estado: **ejecutado (2026-09-06).** Tercero de cinco. Cubre los pasos 6 y 7 del plan
> de roles, más A2 (asignaciones profesor→materia) y A4 (cambio forzado de clave).
> Es el **primero que cambia comportamiento**: los prompts 1 y 2 no movieron un permiso.
> Resumen: `docs/historial/informes/INFORME-PROMPT-3-ROL-TECNICO.md`.

---

## 1. OBJETIVO

Crear el rol **técnico** y repartirle las capacidades que hoy tiene directivo, de forma
que al terminar:

1. Existe un usuario que entra con `Permisos = 'Tecnico'` y ve su propia consola.
2. Ese usuario **puede asignar materias a profesores** desde la web — hoy
   `asignaciones_profesor` tiene 4 filas y **0 activas** en el ciclo operativo, y sin
   eso la atribución de asistencia no tiene de dónde resolver quién imparte qué (A2).
3. Un profesor **cambia su clave en el primer acceso** y deja de compartirla: hoy 20
   profesores tienen **3 claves distintas**; 16 comparten una (A4).
4. Directivo ya no puede configurar el ciclo, el catálogo ni los tutores.
5. La UI decide qué pinta con `puede()`, no con el rol.

## 2. EL ORDEN IMPORTA — riesgo operativo

> **Crear el técnico y comprobar que entra ANTES de recortar a directivo.**

Si se aplica primero el recorte y todavía no hay ninguna cuenta con
`Permisos = 'Tecnico'`, **nadie** puede crear ciclo, cargar roster ni asignar materias:
el sistema se queda sin administrador funcional. Directivo ya no puede y el técnico no
existe.

Este prompt está ordenado para que eso no ocurra: T1→T4 **no quitan nada a nadie**; el
recorte es T5, y su primer paso es verificar que el técnico ya entra.

## 3. CONTEXTO — leer solo esto

- `AGENTS.md` · `ESTADO-ACTUAL.md`
- **`docs/sistema/MATRIZ-PERMISOS.md`** — la §4 es ahora **la especificación a implementar**
- `docs/historial/informes/INFORME-PROMPT-2-CENTRALIZAR-PERMISOS.md` — la tabla de las 13 capacidades y su resolución
- `docs/normativo/GLOSARIO.md` — `PROFESORES.ID` vs `CLAVE`
- `docs/normativo/ORDEN.md` §1 y §2
- `scripts/README.md`

## 4. MEDICIÓN PREVIA

```bash
node scripts/test-permisos.mjs
node scripts/test-auditoria-permisos.mjs
node scripts/gen-matriz-permisos.mjs --check
node scripts/p0-diag-contexto.mjs
node scripts/diag-profesor-alcance.mjs
```

Línea base al 2026-09-06:

| Medida | Valor |
|---|---|
| Roles | 4 · capacidades **62** · actions **137** |
| Capacidades por rol | directivo 61 · maestro 25 · tutor 13 · alumno 9 |
| `asignaciones_profesor` | **4 filas**, **0 activas** en el ciclo operativo |
| `PROFESORES` | 20 profesores, **3 claves distintas** (16 comparten una) |
| Literales de rol fuera de `permisos.ts` | 6 en UI/página + 4 legítimos en `lib/` |

---

## 5. TAREAS

### T1 · El rol existe (sin darle nada todavía)

1. `"tecnico"` a `PortalRole` en `lib/auth/types.ts`.
2. `rolDesdePermisos()` en `lib/auth/portal-login.ts` reconoce `Permisos = 'Tecnico'`.
   **Es una fila normal de `PROFESORES`**: hereda la identidad estructural
   (`PROFESORES.ID` → `profesorId` en la sesión), el login y el cambio forzado de clave.
   No se crea un segundo camino de autenticación (R6).
3. Fila `tecnico` en la matriz de `lib/auth/permisos.ts`, **con las capacidades que la
   §4 le asigna**. Nadie pierde nada todavía: solo se añade un rol.
4. `test-permisos.mjs` cubre el rol nuevo y sigue comparando código contra §4.

**Al terminar T1:** un técnico puede entrar y usar sus pantallas; directivo conserva
todo. Los dos pueden, a propósito, durante T1–T4.

### T2 · La UI decide por capacidad

Los 6 archivos que aún preguntan por el rol. Sustituir el literal por `puede()`, **la
misma función que usa el servidor** (regla 4 de MATRIZ-PERMISOS: un botón visible que
el servidor rechaza es un bug de la matriz, no de la UI).

| Archivo | Qué decide hoy por rol |
|---|---|
| `app/components/ui/barra-navegacion.tsx` | qué entradas de menú se pintan |
| `app/layout.tsx` | montaje según rol |
| `app/configuracion/page.tsx` | `redirect("/perfil")` si no es directivo |
| `app/documentos/page.tsx` · `documentos-client.tsx` | acceso a documentos |
| `app/tutor/page.tsx` | acceso del tutor |

**No tocar** los 4 de `lib/` (`session.ts`, `demo-profiles.ts`, `acceso-alumno.ts`,
`columnas-calificaciones.ts`): codifican la sesión o resuelven *alcance sobre quién*,
ortogonal a las capacidades (regla 5).

`/configuracion` deja de ser «la ruta del directivo» y pasa a ser **la ruta de quien
tenga las capacidades de configuración**. Durante T2 eso son los dos.

### T3 · Consola del técnico — asignaciones profesor→materia (A2)

La capacidad central del rol, y la que desbloquea la atribución de asistencia.

1. `AsignacionesProfesorAdmin` (hoy en `/configuracion`) se gobierna por
   `asignacion.ver` / `asignacion.editar`.
2. La UI debe permitir **asignar cómodamente en volumen**: 20 profesores × 24 grupos ×
   241 materias activas, hoy con 0 asignaciones. Una fila por vez no es usable. Buscador
   por profesor y por materia, y alta en lote por grupo.
3. **La identidad es `PROFESORES.ID`**, nunca `CLAVE` (16 comparten `4321`).
   `asignaciones_profesor` ya tiene `profesor_id`; `profesor_clave` queda legacy y no
   se escribe.
4. Las actions ya existen (`actionCrearAsignacionProfesor`,
   `actionDesactivarAsignacionProfesor`, `actionListarAsignacionesProfesorAdmin`,
   y las dos de listado). Ya llevan `exigir()` del prompt 2: **no reescribirlas**, solo
   consumirlas.

**Validación:** `p0-diag-contexto.mjs` debe mostrar `asignacionesActivas > 0` en el
ciclo operativo. Es la primera vez en todo el proyecto.

### T4 · Credenciales de profesor (A4)

La infraestructura ya existe: `debeCambiarCredenciales` viaja en la sesión y
`supabase/agregar-debe-cambiar-credenciales-profesores.sql` está aplicado.

1. **Cambio forzado en el primer acceso.** Si `debeCambiarCredenciales`, el profesor no
   puede usar el portal hasta cambiar su clave. Usa `profesor.cambiar_clave_propia`,
   que la §4 concede a **todos los roles**: es autoservicio, no administración.
2. **El técnico repone claves de acceso perdidas** con
   `profesor.ver_credenciales_acceso`. La frontera, que hay que respetar literalmente:
   ve y regenera la **clave de inicio de sesión**; **nunca** `PROFESORES.ID` ni
   credenciales de Supabase. Es técnico de la web, no de la base.
3. `profesor.forzar_cambio_clave` permite marcar a un profesor para que la cambie.

**No** se hace una migración masiva de claves: cada profesor la cambia al entrar. Las
81 filas históricas de `clases_impartidas` con clave `4321` siguen con autoría
irrecuperable y **no se backfillean** (inventar la atribución sería peor).

### T5 · El recorte a directivo — el único paso que quita algo

**No empezar sin haber comprobado que un técnico real entra y usa T3.**

1. Aplicar la §4 completa a `permisos.ts`: directivo pierde configuración de ciclo,
   catálogo de materias (editar/activar), asignaciones, roster, tutores y calendario.
2. **Conserva `materia.ver_catalogo` y `semestre.ver`**: sus paneles de `/directivo` le
   quedan en solo lectura. Decisión consciente, anotada en §4.
3. **`ciclo.ver_operativo` NO se mueve.** Directivo y maestro la conservan: de ella
   depende `actionObtenerCicloActual` y con eso toda la subida de asistencia. Si al
   terminar un maestro no puede subir asistencia, esto es lo primero que hay que mirar.
4. Regenerar `gen:matriz` y que `test-permisos.mjs` confirme código = §4.

**Prueba de humo obligatoria, rol por rol, antes de dar por terminado:**

| Rol | Debe poder | No debe poder |
|---|---|---|
| técnico | crear ciclo · cargar roster · asignar materias · editar catálogo · tutores · reponer claves | ver calificaciones |
| directivo | justificaciones · asistencia · calificaciones · documentos · ver catálogo (lectura) | configurar ciclo · asignar materias · crear tutores |
| maestro | subir asistencia · mapear columnas · su materia · **saber el ciclo operativo** | configuración |
| tutor | sus alumnos · solicitar justificación · su clave | todo lo demás |
| alumno | su perfil · sus calificaciones · su asistencia · justificar | todo lo demás |

---

## 6. ALCANCE

**SÍ:** `lib/auth/types.ts` · `portal-login.ts` · `permisos.ts` · los 6 archivos de UI ·
`asignaciones-admin.tsx` y su UI de volumen · el flujo de cambio de clave ·
`profesores-credenciales-panel.tsx` · las suites de permisos.

**NO:**

- Sacar los `.from()` de las actions (C1), separar puro/IO (C2), resolver `_borrador/` y
  las ~20 actions huérfanas (C5), CI (D2) → **prompt 5**
- Ampliar el configurador de ciclo (borrar datos, aliases, roster) → **prompt 4**
- Tocar el esquema: este prompt no lleva ningún `.sql`
- Migración masiva de claves de profesor

**NUNCA:** identificar un profesor por `CLAVE` · dar al técnico acceso a
`PROFESORES.ID` ni a credenciales de Supabase · recortar a directivo antes de T5 ·
mover `ciclo.ver_operativo`.

---

## 7. CONTRATO

```
1. Antes de tocar nada: correr la medición de §4 y pegarla.
2. La decisión va en un módulo puro: permisos.ts sigue siendo puro y sin I/O.
   La UI y el servidor usan la MISMA función puede().
3. Cambio aditivo hasta T4 inclusive. T5 es el único que quita permisos, y va
   después de comprobar que el técnico entra y funciona.
4. No crear un camino paralelo: el técnico es una fila de PROFESORES con
   Permisos='Tecnico', no una tabla nueva ni un login aparte.
5. Validar: npx tsc --noEmit + npm run test:compilar + las 32 suites + next build.
6. Volver a correr la medición del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

**Puntos de parada obligatorios:**

- **Antes de T5**, con el técnico ya funcionando: confirmar que se aplica el recorte.
- Si la prueba de humo de §5/T5 falla en cualquier fila.
- Si hace falta tocar algo fuera del alcance de §6.

## 8. ENTREGABLES

- El rol en `types.ts`, `portal-login.ts` y `permisos.ts`
- Los 6 archivos de UI gobernados por `puede()`
- UI de asignación en volumen · flujo de cambio forzado de clave · reposición de claves
- `docs/sistema/MATRIZ-PERMISOS.md` §3 (alcance por rol) y §5 regeneradas
- `ESTADO-ACTUAL.md`: A2 y A4 cierran; el rol técnico entra en §1
- `docs/normativo/GLOSARIO.md`: entrada del rol técnico y su frontera de credenciales
- Informe en `docs/historial/informes/INFORME-PROMPT-3-ROL-TECNICO.md`, con la prueba
  de humo rol por rol

## 9. Criterio de terminado

1. Un usuario con `Permisos = 'Tecnico'` entra, ve su consola y asigna materias.
2. `p0-diag-contexto.mjs` muestra **`asignacionesActivas > 0`** en el ciclo operativo.
3. Un profesor con `debeCambiarCredenciales` no puede usar el portal sin cambiar su clave.
4. `test-permisos.mjs` confirma que `permisos.ts` = §4, con los 5 roles.
5. `test-auditoria-permisos.mjs`, las 32 suites y `next build` (9 rutas) pasan.
6. La prueba de humo de §5/T5 pasa en las cinco filas.
