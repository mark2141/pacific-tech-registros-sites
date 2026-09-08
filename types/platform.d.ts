// Vite selects the implementation; these declarations only define its contract.
// A tsconfig path would override the selected Sites alias in Vinext.
declare module "@platform/auth" {
  export const getAuthUser: typeof import("../platforms/netlify/auth").getAuthUser;
  export const signOutPath: typeof import("../platforms/netlify/auth").signOutPath;
  export const supportsPasswordAuth: boolean;
  export const previewLabel: string | null;
}
declare module "@platform/equipment" {
  export const getLastEquipmentContact: typeof import("../platforms/netlify/equipment").getLastEquipmentContact;
  export const listReportRows: typeof import("../platforms/netlify/equipment").listReportRows;
  export const getEquipment: typeof import("../platforms/netlify/equipment").getEquipment;
  export const listEquipmentHistory: typeof import("../platforms/netlify/equipment").listEquipmentHistory;
  export const addEquipmentNote: typeof import("../platforms/netlify/equipment").addEquipmentNote;
  export const listEquipment: typeof import("../platforms/netlify/equipment").listEquipment;
  export const createEquipment: typeof import("../platforms/netlify/equipment").createEquipment;
  export const updateEquipment: typeof import("../platforms/netlify/equipment").updateEquipment;
}
declare module "@platform/sign-in" {
  const SignIn: typeof import("../app/sign-in").default;
  export default SignIn;
}
