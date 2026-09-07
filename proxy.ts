import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySecurityHeaders } from "./lib/security-headers";

/**
 * En Cloudflare estas cabeceras las ponía worker/index.ts, que envolvía todas
 * las respuestas. En Netlify no hay un entry propio, así que el enganche es
 * este archivo.
 *
 * Se llama `proxy.ts` y no `middleware.ts` porque Next 16 renombró la
 * convención; vinext admite las dos, pero avisa de que la vieja está obsoleta.
 *
 * `netlify.toml` repite las mismas cabeceras para los archivos estáticos, que
 * no pasan por aquí. Que estén en los dos sitios es deliberado: si una capa
 * deja de cubrir una ruta, la otra sigue puesta.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  applySecurityHeaders(
    response.headers,
    new URL(request.url),
    process.env.NODE_ENV !== "production",
  );
  return response;
}

export const config = {
  // Los assets del framework y las imágenes optimizadas se sirven desde el CDN
  // y no necesitan pasar por la Function.
  matcher: ["/((?!_next/static|_next/image|\\.netlify|favicon\\.svg).*)"],
};
