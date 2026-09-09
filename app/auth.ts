import { getAuthUser as getIdentity } from "@platform/auth";
import { resolveRole } from "../lib/permissions";
import { getEnv } from "../lib/runtime-env";
import { ensureStaff } from "@platform/staff";
export { signOutPath, previewLabel, supportsPasswordAuth } from "@platform/auth";
export async function getAuthUser() {
  const user = await getIdentity();
  if(!user)return null;
  const account=await ensureStaff(user.email.toLowerCase(),resolveRole(user,getEnv().APP_USER_ROLES));
  return account.enabled?{...user,role:account.role,memberId:account.id}:null;
}
