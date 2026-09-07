"use client";

import { FormEvent, useState } from "react";
import SignInCard from "./sign-in-card";

/**
 * Pide a Identity el correo con el enlace de recuperación.
 *
 * El mensaje de confirmación es el mismo exista o no la cuenta, igual que la
 * respuesta de /api/recovery: si dijera "ese correo no está registrado",
 * cualquiera podría averiguar quién tiene acceso al taller probando correos.
 */
export default function RecoverPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "No fue posible enviar el enlace.");
      }
      setSent(data.message || "Revisa tu correo.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible enviar el enlace.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SignInCard
      title="Recuperar el acceso"
      copy="Te enviamos un enlace para elegir una contraseña nueva."
    >
      {sent ? (
        <>
          <p className="sign-in-ok" role="status">
            {sent}
          </p>
          <button className="sign-in-link" type="button" onClick={onBack}>
            Volver al acceso
          </button>
        </>
      ) : (
        <form onSubmit={requestLink} aria-labelledby="sign-in-title">
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

          {error && (
            <p className="sign-in-error" role="alert">
              {error}
            </p>
          )}

          <button className="primary-button" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar enlace"}
          </button>
          <button className="sign-in-link" type="button" onClick={onBack}>
            Volver al acceso
          </button>
        </form>
      )}
    </SignInCard>
  );
}
