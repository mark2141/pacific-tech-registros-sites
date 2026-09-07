import catalogHtml from "./catalog.html?raw";
import { getAuthUser } from "../auth";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return new Response("Acceso denegado: se requiere una sesión válida.", {
      status: 403,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return new Response(catalogHtml, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
