import { supportsPasswordAuth } from "../../auth";
import { exchangePassword } from "../../../lib/identity-grant";
import { IdentityPasswordError } from "../../../lib/identity-password";
import { identityEndpoint } from "../../../lib/netlify-identity-auth";
import { clearSessionCookies } from "../../../lib/session-cookie";
import {
  isHttpsSite,
  jsonResponse as json,
  sessionCookiesFor,
} from "../../../lib/session-response";

/**
 * Netlify Identity expone GoTrue en el propio sitio. El intercambio de
 * credenciales por token ocurre aquí, en el servidor, y no en el navegador: así
 * el token nunca pasa por JavaScript y puede guardarse en una cookie HttpOnly.
 */
export async function POST(request: Request) {
  if (!supportsPasswordAuth) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const password =
      typeof payload.password === "string" ? payload.password : "";

    if (!email || !password) {
      return json({ error: "Ingresa tu correo y tu contraseña." }, 400);
    }

    const session = await exchangePassword(email, password, {
      endpoint: identityEndpoint(),
    });
    // Un mensaje único para credenciales incorrectas y para cuentas que no
    // existen: distinguirlos permitiría enumerar quién tiene acceso al taller.
    if (!session) {
      return json({ error: "Correo o contraseña incorrectos." }, 401);
    }

    return json({ ok: true }, 200, sessionCookiesFor(session));
  } catch (error) {
    // El detalle se queda en el log: los errores de red hacia GoTrue exponen
    // rutas internas que no deben salir por HTTP.
    console.error(
      "Error en /api/session:",
      error,
      error instanceof IdentityPasswordError ? error.detail : "",
    );

    if (error instanceof IdentityPasswordError && error.userFacing) {
      return json({ error: error.message }, 503);
    }

    return json(
      { error: "No fue posible iniciar sesión. Inténtalo nuevamente." },
      500,
    );
  }
}

export async function DELETE() {
  if (!supportsPasswordAuth) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return json({ ok: true }, 200, clearSessionCookies({ secure: isHttpsSite() }));
}

export const dynamic = "force-dynamic";
