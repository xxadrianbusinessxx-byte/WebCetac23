# Auditorías de ciclo — índice de entrada

Veinte documentos (~180 KB) del trabajo de **orquestación de ciclos escolares**
(`CicloConfigurador`). Son históricos: describen un trabajo terminado y ninguno se
lee al arrancar. Este README existe para poder entrar sin abrir veinte.

> **Lo primero que hay que saber — contradice la lectura de «20 fases F1–F10, todas
> cerradas»:** estos 20 archivos NO son una serie. Son tres capas que se
> solapan: el diseño (`P1_…`), las auditorías (`AUDITORIA-CICLO-FASE-0..8`), la
> implementación (`F2_…F7_…`) y tres documentos sueltos de cierre y análisis.
>
> `CIERRE_UNIFICACION_CICLOS_INFORME.md` declara que **NO se da por terminado**
> («quedan pendientes reales que exigen acceso de escritura a Supabase»), así que
> «todas cerradas» tampoco es cierto.
>
> **Lo que ese documento dice de `main` ya NO es verdad, y es el ejemplo perfecto
> de por qué `docs/historial/` no se cita como presente.** Escribió «No se tocó
> `main`. No hay merge» y era cierto el 2026-09-03. Comprobado contra git el
> 2026-09-30: la rama `feature/ciclo-f1-f7-sin-push` **sí está fusionada**
> (`git branch --merged main` la lista) y su commit de producto `396eeb7` **está
> en `main`**. Quien lea el documento y no mire git se lleva el dato al revés.
>
> La serie PROMPT-1…PROMPT-5 (`docs/historial/informes/INFORME-PROMPT-*.md`) es
> la que llevó el ciclo a su estado actual. Estos archivos son el **diseño y la
> auditoría previos**.

## Empezar por aquí

- `F1-F10-CIERRE-TECNICO.md` (491 líneas) — **el cierre permanente**: arquitectura
  final, decisiones que no deben revertirse, ciclo de vida
  BORRADOR→OPERATIVO→HISTÓRICO, tests por fase (§12) y lo que NO hacer (§11).
  Si solo vas a leer uno, este.

## Tres capas, no una sola serie

1. **Diseño previo** — `P1_CICLO_RAIZ_AUDITORIA_DISENO.md` (auditoría + diseño tras
   el incidente P0) y `ANALISIS-OPTIMIZACION-ESTRUCTURA-CICLO.md` (O-1…O-5, posterior).
2. **Auditorías por fase** — `AUDITORIA-CICLO-FASE-0.md` … `FASE-8.md`: lectura real
   del sistema, una por fase (F0–F8).
3. **Implementación** — `F2_CICLO_ADMIN_UI.md` … `F7_ASISTENCIA_CICLO.md`: qué se
   construyó en cada fase (F2–F7).

## Por fase

| Fase | Auditoría (qué se encontró) | Implementación (qué se construyó) |
|---|---|---|
| P1 | `P1_CICLO_RAIZ_AUDITORIA_DISENO.md` — el ciclo como raíz única | — (solo diseño) |
| F0 | `AUDITORIA-CICLO-FASE-0.md` — mapa del sistema existente | — |
| F1 | `AUDITORIA-CICLO-FASE-1.md` — identidad única `periodos.id` | — |
| F2 | `AUDITORIA-CICLO-FASE-2.md` — Excel académico (BLOCKED: se usa clonación) | `F2_CICLO_ADMIN_UI.md` — panel administrativo del ciclo |
| F3 | `AUDITORIA-CICLO-FASE-3.md` — alumnos al BORRADOR | `F3_CONFIGURACION_BORRADOR.md` — configuración académica completa |
| F4 | `AUDITORIA-CICLO-FASE-4.md` — parciales/evaluaciones (PASS) | `F4_ORQUESTACION_CICLO.md` — orquestación y activación (semi) atómica |
| F5 | `AUDITORIA-CICLO-FASE-5.md` — calendario por `periodo_id` | `F5_CALENDARIO_CICLO.md` — calendario y evaluaciones por periodo |
| F6 | `AUDITORIA-CICLO-FASE-6.md` — horario por periodo (PASS) | `F6_ROSTER_HORARIO_CICLO.md` — roster/horario consistente |
| F7 | `AUDITORIA-CICLO-FASE-7.md` — validación integral (PASS) | `F7_ASISTENCIA_CICLO.md` — asistencia y cierre del modelo |
| F8 | `AUDITORIA-CICLO-FASE-8.md` — activación transaccional única | — |

## Informes de cierre sueltos

| Archivo | Qué es |
|---|---|
| `CIERRE_UNIFICACION_CICLOS_INFORME.md` | Auditoría final: lo demostrado vs lo pendiente. **Su afirmación de que nada se fusionó a `main` era cierta el 2026-09-03 y hoy es falsa** (ver la nota de entrada). |
| `ESTADO_Y_AUDITORIA_UNIFICACION_CICLOS.md` | Estado para otra IA que audite el repo: qué se hizo, qué falta, bugs conocidos. |

## A qué archivo ir desde aquí

- Cómo se resolvió el ciclo **en producción** → `docs/historial/informes/INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md` (y los INFORME-PROMPT-2…5).
- El presente del sistema → `docs/sistema/MAPA-DEL-SISTEMA.md` y `ESTADO-ACTUAL.md`.
