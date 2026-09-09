import test from "node:test";
import assert from "node:assert/strict";
import {staffInput,protectStaff} from "../lib/staff.ts";
import {canAccessOrder,operationalData} from "../lib/permissions.ts";
test("Usuarios: valida roles, cuenta protegida y auto bloqueo",()=>{
 const input=staffInput({email:"OWNER@EXAMPLE.TEST",name:"Dueño",role:"admin",enabled:1});assert.equal(input.email,"owner@example.test");
 const current={...input,id:1,protected:1,version:1};assert.throws(()=>protectStaff(current,{...input,role:"lectura"},2));assert.throws(()=>protectStaff({...current,protected:0},{...input,enabled:0},1));assert.doesNotThrow(()=>protectStaff(current,{...input,name:"Nombre nuevo"},2));
 assert.throws(()=>staffInput({...input,role:"constructor"}));assert.throws(()=>staffInput({...input,enabled:true}));
});
test("Alcance: la cuenta, no el nombre del técnico, decide el acceso",()=>{
 assert.equal(canAccessOrder({role:"tecnico",memberId:1},{assignedMemberId:2}),false);assert.equal(canAccessOrder({role:"tecnico",memberId:1},{assignedMemberId:1}),true);assert.equal(canAccessOrder({role:"tecnico"},{assignedMemberId:null}),false);assert.equal(canAccessOrder({role:"admin"},{assignedMemberId:null}),true);
});
test("Proyección operativa: elimina importes y eventos de cobro/contacto",()=>{
 const data={equipment:[{id:1,partsCostCents:999,paidCents:5}],history:[{kind:"pago",message:"$99"},{kind:"contacto",message:"Saldo $99"},{kind:"nota",message:"Revisado"}],summary:{monthRevenueCents:100},item:{unitCostCents:20},lastContact:{message:"Saldo"}};
 const safe=operationalData(data,"tecnico");assert.equal(safe.equipment[0].partsCostCents,undefined);assert.equal(safe.item.unitCostCents,undefined);assert.equal(safe.history.length,1);assert.equal(safe.lastContact,null);assert.deepEqual(operationalData(data,"admin"),data);
});
