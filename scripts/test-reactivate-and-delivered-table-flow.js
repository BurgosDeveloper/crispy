/**
 * Test script: test-reactivate-and-delivered-table-flow.js
 * Valida el flujo exacto reportado por el cliente:
 * 1. Mesa pagada por personas.
 * 2. Comanda entregada y mesa liberada (desaparece de activas).
 * 3. Comanda reactivada (vuelve a activa en salón/caja con mesa ocupada y pagos preservados).
 * 4. Al volver a marcar como entregada, la comanda se retira automáticamente y la mesa se libera sin bloqueos.
 */

const { initDb, query, getClient } = require('../server/db');
const { fetchAllOrders, fetchAllTables } = require('../server/helpers/fetchAll');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

async function runTest() {
  console.log('======================================================================');
  console.log('🧪 PRUEBA AUTOMATIZADA: REACTIVAR Y ENTREGAR MESA CON PAGO POR PERSONAS');
  console.log('======================================================================\n');

  await initDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  // Mock user
  const adminUser = { username: 'admin_test', role: 'admin', shift: 'ambos' };
  app.use((req, res, next) => {
    req.user = adminUser;
    next();
  });

  const ordersRouter = require('../server/routes/orders')(io);
  const paymentsRouter = require('../server/routes/payments')(io);
  app.use('/api/orders', ordersRouter);
  app.use('/api/orders', paymentsRouter);

  const PORT = 3099;
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`🚀 Servidor de prueba montado en puerto ${PORT}`);

  const baseUrl = `http://localhost:${PORT}/api/orders`;

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`   ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`   ❌ [FAIL] ${message}`);
      throw new Error(`Fallo en prueba: ${message}`);
    }
  }

  const testOrderId = `test_ord_reopen_${Date.now()}`;
  const testTableNumber = 8;

  try {
    // Asegurar que la mesa 8 esté libre
    await query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [testTableNumber]);

    console.log('\n📝 1. Creando orden en Mesa #8 con 2 hamburguesas ($7 cada una = $14 USD total)...');
    const orderPayload = {
      type: 'mesa',
      tableNumber: testTableNumber,
      customerName: 'Familia Perez',
      items: [
        {
          productId: 'prod-burger-1',
          productName: 'Crispy Clásica',
          price: 7,
          quantity: 1,
        },
        {
          productId: 'prod-burger-2',
          productName: 'Crispy Especial',
          price: 7,
          quantity: 1,
        },
      ],
      totalUSD: 14,
    };

    const createRes = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });
    const createdOrder = await createRes.json();
    assert(createRes.status === 201 && createdOrder.id, 'Comanda creada con éxito (HTTP 201)');

    const actualOrderId = createdOrder.id;

    // Verificar que la mesa 8 está ocupada
    const { rows: tableRows1 } = await query(`SELECT status FROM tables_config WHERE number = $1`, [testTableNumber]);
    assert(tableRows1[0]?.status === 'ocupada', 'Mesa #8 quedó marcada como OCUPADA en tables_config');

    console.log('\n👥 2. Registrando cobro dividido POR PERSONAS (Persona 1 paga $7, Persona 2 paga $7)...');
    const item1Id = createdOrder.items[0].id;
    const item2Id = createdOrder.items[1].id;

    // Pago Persona 1
    const pay1Res = await fetch(`${baseUrl}/${actualOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 7,
        paymentMethod: 'Efectivo USD',
        payerName: 'Persona 1',
        itemIds: [item1Id],
        shift: 'ambos',
      }),
    });
    assert(pay1Res.status === 200, 'Persona 1 pagó $7 USD correctamente');

    // Pago Persona 2
    const pay2Res = await fetch(`${baseUrl}/${actualOrderId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'payment',
        currency: 'USD',
        amountLocal: 7,
        paymentMethod: 'Efectivo USD',
        payerName: 'Persona 2',
        itemIds: [item2Id],
        shift: 'ambos',
      }),
    });
    assert(pay2Res.status === 200, 'Persona 2 pagó $7 USD correctamente');

    console.log('\n📦 3. Finalizando/Entregando comanda pagada por personas...');
    const finalizeRes = await fetch(`${baseUrl}/${actualOrderId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert(finalizeRes.status === 200, 'Comanda finalizada con éxito (HTTP 200)');

    const { rows: tableRows2 } = await query(`SELECT status FROM tables_config WHERE number = $1`, [testTableNumber]);
    assert(tableRows2[0]?.status === 'libre', 'Mesa #8 se liberó exitosamente (status = libre)');

    // Verificar que en activeOrders queda excluida
    const ordersAfterFinalize = await fetchAllOrders(adminUser);
    const ordCheck1 = ordersAfterFinalize.find((o) => o.id === actualOrderId);
    const isActive1 = !(ordCheck1.status === 'entregada' && (ordCheck1.paymentStatus === 'pagado' || ordCheck1.paymentStatus === 'credito'));
    assert(!isActive1, 'La comanda ya no aparece en la lista de activas');

    console.log('\n🔄 4. Reactivando la comanda saldada (reopenOrder)...');
    const reopenRes = await fetch(`${baseUrl}/${actualOrderId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const reopenedOrder = await reopenRes.json();
    assert(reopenRes.status === 200, 'Comanda reactivada exitosamente (HTTP 200)');
    assert(reopenedOrder.status === 'preparada', 'Estado de comanda reactivada es "preparada"');
    assert(reopenedOrder.paymentStatus === 'pagado', 'paymentStatus SE PRESERVÓ COMO "pagado" (NO se reseteó a no_pagado)');

    const { rows: tableRows3 } = await query(`SELECT status FROM tables_config WHERE number = $1`, [testTableNumber]);
    assert(tableRows3[0]?.status === 'ocupada', 'Mesa #8 volvió a ocuparse en tables_config');

    console.log('\n📦 5. Volviendo a marcar como ENTREGADA después de reactivar...');
    const deliverRes = await fetch(`${baseUrl}/${actualOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const deliveredOrder = await deliverRes.json();
    assert(deliverRes.status === 200, 'Comanda marcada como entregada (HTTP 200)');
    assert(deliveredOrder.status === 'entregada', 'Estado es entregada');
    assert(deliveredOrder.paymentStatus === 'pagado', 'Estado de pago sigue siendo pagado');

    const { rows: tableRows4 } = await query(`SELECT status FROM tables_config WHERE number = $1`, [testTableNumber]);
    assert(tableRows4[0]?.status === 'libre', 'Mesa #8 se LIBERÓ DE NUEVO automáticamente tras marcar como entregada');

    // Verificar que en frontend filter se excluye
    const ordersAfterDeliver = await fetchAllOrders(adminUser);
    const ordCheck2 = ordersAfterDeliver.find((o) => o.id === actualOrderId);
    const isActive2 = !(ordCheck2.status === 'entregada' && (ordCheck2.paymentStatus === 'pagado' || ordCheck2.paymentStatus === 'credito' || ((ordCheck2.paidAmountUSD || 0) > 0 && Math.max(0, ordCheck2.totalUSD - (ordCheck2.paidAmountUSD || 0)) <= 0.05)));
    assert(!isActive2, 'La comanda se quitó de nuevo de la mesa en el salón y de activas en caja');

    console.log('\n🧪 6. Caso Límite: Comanda que tenía payment_status = "no_pagado" pero con pagos completos...');
    // Forzamos manualmente payment_status = 'no_pagado' y status = 'preparada' para simular órdenes pre-existentes
    await query(`UPDATE orders SET payment_status = 'no_pagado', status = 'preparada' WHERE id = $1`, [actualOrderId]);
    await query(`UPDATE tables_config SET status = 'ocupada' WHERE number = $1`, [testTableNumber]);

    // Al marcar como entregada vía PATCH /api/orders/:id/status
    const fixRes = await fetch(`${baseUrl}/${actualOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregada' }),
    });
    const fixedOrder = await fixRes.json();
    assert(fixedOrder.paymentStatus === 'pagado', 'El backend auto-detectó los pagos y corrigió payment_status a "pagado"');

    const { rows: tableRows5 } = await query(`SELECT status FROM tables_config WHERE number = $1`, [testTableNumber]);
    assert(tableRows5[0]?.status === 'libre', 'Mesa #8 liberada exitosamente en el caso límite');

    console.log('\n======================================================================');
    console.log(`🎯 RESULTADO FINAL: ${passedTests} de ${totalTests} PRUEBAS PASARON EXITOSAMENTE (100%)`);
    console.log('   El flujo de reactivación y cierre al marcar como entregada funciona');
    console.log('   a la perfección sin alterar dinero ni dejar mesas atascadas.');
    console.log('======================================================================\n');
  } finally {
    // Limpieza de orden de prueba
    await query(`DELETE FROM order_payments WHERE order_id LIKE 'ord-%' AND payer_name IN ('Persona 1', 'Persona 2')`);
    await query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_name = 'Familia Perez')`);
    await query(`DELETE FROM orders WHERE customer_name = 'Familia Perez'`);
    await query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [testTableNumber]);
    server.close();
  }
}

runTest().catch((err) => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
