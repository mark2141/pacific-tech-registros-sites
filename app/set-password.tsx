"use client";

import { FormEvent, useState } from "react";
import PasswordField from "./password-field";
import SignInCard from "./sign-in-card";

/** El mismo mínimo que exige /api/password. Aquí es cortesía; allí es la regla. */
const MINIMUM_PASSWORD_LENGTH = 8;

/**
 * Pantalla que faltaba: la que convierte un enlace de invitación en una cuenta
 * con contraseña.
 *
 * Bajo Cloudflare Access nadie tenía contraseña de esta aplicación, así que
 * este paso no existía. Con Identity, cada persona elige la suya al aceptar la
 * invitación, y sin esta pantalla el enlace del correo no llevaba a ninguna
 * parte.
 */
export default function SetPassword({
  kind,
  token,
}: {
  kind: "invite" | "recovery";
  token: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isInvite = kind === "invite";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(
        `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`,
      );
      return;
    }
    if (password !== confirmation) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, token, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No fue posible guardar la contraseña.");
      }
      // La ruta ya dejó la sesión iniciada en una cookie: quien acaba de elegir
      // su contraseña no tiene por qué escribirla otra vez. `replace` además
      // deja fuera del historial la URL que traía el token.
      window.location.replace("/");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar la contraseña.",
      );
      setSubmitting(false);
    }
  }

  return (
    <SignInCard
      title={isInvite ? "Elige tu contraseña" : "Restablece tu contraseña"}
      copy={
        isInvite
          ? "Ya casi está. Define la contraseña con la que entrarás al registro del taller."
          : "Escribe la contraseña nueva con la que entrarás al registro del taller."
      }
    >
      <form onSubmit={save} aria-labelledby="sign-in-title">
        <PasswordField
          label="Contraseña nueva"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          focusFirst
        />
        <PasswordField
          label="Repite la contraseña"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
        />

        {error && (
          <p className="sign-in-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar y entrar"}
        </button>
      </form>
    </SignInCard>
  );
}
