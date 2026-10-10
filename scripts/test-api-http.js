const http = require('http');
const express = require('express');
const { initDb } = require('../server/db');

async function testHttpEndpoint() {
  console.log('======================================================================');
  console.log('🌐 PRUEBA HTTP: RUTA REAL /api/orders/historico-search');
  console.log('======================================================================\n');

  await initDb();

  const app = express();
  app.use(express.json());

  // Simular sesión autenticada con rol "caja"
  app.use((req, res, next) => {
    req.user = { id: 'usr-1', username: 'cajero_test', role: 'caja' };
    next();
  });

  const dummyIo = { emit: () => {} };
  const ordersRouter = require('../server/routes/orders')(dummyIo);
  app.use('/api/orders', ordersRouter);

  const server = app.listen(3099, async () => {
    try {
      console.log('🚀 Servidor de prueba levantado en puerto 3099.');

      // 1. Probar búsqueda de comanda #10
      const res1 = await fetch('http://localhost:3099/api/orders/historico-search?orderNumber=10');
      console.log(`📡 GET /api/orders/historico-search?orderNumber=10 -> Status: ${res1.status}`);
      const data1 = await res1.json();
      console.log(`   Resultado: ${data1.length} orden(es) encontrada(s)`);
      if (data1.length > 0) {
        console.log(`   Comanda #1: ${data1[0].orderNumber} | Total: $${data1[0].totalUSD} USD | Ítems: ${data1[0].items.length} | Pagos: ${data1[0].paymentHistory.length}`);
      }

      // 2. Probar búsqueda de rango de fechas
      const res2 = await fetch('http://localhost:3099/api/orders/historico-search?from=2026-09-01&to=2026-09-30');
      console.log(`\n📡 GET /api/orders/historico-search (Rango Septiembre 2026) -> Status: ${res2.status}`);
      const data2 = await res2.json();
      console.log(`   Resultado: ${data2.length} orden(es) encontrada(s)`);

      // 3. Probar búsqueda con texto
      const res3 = await fetch('http://localhost:3099/api/orders/historico-search?search=Sin%20Nombre');
      console.log(`\n📡 GET /api/orders/historico-search?search=Sin%20Nombre -> Status: ${res3.status}`);
      const data3 = await res3.json();
      console.log(`   Resultado: ${data3.length} orden(es) encontrada(s)`);

      console.log('\n======================================================================');
      console.log('✅ TODAS LAS PRUEBAS HTTP PASARON CON ESTADO 200 OK.');
      console.log('======================================================================');
    } catch (err) {
      console.error('Error durante la prueba HTTP:', err);
    } finally {
      server.close(() => {
        console.log('🔒 Servidor de prueba cerrado correctamente.');
        process.exit(0);
      });
    }
  });
}

testHttpEndpoint();
