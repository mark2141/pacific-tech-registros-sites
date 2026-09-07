import { supportsPasswordAuth } from "../../../auth";
import { exchangeRefreshToken } from "../../../../lib/identity-grant";
import { IdentityPasswordError } from "../../../../lib/identity-password";
import { identityEndpoint } from "../../../../lib/netlify-identity-auth";
import {
  clearSessionCookies,
  readRefreshCookie,
} from "../../../../lib/session-cookie";
import {
  isHttpsSite,
  jsonResponse as json,
  sessionCookiesFor,
} from "../../../../lib/session-response";

/**
 * Prolonga la sesión sin volver a pedir la contraseña.
 *
 * El token de acceso de Identity dura una hora. Sin esta ruta, el personal del
 * taller tenía que identificarse cada hora de trabajo: la aplicación recibía un
 * token de refresco al entrar y lo tiraba.
 *
 * El canje ocurre aquí y no en el navegador porque el token de refresco vale
 * por sí solo para abrir sesión: vive en una cookie HttpOnly y no lo ve ningún
 * script.
 */
export async function POST(request: Request) {
  if (!supportsPasswordAuth) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const refreshToken = readRefreshCookie(request.headers.get("Cookie"));
  if (!refreshToken) {
    return json({ error: "No hay sesión que renovar." }, 401);
  }

  try {
    const session = await exchangeRefreshToken(refreshToken, {
      endpoint: identityEndpoint(),
    });

    // Caducado, revocado o ya rotado. Se borran las dos cookies para no dejar
    // al navegador reintentando con un token que nunca va a valer.
    if (!session) {
      return json(
        { error: "La sesión expiró. Vuelve a iniciar sesión." },
        401,
        clearSessionCookies({ secure: isHttpsSite() }),
      );
    }

    return json({ ok: true }, 200, sessionCookiesFor(session));
  } catch (error) {
    console.error(
      "Error en /api/session/refresh:",
      error,
      error instanceof IdentityPasswordError ? error.detail : "",
    );

    // Un fallo de Identity no es una sesión inválida: las cookies se quedan
    // como están para que el siguiente intento pueda renovar.
    if (error instanceof IdentityPasswordError && error.userFacing) {
      return json({ error: error.message }, 503);
    }
    return json({ error: "No fue posible renovar la sesión." }, 503);
  }
}

export const dynamic = "force-dynamic";
