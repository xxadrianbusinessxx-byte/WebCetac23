"use client";

import { useEffect } from "react";

/**
 * Edge/Chrome a veces marcan <img loading="lazy"> con placeholders.
 * Corrige cualquier imagen que entre al DOM sin loading="eager".
 */
export function ForzarImagenesEager() {
  useEffect(() => {
    const aplicar = () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((node) => {
        const img = node as HTMLImageElement;
        img.loading = "eager";
        img.removeAttribute("loading");
        img.setAttribute("loading", "eager");
      });
    };

    aplicar();
    const obs = new MutationObserver(aplicar);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return null;
}
