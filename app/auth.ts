import { getAuthUser as getIdentity } from "@platform/auth";
import { resolveRole } from "../lib/permissions";
import { getEnv } from "../lib/runtime-env";
export { signOutPath, previewLabel, supportsPasswordAuth } from "@platform/auth";
export async function getAuthUser() {
  const user = await getIdentity();
  return user ? { ...user, role: resolveRole(user, getEnv().APP_USER_ROLES) } : null;
}
