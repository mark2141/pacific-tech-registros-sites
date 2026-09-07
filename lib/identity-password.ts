/**
 * Alta de contraseña contra GoTrue: aceptar una invitación y recuperar el
 * acceso perdido.
 *
 * Ninguna de las dos existía mientras la puerta fue Cloudflare Access, porque
 * allí nadie tenía contraseña de esta aplicación: la identidad la resolvía
 * Access contra la cuenta corporativa. Con Identity cada persona tiene la suya,
 * y la elige ella, una sola vez, al aceptar la invitación.
 *
 * Igual que en /api/session, el canje ocurre en el servidor. El token de
 * invitación es tan bueno como una contraseña mientras dura: no debe pasar por
 * JavaScript del navegador más de lo imprescindible, ni acabar en una cookie
 * que no sea HttpOnly.
 */

export type IdentitySession = {
  accessToken: string;
  expiresIn: number;
};

export class IdentityPasswordError extends Error {
  /** Distingue "el enlace no vale" (400/401/404/410) de "Identity falló". */
  readonly userFacing: boolean;
  /**
   * Lo que respondió GoTrue, palabra por palabra. Va al log y nunca al
   * navegador. Sin esto, un 400 se convertía en "el enlace caducó" sin más, y
   * esa frase tapaba por igual un token vencido y un payload mal formado:
   * dos causas que se arreglan de forma muy distinta.
   */
  readonly detail: string;

  constructor(message: string, { userFacing = false, detail = "" } = {}) {
    super(message);
    this.name = "IdentityPasswordError";
    this.userFacing = userFacing;
    this.detail = detail;
  }
}

export type IdentityPasswordOptions = {
  /** Base del endpoint de Identity del sitio, sin barra final. */
  endpoint: string;
  /** Inyectable para las pruebas; en producción es el `fetch` del runtime. */
  fetch?: typeof fetch;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Netlify contesta con una página HTML de redirección —no con JSON— cuando la
 * protección de acceso del sitio intercepta la llamada. Eso no es un veredicto
 * de GoTrue: es que la petición no llegó a GoTrue.
 *
 * Pasó de verdad, y costó tres invitaciones. La Function llama a Identity en el
 * propio sitio, servidor contra servidor, sin las cookies de Netlify que sí
 * lleva el navegador de quien administra; con el sitio protegido, esa llamada
 * se rebotaba a `app.netlify.com/edge-access` y volvía como 401. Leído como
 * veredicto, un 401 dice "token inválido", y el mensaje mandaba a pedir otra
 * invitación que iba a fallar igual.
 */
export function looksLikeAccessGate(body: string) {
  return /^\s*<(!doctype|html)/i.test(body);
}

export const ACCESS_GATE_MESSAGE =
  "La aplicación no puede comunicarse con Netlify Identity: la protección de acceso del sitio está bloqueando la llamada. Haz el sitio público en Site configuration → Site protection.";

/** El cuerpo del error, para el log. Nunca sale por HTTP. */
async function readBody(response: Response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "(sin cuerpo legible)";
  }
}

/** Un enlace caducado, ya usado o manipulado. Nunca es un fallo de servidor. */
function isBadLink(status: number) {
  return status === 400 || status === 401 || status === 404 || status === 410;
}

function readSession(body: unknown): IdentitySession {
  const { access_token: accessToken, expires_in: expiresIn } = (body ??
    {}) as Record<string, unknown>;

  if (typeof accessToken !== "string" || !accessToken) {
    throw new IdentityPasswordError(
      "Netlify Identity no devolvió una sesión utilizable.",
    );
  }

  return {
    accessToken,
    expiresIn:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? expiresIn
        : 3600,
  };
}

async function post(
  path: string,
  payload: unknown,
  { endpoint, fetch: fetchImpl = fetch }: IdentityPasswordOptions,
  { authorization }: { authorization?: string } = {},
) {
  let response: Response;
  try {
    response = await fetchImpl(`${endpoint}${path}`, {
      method: "POST",
      headers: authorization
        ? { ...JSON_HEADERS, Authorization: authorization }
        : JSON_HEADERS,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new IdentityPasswordError(
      `No fue posible contactar con Netlify Identity: ${String(error)}`,
    );
  }

  if (!response.ok) {
    const body = await readBody(response);
    const detail = `POST ${path} → ${response.status} ${body}`;

    // Se comprueba antes que el código: una respuesta HTML invalida cualquier
    // lectura del status, porque el status no lo puso GoTrue.
    if (looksLikeAccessGate(body)) {
      throw new IdentityPasswordError(ACCESS_GATE_MESSAGE, {
        userFacing: true,
        detail,
      });
    }

    if (isBadLink(response.status)) {
      throw new IdentityPasswordError(
        "El enlace no es válido, ya fue utilizado o caducó. Pide una invitación nueva.",
        { userFacing: true, detail },
      );
    }

    throw new IdentityPasswordError(
      `Netlify Identity respondió ${response.status}.`,
      { detail },
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new IdentityPasswordError(
      `La respuesta de Netlify Identity no es JSON válido: ${String(error)}`,
    );
  }
}

/**
 * Acepta la invitación y fija la contraseña de una vez, devolviendo la sesión
 * ya iniciada: quien acaba de elegir su contraseña no debería tener que
 * escribirla otra vez en la pantalla siguiente.
 */
export async function acceptInvite(
  token: string,
  password: string,
  options: IdentityPasswordOptions,
): Promise<IdentitySession> {
  const body = await post(
    "/verify",
    { type: "signup", token, password },
    options,
  );
  return readSession(body);
}

/**
 * Canjea el token de recuperación y sustituye la contraseña.
 *
 * Van dos llamadas porque GoTrue las separa: `/verify` solo demuestra que el
 * enlace es legítimo y devuelve una sesión; la contraseña nueva se escribe
 * después, ya autenticado, contra `/user`.
 */
export async function resetPassword(
  token: string,
  password: string,
  options: IdentityPasswordOptions,
): Promise<IdentitySession> {
  const session = readSession(
    await post("/verify", { type: "recovery", token }, options),
  );

  const { endpoint, fetch: fetchImpl = fetch } = options;
  let response: Response;
  try {
    response = await fetchImpl(`${endpoint}/user`, {
      method: "PUT",
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ password }),
    });
  } catch (error) {
    throw new IdentityPasswordError(
      `No fue posible contactar con Netlify Identity: ${String(error)}`,
    );
  }

  if (!response.ok) {
    throw new IdentityPasswordError(
      `Netlify Identity rechazó la contraseña nueva (${response.status}).`,
      { detail: `PUT /user → ${response.status} ${await readBody(response)}` },
    );
  }

  return session;
}

/**
 * Pide el correo de recuperación.
 *
 * GoTrue responde igual exista o no la cuenta, y esta función mantiene esa
 * indiferencia hacia arriba: distinguir los dos casos permitiría averiguar
 * quién tiene acceso al taller probando correos.
 */
export async function requestPasswordRecovery(
  email: string,
  { endpoint, fetch: fetchImpl = fetch }: IdentityPasswordOptions,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${endpoint}/recover`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    throw new IdentityPasswordError(
      `No fue posible contactar con Netlify Identity: ${String(error)}`,
    );
  }

  // 400 aquí es "ese correo no está registrado". No se propaga: para quien
  // mira desde fuera, pedir el enlace siempre parece haber funcionado.
  if (!response.ok && !isBadLink(response.status)) {
    throw new IdentityPasswordError(
      `Netlify Identity respondió ${response.status}.`,
    );
  }
}
