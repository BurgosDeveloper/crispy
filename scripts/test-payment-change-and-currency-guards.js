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
  const authRouter = require('../server/routes/auth')(io);
  app.use('/api/orders', ordersRouter);
  app.use('/api/orders', paymentsRouter);
  app.use('/api/caja-chica', cajaRouter);
  app.use('/api/auth', authRouter);

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
  let deliveryOrderId = null;
  let pickupOrderId = null;
  let binanceOrderId = null;
  let zelleOrderId = null;
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

    console.log('\n🚫 1.B Validando que NO se permite marcar como ENTREGADA sin haber cobrado ni con abono parcial...');
    const deliverUnpaidRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverUnpaidRes.status === 409, 'Bloqueado (HTTP 409) intento de entregar comanda sin pago');

    // Registrar abono parcial ($5.00 USD de $14.00 USD) y minimizar con X
    const partialRes = await fetch(`${baseUrl}/orders/${createdOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 5,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Prueba Vueltos',
      }),
    });
    const orderAfterPartial = await partialRes.json();
    assert(partialRes.status === 200 && orderAfterPartial.paymentStatus === 'parcial', 'Abono parcial de $5.00 USD registrado (estado parcial)');

    const deliverPartialRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverPartialRes.status === 409, 'Bloqueado (HTTP 409) intento de entregar comanda con abono parcial ($9.00 USD pendientes)');

    // Limpiar el abono parcial para continuar con la prueba de pago con excedente
    const partialPayId = orderAfterPartial.paymentHistory[0]?.id;
    await fetch(`${baseUrl}/orders/${createdOrderId}/payments/${partialPayId}`, { method: 'DELETE' });

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

    const deliverWithPendingChangeRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(
      deliverWithPendingChangeRes.status === 409,
      'Bloqueado (HTTP 409) intento de entregar comanda mientras tenga vuelto pendiente ($6.00 USD) — jamás desaparece en un limbo'
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

    console.log('\n🔄 6. Probando Reactivación de Mesa #7 ya cuadrada y cierre con botón Entregar...');
    const reopenRes = await fetch(`${baseUrl}/orders/${createdOrderId}/reopen`, {
      method: 'POST',
    });
    const reopenedOrder = await reopenRes.json();
    assert(reopenRes.status === 200 && reopenedOrder.status === 'preparada' && reopenedOrder.paymentStatus === 'pagado', 'Mesa #7 reactivada correctamente manteniendo su cuenta cuadrada (pagado)');

    const deliverReopenedRes = await fetch(`${baseUrl}/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const deliveredAgainOrder = await deliverReopenedRes.json();
    assert(deliverReopenedRes.status === 200 && deliveredAgainOrder.status === 'entregada' && deliveredAgainOrder.paymentStatus === 'pagado', 'Al estar cuadrada, el botón Entregar cierra la Mesa #7 reactivada y la devuelve a Histórico');

    console.log('\n🛵 7. Probando Delivery y PickUp: bloqueo de Entregar sin cuadrar y éxito al cuadrar...');
    const createDelRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delivery',
        customerName: 'Delivery Test',
        deliveryFeeUSD: 1,
        items: [{ productId: 'prod-bistro', productName: 'BISTRO', price: 9, quantity: 1 }],
        totalUSD: 10,
      }),
    });
    const delOrd = await createDelRes.json();
    deliveryOrderId = delOrd.id;
    assert(createDelRes.status === 201 && Boolean(deliveryOrderId), 'Orden Delivery creada exitosamente ($10.00 USD)');

    await new Promise((r) => setTimeout(r, 15));
    const createPickRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pickup',
        customerName: 'PickUp Test',
        items: [{ productId: 'prod-bistro', productName: 'BISTRO', price: 8, quantity: 1 }],
        totalUSD: 8,
      }),
    });
    const pickOrd = await createPickRes.json();
    pickupOrderId = pickOrd.id;
    assert(createPickRes.status === 201 && Boolean(pickupOrderId), 'Orden PickUp creada exitosamente ($8.00 USD)');

    // Intento de entregar Delivery sin pagar -> 409
    const delFail1 = await fetch(`${baseUrl}/orders/${deliveryOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(delFail1.status === 409, 'Delivery sin pagar NO permite Entregar (HTTP 409)');

    // Pago con vuelto pendiente en Delivery ($20 para $10) -> 409 al intentar entregar
    await fetch(`${baseUrl}/orders/${deliveryOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20,
        paymentMethod: 'Efectivo USD',
        payerName: 'Delivery Test',
      }),
    });
    const delFail2 = await fetch(`${baseUrl}/orders/${deliveryOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(delFail2.status === 409, 'Delivery con vuelto pendiente ($10 USD) NO permite Entregar (HTTP 409)');

    // Registrar el vuelto de $10 USD en Delivery -> ahora SÍ permite Entregar
    await fetch(`${baseUrl}/orders/${deliveryOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 10,
        paymentMethod: 'Efectivo USD',
        payerName: 'Delivery Test',
      }),
    });
    const delOk = await fetch(`${baseUrl}/orders/${deliveryOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const delFinal = await delOk.json();
    assert(delOk.status === 200 && delFinal.status === 'entregada' && delFinal.paymentStatus === 'pagado', 'Delivery 100% cuadrado en cobro y vuelto permite Entregar y pasa a Histórico');

    // PickUp con abono parcial ($3 de $8) -> 409 al intentar entregar
    await fetch(`${baseUrl}/orders/${pickupOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 3,
        paymentMethod: 'Zelle',
        payerName: 'PickUp Test',
      }),
    });
    const pickFail = await fetch(`${baseUrl}/orders/${pickupOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(pickFail.status === 409, 'PickUp con abono parcial ($3 de $8) NO permite Entregar (HTTP 409)');

    // Completar los $5 restantes en PickUp -> ahora SÍ permite Entregar
    await fetch(`${baseUrl}/orders/${pickupOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 5,
        paymentMethod: 'Efectivo USD',
        payerName: 'PickUp Test',
      }),
    });
    const pickOk = await fetch(`${baseUrl}/orders/${pickupOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const pickFinal = await pickOk.json();
    assert(pickOk.status === 200 && pickFinal.status === 'entregada' && pickFinal.paymentStatus === 'pagado', 'PickUp 100% cuadrado permite Entregar y pasa a Histórico');

    console.log('\n🟡 8. [BINANCE CON EXCEDENTE] Registrando pago de $20 USD vía Binance para comanda de $14 USD...');
    const createBinanceRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pickup',
        customerName: 'Cliente Binance Excess',
        items: [{ productId: 'prod-bistro', productName: 'BISTRO', price: 7, quantity: 2 }],
        totalUSD: 14,
      }),
    });
    const binanceOrd = await createBinanceRes.json();
    binanceOrderId = binanceOrd.id;
    assert(createBinanceRes.status === 201 && Boolean(binanceOrderId), 'Orden para Binance creada ($14.00 USD)');

    // Pagar $20 USD con Binance (genera $6 USD de vuelto pendiente)
    const binancePayRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 20,
        paymentMethod: 'Binance',
        payerName: 'Cliente Binance Excess',
      }),
    });
    const orderAfterBinance = await binancePayRes.json();
    assert(binancePayRes.status === 200, 'Pago con excedente en Binance ($20 USD para deuda de $14 USD) aceptado exitosamente (HTTP 200)');
    assert(orderAfterBinance.paymentStatus === 'parcial', 'Comanda queda en estado "parcial" mientras exista vuelto pendiente de $6 USD');
    assert(orderAfterBinance.pendingChangeUSD === 6, 'Vuelto pendiente en Binance calculado exactamente en $6.00 USD');

    // Intentar entregar sin registrar el vuelto -> debe bloquear
    const deliverBinanceBlocked = await fetch(`${baseUrl}/orders/${binanceOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverBinanceBlocked.status === 409, 'Bloqueado (HTTP 409) intento de entregar comanda de Binance con vuelto pendiente');

    // Registrar el vuelto de $6 USD en Efectivo USD
    const binanceChangeRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'USD',
        amountLocal: 6,
        paymentMethod: 'Efectivo USD',
        payerName: 'Cliente Binance Excess',
      }),
    });
    const orderAfterBinanceChange = await binanceChangeRes.json();
    assert(binanceChangeRes.status === 200, 'Vuelto de $6 USD registrado en Efectivo USD exitosamente');
    assert(orderAfterBinanceChange.paymentStatus === 'pagado', 'Comanda de Binance queda completamente saldada (paymentStatus = "pagado")');

    // Finalizar comanda de Binance
    const finalizeBinanceRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/finalize`, {
      method: 'POST',
    });
    assert(finalizeBinanceRes.status === 200, 'Comanda de Binance finalizada exitosamente tras devolver vuelto');

    // Entregar comanda de Binance (al estar cuadrada, pasa a entregada y postea contabilidad a caja chica)
    const deliverBinanceRes = await fetch(`${baseUrl}/orders/${binanceOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverBinanceRes.status === 200, 'Comanda de Binance entregada exitosamente (HTTP 200)');

    // Verificar contabilidad en Caja Chica para Binance + Efectivo USD
    const { rows: binanceCajaRows } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [binanceOrderId]);
    const binanceIngreso = binanceCajaRows.find((r) => r.type === 'ingreso' && r.payment_method === 'Binance');
    const cashEgreso = binanceCajaRows.find((r) => r.type === 'egreso' && r.payment_method === 'Efectivo USD');
    assert(
      Boolean(binanceIngreso) && Number(binanceIngreso.amount_usd) === 20,
      'Caja Chica registró ingreso exacto de +$20 USD en Binance'
    );
    assert(
      Boolean(cashEgreso) && Number(cashEgreso.amount_usd) === 6,
      'Caja Chica registró egreso exacto de -$6 USD en Efectivo USD (caja física)'
    );

    console.log('\n🔵 9. [ZELLE CON EXCEDENTE Y VUELTO EN COP] Registrando pago de $50 USD vía Zelle con vuelto en Pesos...');
    const createZelleRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'delivery',
        customerName: 'Cliente Zelle Excess',
        deliveryFeeUSD: 2,
        items: [{ productId: 'prod-bistro', productName: 'BISTRO', price: 28, quantity: 1 }],
        totalUSD: 30,
      }),
    });
    const zelleOrd = await createZelleRes.json();
    zelleOrderId = zelleOrd.id;
    assert(createZelleRes.status === 201 && Boolean(zelleOrderId), 'Orden para Zelle creada ($30.00 USD)');

    // Pagar $50 USD con Zelle ($20 USD de vuelto pendiente = 79,000 COP a tasa 3950)
    const zellePayRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 50,
        paymentMethod: 'Zelle',
        payerName: 'Cliente Zelle Excess',
      }),
    });
    const orderAfterZelle = await zellePayRes.json();
    assert(zellePayRes.status === 200, 'Pago con excedente en Zelle ($50 USD para deuda de $30 USD) aceptado exitosamente');
    assert(orderAfterZelle.pendingChangeUSD === 20, 'Vuelto pendiente en Zelle calculado exactamente en $20.00 USD');

    // Registrar vuelto en PESOS COP (79,000 COP)
    const zelleCopChangeRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'change',
        currency: 'COP',
        amountLocal: 79000,
        paymentMethod: 'Efectivo COP',
        payerName: 'Cliente Zelle Excess',
      }),
    });
    const orderAfterZelleCopChange = await zelleCopChangeRes.json();
    assert(zelleCopChangeRes.status === 200, 'Vuelto de $20 USD entregado en Efectivo COP (79,000 COP) registrado exitosamente');
    assert(orderAfterZelleCopChange.paymentStatus === 'pagado', 'Comanda de Zelle queda 100% saldada tras dar vuelto en COP');

    // Finalizar comanda de Zelle
    const finalizeZelleRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/finalize`, {
      method: 'POST',
    });
    assert(finalizeZelleRes.status === 200, 'Comanda de Zelle finalizada exitosamente');

    // Entregar comanda de Zelle
    const deliverZelleRes = await fetch(`${baseUrl}/orders/${zelleOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    assert(deliverZelleRes.status === 200, 'Comanda de Zelle entregada exitosamente (HTTP 200)');

    // Verificar contabilidad en Caja Chica para Zelle + Efectivo COP
    const { rows: zelleCajaRows } = await query(`SELECT * FROM caja_chica_transactions WHERE order_id = $1`, [zelleOrderId]);
    const zelleIngreso = zelleCajaRows.find((r) => r.type === 'ingreso' && r.payment_method === 'Zelle');
    const copEgreso = zelleCajaRows.find((r) => r.type === 'egreso' && r.payment_method === 'Efectivo COP');
    assert(
      Boolean(zelleIngreso) && Number(zelleIngreso.amount_usd) === 50,
      'Caja Chica registró ingreso exacto de +$50 USD en Zelle'
    );
    assert(
      Boolean(copEgreso) && Number(copEgreso.amount_cop) === 79000,
      'Caja Chica registró egreso exacto de -79,000 COP en Efectivo COP'
    );

    console.log('\n🔐 10. [PIN DE SEGURIDAD 6 CARACTERES / ALFANUMÉRICO] Validando verificación y actualización...');
    // Verificación con PIN inicial de 6 dígitos ('123456')
    const verifyInitPinRes = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '123456' }),
    });
    const verifyInitBody = await verifyInitPinRes.json();
    assert(verifyInitPinRes.status === 200 && verifyInitBody.valid === true, 'PIN por defecto de 6 caracteres "123456" verificado exitosamente');

    // Rechazo de PIN antiguo de 4 dígitos
    const verifyOldPinRes = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    assert(verifyOldPinRes.status === 401, 'PIN antiguo de 4 dígitos "1234" rechazado correctamente (HTTP 401)');

    // Rechazo de actualización de PIN con longitud distinta de 6
    const badLengthPinRes = await fetch(`${baseUrl}/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });
    assert(badLengthPinRes.status === 400, 'Intento de actualizar PIN a 4 caracteres rechazado (HTTP 400)');

    const badLengthPinRes2 = await fetch(`${baseUrl}/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234567' }),
    });
    assert(badLengthPinRes2.status === 400, 'Intento de actualizar PIN a 7 caracteres rechazado (HTTP 400)');

    // Actualización a clave alfanumérica de 6 caracteres
    const updateAlphanumericPinRes = await fetch(`${baseUrl}/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'CRIS#1' }),
    });
    assert(updateAlphanumericPinRes.status === 200, 'Actualización a PIN/clave alfanumérica de 6 caracteres "CRIS#1" aceptada exitosamente');

    // Verificación con nueva clave alfanumérica
    const verifyAlphanumericRes = await fetch(`${baseUrl}/auth/verify-admin-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'CRIS#1' }),
    });
    const verifyAlphanumericBody = await verifyAlphanumericRes.json();
    assert(verifyAlphanumericRes.status === 200 && verifyAlphanumericBody.valid === true, 'Clave alfanumérica "CRIS#1" verificada correctamente');

    // Restaurar PIN por defecto '123456'
    await fetch(`${baseUrl}/auth/admin-pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '123456' }),
    });
    console.log('   PIN restablecido a "123456" para operación estándar');

    console.log(`\n🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE (${passed}/${total})`);
  } finally {
    for (const oid of [createdOrderId, deliveryOrderId, pickupOrderId, binanceOrderId, zelleOrderId].filter(Boolean)) {
      await query(`DELETE FROM caja_chica_transactions WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM order_edits WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM order_payments WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM order_items WHERE order_id = $1`, [oid]);
      await query(`DELETE FROM orders WHERE id = $1`, [oid]);
    }
    await query(`UPDATE tables_config SET status = 'libre' WHERE number = 7`);
    server.close();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERROR EN LA PRUEBA:', err.message);
    process.exit(1);
  });
