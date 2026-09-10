import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEquipmentUpdate } from '../lib/equipment-update.ts';
import { balance } from '../lib/payments.ts';
import { operationalData, roleLabels } from '../lib/permissions.ts';
import { staffInput, visibleStaff } from '../lib/staff.ts';
import { buildInvoiceEmailHref } from '../lib/invoice-email.ts';
const order={id:1,assignedTechnician:'Anthony',invoiceKind:'technician',status:'listo',exitDate:null,invoiceNumber:null,partsCostCents:9000,laborCostCents:2500,paidCents:0};
test('Factura del técnico: solo mano de obra, autor estable y correo a Pacific Tech',()=>{
 const invoice=buildEquipmentUpdate(order,{status:'entregado'});
 assert.equal(invoice.invoiceTotalCents,2500);assert.equal(invoice.invoiceTechnician,'Anthony');
 assert.equal(balance(order).totalCents,2500);
 const correction=buildEquipmentUpdate({...order,...invoice},{partsCostCents:15000});
 assert.equal(correction.invoiceTotalCents,2500);assert.equal(correction.invoiceTechnician,undefined);
 assert.throws(()=>buildEquipmentUpdate({...order,...invoice},{assignedTechnician:'Xavier'}));
 assert.throws(()=>buildEquipmentUpdate({...order,assignedTechnician:'Sin asignar'},{status:'entregado'}));
 const data=operationalData({equipment:{...order,...invoice},legacy:{invoiceKind:'customer',invoiceTotalCents:99999}},'tecnico');
 assert.equal(data.equipment.invoiceTotalCents,2500);assert.equal(data.equipment.partsCostCents,undefined);assert.equal(data.legacy.invoiceTotalCents,undefined);
 const mail=decodeURIComponent(buildInvoiceEmailHref({...order,...invoice,orderNumber:'OT-1',customerEmail:'cliente@example.test',equipmentType:'Tablet',brand:'Lenovo',model:'M10',laborDescription:'Reparación'}, {email:'taller@example.test'}));
 assert.match(mail,/mailto:taller@example.test/);assert.match(mail,/Trabajo realizado por: Anthony/);assert.doesNotMatch(mail,/cliente@example.test|90.00/);
});
test('Dos roles y vinculación explícita de nombres',()=>{
 assert.deepEqual(Object.keys(roleLabels),['admin','tecnico']);
 assert.throws(()=>staffInput({email:'a@example.test',name:'A',role:'tecnico',enabled:1}));
 const input=staffInput({email:'a@example.test',name:'A',technicianName:'Valentín',role:'tecnico',enabled:1});assert.equal(input.technicianName,'Valentín');
 assert.throws(()=>staffInput({...input,technicianName:'Otro'}));
 assert.equal(visibleStaff({...input,role:'recepcion'}).enabled,0);
});
