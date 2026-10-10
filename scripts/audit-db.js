const db = require('../server/db');

async function runAudit() {
  console.log('\n======================================================================');
  console.log('   🔍 INICIANDO AUDITORÍA INTEGRAL DE BASE DE DATOS (CRISPY POS)');
  console.log('======================================================================\n');

  try {
    await db.initDb();

    let totalAnomalias = 0;

    // CHECK 1
    console.log('--- [PRUEBA 1/9] Verificando cálculos de precios e ítems en pedidos... ---');
    const r1 = await db.query(`
      SELECT 
        o.id, o.order_number, COALESCE(o.customer_name, 'Sin Nombre') as cliente, 
        o.total_usd, o.delivery_fee_usd,
        COALESCE(SUM(oi.price * oi.quantity), 0) AS suma_items,
        ROUND((COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee_usd, 0)), 2) AS total_calculado,
        ROUND(ABS(o.total_usd - (COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee_usd, 0))), 2) AS diff
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status != 'cancelado'
      GROUP BY o.id, o.order_number, o.customer_name, o.total_usd, o.delivery_fee_usd
      HAVING ABS(o.total_usd - (COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee_usd, 0))) > 0.05
    `);
    if (r1.rows.length === 0) {
      console.log('  ✅ [PERFECTO] Todos los totales de comandas coinciden exactamente con la suma de sus productos.');
    } else {
      totalAnomalias += r1.rows.length;
      console.log(`  ❌ [DESCUADRE DETECTADO] Se encontraron ${r1.rows.length} pedido(s) con totales descuadrados:`);
      console.table(r1.rows);
    }

    // CHECK 2
    console.log('\n--- [PRUEBA 2/9] Verificando pagos registrados vs saldo en pedidos... ---');
    const r2 = await db.query(`
      SELECT 
        o.id, o.order_number, COALESCE(o.customer_name, 'Sin Nombre') as cliente, 
        o.total_usd, o.paid_amount_usd,
        COALESCE(SUM(op.amount_paid_usd), 0) AS suma_pagos,
        ROUND(ABS(COALESCE(o.paid_amount_usd, 0) - COALESCE(SUM(op.amount_paid_usd), 0)), 2) AS diff
      FROM orders o
      LEFT JOIN order_payments op ON op.order_id = o.id
      WHERE o.payment_status != 'credito' AND o.status != 'cancelado'
      GROUP BY o.id, o.order_number, o.customer_name, o.total_usd, o.paid_amount_usd
      HAVING ABS(COALESCE(o.paid_amount_usd, 0) - COALESCE(SUM(op.amount_paid_usd), 0)) > 0.05
    `);
    if (r2.rows.length === 0) {
      console.log('  ✅ [PERFECTO] Todo el dinero recibido en la tabla de pagos coincide exactamente con lo registrado en cada comanda.');
    } else {
      totalAnomalias += r2.rows.length;
      console.log(`  ❌ [DESCUADRE DETECTADO] Se encontraron ${r2.rows.length} comanda(s) con discrepancia de pagos:`);
      console.table(r2.rows);
    }

    // CHECK 3
    console.log('\n--- [PRUEBA 3/9] Verificando estados de cobro (Pagado / No Pagado)... ---');
    const r3 = await db.query(`
      SELECT 
        id, order_number, COALESCE(customer_name, 'Sin Nombre') as cliente, 
        status, payment_status, total_usd, paid_amount_usd,
        CASE 
          WHEN payment_status = 'pagado' AND (total_usd - paid_amount_usd) > 0.05 
            THEN 'Marcada PAGADA pero debe $' || ROUND(total_usd - paid_amount_usd, 2)
          WHEN payment_status = 'no_pagado' AND (paid_amount_usd >= total_usd - 0.05) AND total_usd > 0
            THEN 'Marcada NO PAGADA pero ya tiene cubierto el 100%'
          ELSE 'OK'
        END AS anomalia
      FROM orders
      WHERE status != 'cancelado' AND payment_status != 'credito'
        AND (
          (payment_status = 'pagado' AND (total_usd - paid_amount_usd) > 0.05)
          OR
          (payment_status = 'no_pagado' AND (paid_amount_usd >= total_usd - 0.05) AND total_usd > 0)
        )
    `);
    if (r3.rows.length === 0) {
      console.log('  ✅ [PERFECTO] Todos los estados de pago son transparentes y coherentes con la deuda.');
    } else {
      totalAnomalias += r3.rows.length;
      console.log(`  ❌ [ESTADOS INCONSISTENTES] Se detectaron ${r3.rows.length} orden(es):`);
      console.table(r3.rows);
    }

    // CHECK 4
    console.log('\n--- [PRUEBA 4/9] Verificando sincronización de mesas en salón... ---');
    const r4 = await db.query(`
      SELECT tc.number AS mesa, tc.name, tc.status AS estado_sistema, 'Marcada OCUPADA sin comanda activa' AS motivo
      FROM tables_config tc
      WHERE tc.status = 'ocupada'
        AND NOT EXISTS (
          SELECT 1 FROM orders o 
          WHERE o.type = 'mesa' AND o.table_number = tc.number 
            AND o.status NOT IN ('entregada', 'cancelado', 'fusionada') 
            AND o.payment_status != 'credito' AND o.archived_at IS NULL
        )
      UNION ALL
      SELECT tc.number AS mesa, tc.name, tc.status AS estado_sistema, 'Marcada LIBRE pero con comanda comiendo' AS motivo
      FROM tables_config tc
      WHERE tc.status = 'libre'
        AND EXISTS (
          SELECT 1 FROM orders o 
          WHERE o.type = 'mesa' AND o.table_number = tc.number 
            AND o.status NOT IN ('entregada', 'cancelado', 'fusionada') 
            AND o.payment_status != 'credito' AND o.archived_at IS NULL
        )
    `);
    if (r4.rows.length === 0) {
      console.log('  ✅ [PERFECTO] El mapa de mesas refleja exactamente los comensales sentados en el salón.');
    } else {
      totalAnomalias += r4.rows.length;
      console.log(`  ❌ [DESALINEACIÓN DE MESAS] Se detectaron ${r4.rows.length} mesa(s):`);
      console.table(r4.rows);
    }

    // CHECK 5
    console.log('\n--- [PRUEBA 5/9] Verificando protección de comandas a crédito... ---');
    const r5 = await db.query(`
      SELECT o.id, o.order_number, COALESCE(o.customer_name, 'Sin Nombre') as deudor, c.amount_usd, c.description
      FROM orders o
      JOIN caja_chica_transactions c ON c.order_id = o.id
      WHERE o.payment_status = 'credito'
        AND (c.description LIKE 'Cobro de comanda finalizada %' OR c.description LIKE 'Vuelto de comanda finalizada %')
    `);
    if (r5.rows.length === 0) {
      console.log('  ✅ [PERFECTO] Ninguna cuenta a crédito infló dinero de efectivo en la caja chica.');
    } else {
      totalAnomalias += r5.rows.length;
      console.log(`  ❌ [CRÉDITO EN EFECTIVO] Se encontraron ${r5.rows.length} transacciones a revisar:`);
      console.table(r5.rows);
    }

    // CHECK 6
    console.log('\n--- [PRUEBA 6/9] Verificando si existen pedidos vacíos (sin ítems)... ---');
    const r6 = await db.query(`
      SELECT o.id, o.order_number, COALESCE(o.customer_name, 'Sin Nombre') as cliente, o.created_at, o.total_usd
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE oi.id IS NULL AND o.status != 'cancelado'
    `);
    if (r6.rows.length === 0) {
      console.log('  ✅ [PERFECTO] No hay órdenes huérfanas ni vacías en el sistema.');
    } else {
      totalAnomalias += r6.rows.length;
      console.log(`  ❌ [ÓRDENES VACÍAS] Se encontraron ${r6.rows.length} orden(es) sin productos:`);
      console.table(r6.rows);
    }

    // CHECK 7
    console.log('\n--- [PRUEBA 7/9] Verificando pagos huérfanos... ---');
    const r7 = await db.query(`
      SELECT op.id, op.order_id, op.payer_name, op.amount_paid_usd, op.created_at
      FROM order_payments op
      LEFT JOIN orders o ON o.id = op.order_id
      WHERE o.id IS NULL
    `);
    if (r7.rows.length === 0) {
      console.log('  ✅ [PERFECTO] La integridad referencial de pagos es 100% sólida.');
    } else {
      totalAnomalias += r7.rows.length;
      console.log(`  ❌ [PAGOS HUÉRFANOS] Se encontraron ${r7.rows.length} pago(s) sin orden asociada:`);
      console.table(r7.rows);
    }

    // CHECK 8
    console.log('\n--- [PRUEBA 8/9] Consultando última apertura de caja chica... ---');
    const r8 = await db.query(`
      SELECT id, usd_cash AS base_usd, cop_cash AS base_cop, shift, timestamp AS fecha
      FROM caja_chica_apertura
      ORDER BY timestamp DESC LIMIT 2
    `);
    console.table(r8.rows);

    // CHECK 9
    console.log('\n--- [PRUEBA 9/9] Resumen financiero del turno activo... ---');
    const r9 = await db.query(`
      SELECT 
        COUNT(*) AS total_comandas,
        COUNT(CASE WHEN payment_status = 'pagado' THEN 1 END) AS pagadas,
        COUNT(CASE WHEN payment_status = 'no_pagado' THEN 1 END) AS pendientes,
        COUNT(CASE WHEN payment_status = 'credito' THEN 1 END) AS a_credito,
        COUNT(CASE WHEN status = 'cancelado' THEN 1 END) AS anuladas,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'pagado' THEN total_usd ELSE 0 END), 0), 2) AS cobrado_usd,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'credito' THEN total_usd ELSE 0 END), 0), 2) AS cuentas_por_cobrar_usd,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'no_pagado' THEN total_usd ELSE 0 END), 0), 2) AS mesas_abiertas_usd,
        ROUND(COALESCE(SUM(CASE WHEN payment_status IN ('pagado', 'credito') THEN total_usd ELSE 0 END), 0), 2) AS ventas_totales_usd
      FROM orders
      WHERE archived_at IS NULL
    `);
    console.table(r9.rows);

    console.log('\n======================================================================');
    if (totalAnomalias === 0) {
      console.log('   🎉 RESULTADO FINAL: BASE DE DATOS 100% LIMPIA Y SIN ANOMALÍAS');
      console.log('   No se detectaron fallos matemáticos, de dinero ni desajustes.');
    } else {
      console.log(`   ⚠️ RESULTADO FINAL: SE ENCONTRARON ${totalAnomalias} ANOMALÍA(S) A REVISAR.`);
    }
    console.log('======================================================================\n');

  } catch (err) {
    console.error('Error al ejecutar la auditoría:', err.message);
  } finally {
    process.exit(0);
  }
}

runAudit();
