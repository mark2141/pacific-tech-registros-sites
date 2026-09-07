/**
 * La sesión viaja en cookies HttpOnly, no en localStorage.
 *
 * El render del servidor necesita la identidad en el momento del request, así
 * que un token guardado por JavaScript no serviría: no llegaría al servidor en
 * la primera navegación. HttpOnly además deja los tokens fuera del alcance de
 * cualquier script, que es la diferencia entre un XSS molesto y un XSS que se
 * lleva la sesión.
 *
 * Son dos cookies con vidas muy distintas. La de sesión caduca cuando caduca el
 * token de acceso —alrededor de una hora— y la de refresco dura semanas: es la
 * que permite renovar sin volver a pedir la contraseña. Separarlas mantiene la
 * de vida larga fuera de cada comprobación de identidad.
 */

export const SESSION_COOKIE = "pt_session";
export const REFRESH_COOKIE = "pt_refresh";

/**
 * Un token de refresco vale por sí solo para volver a entrar, así que dura lo
 * que se quiera que dure el "no me vuelvas a pedir la contraseña": un mes.
 * Pasado ese tiempo hay que identificarse otra vez, que es un límite sano para
 * un equipo compartido en un taller.
 */
export const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function readCookie(
  cookieHeader: string | null | undefined,
  name: string,
) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    const value = part.slice(separator + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export function readSessionCookie(cookieHeader: string | null | undefined) {
  return readCookie(cookieHeader, SESSION_COOKIE);
}

export function readRefreshCookie(cookieHeader: string | null | undefined) {
  return readCookie(cookieHeader, REFRESH_COOKIE);
}

export function serializeCookie(
  name: string,
  token: string,
  { maxAgeSeconds, secure }: { maxAgeSeconds: number; secure: boolean },
) {
  const attributes = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  // En local el servidor habla http y una cookie Secure no llegaría a fijarse.
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function serializeSessionCookie(
  token: string,
  options: { maxAgeSeconds: number; secure: boolean },
) {
  return serializeCookie(SESSION_COOKIE, token, options);
}

export function serializeRefreshCookie(
  token: string,
  { secure }: { secure: boolean },
) {
  return serializeCookie(REFRESH_COOKIE, token, {
    maxAgeSeconds: REFRESH_MAX_AGE_SECONDS,
    secure,
  });
}

/** Ambas a la vez: cerrar sesión a medias dejaría la puerta de atrás abierta. */
export function clearSessionCookies({ secure }: { secure: boolean }) {
  return [SESSION_COOKIE, REFRESH_COOKIE].map((name) =>
    serializeCookie(name, "", { maxAgeSeconds: 0, secure }),
  );
}
