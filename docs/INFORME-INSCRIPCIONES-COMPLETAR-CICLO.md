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
1. ~~FIGUEROA OSORIO KEVIN ODICEO y FLORES CERON ALIZON FATIMA~~ → **RESUELTO** con
   CURP proporcionadas por el directivo (ver sección siguiente).
2. Revisar si los alumnos que quedaron con otra inscripción ACTIVA además del
   grupo objetivo (p. ej. cohorte 5TO MC A también activa en 6TO A
   MECATRONICA, o lista 3RO/5TO RH también activa en grados previos) deben
   regularizarse después (decisión del directivo; no se desactivó nada).

## Anexo (mismo día): alta de los 2 alumnos restantes de 3RO A RH
CURP proporcionadas por el directivo:

| Alumno (lista) | CURP | Qué se hizo |
|---|---|---|
| FLORES CERON ALIZON FATIMA | `FOCA100513MDFLRLA0` | Se creó su identidad en `ALUMNOS` (CURP + CLAVE derivada `FLRLA0` + nombre/apellidos) y se insertó su inscripción ACTIVA en 3RO A RH. |
| FIGUEROA OSORIO KEVIN ODICEO | `FIOK090228HGTGSVA3` | Ya existía en `ALUMNOS` (como “KEVIN ODICEO FIGUEROA OSORNIO”) y **ya estaba ACTIVO** en 3RO A RH; no requirió cambios. |

Estado final verificado: los **30/30** nombres de la lista 3RORHA tienen CURP e
inscripción ACTIVA en el grupo (el script por nombres lo reporta como “29 +
SIN-CURP Kevin” solo porque su apellido está guardado con typo “OSORNIO”, pero
la verificación por CURP confirma su inscripción activa).

> Opcional (decisión del directivo): corregir en `ALUMNOS` el `S_APELLIDO` de
> `FIOK090228HGTGSVA3` de “OSORNIO” a “OSORIO” para que coincida con la lista
> oficial.

## Scripts
- `scripts/actualizar-inscripciones-listas.mjs` — reactivación masiva por listas
  (`node …` = plan; `node … --apply` = ejecuta).
- `scripts/registrar-alumnos-extras-3ro.mjs` — alta idempotente de los 2 casos
  anteriores (crea `ALUMNOS` si falta y asegura inscripción ACTIVA en 3RO A RH).

