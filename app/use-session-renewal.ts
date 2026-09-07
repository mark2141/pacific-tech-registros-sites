"use client";

import { useEffect } from "react";

/**
 * Mantiene viva la sesión mientras la pestaña está abierta.
 *
 * El token de acceso de Identity dura una hora. Sin esto, a un técnico se le
 * caía la sesión a mitad de la jornada y volvía a la pantalla de acceso, a
 * veces con un formulario a medio llenar detrás.
 *
 * Se renueva cada media hora —holgado bajo la hora que dura el token— y
 * también al volver a la pestaña, que es lo que cubre el portátil que estuvo
 * suspendido y despierta con la sesión ya vencida.
 */
const RENEWAL_INTERVAL_MS = 30 * 60 * 1000;

export function useSessionRenewal(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function renew() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        // Un fallo aquí no se le enseña a nadie: si la sesión de verdad
        // expiró, la siguiente navegación lleva a la pantalla de acceso, que
        // ya sabe recuperarla sola.
        await fetch("/api/session/refresh", { method: "POST" });
      } catch {
        // Sin red no hay nada que hacer; se reintenta en el siguiente ciclo.
      }
    }

    const onVisible = () => void renew();
    const timer = setInterval(onVisible, RENEWAL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      // Con una referencia guardada, no con otra flecha: `removeEventListener`
      // compara por identidad y una flecha nueva no habría quitado nada.
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
