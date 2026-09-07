import { supportsPasswordAuth } from "../../auth";
import { requestPasswordRecovery } from "../../../lib/identity-password";
import { identityEndpoint } from "../../../lib/netlify-identity-auth";
import { jsonResponse } from "../../../lib/session-response";

/**
 * Pide a Identity el correo con el enlace de recuperación.
 *
 * La respuesta es la misma exista o no la cuenta. Contestar distinto
 * permitiría averiguar quién tiene acceso al taller probando correos, que es la
 * misma razón por la que /api/session no distingue entre contraseña incorrecta
 * y usuario inexistente.
 */
export async function POST(request: Request) {
  if (!supportsPasswordAuth) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const sent = {
    ok: true,
    message:
      "Si ese correo tiene acceso, recibirás un enlace para restablecer la contraseña.",
  };

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim() : "";

    if (!email) {
      return jsonResponse({ error: "Ingresa tu correo." }, 400);
    }

    await requestPasswordRecovery(email, { endpoint: identityEndpoint() });
    return jsonResponse(sent, 200);
  } catch (error) {
    // Ni siquiera un fallo de Identity cambia lo que ve quien lo pide: el
    // detalle va al log y la respuesta sigue siendo indistinguible.
    console.error("Error en /api/recovery:", error);
    return jsonResponse(sent, 200);
  }
}

export const dynamic = "force-dynamic";
