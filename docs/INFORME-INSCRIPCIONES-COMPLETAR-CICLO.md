# INFORME — Completar inscripciones ACTIVAS del ciclo actual con las listas de `things`

Fecha: 2026-09-04 · Período operativo: **AGO2026-ENE2027** (`7cf5cca7-f448-4f03-a624-8d34fba00aaf`).
Decisión del directivo: **activar** a los alumnos listados en sus grupos del ciclo
actual **sin desactivar ninguna otra inscripción** (no se borra ni se inactiva nada).

---

## Qué se detectó
Las plantillas de asistencia se generan desde las inscripciones ACTIVAS del
grupo. Tres grupos del operativo estaban “incompletos” porque los alumnos de su
lista **ya tenían fila en el grupo, pero `activo=false`** (heredada del armado
del ciclo) y solo algunos habían sido activados.

Listas usadas (`things/Alumnos CETAC`), nombres → CURP por coincidencia exacta y
única contra `ALUMNOS` (orden `P_APELLIDO S_APELLIDO NOMBRE`):

| Lista | Grupo en el ciclo | En lista | Activos antes | Reactivados |
|---|---|---|---|---|
| `3RORHA.xlsx` | 3RO A RH | 30 | 7 | **21** |
| `5TORHA.xlsx` | 5TO A RH | 25 | 13 | **12** |
| `6TOMCA.xlsx` → 5TO MC A (decisión del directivo) | 5TO A MECATRONICA | 41 | 17 | **24** |

Total reactivados: **57**. Operación: `UPDATE inscripciones_alumno SET activo=true`
sobre las 57 filas existentes (ids encontrados por `curp` + `grupo_id` del grupo
objetivo). No se hizo ningún INSERT y no se tocó ninguna otra fila.

## Verificación posterior (dry-run del mismo script)
- 3RO A RH: 28/30 activos (faltan los 2 SIN CURP, ver abajo) · A INSERTAR 0 · A REACTIVAR 0.
- 5TO A RH: **25/25** activos.
- 5TO A MECATRONICA: **41/41** activos.

## Pendiente humano (directivo)
1. **2 nombres sin CURP en `ALUMNOS`** (3RO A RH): FIGUEROA OSORIO KEVIN ODICEO y
   FLORES CERON ALIZON FATIMA. Se necesitan sus CURP reales para darlos de alta
   (no se inventan CURP).
2. Revisar si los alumnos que quedaron con otra inscripción ACTIVA además del
   grupo objetivo (p. ej. cohorte 5TO MC A también activa en 6TO A
   MECATRONICA, o lista 3RO/5TO RH también activa en grados previos) deben
   regularizarse después (decisión del directivo; no se desactivó nada).

## Script
`scripts/actualizar-inscripciones-listas.mjs` — `node …` = plan (dry-run);
`node … --apply` = ejecuta. Reversible: solo reactiva filas existentes.
