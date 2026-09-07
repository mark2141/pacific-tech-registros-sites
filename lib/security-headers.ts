// CSP conservadora a propósito: Next inyecta scripts en línea para hidratar RSC,
// así que 'unsafe-inline' es necesario en script-src. Aun así la política aporta:
// corta orígenes externos de script y de red, impide el enmarcado y bloquea
// <object>, que es de donde vienen los ataques que importan aquí.
export function contentSecurityPolicy(isDevelopment: boolean) {
  // El HMR de Vite necesita eval y un websocket; en producción no se conceden.
  const scriptSrc = isDevelopment
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";
  const connectSrc = isDevelopment ? "'self' ws: wss:" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const STATIC_HEADERS: Array<[string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"],
];

const HSTS = "max-age=31536000; includeSubDomains";

/**
 * Escribe las cabeceras sobre un objeto Headers existente. El middleware trabaja
 * así porque no puede reconstruir la respuesta: la genera el framework después.
 */
export function applySecurityHeaders(
  headers: Headers,
  url: URL,
  isDevelopment = false,
): Headers {
  for (const [name, value] of STATIC_HEADERS) headers.set(name, value);
  headers.set("Content-Security-Policy", contentSecurityPolicy(isDevelopment));
  // HSTS solo tiene sentido sobre HTTPS; enviarlo en http es ruido.
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", HSTS);
  return headers;
}

export function withSecurityHeaders(
  response: Response,
  url: URL,
  isDevelopment = false,
): Response {
  const headers = applySecurityHeaders(
    new Headers(response.headers),
    url,
    isDevelopment,
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
