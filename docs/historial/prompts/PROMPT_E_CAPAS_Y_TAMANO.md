# PROMPT E — Capas y tamaño: sacar el I/O de `app/actions/` y partir los módulos gigantes

> Cierra **PROMPT-5 Parte B (B3 y B4)** y el punto 7 de la evaluación del 09-08.
> Diagnóstico ya medido el 2026-09-16 — **no re-investigar**.

---

## OBJETIVO

Que la lógica de negocio viva en `lib/` y que ningún módulo siga siendo tan
grande que nadie se atreva a tocarlo. Es la deuda de **capas**, no de
funcionalidad: al terminar, el sistema hace exactamente lo mismo.

---

## ESTADO ACTUAL (medido, no re-investigar)

### B3 · 13 archivos de `app/actions/` hablan con Supabase directamente

```bash
grep -rl "\.from(" app/actions/*.ts | wc -l   # -> 13
```

El `CONTRATO-DE-CAMBIO` §1 punto 2 dice: «La action solo valida sesión y delega.
La lógica no vive en `app/actions/`». Hoy 13 archivos lo incumplen.

### B4 · módulos con I/O importados desde componentes cliente

Cuatro módulos mezclan decisión pura e I/O y los importa un `"use client"`, lo
que arrastra al bundle código que solo debería correr en servidor.

### Punto 7 · seis archivos por encima de 1 000 líneas

| Archivo | Líneas |
|---|---|
| `lib/escolar/asistencia/asistencias.ts` | 1 705 |
| `lib/escolar/horario/horario-importar.ts` | 1 267 |
| `app/actions/asistencias.ts` | 1 157 |
| `lib/escolar/ciclo/contexto-ciclo.ts` | 1 133 |
| `lib/escolar/tutores/tutores.ts` | 1 064 |
| `app/actions/escolar.ts` | 1 035 |

Eran 4 el 09-08 y ahora son 6: **crecen solos**. La reorganización del
2026-09-06 ordenó las carpetas, no los archivos.

---

## RESULTADO ESPERADO

### R-1 · El I/O baja a `lib/`
Por cada uno de los 13 archivos de `app/actions/` con `.from()`:
- la consulta se muda a la familia de `lib/escolar/` que le corresponda;
- la action queda con: `exigir()` → validar entrada → delegar → devolver.
- **Si una consulta es trivial y de un solo uso**, mudarla igual: el criterio es
  la capa, no el tamaño.

### R-2 · Separar `-puro` del I/O
Los 4 módulos de B4 se parten en `<nombre>-puro.ts` (decisión, sin imports de
Supabase, probable sin base) y `<nombre>.ts` (I/O, `server-only`). Los
componentes cliente importan **solo** el `-puro`.

### R-3 · Partir los seis gigantes
Cada uno baja de **1 000 líneas**, partiendo **por responsabilidad**, no por
número de líneas. Orientación (ajústala si el código dice otra cosa):
- `asistencias.ts` → plantilla · análisis de subida · estados derivados · repositorio.
- `horario-importar.ts` → lectura del Excel · validación · aplicación.
- `contexto-ciclo.ts` → clonación · carga desde catálogo · reparación de `tabla_legacy`.
- `tutores.ts` → credenciales · relación tutor↔alumno · generación masiva.
- Los dos de `app/actions/` deberían adelgazar solos al aplicar R-1.

**Los re-exports se conservan**: ningún import existente puede romperse (§10).

---

## REGLAS

1. **Refactor puro: cero cambios de comportamiento.** Ninguna suite cambia de
   resultado; si una suite hay que tocarla, es señal de que cambiaste semántica.
2. **Nada destructivo** (R8): no se borra legacy ni se retiran fallbacks
   «de paso». `FALLBACK_TODAS_LAS_MATERIAS` y los `FALLBACK_LEGACY_*` se quedan.
3. **No crear caminos paralelos** (R6): si ya hay un módulo para ese dominio, va ahí.
4. **Sin migraciones ni SQL.** Este prompt no toca la base.
5. **Por partes, verificando entre medias.** Es el cambio con más superficie de
   todo el repo: hacerlo de una vez y validar al final hace imposible localizar
   qué lo rompió.

---

## LÍMITES

- ❌ No toca `app/_borrador/` ni `lib/_borrador/` (eso es el Prompt F).
- ❌ No arregla los 17 errores de lint (Prompt F).
- ❌ No toca el rediseño Océano ni ninguna UI.
- ❌ No cambia permisos: `test-permisos` y `test-auditoria-permisos` deben seguir
  dando exactamente los mismos números (475 y 229).

---

## VALIDACIÓN

1. `npx tsc --noEmit` · `npm run test:ci` (36/36) · `npm run build`.
2. `npm run lint` no debe **subir** de 17 errores / 38 warnings.
3. Comprobaciones específicas del prompt, con el antes/después pegado:
   ```bash
   grep -rl "\.from(" app/actions/*.ts | wc -l          # 13 -> 0
   find app lib -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head -8
   ```
4. `npm run gen:matriz -- --check` en 0.

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
