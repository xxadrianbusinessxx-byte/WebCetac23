"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EstadoCarga<T> = {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
};

/**
 * Ejecuta una carga async una vez por clave; ignora respuestas obsoletas y evita solapes.
 */
export function useCargaUnica<T>(
  clave: string,
  cargar: () => Promise<T>,
  activo = true,
): EstadoCarga<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const enCursoRef = useRef(false);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const ejecutar = useCallback(() => {
    if (!activo || !clave) return;

    const seq = ++seqRef.current;
    if (enCursoRef.current) return;

    enCursoRef.current = true;
    setCargando(true);
    setError(null);

    void cargarRef
      .current()
      .then((resultado) => {
        if (seqRef.current !== seq) return;
        setDatos(resultado);
      })
      .catch((e) => {
        if (seqRef.current !== seq) return;
        setDatos(null);
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
      })
      .finally(() => {
        if (seqRef.current === seq) {
          setCargando(false);
          enCursoRef.current = false;
        }
      });
  }, [activo, clave]);

  useEffect(() => {
    ejecutar();
    return () => {
      seqRef.current += 1;
      enCursoRef.current = false;
    };
  }, [ejecutar]);

  return { datos, cargando, error, recargar: ejecutar };
}
