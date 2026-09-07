/**
 * Lectura del fragmento con el que Netlify Identity devuelve al usuario.
 *
 * Los correos de invitación y de recuperación apuntan a la raíz del sitio con
 * el token detrás de una almohadilla: `https://sitio/#invite_token=abc`. El
 * fragmento no viaja al servidor —el navegador nunca lo manda—, así que quien
 * tiene que leerlo es el cliente. En un sitio con el widget de Identity esto lo
 * hacía el widget; aquí no hay widget, y sin esta pieza el enlace de
 * invitación aterrizaba en la pantalla de acceso y el token se perdía.
 *
 * Que el token viva en el fragmento tiene una ventaja que conviene conservar:
 * no aparece en los logs del servidor ni en la cabecera Referer. Por eso la
 * pantalla lo borra de la URL en cuanto lo lee.
 */

export type IdentityFragment =
  | { kind: "invite"; token: string }
  | { kind: "recovery"; token: string }
  | { kind: "error"; message: string };

const TOKEN_KINDS: ReadonlyArray<[string, "invite" | "recovery"]> = [
  ["invite_token", "invite"],
  ["recovery_token", "recovery"],
];

/**
 * Devuelve qué trae el fragmento, o `null` si no trae nada nuestro.
 *
 * Acepta el hash tal cual lo da el navegador, con o sin la almohadilla inicial.
 */
export function parseIdentityFragment(
  hash: string | null | undefined,
): IdentityFragment | null {
  if (!hash) return null;

  const parameters = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );

  for (const [parameter, kind] of TOKEN_KINDS) {
    // URLSearchParams ya deshace el porcentaje y el "+", así que el valor sale
    // listo. Decodificarlo otra vez rompería un token que contenga un "+".
    const token = parameters.get(parameter)?.trim();
    if (token) return { kind, token };
  }

  // Identity rebota aquí también los fallos: un enlace caducado o ya usado
  // llega como `#error=access_denied&error_description=...`. Sin esta rama, un
  // token vencido se vería como "no pasa nada", que es la peor explicación.
  const error = parameters.get("error")?.trim();
  const description = parameters.get("error_description")?.trim();
  if (error || description) {
    return {
      kind: "error",
      message: description || "El enlace no es válido o ya fue utilizado.",
    };
  }

  return null;
}
