"use client";

import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Marco compartido por las tres pantallas de acceso: entrar, elegir contraseña
 * y pedir el enlace de recuperación. Solo cambia el texto y el formulario.
 */
export default function SignInCard({
  title,
  copy,
  children,
}: {
  title: string;
  copy: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="sign-in">
      <section className="sign-in-card">
        <Image
          className="sign-in-logo"
          src="/pacific-tech-logo.png"
          alt="Pacific Tech Pa"
          width={148}
          height={48}
          priority
        />
        <h1 id="sign-in-title">{title}</h1>
        <p className="sign-in-copy">{copy}</p>
        {children}
      </section>
    </main>
  );
}
