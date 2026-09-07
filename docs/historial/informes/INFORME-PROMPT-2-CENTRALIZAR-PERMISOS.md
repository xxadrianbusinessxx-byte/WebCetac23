# INFORME — PROMPT-2: Centralización de permisos

- **Fecha de ejecución:** 2026-09-06
- **Prompt:** `docs/historial/prompts/PROMPT-2-CENTRALIZAR-PERMISOS.md`
- **Estado:** ejecutado T1–T5. Puntos de parada humanos resueltos: resolución de las 13
  capacidades (T2) aprobada; T4 resuelto cableando `calificaciones.ts`.
- **Regla de oro:** comportamiento neutro. La matriz de DESTINO de la §4 (con el rol
  técnico) NO se implementó: sigue intacta para el prompt 3.

---

## 1. Medición previa (§4 del prompt) — pegada

```
node scripts/gen-matriz-permisos.mjs --check  → "Al día."
npx tsc --noEmit                             → 0 errores
npm run test:compilar                        → 13/13
node scripts/test-auditoria-ciclo-f0.mjs     → FASE 0 AUDITORIA: 29 pasadas, 0 fallidas

Server Actions exportadas: 138
Comprobaciones de rol (rol !==/===) en app+lib: 130 (el prompt contaba 182 con variantes)
obtenerSesionPortal() en actions: 145
```

## 2. Medición posterior (contrato §7.6)

```
node scripts/gen-matriz-permisos.mjs --check  → "Al día." (inventario regenerado: 137 actions)
npx tsc --noEmit                             → 0 errores
npm run test:compilar                        → 13/13
Las 32 suites (30 + test-permisos + test-auditoria-permisos) → 0 fallos
next build                                   → 9 rutas

Server Actions exportadas: 137   (era 138: se borró actionListarMateriasSupabase)
Llamadas a exigir() en actions:  132 directas + 4 vía helper autorizarEscrituraEtiquetas
                                 + 2 públicas por diseño (portada.ver)
obtenerSesionPortal() en actions: 0
rol !== / rol === en app/actions: 0   (antes: 130)
```

### 2.1 Archivos tocados y por qué

| Archivo | Qué cambió |
|---|---|
| `lib/auth/capacidades.ts` (nuevo) | Lista cerrada de capacidades como `union type` (59 de §5 + 3 de las divisiones T2). |
| `lib/auth/permisos.ts` (nuevo) | Módulo puro sin I/O: matriz HOY `rol → capacidades` + `puede()`, `rolesDe()`, `matrizHoy()`, `esRol()`. |
| `lib/auth/exigir.ts` (nuevo) | Capa con I/O: cookie firmada + `puede()` + error estándar. Único sitio donde las actions piden autorización. |
| 22 archivos de `app/actions/` | Todas las Server Actions migradas de `rol !==/===` a `exigir("capacidad")`; ramas de alcance (SOBRE QUIÉN) conservadas tras `exigir()` vía `esRol()`/`accesoAlumno`. |
| `app/actions/calificaciones.ts` | T4: dejó de leer `rol` del FormData; rol SOLO de la cookie. |
| `app/actions/tablas.ts` | Se borró `actionListarMateriasSupabase` (sin consumidor); `actionListarRegistrosSupabase` cableada con `calificacion.ver`. |
| `scripts/test-permisos.mjs` (nuevo) | Pruebas puras de `puede()` + comparación matriz código ⇄ §5. |
| `scripts/test-auditoria-permisos.mjs` (nuevo) | Detector de regresión T5. |
| `scripts/gen-matriz-permisos.mjs` | Entiende `exigir("cap")` como guardia HOY y reasigna la capacidad desde `exigir()`. |
| `scripts/test-auditoria-ciclo-f8.mjs` | La regresión F8 acepta `exigir("ciclo.activar")` como la autorización de directivo que antes buscaba como `rol !==`. |
| `docs/sistema/MATRIZ-PERMISOS.md` | Cabecera + §4 anotada (destino intacto) + §5 regenerada + §6.1 resuelta + §6.3 nueva (resolución T2). |
| `ESTADO-ACTUAL.md`, `scripts/README.md`, `docs/normativo/ORDEN.md` §2 | Estado, filas de suites y «toda action empieza por exigir()». |
| `docs/historial/informes/INFORME-PROMPT-2-CENTRALIZAR-PERMISOS.md` (este) | Informe. |


## 3. La resolución de las 13 capacidades (T2) — lo que el prompt 3 necesita leer

Decisión por capacidad, aprobada por el directivo antes de escribir código. «Salida» =
quién tiene la capacidad en la matriz HOY (`lib/auth/permisos.ts`).

| # | Capacidad | Decisión | Salida | Motivo |
|---|---|---|---|---|
| 1 | `alumno.ver_perfil` | **UNIÓN** → sesión + `accesoAlumno` | D·M·T·A | 2 SIN SESION corregidos (buscador y resumen); su única UI es el directivo; `accesoAlumno` acota sobre quién. |
| 2 | `alumno.editar_etiquetas` | **UNIÓN** → `accesoAlumno` | D·T | La SIN SESION delega en función guardada; exigir la hace explícita. |
| 3 | `asistencia.ver_alumno` | **UNIÓN** + alcance por rol | D·M·T·A | El código ya ramifica alumno(propia)/tutor(vinculados)/maestro(su aporte)/directivo(todo). |
| 4 | `calificacion.ver` | **CORRECCIÓN** (sin ampliar) | D·M·A | Vista completa solo donde la UI la usa (directivo/maestro); alumno solo su fila. |
| 5 | `calificacion.subir` | **UNIÓN** | D·M | El maestro ya sube materias; el registro final sigue en `actionSubirRegistroExcel` (D). |
| 6 | `ciclo.ver` | **DIVISIÓN** | ver → D·M·T·A; nuevo `ciclo.ver_contexto` (D); nuevo `ciclo.ver_operativo` (D·M) | Si se unía a «todos», contexto/admin (hoy D) se abría a tutor/alumno → se divide. |
| 7 | `documento.ver` | **UNIÓN** + `nivelAccesoProfesor` | D·M | `esDirectivo` helper local eliminado a favor de `puede()`; alcance por carpeta ortogonal se conserva. |
| 8 | `horario.importar` | **DIVISIÓN** | `horario.importar` (D) + nuevo `horario.descargar_plantilla` (D·M) | Ejemplo del propio prompt: importar ≠ descargar plantilla. |
| 9 | `justificacion.solicitar` | **UNIÓN** + alcance por CURP | D·M·T·A | Cada rol conserva su restricción de alcance dentro de la action. |
| 10 | `justificacion.ver_propias` | **UNIÓN** + alcance por CURP | D·M·T·A | `sesionAutorizaCurp`/`leerJustificacionAutorizada` acotan sobre quién. |
| 11 | `materia.ver_catalogo` | **UNIÓN** | D·M | Catálogo que ambos ya ven en sus paneles. |
| 12 | `materia.mapear_columnas` | **CORRECCIÓN** | D·M | La lectura SIN SESION es previa al guardado del mismo componente (que ya exige sesión). |
| 13 | `tutor.ver_propio` | **UNIÓN** | D·T | Directivo administra (detalle por id); tutor solo su propia matrícula (alcance en la action). |

**Casos donde la UNIÓN habría ampliado (reportados, se eligió otra vía):** `ciclo.ver`
(unir a «todos» abriría contexto/admin a tutor/alumno → división en 3),
`horario.importar` (unir daría importar al maestro → división),
`calificacion.ver` (unir daría la vista completa a cualquier sesión → corrección).

**Capacidades nuevas creadas por las divisiones (3):** `ciclo.ver_contexto` (D),
`ciclo.ver_operativo` (D·M), `horario.descargar_plantilla` (D·M). Entran en
`capacidades.ts`, en la §5 (regenerada) y están anotadas en la §4/§6.3 del MATRIZ.

## 4. Decisiones anexas declaradas (excepciones del detector)

1. **Públicas por diseño (portada, antes del login):** `actionAlumnosEstrella` y
   `actionObtenerNoticiasInicio` no llaman a `exigir()`; capacidad `portada.ver`.
2. **Delegación verificada:** las 4 acciones de `etiquetas-dinamicas` que editan
   etiquetas delegan en el helper `autorizarEscrituraEtiquetas`, que SÍ llama a
   `exigir("alumno.editar_etiquetas")` + `resolverAccesoAlumno`.
3. **Alcance (no guardia):** `resolverAccesoAlumno`, `nivelAccesoProfesor` y
   `lib/auth/session.ts` conservan comparaciones de rol porque dicen SOBRE QUIÉN (o
   validan la cookie), no QUÉ puede un rol (regla 5 del MATRIZ). El detector vigila
   `app/actions/**`.

## 5. Qué NO se tocó pudiendo tocarse

- La **matriz de destino de la §4** (con `técnico` y recortes de directivo): intacta.
  Es el prompt 3, en un cambio atómico con el alta del rol.
- `accesoAlumno` y `nivelAccesoProfesor`: tal cual (ortogonales).
- La UI (no se ocultó ningún botón por capacidad): prompt 3, con el rol ya existente.
- Los `.from()` de las actions (C1) y la separación puro/IO (C2): prompt 5.
- `chat.ts`: el chat ya estaba retirado en `_borrador/` antes del prompt 2.

## 6. Validación completa

```text
npx tsc --noEmit                       → 0 errores
npm run test:compilar                  → 13/13
node scripts/test-permisos.mjs         → 155 pasadas, 0 fallidas
node scripts/test-auditoria-permisos.mjs → 137 actions auditadas, 0 fallidas
node scripts/gen-matriz-permisos.mjs --check → "Al día."
32 suites completas                    → 0 fallos
next build                             → 9 rutas
```

> Nota sobre las cifras de `test-permisos.mjs`: la fase de decisión (T1/T2, contra la §5
> con guardias `solo X`) cerró con 308 aserciones, 0 fallidas. Al regenerar la §5 al
> final (con `exigir: capacidad` como guardia HOY), las filas ya no dicen `solo X`, así
> que la verificación de regla de oro por-fila se reduce a las 155 aserciones restantes
> (matriz ⇄ capacidades ⇄ §5) — ambas pasan en verde.
