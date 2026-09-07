import { getChatGPTUser, chatGPTSignOutPath } from "./chatgpt-auth";
import type { AuthUser } from "../../lib/auth-user";

// Sites validates these headers at its private access gateway. Netlify never
// imports this adapter and continues to validate its own Identity session.
export async function getAuthUser(): Promise<AuthUser | null> {
  return getChatGPTUser();
}

export const previewLabel: string | null = "Entorno de pruebas · Datos separados del taller";
export function signOutPath(): string | null { return chatGPTSignOutPath("/"); }

export const supportsPasswordAuth = false;
