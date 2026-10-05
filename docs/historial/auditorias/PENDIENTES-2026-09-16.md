# Pendientes reales — 2026-09-16

> Medido contra `c47c040` y contra Supabase real. Reconcilia lo que **dicen**
> nuestros documentos contra lo que **está** en la base.
> Reproducible: `scripts/diag-sql-aplicado.mjs` (nuevo), `diag-relaciones-supabase.mjs`,
> `diag-profesor-alcance.mjs`, `diag-materias-alumno.mjs`.

## Resumen en una línea

En 8 días entraron **29 commits, todos del rediseño Océano**. La salud del
sistema se mantuvo (36/36 suites, `tsc` limpio), pero **ninguno de los 7 puntos
de optimización del 09-08 se movió**, y los documentos acumularon **4 pendientes
que ya estaban resueltos**.

---

## 1 · Optimización: cero movimiento en 8 días

| # | Punto (eval. 09-08) | Estado hoy | Medición |
|---|---|---|---|
| 1 | O-1: RPC sin acotar por grupo | ❌ igual | `crear-rpc-obtener-perfil-alumno.sql:208` sigue sin `AND gm.grupo_id = v_grupo_id` |
| 2 | Lint + lint en CI | ❌ **peor** | 140 → **151 errores**; el CI sigue con 0 pasos de lint |
| 3 | FK `calendario_escolar.periodo_id` | ❌ igual | `calendario_escolar`: **0 FK** |
| 4 | Estrenar el traspaso | ❌ igual | `asignaciones_profesor`: **0 filas** |
| 5 | Re-medir rendimiento | ❌ **más urgente** | +29 commits de UI encima de cifras de la FASE 10 |
| 6 | Contraseñas de PROFESORES | ⏳ a medias | 19 marcados con `debe_cambiar_credenciales`; **15 de 21 aún comparten clave** |
| 7 | Partir archivos >1 000 líneas | ❌ **peor** | eran 4, ahora son **6** (`escolar.ts` pasó de 962 a 1 035) |

Ninguno es culpa del rediseño: son items que nadie retomó. Pero dos **empeoraron
solos** (lint y archivos grandes), que es lo que pasa cuando una métrica no está
en el CI.

### El que sigue doliendo: O-1

Sigue siendo **una línea**. Y sigue siendo invisible: al haber un solo ciclo, el
sobrecoste es ×1 y no se nota. Vuelve, multiplicado, el día que se cree el ciclo
**2027-2028**. Un bug latente que se esconde solo es peor que uno visible.

### El que se volvió más urgente: re-medir

`docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md` tiene cifras reales
(bundle por ruta, 1 000 concurrentes, p50/p95) de la FASE 10. Desde entonces:
reorganización completa del repo, 9 FK nuevas, modelo de asistencia por materia,
y **ahora un rediseño visual de los 5 roles con shell y tokens nuevos**.
Ninguna cifra se ha vuelto a tomar. §16 dice medir antes de optimizar —
hoy se optimizaría a ciegas sobre un frontend que cambió entero.

Dato que refuerza la urgencia: `asistencia_alumnos` pasó de ~1 000 filas a
**3 863**. Es la tabla que más crece y la que alimenta las vistas de alumno,
tutor y profesor.

---

## 2 · Pendientes declarados que YA están resueltos

`ESTADO-ACTUAL.md` §6 lista 8 pendientes humanos. **Cuatro ya no lo son:**

| Pendiente declarado | Realidad medida |
|---|---|
| Ejecutar `agregar-grupo-materia-justificaciones.sql` | `justificaciones_asistencia.grupo_materia_id` **existe** |
| Ejecutar `agregar-fk-asistencia.sql` | las 9 FK **existen**, 0 huérfanos (el script es idempotente: no hace daño, pero no urge) |
| Ejecutar `agregar-atribucion-profesor-asistencia.sql` | `clases_impartidas.grupo_materia_id` y `asistencia_alumnos.profesor_id` **existen** |
| «Commitear los cambios de PROMPT-1 a PROMPT-5» | árbol **limpio**, 29 commits después |

Esto no es cosmético: un pendiente falso cuesta lo mismo de leer que uno real, y
entrena a ignorar la lista. De los 44 `.sql` del repo, **solo 1 está preparado y
sin aplicar**: `agregar-periodo-vigente.sql` (`periodos.vigente`), que además
**nunca se usó en código** — es un concepto abandonado, no un pendiente.

---

## 3 · Pendientes reales que siguen vivos

Verificados uno a uno contra la base:

1. **`asignaciones_profesor` = 0 filas.** La consola del técnico está lista
   (PROMPT-3/T3) y el traspaso está probado con 26 casos puros, pero **nadie ha
   subido una plantilla todavía**. Es el riesgo más alto del sistema: código
   entero sin estrenar en producción.
2. **15 de 21 profesores comparten contraseña.** La marca
   `debe_cambiar_credenciales` está puesta en 19; el cambio real ocurre cuando
   cada uno entre. Hasta entonces, cualquiera que sepa el nombre de un colega
   puede entrar como él.
3. **68 de 3 863 filas de `asistencia_alumnos` sin `periodo_id`** (fechas fuera
   del rango del operativo). Decidir si se archivan.
4. **PROMPT-5 Parte B sin cerrar:** B3 (**13 archivos de `app/actions` siguen
   con `.from()` directo**, saltándose `lib/`), B4 (partir los 4 módulos con I/O
   importados desde cliente) y B5 (`app/_borrador/` y `lib/_borrador/` siguen ahí).
5. **`agregar-indices-asistencia.sql`** — único SQL cuya aplicación no pude
   verificar por PostgREST (los índices no salen en el spec OpenAPI). Con 3 863
   filas y creciendo, conviene confirmarlo en el SQL Editor.
6. **Rotar la contraseña de Supabase** (no verificable desde aquí).

---

## 4 · Un riesgo nuevo: la documentación empezó a pesar

`ESTADO-ACTUAL.md` es una buena idea bien ejecutada —sustituir el
`contexto.feliz` append-only por «qué es verdad hoy»— pero está incumpliendo sus
propias reglas:

- **Su regla dice ~150 líneas; tiene 517.** Por su propio criterio, 367 líneas
  son historial y deberían estar en `docs/historial/`.
- **Su cabecera dice `HEAD: d631e4f (2026-09-04) + cambios sin commitear`.**
  El HEAD real es `c47c040`, 31 commits después, y no hay nada sin commitear.
- Dice «16 de 20 comparten CLAVE»; la medición da **15 de 21**.
- Dice «34 suites»; hay **36**.

La regla de mantenimiento («se actualiza en el mismo cambio que lo vuelve
falso») es correcta; lo que falla es que **nada la verifica**. Es exactamente el
mismo patrón que el lint: una regla sin verificación automática se degrada sola.

**Lo barato:** un check en el CI que compare la cabecera de `ESTADO-ACTUAL.md`
contra `git rev-parse --short HEAD` y contra el número de suites. Ya existe el
precedente: `npm run gen:matriz -- --check` hace justo eso con la matriz de
permisos, y por eso la §4 **no** se desincronizó.

---

## 5 · Qué haría, por orden

| # | Qué | Coste | Por qué ahora |
|---|---|---|---|
| 1 | **Purgar los 4 pendientes falsos** de `ESTADO-ACTUAL.md` §6 | 10 min | Cada lectura futura los vuelve a pagar |
| 2 | **Cerrar O-1** (`AND gm.grupo_id = v_grupo_id`) | 1 línea | Lleva 12 días abierto; desaparece de la vista pero no del código |
| 3 | **FK `calendario_escolar.periodo_id`** | 1 sentencia | Columna poblada al 100 %: la FK es gratis |
| 4 | **Excluir `scripts/**/*.mjs` del lint + añadir lint al CI** | ~30 min | 151 errores donde ~29 son reales; y sin CI seguirá subiendo |
| 5 | **Check de frescura de `ESTADO-ACTUAL.md` en CI** | ~30 min | Mismo patrón que `gen:matriz --check`, que sí funcionó |
| 6 | **Estrenar el traspaso con un profesor real** | 1 subida | No es código: es operación. Único modo de validar el Prompt D |
| 7 | **Re-medir rendimiento (FASE 11)** | medio | El frontend cambió entero; las cifras actuales no describen nada |

Los puntos 1 a 5 caben en una sesión y son mayormente de higiene. El 6 no lo
puede hacer un agente. El 7 merece su propio prompt.

---

## Nota sobre el método

Al escribir `diag-sql-aplicado.mjs` metí un falso negativo que conviene no
repetir: detectaba RPCs con un `POST {}`. PostgREST **empareja funciones por
nombre de argumento**, así que una función con parámetros obligatorios responde
`PGRST202` a un body vacío aunque exista. El script llegó a reportar **6 RPCs
inexistentes que sí existen**. La forma correcta es leer las rutas `/rpc/<fn>`
del spec OpenAPI, y así quedó corregido y documentado en el propio script.
