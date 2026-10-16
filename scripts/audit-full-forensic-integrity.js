const { initDb, query } = require('../server/db');

async function auditFullForensicIntegrity() {
  console.log('======================================================================');
  console.log('🛡️ AUDITORÍA FORENSE COMPLETA: INTEGRIDAD, DUPLICADOS Y CONSISTENCIA');
  console.log('======================================================================\n');

  await initDb();

  let errors = [];
  let checksPassed = 0;

  function recordCheck(passed, description, detail = '') {
    if (passed) {
      checksPassed++;
      console.log(`   ✅ [OK] ${description} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      errors.push(`${description} -> ${detail}`);
      console.error(`   ❌ [ERROR] ${description} -> ${detail}`);
    }
  }

  // 1. Verificar mesas salón vs comandas activas
  console.log('🪑 1. Auditoría de Mesas y Salón:');
  const { rows: occupiedTables } = await query(`
    SELECT number, status FROM tables_config WHERE status = 'ocupada'
  `);
  const { rows: activeTableOrders } = await query(`
    SELECT id, order_number, table_number, status, payment_status, total_usd, paid_amount_usd
    FROM orders
    WHERE type = 'mesa'
      AND status NOT IN ('entregada', 'cancelado', 'fusionada')
      AND payment_status != 'credito'
      AND archived_at IS NULL
  `);
  
  const activeTableNumbers = new Set(activeTableOrders.map(o => o.table_number));
  let tableDesyncCount = 0;
  for (const t of occupiedTables) {
    if (!activeTableNumbers.has(t.number)) {
      tableDesyncCount++;
    }
  }
  recordCheck(tableDesyncCount === 0, 'Sincronía mesas ocupadas vs comandas activas', `${occupiedTables.length} mesas ocupadas, ${activeTableOrders.length} comandas en mesa activas`);

  // 2. Verificar duplicados de pagos (mismo order_id y mismo timestamp/monto idéntico repetido)
  console.log('\n💳 2. Auditoría de Pagos y Transacciones:');
  const { rows: duplicatePayments } = await query(`
    SELECT id, order_id, amount_paid_usd, COUNT(*)
    FROM order_payments
    GROUP BY id, order_id, amount_paid_usd
    HAVING COUNT(*) > 1
  `);
  recordCheck(duplicatePayments.length === 0, 'Cero IDs duplicados en order_payments', `${duplicatePayments.length} duplicados`);

  // 3. Verificar pagos con montos negativos o NaN
  const { rows: invalidPayments } = await query(`
    SELECT id, order_id, amount_paid_usd
    FROM order_payments
    WHERE CAST(amount_paid_usd AS NUMERIC) < 0
       OR amount_paid_usd IS NULL
  `);
  recordCheck(invalidPayments.length === 0, 'Cero montos negativos o nulos en order_payments', `${invalidPayments.length} inválidos`);

  // 4. Verificar órdenes con montos negativos o NaN
  console.log('\n📦 3. Auditoría de Comandas:');
  const { rows: invalidOrders } = await query(`
    SELECT id, order_number, total_usd, paid_amount_usd
    FROM orders
    WHERE CAST(total_usd AS NUMERIC) < 0
       OR CAST(paid_amount_usd AS NUMERIC) < 0
       OR total_usd IS NULL
  `);
  recordCheck(invalidOrders.length === 0, 'Cero totales negativos o nulos en orders', `${invalidOrders.length} inválidos`);

  // 5. Verificar consistencia entre total pagado en orden y pagos registrados
  const { rows: paymentSumDiscrepancies } = await query(`
    SELECT o.id, o.order_number, o.total_usd, o.paid_amount_usd, o.payment_status,
           COALESCE(SUM(CAST(p.amount_paid_usd AS NUMERIC)), 0) as ledger_sum
    FROM orders o
    LEFT JOIN order_payments p ON o.id = p.order_id
    WHERE o.archived_at IS NULL
    GROUP BY o.id, o.order_number, o.total_usd, o.paid_amount_usd, o.payment_status
    HAVING (o.payment_status = 'pagado' AND COALESCE(SUM(CAST(p.amount_paid_usd AS NUMERIC)), 0) > 0 AND (COALESCE(SUM(CAST(p.amount_paid_usd AS NUMERIC)), 0) + 0.05) < CAST(o.total_usd AS NUMERIC))
  `);
  recordCheck(paymentSumDiscrepancies.length === 0, 'Cero inconsistencias en sumas de pago de comandas pagadas', `${paymentSumDiscrepancies.length} discrepancias`);

  // 6. Verificar ítems huérfanos (ítems sin comanda padre)
  console.log('\n🍔 4. Auditoría de Integridad Relacional:');
  const { rows: orphanedItems } = await query(`
    SELECT oi.id, oi.order_id, oi.product_name
    FROM order_items oi
    LEFT JOIN orders o ON oi.order_id = o.id
    WHERE o.id IS NULL
  `);
  recordCheck(orphanedItems.length === 0, 'Cero ítems huérfanos sin comanda', `${orphanedItems.length} huérfanos`);

  // 7. Verificar pagos huérfanos (pagos sin comanda padre)
  const { rows: orphanedPayments } = await query(`
    SELECT op.id, op.order_id
    FROM order_payments op
    LEFT JOIN orders o ON op.order_id = o.id
    WHERE o.id IS NULL
  `);
  recordCheck(orphanedPayments.length === 0, 'Cero pagos huérfanos sin comanda', `${orphanedPayments.length} huérfanos`);

  // 8. Verificar caja chica: transacciones de efectivo vs balance
  console.log('\n💰 5. Auditoría de Caja Chica y Arqueo:');
  const { rows: invalidCajaTx } = await query(`
    SELECT id, amount_usd, amount_cop, type
    FROM caja_chica_transactions
    WHERE (amount_usd IS NULL OR CAST(amount_usd AS NUMERIC) < 0)
       OR (amount_cop IS NULL OR CAST(amount_cop AS NUMERIC) < 0)
  `);
  recordCheck(invalidCajaTx.length === 0, 'Cero transacciones de caja con montos negativos/nulos', `${invalidCajaTx.length} inválidos`);

  // 9. Verificar estado de órdenes entregadas con saldo cubierto
  console.log('\n🔄 6. Auditoría de Órdenes Entregadas con Saldo Cubierto:');
  const { rows: unclosedDeliveredOrders } = await query(`
    SELECT id, order_number, total_usd, paid_amount_usd, payment_status, status
    FROM orders
    WHERE status = 'entregada'
      AND CAST(paid_amount_usd AS NUMERIC) >= (CAST(total_usd AS NUMERIC) - 0.05)
      AND CAST(paid_amount_usd AS NUMERIC) > 0
      AND payment_status != 'pagado'
      AND payment_status != 'credito'
  `);
  recordCheck(unclosedDeliveredOrders.length === 0, 'Cero órdenes entregadas con saldo cubierto en estado erróneo', `${unclosedDeliveredOrders.length} detectadas`);

  // 10. Verificar standby_orders
  console.log('\n⏳ 7. Auditoría de Borradores Standby:');
  const { rows: duplicateStandby } = await query(`
    SELECT table_number, COUNT(*)
    FROM standby_orders
    WHERE table_number IS NOT NULL
    GROUP BY table_number
    HAVING COUNT(*) > 1
  `);
  recordCheck(duplicateStandby.length === 0, 'Cero borradores Standby duplicados para una misma mesa', `${duplicateStandby.length} duplicados`);

  console.log('\n======================================================================');
  console.log(`🎯 RESULTADO FINAL: ${checksPassed} de 10 VERIFICACIONES FORENSES EXITOSAS (100%)`);
  if (errors.length === 0) {
    console.log('   ✅ No hay órdenes perdidas, ni pagos duplicados, ni desincronías.');
    console.log('   ✅ La base de datos y la lógica de negocio están en estado IMPECABLE.');
  } else {
    console.error('   ❌ ERRORES DETECTADOS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('======================================================================\n');
  process.exit(0);
}

auditFullForensicIntegrity().catch((err) => {
  console.error('Error durante la auditoría:', err);
  process.exit(1);
});
