import type { AuthUser } from "./auth-user.ts";
import { fetchIdentityUser } from "./identity-token";
import { getEnv, siteUrl, type RuntimeEnv } from "./runtime-env";
import { readSessionCookie } from "./session-cookie";

/**
 * Netlify Identity, a diferencia de Cloudflare Access, no es una puerta delante
 * del origen: cualquiera puede alcanzar la Function directamente. Por eso la
 * identidad no se lee de una cabecera, sino del token guardado en la cookie de
 * sesión, que se valida contra Identity en cada request.
 *
 * La validación es una llamada a GoTrue y no una comprobación de firma local
 * porque el panel de Netlify ya no expone el JWT secret del sitio. El detalle
 * está en lib/identity-token.ts.
 */

/** Base del endpoint de Identity del sitio. La comparten sesión y validación. */
export function identityEndpoint(environment: RuntimeEnv = getEnv()) {
  return `${siteUrl(environment)}/.netlify/identity`;
}

export async function getIdentityUserFromHeaders(
  requestHeaders: Pick<Headers, "get">,
): Promise<AuthUser | null> {
  const token = readSessionCookie(requestHeaders.get("Cookie"));
  if (!token) return null;

  const user = await fetchIdentityUser(token, { endpoint: identityEndpoint() });
  if (!user) return null;

  // Con el registro en modo invitación el gate es la propia lista de usuarios.
  // Donde se quiera además separar personal de taller de otras cuentas del
  // sitio, NETLIFY_IDENTITY_REQUIRED_ROLE exige un rol concreto.
  const requiredRole = getEnv().NETLIFY_IDENTITY_REQUIRED_ROLE?.trim();
  if (requiredRole && !user.roles.includes(requiredRole)) {
    console.warn(`Sesión rechazada: ${user.email} no tiene el rol ${requiredRole}.`);
    return null;
  }

  return { email: user.email, userId: user.userId };
}
