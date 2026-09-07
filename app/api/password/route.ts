import { supportsPasswordAuth } from "../../auth";
import {
  IdentityPasswordError,
  acceptInvite,
  resetPassword,
} from "../../../lib/identity-password";
import { identityEndpoint } from "../../../lib/netlify-identity-auth";
import { jsonResponse, sessionCookiesFor } from "../../../lib/session-response";

/**
 * Alta de contraseña: aceptar una invitación y recuperar el acceso.
 *
 * El token llega del fragmento de la URL, que la pantalla de acceso lee en el
 * navegador porque el navegador no lo manda al servidor. De ahí en adelante el
 * canje ocurre aquí: un token de invitación vale tanto como una contraseña
 * mientras dura, y la sesión que sale debe acabar en una cookie HttpOnly, no en
 * una variable de JavaScript.
 */

/** GoTrue acepta desde 6; ocho es lo que pide esta aplicación. */
export const MINIMUM_PASSWORD_LENGTH = 8;

const KINDS = new Set(["invite", "recovery"]);

export async function POST(request: Request) {
  if (!supportsPasswordAuth) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    const password =
      typeof payload.password === "string" ? payload.password : "";

    if (!KINDS.has(kind) || !token) {
      return jsonResponse(
        { error: "El enlace no es válido. Pide una invitación nueva." },
        400,
      );
    }

    // La misma comprobación que hace la pantalla, repetida aquí: la del cliente
    // es una cortesía, esta es la que manda.
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      return jsonResponse(
        {
          error: `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`,
        },
        400,
      );
    }

    const options = { endpoint: identityEndpoint() };
    const session =
      kind === "invite"
        ? await acceptInvite(token, password, options)
        : await resetPassword(token, password, options);

    return jsonResponse({ ok: true }, 200, sessionCookiesFor(session));
  } catch (error) {
    // El detalle de GoTrue va al log de la Function, donde se puede leer sin
    // exponerlo por HTTP: es lo único que distingue un token vencido de una
    // petición mal formada por nuestra parte.
    console.error(
      "Error en /api/password:",
      error,
      error instanceof IdentityPasswordError ? error.detail : "",
    );

    // Un enlace caducado o ya usado es cosa de quien lo abre, y necesita
    // saberlo para pedir otro. El resto se queda en el log: los errores hacia
    // GoTrue exponen rutas internas que no deben salir por HTTP.
    if (error instanceof IdentityPasswordError && error.userFacing) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(
      { error: "No fue posible guardar la contraseña. Inténtalo nuevamente." },
      500,
    );
  }
}

export const dynamic = "force-dynamic";
