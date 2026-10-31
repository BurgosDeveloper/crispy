/**
 * Test script: test-payment-change-and-currency-guards.js
 * Valida los 3 casos reportados por el jefe de la hamburguesería:
 * 1. Bug A: Permitir eliminar un pago con vuelto pendiente directamente desde la ventana de cobro sin haber cerrado la comanda.
 * 2. Bug B: Si el cajero sale de la ventana de cobro con vuelto pendiente (sin anular el pago), la comanda NO debe aparecer como "PAGADO" bloqueada, sino permitir re-entrar a dar los vueltos.
 * 3. Bug C: Bloquear montos en Pesos (ej. 5000) ingresados por error con la moneda en Dólares (USD) tanto en pagos como en vueltos y movimientos manuales de caja chica.
 */

const { initDb, query } = require('../server/db');
const { fetchAllOrders } = require('../server/helpers/fetchAll');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 PRUEBA AUTOMATIZADA: VUELTOS PENDIENTES, ANULACIÓN Y GUARDAS USD/COP');
  console.log('======================================================================\n');

  await initDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const cajaUser = { username: 'cajero_test', role: 'caja', shift: 'ambos' };
  app.use((req, res, next) => {
    req.user = cajaUser;
    next();
  });

  const ordersRouter = require('../server/routes/orders')(io);
  const paymentsRouter = require('../server/routes/payments')(io);
  const cajaRouter = require('../server/routes/caja')(io);
  app.use('/api/orders', ordersRouter);
  app.use('/api/orders', paymentsRouter);
  app.use('/api/caja-chica', cajaRouter);

  const PORT = 3098;
  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}/api`;

  let passed = 0;
  let total = 0;
  function assert(cond, msg) {
    total++;
    if (cond) {
      console.log(`   ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`   ❌ [FAIL] ${msg}`);
      throw new Error(`Fallo en prueba: ${msg}`);
    }
  }

  let createdOrderId = null;
  try {
    await query(`UPDATE tables_config SET status = 'libre' WHERE number = 7`);

    console.log('\n📝 1. Creando comanda de prueba en Mesa #7 ($14.00 USD)...');
    const createRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mesa',
        tableNumber: 7,
        customerName: 'Cliente Prueba Vueltos',
        items: [
          { productId: 'prod-bistro', productName: 'BISTRO', price: 7, quantity: 2 },
        ],
        totalUSD: 14,
      }),
    });
    const order = await createRes.json();
    createdOrderId = order.id;
    assert(createRes.status === 201 && createdOrderId, 'Comanda creada exitosamente ($14.00 USD)');

    console.log('\n💵 2. [CASO A & B] Registrando pago con dinero de más ($20.00 Efectivo USD para dar $6.00 de vuelto)...');
    const payExcessRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const orderAfterExcess = await payExcessRes.json();
    assert(payExcessRes.status === 200, 'Pago de $20.00 USD registrado (HTTP 200)');
    assert(
      orderAfterExcess.paymentStatus !== 'pagado',
      `Comanda con vuelto pendiente ($6.00 USD) NO se marca como 'pagado' prematuramente (estado actual: '${orderAfterExcess.paymentStatus}')`
    );

    const allOrdersSync = await fetchAllOrders(cajaUser);
    const syncedOrder = allOrdersSync.find((o) => o.id === createdOrderId);
    assert(
      syncedOrder && syncedOrder.paymentStatus !== 'pagado',
      `Al salir de la ventana de cobro, fetchAllOrders mantiene paymentStatus='${syncedOrder?.paymentStatus}' (NO aparece bloqueada como PAGADA, permitiendo volver a entrar a dar vuelto)`
    );

    console.log('\n🗑️ 3. [CASO A] Eliminando el pago equivocado en Efectivo USD directamente sin haber cerrado la comanda...');
    const wrongPaymentId = orderAfterExcess.paymentHistory[0]?.id;
    assert(Boolean(wrongPaymentId), 'ID del movimiento de pago obtenido');

    const delRes = await fetch(`${baseUrl}/orders/${createdOrderId}/payments/${wrongPaymentId}`, {
      method: 'DELETE',
    });
    const orderAfterDelete = await delRes.json();
    assert(delRes.status === 200, 'Movimiento de pago eliminado directamente por cajero (HTTP 200)');
    assert(orderAfterDelete.paymentHistory.length === 0, 'Historial de pagos quedó limpio (0 movimientos)');
    assert(orderAfterDelete.paymentStatus === 'no_pagado', 'Estado de pago volvió a no_pagado');
    assert(orderAfterDelete.paidAmountUSD === 0, 'Monto pagado volvió a $0.00 USD');

    console.log('\n🛡️ 4. [CASO C] Validando bloqueo de 5000 USD ingresados por error cuando eran Pesos (COP)...');
    const badUsdPaymentRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 5000,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const badUsdPaymentBody = await badUsdPaymentRes.json();
    assert(
      badUsdPaymentRes.status === 400 && badUsdPaymentBody.error.includes('PESOS (COP)'),
      `Pago de $5,000 USD rechazado correctamente (HTTP 400): "${badUsdPaymentBody.error}"`
    );

    // Ahora registrar un pago real en Pesos con excedente para generar vuelto pendiente:
    // $14 USD * 3950 = 55,300 COP. El cliente entrega 70,000 COP (vuelto pendiente: 14,700 COP ≈ $3.72 USD).
    const validCopPaymentRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'COP',
        amountLocal: 70000,
        paymentMethod: 'Efectivo COP',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const orderAfterCopPay = await validCopPaymentRes.json();
    assert(validCopPaymentRes.status === 200, 'Pago válido de 70,000 COP registrado correctamente');
    assert(orderAfterCopPay.paymentStatus === 'parcial', 'Orden queda en estado parcial mientras falte entregar los 14,700 COP de vuelto');

    // Intentar registrar 5000 de vuelto dejando por error la moneda en USD:
    const badUsdChangeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 5000,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const badUsdChangeBody = await badUsdChangeRes.json();
    assert(
      badUsdChangeRes.status === 400 && badUsdChangeBody.error.includes('PESOS (COP)'),
      `Vuelto de $5,000 USD rechazado correctamente (HTTP 400): "${badUsdChangeBody.error}"`
    );

    // Intentar registrar 5000 USD en Caja Chica manual:
    const badManualCajaRes = await fetch(`${baseUrl}/caja-chica/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'egreso',
        amountUSD: 5000,
        amountCOP: 0,
        amountBs: 0,
        paymentMethod: 'Efectivo USD',
        description: 'Vuelto equivocado',
      }),
    });
    const badManualCajaBody = await badManualCajaRes.json();
    assert(
      badManualCajaRes.status === 400 && badManualCajaBody.error.includes('COP'),
      `Movimiento manual de $5,000 USD en Caja Chica rechazado correctamente (HTTP 400): "${badManualCajaBody.error}"`
    );

    console.log('\n✅ 5. Registrando el vuelto correcto en Pesos (14,700 COP) y finalizando comanda...');
    const validCopChangeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'COP',
        amountLocal: 14700,
        paymentMethod: 'Efectivo COP',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    assert(validCopChangeRes.status === 200, 'Vuelto de 14,700 COP registrado exitosamente (HTTP 200)');

    const finalizeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/finalize`, {
      method: 'POST',
    });
    const finalizedOrder = await finalizeRes.json();
    assert(finalizeRes.status === 200, 'Comanda finalizada exitosamente tras entregar el vuelto (HTTP 200)');
    assert(finalizedOrder.paymentStatus === 'pagado' && finalizedOrder.status === 'entregada', 'Comanda quedó pagada y entregada');

    // Verificar contabilidad en caja_chica_transactions
    const { rows: cajaRows } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [createdOrderId]);
    const ingresosCOP = cajaRows.filter((r) => r.type === 'ingreso').reduce((s, r) => s + Number(r.amount_cop), 0);
    const egresosCOP = cajaRows.filter((r) => r.type === 'egreso').reduce((s, r) => s + Number(r.amount_cop), 0);
    assert(ingresosCOP === 70000 && egresosCOP === 14700 && (ingresosCOP - egresosCOP) === 55300, 'Contabilidad en Caja Chica exacta: +70,000 COP ingreso, -14,700 COP vuelto = +55,300 COP netos ($14.00 USD)');

    console.log(`\n🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE (${passed}/${total})`);
  } finally {
    if (createdOrderId) {
      await query(`DELETE FROM caja_chica_transactions WHERE order_id = $1`, [createdOrderId]);
      await query(`DELETE FROM order_edits WHERE order_id = $1`, [createdOrderId]);
      await query(`DELETE FROM order_payments WHERE order_id = $1`, [createdOrderId]);
      await query(`DELETE FROM order_items WHERE order_id = $1`, [createdOrderId]);
      await query(`DELETE FROM orders WHERE id = $1`, [createdOrderId]);
      await query(`UPDATE tables_config SET status = 'libre' WHERE number = 7`);
    }
    server.close();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERROR EN LA PRUEBA:', err.message);
    process.exit(1);
  });
