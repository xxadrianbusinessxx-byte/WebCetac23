# INFORME — PROMPT R: las pantallas del modelo B y dos guardianes

> **Reconstruido el 2026-10-06 desde los commits** (`git log --grep="Prompt R"` y
> `git show --stat`). No es el informe que entregó quien implementó, que no se archivó:
> aquí solo está lo que dicen los mensajes y los archivos de cada commit. Las cifras son
> las que declararon el día del commit, no se han vuelto a medir.

## Qué se pidió

`docs/historial/prompts/PROMPT_CLINE_R_PANTALLAS_MODELO_B.md`, medido el 2026-10-01 sobre
`53a1972`. Cuatro partes con parada obligatoria entre cada una:

| Parte | Qué | Peso | Va a |
|---|---|---|---|
| 0 | C16 (cada `onConflict` es una UNIQUE declarada) y C17 (`test:ci` = workflow) en `test-orden` | 1/14 (GOBIERNO) | Cline + revisión |
| 1 | la vista de calificaciones del alumno lee del modelo nuevo | 2/14 | Cline |
| 2 | la subida del profesor escribe también en el modelo nuevo | 1/14 | Cline |
| 3 | la pantalla del técnico: materias por grupo | 3/14 | Cline |

No era de Cline, con su porqué: el servidor del modelo B (alcance por CURP y cerrojo del
padrón) y `supabase/corregir-unicidad-calificaciones.sql`, que aplica una persona.

## Qué se hizo, por commit

Los commits de cada parte no llevan firma; las revisiones, de Claude, atribuyen la
implementación a Cline (`7daf598`, `52f6941`, `f727b0b`).

| Commit | Qué |
|---|---|
| `291af39` · prompt | Claude lo archiva tras comprobar lo que afirma: corrige dos afirmaciones falsas (quién usa la vista vieja y una píldora de `app/components/ui/` que no existe), avisa de que C11 está en 21/21 y cita `verificacion.yml` en vez de `ci.yml`. |
| `3dfb005` · Parte 0 | C16 generaliza a `lib/` el bloque de `test-calificaciones-io.mjs`, ahora con primary key; C17 vigila que `test:ci` corra los mismos pasos que el workflow. Toca `test-orden.mjs`, `package.json`, `scripts/README.md` y ESTADO-ACTUAL. |
| `7daf598` · revisión 0 | Aceptada con tres retoques: `sinComentariosSql` quita también `/* … */`; el título de C16 dice «DECLARADA en supabase/» (mide el repo, no la base); AGENTS.md describe `test:ci` como el CI completo. |
| `0667a87` · Parte 1 | La pieza `materias-calificacion` de `contenido-alumno-oceano.tsx` pasa a `actionVistaCalificacionesAlumno`, con lista propia por `grupoMateriaId`, `null` como guion y los dos promedios. No borra `MateriaCalificacionesAlumno` ni `actionObtenerVistaMateria`: siguen en uso (R8). |
| `357e32e` · revisión 1 | Aceptada; cada respuesta se guarda con su CURP y su materia y solo se pinta si coinciden (`materiaEfectiva`); «Cargando…» en vez de «No hay materias»; `aria-pressed`. |
| `6b1fa9d` · Parte 2 | `materia-mapeo-columnas.tsx`: tras el ok de la subida vieja, resuelve la pareja y sube al modelo normalizado; el resultado va debajo, atado a `{ materia, subida }`. Reemplazar no borra en el modelo nuevo. |
| `52f6941` · revisión 2 | Aceptada; `subirModeloNuevo` ya no lanza (una excepción dejaba el asistente en «Guardando…» y ocultaba el éxito de la subida vieja) y el mensaje de la vieja se pone antes de esperar a la nueva. |
| `c479872` · Parte 3 | Modo «Por grupo» con `app/components/parejas-materias-panel.tsx` (nuevo): activas e inactivas, desactivar con confirmación y sin borrar, alias en línea, alta por grupo + materia. |
| `f727b0b` · revisión 3 | Aceptada; el fallo de identidad era del servidor (de Claude): 10 de las 24 etiquetas del ciclo 2026-2027 se repiten entre carreras. Ahora el servidor devuelve la carrera y el panel agrupa por `grupoId` («2DO A · RH»); si la primera carga falla, ofrece reintentar. |

## Validación declarada

| Commit | Lo que dice |
|---|---|
| `3dfb005`, `0667a87`, `6b1fa9d`, `c479872` | Ninguna (los mensajes no declaran validación) |
| `7daf598` | C16 y C17 fallan donde deben, con mutaciones (sin el SQL correctivo, clave no literal, solo índice parcial, `test:ci` sin build, paso nuevo en el workflow). `test:ci` en verde |
| `357e32e`, `52f6941` | `test:ci` en verde. No verificado en navegador (exige la sesión de un alumno o profesor real contra producción) |
| `f727b0b` | Suite I/O 111 → 114; el ensayo en seco de `migrar-ensayo-modelo-b.mjs` comprueba contra la base 24 etiquetas para 24 grupos. `test:ci` en verde. No verificado en navegador |

## Lo pendiente (según los commits)

- El SQL correctivo: hasta aplicarlo, las escrituras del modelo B devolvían `42P10` y C16
  estaba en verde igual (`7daf598`). `d7415a7`, posterior, lo da por aplicado y cierra
  `sql-unicidad-calificaciones`.
- Ninguna de las tres pantallas (Partes 1-3) se probó en el navegador.
