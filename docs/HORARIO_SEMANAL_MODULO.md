# Módulo HORARIO SEMANAL OFICIAL (FASE HORARIO)

## Objetivo

El horario responde SOLO a: «¿qué clases están programadas para este grupo en
este día?». La asistencia (`clases_impartidas`, `asistencia_alumnos`) responde
«¿qué ocurrió realmente?». El horario NUNCA genera filas de asistencia ni
duplica el catálogo.

## Arquitectura

```
ALUMNO → inscripción activa → grupo → HORARIO (lectura única del grupo)
PROFESOR → elige grupo + materia del horario → bloques de esa materia
FECHA → día de semana → HORARIO → clase programada → clase impartida → asistencia
```

### Fuente única de verdad

`horario_semanal` (versionada por `periodos`) es la autoridad de la cantidad de
bloques/clases por día. Se **deriva** contando bloques; nunca se almacena un
«clases por día» duplicado. La hoja «Resumen Clases por Día» del Excel solo se
usa como validación cruzada (advertencias), nunca se persiste.

### Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/crear-horario-semanal.sql` | Tabla + índices + trigger + RLS + COMMENT legacy. IDEMPOTENTE y re-ejecutable (incluye `DROP POLICY IF EXISTS` porque Postgres no tiene `CREATE POLICY IF NOT EXISTS`). PREPARADO, no se ejecuta automáticamente |
| `lib/escolar/tables.ts` | `TABLA_HORARIO_SEMANAL` |
| `lib/escolar/tablas-supabase.ts` | Exclusión de la tabla del descubrimiento de materias |
| `lib/escolar/horario-semanal.ts` | Tipos, normalización (días/horas/materias), repositorio y derivación de conteos |
| `lib/escolar/horario-importar.ts` | Importación Excel (lectura→normalización→validación→preview→aplicación idempotente) |
| `app/actions/horario.ts` | Server Actions (escritura solo directivo; lectura con autorización por rol) |
| `app/components/horario-escolar-panel.tsx` | UI del directivo (importar + consultar + descargar plantilla .xlsx) |
| `app/components/horario-alumno-resumen.tsx` | Vista del horario del alumno/tutor |
| `lib/escolar/asistencias.ts` | La fila CLASES se deriva del horario contando bloques de la MATERIA elegida (`obtenerConteosHorarioMateria`) |
| `app/components/asistencias-panel.tsx` | UI del profesor: horario del grupo, selector de materia y clases por día automáticas (sin config manual) |

## Modelo de datos

`horario_semanal`:
- `periodo_id` (FK `periodos`) y `grupo_id` (FK `grupos`): sin duplicar oferta.
- `dia_semana` (lunes..viernes), `hora_inicio`/`hora_fin` (time).
- `materia_clave`/`materia_nombre`: identidad de la materia DENTRO del horario
  (texto oficial del archivo; no depende del catálogo).
- `materia_id`: vínculo OPCIONAL (best-effort) a `materias` cuando el nombre
  resuelve de forma única.
- `profesor_nombre`/`profesor_clave`: profesor visible y clave opcional.
  «Sin profesor asignado» = NULL (nunca se convierte en un profesor real).
- UNIQUE natural `(periodo_id, grupo_id, dia_semana, hora_inicio, materia_clave)`
  → re-subir el mismo archivo no duplica.

No existe copia del horario por alumno, ni tabla por grupo, ni resumen
persistente por día.

## Importación (Excel)

Flujo: `leerLibroExcel → localizarHojaDetalle → detectarColumnasHorario →
parsearFilaHorario → analizarFilasHorario (forma+duplicados+solapamientos) →
resolución contra catálogo (grupo por identidad, materia best-effort) →
diff con lo existente (nuevas/actualizables/sin cambios/a eliminar) →
validación cruzada con el resumen (advertencias) → preview → aplicar`.

- Estrategia: **reemplazo-diferenciado por periodo** (nunca DELETE masivo ciego;
  primero el preview; la aplicación re-analiza el archivo).
- Errores estructurales (grupo inexistente, día/hora inválidos, duplicados,
  solapamientos) **bloquean** la escritura y se muestran por fila.
- Carreras del archivo aceptan alias (MC → MECATRONICA, RH, tronco común).
- El panel del directivo ofrece «Descargar plantilla del horario (.xlsx)» con la
  misma estructura del archivo de referencia y filas de ejemplo para
  conservarla y actualizarla cuando cambie.
- Hallazgo del archivo real (Ago2026–Ene2027): hay 2 bloques solapados
  (5°A viernes 09:40–11:20 vs 10:30–11:20) que la importación detecta y bloquea
  hasta corregirlos; la hoja «Resumen Clases por Día» solo cuadra para 1° y se
  usa únicamente como aviso de validación cruzada.

## Profesor

El profesor NO indica cuántas clases tiene por día. Selecciona el contexto
(grado/grupo/carrera/ciclo) y la MATERIA del horario oficial; el sistema deriva
la fila CLASES de la plantilla contando los bloques de esa materia por día
(`obtenerConteosHorarioMateria`). Cualquier profesor puede descargar la
plantilla de la materia que va a registrar: el profesor del documento es solo
referencia informativa, no restringe el acceso ni crea asignaciones.

La configuración manual por día (`configuracion_clases_profesor`) quedó
desactivada y sin UI; la plantilla solo se genera si el grupo tiene horario
oficial cargado.

## Alumno / tutor

- Alumno/tutor: `actionObtenerHorarioAlumno(curp)`; el grupo se resuelve en el
  servidor desde la inscripción ACTIVA (nunca se confía en grado/grupo del
  cliente). El tutor solo puede leer CURPs vinculados a él.
- Estados de asistencia: se mantienen derivados (`estadoAsistenciaAlumno`);
  el horario aporta contexto (bloques programados) sin inventar estados por
  bloque.

## Legacy `configuracion_clases_profesor`

Se conserva la tabla (no se elimina físicamente). Quedó:
1. documentada como deprecated en SQL (`COMMENT ON TABLE`);
2. aislada: ya no es autoridad cuando existe horario para el grupo/periodo
   (constante `FALLBACK_LEGACY_CONFIG_CLASES_ACTIVO` en `asistencias.ts`);
3. sus funciones de servicio marcadas como deprecadas en código.

## Pendiente de ejecución humana

- Ejecutar `supabase/crear-horario-semanal.sql` en el SQL Editor de Supabase
  (solo CREATE + comentarios; no borra nada).
- Importar el archivo real del ciclo desde `/configuracion` (directivo).
- Alinear el catálogo (`materias` / `grupo_materias` / `asignaciones_profesor`)
  con las materias/profesores del horario para que la atribución de bloques al
  profesor coincida (los avisos de la UI guían el proceso).
