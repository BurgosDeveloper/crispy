const express = require('express');
const { initDb, query } = require('../server/db');

async function runExhaustiveFilterAndAccountingTest() {
  console.log('======================================================================');
  console.log('🧪 PRUEBA EXHAUSTIVA DE TODOS LOS FILTROS Y CONTABILIDAD FORENSE');
  console.log('======================================================================\n');

  await initDb();

  // Helper para hashes criptográficos antes y después
  async function getDbFingerprints() {
    const res = await query(`
      SELECT
        (SELECT MD5(COALESCE(STRING_AGG(id || total_usd || paid_amount_usd || status || payment_status || COALESCE(archived_at::text, ''), ',' ORDER BY id), 'empty')) FROM orders) AS orders_hash,
        (SELECT MD5(COALESCE(STRING_AGG(id || order_id || price || quantity, ',' ORDER BY id), 'empty')) FROM order_items) AS items_hash,
        (SELECT MD5(COALESCE(STRING_AGG(id || order_id || amount_paid_usd || payment_method, ',' ORDER BY id), 'empty')) FROM order_payments) AS payments_hash,
        (SELECT MD5(COALESCE(STRING_AGG(id || amount_usd || description, ',' ORDER BY id), 'empty')) FROM caja_chica_transactions) AS caja_hash,
        (SELECT MD5(COALESCE(STRING_AGG(id || number || status, ',' ORDER BY id), 'empty')) FROM tables_config) AS tables_hash
    `);
    return res.rows[0];
  }

  const hashBefore = await getDbFingerprints();
  console.log('🔒 HASH CRIPTOGRÁFICO INICIAL DE LA BD:');
  console.log(`   - Hash Orders:   ${hashBefore.orders_hash}`);
  console.log(`   - Hash Items:    ${hashBefore.items_hash}`);
  console.log(`   - Hash Pagos:    ${hashBefore.payments_hash}`);
  console.log(`   - Hash Caja:     ${hashBefore.caja_hash}`);
  console.log(`   - Hash Mesas:    ${hashBefore.tables_hash}\n`);

  // Levantar servidor temporal con la ruta real de orders
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'usr-admin', username: 'admin', role: 'admin' };
    next();
  });
  const dummyIo = { emit: () => {} };
  const ordersRouter = require('../server/routes/orders')(dummyIo);
  app.use('/api/orders', ordersRouter);

  const server = app.listen(3098);
  const BASE_URL = 'http://localhost:3098/api/orders/historico-search';

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, testName, detail = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`   ✅ [PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      console.error(`   ❌ [FAIL] ${testName} - ${detail}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // PRUEBA 1: FILTRO POR NÚMERO DE COMANDA
    // -------------------------------------------------------------
    console.log('🔍 1. PROBANDO FILTROS POR NÚMERO DE COMANDA:');
    
    // Con prefijo #
    const r1 = await fetch(`${BASE_URL}?orderNumber=%2310`);
    const d1 = await r1.json();
    assert(r1.status === 200 && d1.length > 0 && d1.every(o => o.orderNumber.includes('10')), 'Filtro orderNumber con "#10"', `${d1.length} encontradas`);

    // Sin prefijo #
    const r2 = await fetch(`${BASE_URL}?orderNumber=10`);
    const d2 = await r2.json();
    assert(r2.status === 200 && d2.length > 0 && d2.every(o => o.orderNumber.includes('10')), 'Filtro orderNumber con "10" plano', `${d2.length} encontradas`);

    // Número inexistente
    const r3 = await fetch(`${BASE_URL}?orderNumber=999999`);
    const d3 = await r3.json();
    assert(r3.status === 200 && Array.isArray(d3) && d3.length === 0, 'Filtro orderNumber con número inexistente devuelve []', '0 resultados');

    // -------------------------------------------------------------
    // PRUEBA 2: FILTRO POR BÚSQUEDA DE TEXTO (CLIENTE / NOTAS / MESERO)
    // -------------------------------------------------------------
    console.log('\n🔍 2. PROBANDO FILTROS POR BÚSQUEDA DE TEXTO:');
    
    // Obtener un cliente existente de la BD
    const sampleCustomer = await query(`SELECT customer_name FROM orders WHERE customer_name IS NOT NULL AND customer_name != '' LIMIT 1`);
    if (sampleCustomer.rows.length > 0) {
      const cName = sampleCustomer.rows[0].customer_name;
      const r4 = await fetch(`${BASE_URL}?search=${encodeURIComponent(cName)}`);
      const d4 = await r4.json();
      assert(r4.status === 200 && d4.length > 0, `Búsqueda por nombre de cliente "${cName}"`, `${d4.length} encontradas`);
    }

    // Texto con mayúsculas/minúsculas indiferentes
    const r5 = await fetch(`${BASE_URL}?search=crIsPy`);
    const d5 = await r5.json();
    assert(r5.status === 200 && Array.isArray(d5), 'Búsqueda case-insensitive no arroja error');

    // -------------------------------------------------------------
    // PRUEBA 3: FILTROS POR FECHAS (DESDE / HASTA / RANGOS)
    // -------------------------------------------------------------
    console.log('\n🔍 3. PROBANDO FILTROS POR FECHA:');

    // Rango amplio conocido
    const r6 = await fetch(`${BASE_URL}?from=2026-09-01&to=2026-09-30`);
    const d6 = await r6.json();
    assert(r6.status === 200 && d6.length > 0, 'Rango por fechas solo año-mes-día (2026-09-01 a 2026-09-30)', `${d6.length} órdenes`);

    // Rango con fecha y hora (datetime-local format: T o espacio)
    const r7 = await fetch(`${BASE_URL}?from=2026-09-01T00:00&to=2026-09-30T23:59`);
    const d7 = await r7.json();
    assert(r7.status === 200 && d7.length === d6.length, 'Rango con formato datetime-local ISO (T00:00 / T23:59)', `${d7.length} órdenes`);

    // Rango futuro (debe dar 0 filas sin romperse)
    const r8 = await fetch(`${BASE_URL}?from=2030-01-01&to=2030-01-02`);
    const d8 = await r8.json();
    assert(r8.status === 200 && d8.length === 0, 'Rango futuro sin registros devuelve [] limpio', '0 órdenes');

    // -------------------------------------------------------------
    // PRUEBA 4: FILTRO POR TIPO DE SERVICIO (MESA, DELIVERY, PICKUP, CREDITO)
    // -------------------------------------------------------------
    console.log('\n🔍 4. PROBANDO FILTROS POR TIPO DE SERVICIO:');

    for (const t of ['mesa', 'delivery', 'pickup', 'credito']) {
      const rt = await fetch(`${BASE_URL}?type=${t}`);
      const dt = await rt.json();
      const valid = rt.status === 200 && dt.every(o => o.type === t);
      assert(valid, `Filtro type="${t}"`, `${dt.length} órdenes, todas con type='${t}'`);
    }

    // -------------------------------------------------------------
    // PRUEBA 5: FILTRO POR ESTADO DE PAGO (PAGADO, NO_PAGADO, CREDITO, CANCELADO)
    // -------------------------------------------------------------
    console.log('\n🔍 5. PROBANDO FILTROS POR ESTADO DE PAGO:');

    const rp1 = await fetch(`${BASE_URL}?paymentStatus=pagado`);
    const dp1 = await rp1.json();
    assert(rp1.status === 200 && dp1.every(o => o.paymentStatus === 'pagado' && o.status !== 'cancelado'), 'Filtro paymentStatus="pagado"', `${dp1.length} órdenes`);

    const rp2 = await fetch(`${BASE_URL}?paymentStatus=cancelado`);
    const dp2 = await rp2.json();
    assert(rp2.status === 200 && dp2.every(o => o.status === 'cancelado'), 'Filtro paymentStatus="cancelado"', `${dp2.length} órdenes`);

    // -------------------------------------------------------------
    // PRUEBA 6: COMBINACIÓN DE MÚLTIPLES FILTROS SIMULTÁNEOS
    // -------------------------------------------------------------
    console.log('\n🔍 6. PROBANDO FILTROS COMBINADOS:');

    const rComb = await fetch(`${BASE_URL}?type=mesa&paymentStatus=pagado&from=2026-09-01&to=2026-09-30`);
    const dComb = await rComb.json();
    const combOk = rComb.status === 200 && dComb.every(o => o.type === 'mesa' && o.paymentStatus === 'pagado');
    assert(combOk, 'Filtro combinado: Mesa + Pagada + Rango Septiembre', `${dComb.length} órdenes coincidentes`);

    // -------------------------------------------------------------
    // PRUEBA 7: INTEGRIDAD Y COMPLETITUD DE DATOS RETORNADOS
    // -------------------------------------------------------------
    console.log('\n🔍 7. VALIDACIÓN DE CAMPOS Y DETALLE FORENSE:');

    const rAll = await fetch(`${BASE_URL}?limit=500`);
    const allOrders = await rAll.json();
    assert(allOrders.length > 0, `Descarga de todas las órdenes para auditoría profunda`, `${allOrders.length} órdenes`);

    let itemsOk = true;
    let paymentsOk = true;
    let numbersOk = true;
    let customizationsOk = true;

    for (const ord of allOrders) {
      // 1. Validar que números no sean NaN
      if (isNaN(ord.totalUSD) || isNaN(ord.paidAmountUSD) || isNaN(ord.deliveryFeeUSD)) {
        numbersOk = false;
      }

      // 2. Validar que items sea un arreglo válido
      if (!Array.isArray(ord.items)) {
        itemsOk = false;
      } else {
        for (const it of ord.items) {
          if (!it.productName || typeof it.price !== 'number' || typeof it.quantity !== 'number') {
            itemsOk = false;
          }
          if (!Array.isArray(it.proteins) || !Array.isArray(it.removedIngredients)) {
            customizationsOk = false;
          }
        }
      }

      // 3. Validar historial de pagos
      if (!Array.isArray(ord.paymentHistory)) {
        paymentsOk = false;
      } else {
        for (const p of ord.paymentHistory) {
          if (typeof p.amountPaidUSD !== 'number' || isNaN(p.amountPaidUSD)) {
            paymentsOk = false;
          }
        }
      }
    }

    assert(numbersOk, 'Totales monetarios numéricos limpios (cero NaN en totalUSD, paidAmount, deliveryFee)');
    assert(itemsOk, 'Todos los ítems estructurados con productName, price y quantity válidos');
    assert(customizationsOk, 'Todas las personalizaciones estructuradas (proteins[], removedIngredients[])');
    assert(paymentsOk, 'Todos los historiales de pago estructurados con amountPaidUSD numérico');

    // -------------------------------------------------------------
    // PRUEBA 8: COMPROBACIÓN CRIPTOGRÁFICA DE INMUTABILIDAD CONTABLE
    // -------------------------------------------------------------
    console.log('\n======================================================================');
    console.log('📊 COMPARACIÓN CRIPTOGRÁFICA FINAL (ANTES vs DESPUÉS):');
    console.log('======================================================================');

    const hashAfter = await getDbFingerprints();

    assert(hashBefore.orders_hash === hashAfter.orders_hash, 'Hash MD5 de órdenes', `${hashAfter.orders_hash}`);
    assert(hashBefore.items_hash === hashAfter.items_hash, 'Hash MD5 de ítems', `${hashAfter.items_hash}`);
    assert(hashBefore.payments_hash === hashAfter.payments_hash, 'Hash MD5 de pagos', `${hashAfter.payments_hash}`);
    assert(hashBefore.caja_hash === hashAfter.caja_hash, 'Hash MD5 de caja chica', `${hashAfter.caja_hash}`);
    assert(hashBefore.tables_hash === hashAfter.tables_hash, 'Hash MD5 de mesas salón', `${hashAfter.tables_hash}`);

    console.log('\n======================================================================');
    console.log(`🎯 RESUMEN FINAL: ${passedTests} de ${totalTests} PRUEBAS PASARON EXITOSAMENTE (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('======================================================================');

  } catch (err) {
    console.error('Error durante la batería de pruebas:', err);
  } finally {
    server.close(() => {
      process.exit(0);
    });
  }
}

runExhaustiveFilterAndAccountingTest();
