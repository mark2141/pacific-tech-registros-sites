import type { AuthUser } from "./auth-user.ts";

/**
 * Resolución de la sesión contra Netlify Identity.
 *
 * Antes esto verificaba la firma HS256 del JWT con el secreto del sitio. Ese
 * camino ya no existe: el panel de Netlify dejó de exponer el JWT secret, así
 * que no hay forma de conocer la llave con la que GoTrue firma sus tokens.
 *
 * En su lugar se le pregunta a Identity. `GET /.netlify/identity/user` con el
 * token en la cabecera devuelve el usuario cuando el token es válido y 401
 * cuando no lo es. GoTrue comprueba firma y expiración por su cuenta —lo mismo
 * que hacía la verificación local— y además ve el estado actual de la cuenta:
 * un usuario borrado o bloqueado deja de entrar en el acto, cosa que verificar
 * la firma en local no podía saber. El cambio forzado sale ganando ahí.
 *
 * El precio es una llamada de red por request. Va contra el propio sitio, así
 * que es corta, y no se cachea a propósito: guardar identidades ya resueltas
 * reintroduciría justo la ventana de revocación que este camino elimina.
 */

export type IdentityUser = AuthUser & {
  roles: string[];
};

export class IdentityLookupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IdentityLookupError";
  }
}

export type IdentityLookupOptions = {
  /** Base del endpoint de Identity del sitio, sin barra final. */
  endpoint: string;
  /** Inyectable para las pruebas; en producción es el `fetch` del runtime. */
  fetch?: typeof fetch;
};

type IdentityUserResponse = {
  id?: unknown;
  email?: unknown;
  app_metadata?: unknown;
};

function readRoles(appMetadata: unknown): string[] {
  if (!appMetadata || typeof appMetadata !== "object") return [];
  const roles = (appMetadata as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((role): role is string => typeof role === "string");
}

/**
 * Devuelve el usuario dueño del token, o `null` si Identity lo rechaza.
 *
 * Distingue "esta sesión no vale" de "no pude preguntar": lo primero es null y
 * acaba en la pantalla de acceso; lo segundo lanza, porque una caída de
 * Identity no es un usuario anónimo y presentarla como tal mandaría al usuario
 * a un formulario de acceso que tampoco va a funcionar.
 */
export async function fetchIdentityUser(
  token: string,
  { endpoint, fetch: fetchImpl = fetch }: IdentityLookupOptions,
): Promise<IdentityUser | null> {
  if (!token.trim()) return null;

  let response: Response;
  try {
    response = await fetchImpl(`${endpoint}/user`, {
      headers: { Authorization: `Bearer ${token}` },
      // La respuesta lleva la identidad del usuario: ningún intermediario debe
      // guardarla, y el runtime tampoco debe reutilizarla entre requests.
      cache: "no-store",
    });
  } catch (error) {
    throw new IdentityLookupError(
      "No fue posible consultar a Netlify Identity.",
      { cause: error },
    );
  }

  // 401 es la respuesta normal a un token caducado, revocado o falsificado, y
  // también a la cuenta que ya no existe. No es un error: es un "no".
  if (response.status === 401) return null;

  if (!response.ok) {
    throw new IdentityLookupError(
      `Netlify Identity respondió ${response.status} al validar la sesión.`,
    );
  }

  let body: IdentityUserResponse;
  try {
    body = (await response.json()) as IdentityUserResponse;
  } catch (error) {
    throw new IdentityLookupError(
      "La respuesta de Netlify Identity no es JSON válido.",
      { cause: error },
    );
  }

  // Un 200 sin correo no es una sesión anónima, es una respuesta que no
  // entendemos. Fallar es preferible a dejar pasar una identidad a medias.
  if (typeof body.email !== "string" || !body.email.trim()) {
    throw new IdentityLookupError(
      "Netlify Identity no devolvió el correo del usuario.",
    );
  }

  const email = body.email.trim();
  const userId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : email;

  return { email, userId, roles: readRoles(body.app_metadata) };
}
