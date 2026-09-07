import assert from "node:assert/strict";
import test from "node:test";
import { summarizeStatusCounts } from "../lib/equipment-summary.ts";

test("cuenta como activos solo los estados con equipo en el taller", () => {
  const { activeCount } = summarizeStatusCounts(
    { ingreso: 2, diagnostico: 1, reparacion: 3, listo: 1, entregado: 9 },
    16,
  );

  assert.equal(activeCount, 7);
});

test("una orden anulada no es un equipo en el taller", () => {
  // Era el fallo: el recuento restaba los entregados de todo lo demás, así que
  // al aparecer `anulado` una orden anulada seguía contando como activa.
  const soloAnulada = summarizeStatusCounts({ anulado: 1 }, 1);

  assert.equal(soloAnulada.activeCount, 0);
  assert.equal(soloAnulada.liveTotal, 0);
});

test("las anuladas salen del total de Todos pero no del resto", () => {
  const { activeCount, liveTotal } = summarizeStatusCounts(
    { ingreso: 4, entregado: 2, anulado: 3 },
    9,
  );

  assert.equal(activeCount, 4);
  // 9 filas menos las 3 anuladas: las entregadas siguen estando en "Todos".
  assert.equal(liveTotal, 6);
});

test("tolera recuentos ausentes y no devuelve totales negativos", () => {
  assert.deepEqual(summarizeStatusCounts({}, 0), { activeCount: 0, liveTotal: 0 });
  // Si los agregados llegaran descuadrados, un total negativo sería peor que
  // un cero: se enseña en pantalla.
  assert.equal(summarizeStatusCounts({ anulado: 5 }, 2).liveTotal, 0);
});
