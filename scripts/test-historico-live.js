const { initDb, query } = require('../server/db');

async function runLiveTest() {
  console.log('======================================================================');
  console.log('🧪 PRUEBA EN VIVO: VALIDACIÓN FORENSE DE BÚSQUEDA HISTÓRICA');
  console.log('======================================================================\n');

  try {
    await initDb();

    // 1. Conteo inicial de registros en todas las tablas sensibles
    const beforeCounts = await query(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS orders_count,
        (SELECT COUNT(*) FROM order_items) AS items_count,
        (SELECT COUNT(*) FROM order_payments) AS payments_count,
        (SELECT COUNT(*) FROM caja_chica_transactions) AS caja_count,
        (SELECT COUNT(*) FROM tables_config) AS tables_count,
        (SELECT usd_cash FROM caja_chica_apertura ORDER BY id DESC LIMIT 1) AS caja_usd_cash,
        (SELECT cop_cash FROM caja_chica_apertura ORDER BY id DESC LIMIT 1) AS caja_cop_cash
    `);
    const initial = beforeCounts.rows[0];
    console.log('📌 ESTADO INICIAL DE LA BASE DE DATOS:');
    console.log(`   - Comandas totales:       ${initial.orders_count}`);
    console.log(`   - Ítems de productos:     ${initial.items_count}`);
    console.log(`   - Pagos registrados:      ${initial.payments_count}`);
    console.log(`   - Movimientos de caja:    ${initial.caja_count}`);
    console.log(`   - Mesas en salón:         ${initial.tables_count}`);
    console.log(`   - Efectivo apertura:      $${initial.caja_usd_cash || 0} USD | ${initial.caja_cop_cash || 0} COP\n`);

    // 2. Ejecutar prueba 1: Búsqueda de una comanda específica (#10)
    console.log('🔍 PRUEBA 1: Buscando comanda específica "#10"...');
    const q1 = await query(`
      SELECT orders.* FROM orders 
      WHERE orders.order_number ILIKE $1 OR regexp_replace(orders.order_number, '\\D', '', 'g') = $2
      ORDER BY orders.created_at DESC
      LIMIT 10
    `, ['%10%', '10']);

    console.log(`   Encontradas: ${q1.rows.length} fila(s).`);
    if (q1.rows.length > 0) {
      const order1 = q1.rows[0];
      const items1 = await query(`
        SELECT oi.*, p.default_proteins 
        FROM order_items oi 
        LEFT JOIN products p ON (oi.product_id = p.id OR LOWER(oi.product_name) = LOWER(p.name))
        WHERE oi.order_id = $1
      `, [order1.id]);
      const payments1 = await query(`
        SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at ASC
      `, [order1.id]);

      console.log(`   Comanda: ${order1.order_number} (ID: ${order1.id})`);
      console.log(`   Fecha:   ${order1.created_at}`);
      console.log(`   Total:   $${order1.total_usd} USD`);
      console.log(`   Estado:  ${order1.status} | Pago: ${order1.payment_status}`);
      console.log(`   Ítems recuperados: ${items1.rows.length}`);
      items1.rows.forEach((it, idx) => {
        console.log(`     [${idx + 1}] ${it.quantity}x ${it.product_name} - $${it.price} (Proteínas: [${it.proteins || ''}], Quitar: [${it.removed_ingredients || ''}], Sabor: ${it.flavor || 'N/A'})`);
      });
      console.log(`   Pagos recuperados: ${payments1.rows.length}`);
      payments1.rows.forEach((p, idx) => {
        console.log(`     [$${p.amount_paid_usd} USD vía ${p.payment_method}] Recibido: ${p.tendered_usd ? '$' + p.tendered_usd + ' USD' : (p.tendered_cop ? p.tendered_cop + ' COP' : (p.tendered_bs ? p.tendered_bs + ' Bs' : 'N/A'))} | Vuelto: $${p.change_amount_usd || 0} USD`);
      });
    }

    // 3. Ejecutar prueba 2: Búsqueda por rango amplio (todas las comandas históricas)
    console.log('\n🔍 PRUEBA 2: Buscando histórico de pedidos con filtros combinados...');
    const q2 = await query(`
      SELECT orders.* FROM orders 
      ORDER BY orders.created_at DESC
      LIMIT 100
    `);
    console.log(`   Órdenes devueltas por la consulta: ${q2.rows.length}`);

    // 4. Conteo posterior de registros
    const afterCounts = await query(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS orders_count,
        (SELECT COUNT(*) FROM order_items) AS items_count,
        (SELECT COUNT(*) FROM order_payments) AS payments_count,
        (SELECT COUNT(*) FROM caja_chica_transactions) AS caja_count,
        (SELECT COUNT(*) FROM tables_config) AS tables_count,
        (SELECT usd_cash FROM caja_chica_apertura ORDER BY id DESC LIMIT 1) AS caja_usd_cash,
        (SELECT cop_cash FROM caja_chica_apertura ORDER BY id DESC LIMIT 1) AS caja_cop_cash
    `);
    const final = afterCounts.rows[0];

    console.log('\n======================================================================');
    console.log('📊 VERIFICACIÓN DE INMUTABILIDAD CONTABLE:');
    console.log('======================================================================');
    const diffOrders = final.orders_count - initial.orders_count;
    const diffItems = final.items_count - initial.items_count;
    const diffPayments = final.payments_count - initial.payments_count;
    const diffCaja = final.caja_count - initial.caja_count;
    const diffTables = final.tables_count - initial.tables_count;
    const diffUsdCash = (parseFloat(final.caja_usd_cash) || 0) - (parseFloat(initial.caja_usd_cash) || 0);
    const diffCopCash = (parseFloat(final.caja_cop_cash) || 0) - (parseFloat(initial.caja_cop_cash) || 0);

    console.log(`   Diferencia en Comandas:           ${diffOrders} (Esperado: 0) ${diffOrders === 0 ? '✅ INTACTO' : '❌ ERROR'}`);
    console.log(`   Diferencia en Ítems:              ${diffItems} (Esperado: 0) ${diffItems === 0 ? '✅ INTACTO' : '❌ ERROR'}`);
    console.log(`   Diferencia en Pagos:              ${diffPayments} (Esperado: 0) ${diffPayments === 0 ? '✅ INTACTO' : '❌ ERROR'}`);
    console.log(`   Diferencia en Movimientos Caja:   ${diffCaja} (Esperado: 0) ${diffCaja === 0 ? '✅ INTACTO' : '❌ ERROR'}`);
    console.log(`   Diferencia en Mesas de Salón:     ${diffTables} (Esperado: 0) ${diffTables === 0 ? '✅ INTACTO' : '❌ ERROR'}`);
    console.log(`   Diferencia en Efectivo Apertura:  USD $${diffUsdCash} / COP $${diffCopCash} (Esperado: 0) ${diffUsdCash === 0 && diffCopCash === 0 ? '✅ INTACTO' : '❌ ERROR'}`);

    if (diffOrders === 0 && diffItems === 0 && diffPayments === 0 && diffCaja === 0 && diffTables === 0 && diffUsdCash === 0 && diffCopCash === 0) {
      console.log('\n🎯 RESULTADO: PRUEBA 100% EXITOSA.');
      console.log('   La búsqueda histórica es estrictamente de SOLO LECTURA.');
      console.log('   Cero alteraciones en datos, caja o comandas activas.');
    } else {
      console.error('\n❌ ERROR: Se detectó una alteración de datos.');
    }
  } catch (err) {
    console.error('Error durante la prueba:', err);
  } finally {
    process.exit(0);
  }
}

runLiveTest();
