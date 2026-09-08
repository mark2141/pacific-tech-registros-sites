// Vite selects the implementation; these declarations only define its contract.
declare module "@platform/payments" {
  export const listPayments: typeof import("../platforms/netlify/payments").listPayments;
  export const recordPayment: typeof import("../platforms/netlify/payments").recordPayment;
}
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
declare module "@platform/inventory" {
  export const getInventoryItem: typeof import("../platforms/netlify/inventory").getInventoryItem;
  export const listInventory: typeof import("../platforms/netlify/inventory").listInventory;
  export const createInventoryItem: typeof import("../platforms/netlify/inventory").createInventoryItem;
  export const editInventoryItem: typeof import("../platforms/netlify/inventory").editInventoryItem;
  export const listInventoryMovements: typeof import("../platforms/netlify/inventory").listInventoryMovements;
  export const listOrderParts: typeof import("../platforms/netlify/inventory").listOrderParts;
  export const moveInventory: typeof import("../platforms/netlify/inventory").moveInventory;
}
declare module "@platform/files" {
  export const putFile: typeof import("../platforms/netlify/files").putFile;
  export const getFile: typeof import("../platforms/netlify/files").getFile;
  export const deleteFile: typeof import("../platforms/netlify/files").deleteFile;
}
declare module "@platform/attachments" {
  export const getAttachment: typeof import("../platforms/netlify/attachments").getAttachment;
  export const findAttachment: typeof import("../platforms/netlify/attachments").findAttachment;
  export const listAttachments: typeof import("../platforms/netlify/attachments").listAttachments;
  export const createAttachment: typeof import("../platforms/netlify/attachments").createAttachment;
}
declare module "@platform/backup" {
  export const exportRecords: typeof import("../platforms/netlify/backup").exportRecords;
}
