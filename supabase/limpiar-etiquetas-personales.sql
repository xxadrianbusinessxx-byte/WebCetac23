-- C4.24 — LIMPIEZA DE IDENTIDAD ACADÉMICA EN ETIQUETAS PERSONALES.
--
-- Las ETIQUETAS PERSONALES YA NO son la fuente de grado/grupo/carrera del
-- alumno: eso lo resuelve SOLO la inscripción (inscripciones_alumno → grupos
-- → carreras) mediante el sistema implementado (C3/C4.19 Reconocimiento
-- Académico). Este script vacía esos tres campos legacy para que no queden
-- datos que puedan confundir o sobreponerse.
--
-- Aplica SOLO a GRADO, GRUPO y CARRERA (UPDATE a cadena vacía).
-- NO borra el resto de datos personales (GENERO, CORREO, CELULAR, TIPO DE
-- SANGRE, ALERGIAS, COMENTARIO PERSONAL, etc.).
-- NO borra filas ni la estructura.

UPDATE "ETIQUETAS PERSONALES"
SET GRADO = '',
    GRUPO = '',
    CARRERA = '';

-- OPCIONAL (SOLO si además quieres borrar TODA la tabla de etiquetas
-- personales, incluyendo datos personales). Descomenta si es el caso:
-- DELETE FROM "ETIQUETAS PERSONALES";
