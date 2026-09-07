# PROMPT A PARA CLINE — Reparar `tabla_legacy` del ciclo operativo (URGENTE)

> Formato `criterios.prompts` §24. Unidad pequeña y acotada: **ningún alumno ve
> materias hoy**. Diagnóstico ya hecho contra Supabase real — **no re-investigar**.
> Ejecutar ANTES que el Prompt B.

---

## OBJETIVO

Reparar el puente físico `grupo_materias.tabla_legacy` en el ciclo OPERATIVO, y
corregir la función de clonación que lo perdió, para que los alumnos vuelvan a
ver sus materias en `/perfil`.

---

## ESTADO ACTUAL (verificado, 2026-09-04 — NO re-investigar)

Ejecuta `node scripts/diag-materias-alumno.mjs` para ver esto en vivo:

```
=== COBERTURA DE tabla_legacy POR PERIODO ===
  AGO2026-DIC2026      gmAct= 101 · conTabla= 101 (100%)
  2026-2027            gmAct= 241 · conTabla= 241 (100%)
  BORRADOR             gmAct= 101 · conTabla= 101 (100%)
  AGO2026-ENE2027      gmAct= 241 · conTabla=   0 (0%)  <-- OPERATIVO
```

RPC en vivo para un alumno real inscrito:

```
RPC obtener_perfil_alumno('ZAFA100523MVZPMMA6')
  inscripcion: sí · grupo: 3RO A · periodo: AGO2026-ENE2027
  grupo_materias: 10
  identidades:    0   <-- lo que la UI convierte en materias
```

### Cadena del fallo (ya trazada, no re-derivar)

`app/actions/escolar.ts` → `actionObtenerPerfilAlumno`:

```
tablasLegacy = grupo_materias.map(tabla_legacy).filter(Boolean)   → []
identidades  = resolverIdentidadesCatalogo(supabase, [])          → Map vacío
materias     = materiasVisiblesDesdeCatalogo([], ...)             → []
```

El alumno tiene inscripción activa, grupo activo y periodo activo. Lo único que
falta es `tabla_legacy`.

### Causa

`lib/escolar/contexto-ciclo.ts` → `clonarContextoAcademico`, ~línea 298:

```ts
.from(TABLA_GRUPO_MATERIAS)
.select("grupo_id, materia_id")      // <-- NO lee tabla_legacy
```

y ~línea 329:

```ts
const filasMaterias: { grupo_id: string; materia_id: string; activo: boolean }[] = [];
```

**Nunca copia `tabla_legacy`.** `AGO2026-ENE2027` se creó por clonación de
`2026-2027` el 2026-09-03 14:49 → 24 grupos y 241 `grupo_materias` idénticos,
pero sin el puente físico.

### Trampa que debes evitar

`cargarMateriasDesdeCatalogo` (Bloque 16) **NO repara esto**: solo inserta
parejas `(grupo_id, materia_id)` inexistentes, y las 241 ya existen. Correrla
desde la UI las salta sin rellenar `tabla_legacy`. Hace falta un **UPDATE** sobre
filas existentes.

### La reparación es determinista

`2026-2027` (origen) tiene 241/241 con `tabla_legacy`; el operativo tiene las
mismas 241 filas con NULL. El emparejamiento es 1:1 por
**(identidad del grupo: grado|grupo|carrera) + `materia_id`**.

---

## RESULTADO ESPERADO

### R-1 · `clonarContextoAcademico` deja de perder el puente
- Leer `tabla_legacy` en el `select` del origen.
- Incluirlo en `filasMaterias` del `insert`.
- Si una fila de origen no tiene `tabla_legacy`, se inserta `null` (no se
  inventa) y se cuenta en el resumen del resultado.

### R-2 · Función de reparación (nueva)
`repararTablaLegacyDePeriodo` en `lib/escolar/contexto-ciclo.ts`, en dos mitades
como el resto del módulo:

- **Plan PURO** `planRepararTablaLegacy(gmDestino, gruposDestino, gmOrigen, gruposOrigen)`
  → devuelve, por fila de destino con `tabla_legacy` vacío, el `tabla_legacy`
  propuesto y un `estado`:
  `match` | `ya_tiene` | `sin_origen` | `ambiguo`.
  Emparejar por `identidad(grado|grupo|carrera) + materia_id`, normalizando con
  los helpers existentes (`normalizarGradoCatalogo`, `normalizarGrupoCatalogo`,
  `normalizarCarreraCatalogo`). **Ambiguo = dos candidatos distintos → NO se
  elige uno; se reporta.**
- **Aplicación** `repararTablaLegacyDePeriodo(supabase, { periodoDestinoId, periodoOrigenId })`
  → ejecuta solo los `match`, con **UPDATE por `id`**, y SOLO donde
  `tabla_legacy` está vacío. Idempotente: re-ejecutar da 0 cambios.

### R-3 · Server Action con preview obligatorio
En `app/actions/contexto-ciclo.ts` (mismo patrón que las acciones existentes):
- `actionPrevisualizarRepararTablaLegacy(periodoDestinoId, periodoOrigenId)` — no escribe.
- `actionRepararTablaLegacy(periodoDestinoId, periodoOrigenId)` — escribe.
- **Ambas solo rol `directivo`.**

### R-4 · UI
Botón **"Reparar puente de materias (tabla_legacy)"** en el paso Académico del
`CicloConfigurador`, con selector de ciclo origen, que **primero muestra el
preview** (cuántos match / ambiguos / sin origen) y solo entonces habilita
aplicar. Mismo patrón visual que "Copiar estructura" y "Cargar materias según
catálogo".

---

## REGLAS ARQUITECTÓNICAS

1. **NO** tocar `materias`, `grupos`, `inscripciones_alumno` ni las tablas
   físicas de calificaciones. Solo `grupo_materias.tabla_legacy`.
2. **NO** borrar ni desactivar filas. Solo `UPDATE` de una columna hoy NULL.
3. **NO** inventar un `tabla_legacy`: si no hay origen inequívoco, se reporta y
   se deja NULL.
4. Reutilizar los normalizadores y el patrón plan-puro/aplicación que ya existen
   en `contexto-ciclo.ts` (§8: extender lo existente, no crear una abstracción
   paralela).
5. Cambio aditivo (§10): las firmas actuales de `clonarContextoAcademico` siguen
   compilando; su resultado puede ganar campos nuevos.

---

## PERMISOS / SEGURIDAD

- Ambas Server Actions: **solo `directivo`**, validado desde
  `obtenerSesionPortal()` server-side.
- Los `periodoId` que llegan del cliente se re-resuelven contra `periodos` en el
  servidor. Un id inexistente → error, no escritura parcial.

---

## RENDIMIENTO

- Toda la reparación en **4 consultas**: grupos origen, grupos destino,
  `grupo_materias` origen, `grupo_materias` destino. El emparejamiento es en
  memoria. **Prohibido** un UPDATE por fila en bucle sin agrupar: usar lotes
  (`in`) o, si el UPDATE debe ser por `id`, agruparlos por valor de
  `tabla_legacy` para minimizar round-trips. Cero N+1.

---

## LÍMITES

- ❌ No toca asistencias, justificaciones, horario ni identidad del profesor
  (eso es el **Prompt B**).
- ❌ No ejecuta SQL contra Supabase. Si hiciera falta DDL, se prepara en
  `supabase/` y se documenta (aquí NO hace falta: es solo UPDATE vía PostgREST
  desde la Server Action del directivo).
- ❌ No retira `FALLBACK_TODAS_LAS_MATERIAS`.

---

## VALIDACIÓN

1. `npx tsc --noEmit` → 0 errores.
2. `npm run lint` → sin errores nuevos (baseline preexistente: reportar, no arreglar).
3. `npm run build` → compila.
4. **Test puro nuevo** `scripts/test-reparar-tabla-legacy.mjs` (sin Supabase) que cubra:
   - match 1:1 por identidad + materia_id;
   - fila destino que YA tiene `tabla_legacy` → `ya_tiene`, nunca se pisa;
   - dos candidatos distintos → `ambiguo`, y **no** se elige ninguno;
   - materia del destino sin equivalente en origen → `sin_origen`;
   - idempotencia: aplicar el plan dos veces → 0 cambios la segunda;
   - grupos que difieren solo por carrera (`3RO A MECATRONICA` vs `3RO A RH`) no
     se confunden entre sí.
5. `node scripts/diag-materias-alumno.mjs` **antes y después**, pegando ambas
   salidas en el informe. Criterio de éxito: `AGO2026-ENE2027` pasa de
   `conTabla=0 (0%)` a `conTabla=241 (100%)` y la RPC devuelve `identidades: 10`
   para `ZAFA100523MVZPMMA6`.

---

## INFORME FINAL (§26)

Compacto, con el antes/después del diagnóstico y la confirmación de que
`clonarContextoAcademico` ya propaga `tabla_legacy`.

---

## NOTA PARA EL DIRECTIVO (humano)

La reparación **no se ejecuta sola**: Cline entrega el botón y el preview. Tú
corres el preview sobre `AGO2026-ENE2027` con origen `2026-2027`, verificas que
diga 241 match / 0 ambiguos, y aplicas.
