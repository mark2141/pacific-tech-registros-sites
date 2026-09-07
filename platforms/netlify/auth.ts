import { headers } from "next/headers";
import { getAuthUserFromHeaders, signOutPath } from "../../lib/auth";

export { signOutPath };

export async function getAuthUser() {
  return getAuthUserFromHeaders(await headers());
}

export const previewLabel: string | null = null;

export const supportsPasswordAuth = true;
