import Image from "next/image";
import { chatGPTSignInPath } from "./chatgpt-auth";

export default function SitesSignIn() {
  return <main className="app-shell">
    <section className="records-card" style={{ padding: "2rem", maxWidth: 520, margin: "10vh auto" }}>
      <Image src="/pacific-tech-logo.png" alt="Pacific Tech" width={148} height={48} />
      <h1>Registro de equipos</h1>
      <p>Accede al entorno privado de pruebas con tu cuenta de ChatGPT.</p>
      <a className="primary-button" href={chatGPTSignInPath("/")} target="_top">Entrar con ChatGPT</a>
    </section>
  </main>;
}
