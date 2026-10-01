# RUMBO — en medio de qué estamos

**Generado por `node scripts/gen-rumbo.mjs`; la cabecera va a mano.**

- **Campaña:** cerrar las UIs pendientes del Océano.
- **Se da por terminada cuando:** las seis pantallas operan, CI verde.

## Fuera de alcance ahora

- Operación de persona: asignaciones y claves.
- `docs/sistema/MATRIZ-UX.md`: pendiente abierto.
- Legacy y fallbacks (R8): no se retiran.

<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->
- **Rama y HEAD:** main · ad9b5eb

## Qué cerró (últimos 10 commits)

- ad9b5eb · Modelo B: las escrituras no funcionaban en la base; arreglo y ensayo rea…
- f7d4d3d · Opción B: I/O y actions de calificaciones normalizadas
- c58093a · .gitignore: la regla que ORDEN.md ya declaraba y el archivo no tenía
- 49d4349 · Migración Opción B · pieza 1: el convertidor del Excel a calificaciones…
- a1375c9 · Opciones para migrar las materias legacy a materias.id, medidas contra l…
- 632a996 · Parte 2 del Prompt Q: MATRIZ-UX al shell, índice de auditorías y pendien…
- c2a285c · Parte 1 del Prompt Q: cuatro módulos puros (9→13) y cuatro suites (41→45…
- 7fdb83b · Parte 0 del Prompt Q: los dos guardianes en verde, y tres referencias mu…
- 6b31e6b · Prompt Q: consolida el desbloqueo del CI, la modularidad y los documento…
- fa41157 · Escala medible del peso de un cambio, calibrada contra 8 commits reales

## Lo que más pesa hoy

- sql-unicidad-calificaciones — corregir-unicidad-calificaciones.sql sin aplicar: el modelo B no puede escribir · `node scripts/migrar-ensayo-modelo-b.mjs --apply`
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs`
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs`
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs`
- C10 = 34
- C11 = 21
<!-- FIN GENERADO -->
