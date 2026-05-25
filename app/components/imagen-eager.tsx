import type { CSSProperties, ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** Marca para herramientas de accesibilidad / depuración */
  "data-imagen-eager"?: boolean;
};

/**
 * <img> sin next/image: carga inmediata, sin placeholders del optimizador.
 */
export function ImagenEager({
  loading: _loading,
  fetchPriority,
  decoding = "async",
  ...rest
}: Props) {
  return (
    <img
      {...rest}
      loading="eager"
      decoding={decoding}
      fetchPriority={fetchPriority ?? "auto"}
      data-imagen-eager
    />
  );
}

type FillProps = Omit<Props, "width" | "height" | "fill"> & {
  className?: string;
  style?: CSSProperties;
};

/** Equivalente a next/image fill, sin lazy-load. */
export function ImagenEagerFill({ className = "", style, alt = "", ...rest }: FillProps) {
  return (
    <ImagenEager
      alt={alt}
      className={`absolute inset-0 h-full w-full ${className}`.trim()}
      style={style}
      fetchPriority="high"
      decoding="sync"
      {...rest}
    />
  );
}
