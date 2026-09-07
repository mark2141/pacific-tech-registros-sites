import { headers } from "next/headers";
import { resolveBusinessInfo } from "../lib/business-info";
import { getEnv } from "../lib/runtime-env";
import { readRefreshCookie } from "../lib/session-cookie";
import { getAuthUser, signOutPath, previewLabel } from "./auth";
import RegistryClient from "./registry-client";
import SignIn from "@platform/sign-in";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthUser();
  if (!user) {
    // Sin sesión válida pero con token de refresco: la pantalla de acceso
    // intenta recuperarla sola antes de pedir la contraseña. Es el caso de
    // quien vuelve al día siguiente y solo se le venció el token de una hora.
    const canRestore = Boolean(
      readRefreshCookie((await headers()).get("Cookie")),
    );
    return <SignIn canRestore={canRestore} />;
  }

  // El entorno se lee aquí, en el servidor, y baja como prop. Los datos acaban
  // en el navegador de todos modos —son los que el cliente lee en su factura—
  // pero fuera del control de versiones, que es lo que se quería evitar.
  return (
    <RegistryClient
      previewLabel={previewLabel}
      userEmail={user.email}
      signOutPath={signOutPath()}
      business={resolveBusinessInfo(getEnv())}
    />
  );
}
