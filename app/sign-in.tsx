"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import {
  parseIdentityFragment,
  type IdentityFragment,
} from "../lib/identity-fragment";
import PasswordField from "./password-field";
import RecoverPassword from "./recover-password";
import SetPassword from "./set-password";
import SignInCard from "./sign-in-card";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;
/** En el servidor no hay fragmento: el navegador nunca lo manda. */
const noHash = () => "";

/**
 * Cloudflare Access resolvía el inicio de sesión antes de llegar a la
 * aplicación, así que esta pantalla no existía. Con Netlify Identity el origen
 * es alcanzable y la aplicación tiene que pedir las credenciales ella misma.
 *
 * El formulario no toca el token: envía las credenciales a /api/session, que
 * las canjea contra Identity en el servidor y devuelve una cookie HttpOnly.
 *
 * Esta pantalla es además donde aterrizan los correos de Identity, que vuelven
 * con el token en el fragmento de la URL. Se lee aquí, en el cliente, porque el
 * navegador nunca manda el fragmento al servidor.
 *
 * El fragmento se queda en la barra de direcciones mientras dura el trámite y
 * desaparece al terminar, porque la pantalla siguiente navega con `replace`.
 * Borrarlo antes obligaría a guardarlo aparte para no perderlo a mitad, y el
 * token es de un solo uso y vida corta: no compensa.
 */
export default function SignIn({ canRestore = false }: { canRestore?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [restoring, setRestoring] = useState(canRestore);

  // Leído con useSyncExternalStore y no con un efecto: así el servidor y la
  // primera pasada del cliente coinciden —ambos ven "" y pintan el formulario
  // de acceso— y el fragmento entra en el render siguiente sin desajustar la
  // hidratación ni escribir estado desde un efecto.
  const fragment: IdentityFragment | null = parseIdentityFragment(
    useSyncExternalStore(subscribeToHash, readHash, noHash),
  );

  // Con un token de refresco guardado, se intenta recuperar la sesión antes de
  // pedir la contraseña: el token de acceso dura una hora y volver al día
  // siguiente no debería costar volver a identificarse.
  useEffect(() => {
    if (!restoring) return;
    let cancelled = false;

    void (async () => {
      let restored = false;
      try {
        const response = await fetch("/api/session/refresh", { method: "POST" });
        restored = response.ok;
      } catch {
        // Sin red: se cae al formulario, que es lo honesto.
      }
      if (cancelled) return;
      // Recarga en lugar de seguir en el cliente: la identidad la resuelve el
      // servidor en el render.
      if (restored) window.location.reload();
      else setRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [restoring]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No fue posible iniciar sesión.");
      }
      // Recarga completa a propósito: el estado de sesión lo resuelve el
      // servidor en el render, no el cliente.
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No fue posible iniciar sesión.",
      );
      setSubmitting(false);
    }
  }

  // El fragmento manda sobre la recuperación: quien llega desde un correo de
  // invitación viene a elegir contraseña, no a reanudar nada.
  if (fragment?.kind === "invite" || fragment?.kind === "recovery") {
    return <SetPassword kind={fragment.kind} token={fragment.token} />;
  }

  if (restoring) {
    return (
      <SignInCard
        title="Un momento"
        copy="Estamos reanudando tu sesión."
      >
        <p className="sign-in-copy" role="status">Comprobando tu acceso…</p>
      </SignInCard>
    );
  }

  if (recovering) {
    return <RecoverPassword onBack={() => setRecovering(false)} />;
  }

  return (
    <SignInCard
      title="Registro de equipos"
      copy="Acceso restringido al personal del taller."
    >
      <form onSubmit={signIn} aria-labelledby="sign-in-title">
        <label>
          Correo
          <input
            data-autofocus
            type="email"
            name="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@correo.com"
          />
        </label>
        <PasswordField
          label="Contraseña"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {/* Un enlace caducado o ya usado vuelve como error en el fragmento.
            Decirlo aquí evita que parezca que no pasó nada. */}
        {(error || fragment?.kind === "error") && (
          <p className="sign-in-error" role="alert">
            {error || (fragment?.kind === "error" ? fragment.message : "")}
          </p>
        )}

        <button className="primary-button" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
        <button
          className="sign-in-link"
          type="button"
          onClick={() => setRecovering(true)}
        >
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </SignInCard>
  );
}
