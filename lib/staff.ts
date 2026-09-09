import { roleLabels, type Role } from "./permissions.ts";
export type Staff = {id:number;email:string;name:string;role:Role;enabled:number;protected:number;version:number};
export type StaffInput = {email:string;name:string;role:Role;enabled:number};
export class StaffError extends Error { status:number; constructor(message:string,status=400){super(message);this.status=status;} }
export function staffInput(payload:Record<string,unknown>):StaffInput {
  const email=typeof payload.email==="string"?payload.email.trim().toLowerCase():"",name=typeof payload.name==="string"?payload.name.trim():"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>100)throw new StaffError("Indica un correo válido y un nombre de hasta 100 caracteres.");
  if(typeof payload.role!=="string"||!Object.hasOwn(roleLabels,payload.role))throw new StaffError("Rol inválido.");
  if(payload.enabled!==0&&payload.enabled!==1)throw new StaffError("Estado inválido.");
  return{email,name,role:payload.role as Role,enabled:payload.enabled};
}
export function protectStaff(current:Staff,input:StaffInput,actorId:number){
  if(current.email!==input.email)throw new StaffError("El correo identifica la cuenta y no puede cambiarse.");
  if((current.protected||current.id===actorId)&&(input.role!==current.role||input.enabled!==current.enabled))throw new StaffError("No puedes desactivar ni cambiar el rol de tu cuenta o del administrador protegido.",403);
}
