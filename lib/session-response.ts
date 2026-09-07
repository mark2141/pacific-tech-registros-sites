import { siteUrl } from "./runtime-env";
import {
  serializeRefreshCookie,
  serializeSessionCookie,
} from "./session-cookie";

/**
 * Piezas que comparten las rutas que abren o renuevan sesión: /api/session al
 * entrar, /api/session/refresh al prolongarla y /api/password al aceptar una
 * invitación. Estaban escritas dentro de la primera; al aparecer las otras
 * dejó de tener sentido repetirlas, y menos la cabecera de caché, que es una
 * decisión de seguridad y no un detalle de una ruta.
 */

/** La sesión lleva un token de identidad: ningún intermediario debe guardarla. */
export const NO_STORE = { "Cache-Control": "private, no-store" };

export function jsonResponse(
  body: unknown,
  status: number,
  cookies?: string | string[],
) {
  // Headers y no un objeto plano: dos cookies necesitan dos cabeceras
  // Set-Cookie, y un objeto solo admite una clave con ese nombre.
  const headers = new Headers(NO_STORE);
  for (const cookie of typeof cookies === "string" ? [cookies] : cookies ?? []) {
    headers.append("Set-Cookie", cookie);
  }
  return Response.json(body, { status, headers });
}

/** En local el servidor habla http y una cookie Secure no llegaría a fijarse. */
export function isHttpsSite() {
  return siteUrl().startsWith("https:");
}

/**
 * Las cookies de una sesión recién abierta o renovada.
 *
 * La de refresco solo se reescribe si Identity emitió una nueva: GoTrue rota
 * los tokens de refresco al usarlos, pero no siempre, y pisar la que ya vale
 * con un vacío dejaría al usuario sin poder renovar.
 */
export function sessionCookiesFor({
  accessToken,
  expiresIn,
  refreshToken,
}: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string | null;
}) {
  const secure = isHttpsSite();
  const cookies = [
    serializeSessionCookie(accessToken, { maxAgeSeconds: expiresIn, secure }),
  ];
  if (refreshToken) cookies.push(serializeRefreshCookie(refreshToken, { secure }));
  return cookies;
}
