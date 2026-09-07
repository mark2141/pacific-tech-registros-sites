import {
  ACCESS_GATE_MESSAGE,
  IdentityPasswordError,
  looksLikeAccessGate,
} from "./identity-password.ts";

/**
 * Canje de credenciales por sesión contra GoTrue.
 *
 * Estaba escrito dentro de /api/session, con una sola forma: usuario y
 * contraseña. Al aparecer la renovación hay dos, y las dos hablan con el mismo
 * endpoint cambiando el `grant_type`, así que viven juntas.
 *
 * La novedad es que ahora se guarda también el `refresh_token`. Antes se
 * descartaba, y con él se descartaba la única manera de prolongar la sesión:
 * el token de acceso dura una hora, así que el personal del taller tenía que
 * escribir su contraseña cada hora de trabajo.
 */

export type GrantedSession = {
  accessToken: string;
  expiresIn: number;
  /** Ausente si Identity no lo emite; la sesión entonces solo dura su hora. */
  refreshToken: string | null;
};

async function requestToken(
  endpoint: string,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<GrantedSession | null> {
  const response = await fetchImpl(`${endpoint}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    // Una respuesta HTML no es GoTrue rechazando nada: es que la petición no
    // llegó a GoTrue. Leerla como "credenciales incorrectas" manda a probar
    // contraseñas que nunca van a funcionar.
    const raw = await response.text();
    if (looksLikeAccessGate(raw)) {
      throw new IdentityPasswordError(ACCESS_GATE_MESSAGE, {
        userFacing: true,
        detail: `POST /token → ${response.status} ${raw.slice(0, 500)}`,
      });
    }
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) return null;

  const expiresIn = payload.expires_in;

  return {
    accessToken,
    expiresIn:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? expiresIn
        : 3600,
    refreshToken:
      typeof payload.refresh_token === "string" && payload.refresh_token
        ? payload.refresh_token
        : null,
  };
}

/** `null` cuando las credenciales no valen. Lanza si Identity no contestó. */
export function exchangePassword(
  email: string,
  password: string,
  { endpoint, fetch: fetchImpl = fetch }: { endpoint: string; fetch?: typeof fetch },
) {
  return requestToken(
    endpoint,
    new URLSearchParams({
      grant_type: "password",
      username: email,
      password,
    }),
    fetchImpl,
  );
}

/**
 * `null` cuando el token de refresco ya no vale —caducado, revocado o rotado—,
 * que es una respuesta normal y termina en la pantalla de acceso.
 */
export function exchangeRefreshToken(
  refreshToken: string,
  { endpoint, fetch: fetchImpl = fetch }: { endpoint: string; fetch?: typeof fetch },
) {
  return requestToken(
    endpoint,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    fetchImpl,
  );
}
