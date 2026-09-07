"use client";

import { useId, useState } from "react";

/**
 * Campo de contraseña con interruptor para verla.
 *
 * Escribir una contraseña a ciegas en un móvil, en un taller, es donde más se
 * falla: sin poder comprobar lo escrito, un error de tecleo se confunde con
 * "la contraseña no sirve". Poder mirarla convierte ese callejón en un vistazo.
 *
 * Nace oculta y el interruptor es un botón, no una casilla, para que quede
 * fuera del recorrido de tabulación entre los campos del formulario. `aria-*`
 * anuncia el estado, porque el cambio de icono no lo dice a quien no ve.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  focusFirst = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  /** Marca el campo con data-autofocus, que es como enfoca useModal. */
  focusFirst?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <label htmlFor={inputId}>
      {label}
      <span className="password-field">
        <input
          id={inputId}
          data-autofocus={focusFirst || undefined}
          // El tipo es lo único que cambia: nada de duplicar el campo ni de
          // copiar el valor a otro sitio.
          type={visible ? "text" : "password"}
          name="password"
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible(!visible)}
          aria-pressed={visible}
          aria-controls={inputId}
          aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
          title={visible ? "Ocultar" : "Mostrar"}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </span>
    </label>
  );
}
