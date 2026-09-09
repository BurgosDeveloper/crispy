const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllOrders, fetchAllTables } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');
const { printCierreShiftTicket } = require('../helpers/thermalPrinter');

module.exports = function(io) {
  router.get('/', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura ORDER BY timestamp DESC LIMIT 1`
      );
      const { rows: txRows } = await query(
        `SELECT tx.*, o.order_number
         FROM caja_chica_transactions tx
         LEFT JOIN orders o ON o.id = tx.order_id
         WHERE tx.cierre_id IS NULL
         ORDER BY tx.timestamp DESC`
      );
      const { rows: cierreRows } = await query(
        `SELECT * FROM caja_chica_cierres ORDER BY closed_at DESC LIMIT 5`
      );

      return res.json({
        apertura: aperturaRows[0] ? {
          usdCash: parseFloat(aperturaRows[0].usd_cash),
          copCash: parseFloat(aperturaRows[0].cop_cash),
          openedAt: aperturaRows[0].timestamp,
          shift: 'ambos',
        } : { usdCash: 0, copCash: 0 },
        transacciones: txRows.map((t) => ({
          id: t.id,
          type: t.type,
          amountUSD: parseFloat(t.amount_usd),
          amountCOP: parseFloat(t.amount_cop),
          amountBs: parseFloat(t.amount_bs),
          currency: t.amount_bs > 0 ? 'Bs' : t.amount_cop > 0 ? 'COP' : 'USD',
          paymentMethod: t.payment_method,
          description: t.description,
          orderId: t.order_id || undefined,
          orderReference: t.order_id ? `Comanda ${t.order_number || t.order_id}` : 'Movimiento manual',
          timestamp: t.timestamp,
          shift: 'ambos',
        })),
        ultimoCierre: cierreRows[0] ? {
          id: cierreRows[0].id,
          openedUSD: parseFloat(cierreRows[0].opened_usd) || 0,
          openedCOP: parseFloat(cierreRows[0].opened_cop) || 0,
          totalSalesUSD: parseFloat(cierreRows[0].total_sales_usd) || 0,
          expectedUSD: parseFloat(cierreRows[0].expected_usd) || 0,
          expectedCOP: parseFloat(cierreRows[0].expected_cop) || 0,
          actualUSD: parseFloat(cierreRows[0].actual_usd) || 0,
          actualCOP: parseFloat(cierreRows[0].actual_cop) || 0,
          differenceUSD: parseFloat(cierreRows[0].difference_usd) || 0,
          differenceCOP: parseFloat(cierreRows[0].difference_cop) || 0,
          closedAt: cierreRows[0].closed_at,
          closedBy: cierreRows[0].closed_by || 'Caja',
          notes: cierreRows[0].notes || '',
          shift: 'ambos',
        } : null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al consultar Caja Chica' });
    }
  });

  router.post('/apertura', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { usdCash, copCash } = req.body;
      const apId = `ap-${Date.now()}`;

      await query(
        `INSERT INTO caja_chica_apertura (id, usd_cash, cop_cash, shift) VALUES ($1, $2, $3, 'ambos')`,
        [apId, usdCash || 0, copCash || 0]
      );

      io.emit('caja:updated');
      res.status(201).json({ success: true, usdCash, copCash });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al aperturar caja' });
    }
  });

  router.post('/transaction', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { type, amountUSD, amountCOP, amountBs, paymentMethod, description } = req.body;
      const normalizedUSD = Number(amountUSD) || 0;
      const normalizedCOP = Number(amountCOP) || 0;
      const normalizedBs = Number(amountBs) || 0;

      if (!['ingreso', 'egreso'].includes(type) || !Number.isFinite(normalizedUSD) || !Number.isFinite(normalizedCOP) || !Number.isFinite(normalizedBs) || normalizedUSD < 0 || normalizedCOP < 0 || normalizedBs < 0 || normalizedUSD + normalizedCOP + normalizedBs <= 0) {
        return res.status(400).json({ error: 'El movimiento debe tener tipo y un monto positivo válido.' });
      }

      if (typeof paymentMethod !== 'string' || !paymentMethod.trim()) {
        return res.status(400).json({ error: 'El movimiento debe indicar un método de pago.' });
      }

      const txId = `tx-${Date.now()}`;

      await query(
        `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, amount_bs, payment_method, description, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ambos')`,
        [txId, type, normalizedUSD, normalizedCOP, normalizedBs, paymentMethod.trim(), description || 'Movimiento manual']
      );

      io.emit('caja:updated');
      res.status(201).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al registrar movimiento' });
    }
  });

  router.post('/cierre', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const { actualUSD, actualCOP, notes } = req.body;
      const normalizedActualUSD = Number(actualUSD);
      const normalizedActualCOP = Number(actualCOP);
      if (!Number.isFinite(normalizedActualUSD) || !Number.isFinite(normalizedActualCOP) || normalizedActualUSD < 0 || normalizedActualCOP < 0) {
        return res.status(400).json({ error: 'Los conteos físicos USD y COP deben ser montos válidos no negativos.' });
      }

      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura ORDER BY timestamp DESC LIMIT 1`
      );
      if (!aperturaRows[0]) {
        return res.status(409).json({ error: 'Debes registrar la apertura de caja antes de hacer el arqueo.' });
      }
      const openedUSD = aperturaRows[0] ? parseFloat(aperturaRows[0].usd_cash) : 0;
      const openedCOP = aperturaRows[0] ? parseFloat(aperturaRows[0].cop_cash) : 0;
      const openedAt = aperturaRows[0] ? aperturaRows[0].timestamp : null;

      let txQuery = `SELECT * FROM caja_chica_transactions WHERE cierre_id IS NULL`;
      let queryParams = [];
      if (openedAt) {
        txQuery += ` AND timestamp >= $1`;
        queryParams.push(openedAt);
      }
      const { rows: txRows } = await query(txQuery, queryParams);
      const physicalCashTransactions = txRows.filter((transaction) => ['Efectivo USD', 'Efectivo COP'].includes(transaction.payment_method));
      const totalIngresosUSD = physicalCashTransactions.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + (parseFloat(t.amount_usd) || 0), 0);
      const totalIngresosCOP = physicalCashTransactions.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + (parseFloat(t.amount_cop) || 0), 0);
      const totalEgresosUSD = physicalCashTransactions.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + (parseFloat(t.amount_usd) || 0), 0);
      const totalEgresosCOP = physicalCashTransactions.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + (parseFloat(t.amount_cop) || 0), 0);

      const expectedUSD = openedUSD + totalIngresosUSD - totalEgresosUSD;
      const expectedCOP = openedCOP + totalIngresosCOP - totalEgresosCOP;
      const diffUSD = normalizedActualUSD - expectedUSD;
      const diffCOP = normalizedActualCOP - expectedCOP;

      // 1. Obtener desglose por método de pago de los pedidos del turno activo (Venta Neta Facturada)
      const { rows: paymentMethodRows } = await query(
        `SELECT op.payment_method, 
                SUM(CASE 
                  WHEN op.payment_method IN ('Efectivo USD', 'Zelle', 'Binance') 
                  THEN COALESCE(NULLIF(op.cash_tendered_usd, 0), op.amount_paid_usd) - COALESCE(op.change_given_usd, 0)
                  ELSE op.amount_paid_usd 
                END) as total_usd,
                SUM(CASE 
                  WHEN op.payment_method IN ('Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP') 
                  THEN COALESCE(NULLIF(op.cash_tendered_cop, 0), op.amount_paid_usd * op.cop_rate) - COALESCE(op.change_given_cop, 0)
                  ELSE 0 
                END) as total_cop,
                SUM(CASE 
                  WHEN op.payment_method IN ('Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito') 
                  THEN COALESCE(NULLIF(op.cash_tendered_bs, 0), op.amount_paid_usd * op.bs_rate) - COALESCE(op.change_given_bs, 0)
                  ELSE 0 
                END) as total_bs,
                COUNT(op.id) as count
         FROM order_payments op
         INNER JOIN orders o ON o.id = op.order_id
         WHERE o.archived_at IS NULL
         GROUP BY op.payment_method
         ORDER BY total_usd DESC`
      );

      // 2. Obtener resumen de créditos y órdenes procesadas del turno activo
      const { rows: creditSummaryRows } = await query(
        `SELECT COUNT(id) as count, COALESCE(SUM(total_usd), 0) as total_usd
         FROM orders
         WHERE payment_status = 'credito' AND archived_at IS NULL`
      );

      const { rows: shiftOrdersRows } = await query(
        `SELECT id, order_number, type, customer_name, total_usd, payment_status, status, table_number, created_at
         FROM orders
         WHERE archived_at IS NULL
         ORDER BY created_at ASC`
      );

      const totalSalesUSD = shiftOrdersRows
        .filter((o) => o.payment_status === 'pagado' || o.payment_status === 'credito')
        .reduce((sum, o) => sum + (parseFloat(o.total_usd) || 0), 0);

      const cierreId = `cierre-${Date.now()}`;

      // 3. Guardar registro en histórico de cierres
      await query(
        `INSERT INTO caja_chica_cierres (id, opened_usd, opened_cop, total_sales_usd, expected_usd, expected_cop, actual_usd, actual_cop, difference_usd, difference_cop, closed_by, notes, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ambos')`,
        [
          cierreId,
          openedUSD,
          openedCOP,
          totalSalesUSD,
          expectedUSD,
          expectedCOP,
          normalizedActualUSD,
          normalizedActualCOP,
          diffUSD,
          diffCOP,
          req.user.username || 'Caja',
          notes || 'Cierre de caja realizado'
        ]
      );

      // 4. Impresión Térmica Automática del Cierre y Arqueo
      try {
        await printCierreShiftTicket({
          shift: 'ambos',
          closedBy: req.user.username || 'Caja',
          notes: notes || 'Cierre de caja',
          openedUSD,
          openedCOP,
          expectedUSD,
          expectedCOP,
          actualUSD: normalizedActualUSD,
          actualCOP: normalizedActualCOP,
          differenceUSD: diffUSD,
          differenceCOP: diffCOP,
          totalSalesUSD,
          totalOrdersCount: shiftOrdersRows.length,
          paymentMethods: paymentMethodRows,
          creditsUSD: parseFloat(creditSummaryRows[0]?.total_usd || 0),
          creditsCount: parseInt(creditSummaryRows[0]?.count || 0, 10),
        });
        console.log(`🖨️ [IMPRESIÓN AUTOMÁTICA DE CIERRE] Ticket de cierre emitido exitosamente.`);
      } catch (printErr) {
        console.warn(`⚠️ Aviso: no se pudo imprimir ticket de cierre térmico:`, printErr.message);
      }

      // 5. Archivado de turno: Archivar TODAS las comandas del turno (pagadas, a crédito, canceladas; data 100% persistente en BD)
      const allShiftOrderIds = shiftOrdersRows.map((o) => o.id);

      if (allShiftOrderIds.length > 0) {
        await query('UPDATE orders SET archived_at = CURRENT_TIMESTAMP WHERE id = ANY($1::text[]) AND archived_at IS NULL', [allShiftOrderIds]);
        console.log(`📦 [ARCHIVADO DE TURNO] Se archivaron ${allShiftOrderIds.length} comandas del turno (incluyendo pagos y créditos; data 100% preservada en BD).`);
      }

      // 7. Marcar movimientos de caja chica con el cierreId (preservados en BD) y reiniciar apertura
      await query('UPDATE caja_chica_transactions SET cierre_id = $1 WHERE cierre_id IS NULL', [cierreId]);
      await query('DELETE FROM caja_chica_apertura');

      // 8. Liberar todas las mesas al cierre del turno (las comandas a crédito preservadas no bloquean mesas)
      await query("UPDATE tables_config SET status = 'libre'");

      // 9. Sincronización en tiempo real vía WebSocket
      const remainingOrders = await fetchAllOrders();
      const allTables = await fetchAllTables();
      io.emit('orders:sync', remainingOrders);
      io.emit('tables:sync', allTables);
      io.emit('caja:updated');

      res.json({
        success: true,
        message: 'Cierre de caja y archivado de datos completados exitosamente. Toda la información histórica queda preservada en la base de datos.',
        summary: {
          openedUSD,
          openedCOP,
          totalIngresosUSD,
          totalIngresosCOP,
          totalEgresosUSD,
          totalEgresosCOP,
          expectedUSD,
          expectedCOP,
          actualUSD: normalizedActualUSD,
          actualCOP: normalizedActualCOP,
          differenceUSD: diffUSD,
          differenceCOP: diffCOP,
          totalSalesUSD,
          purgedOrdersCount: allShiftOrderIds.length,
          archivedCreditsCount: shiftOrdersRows.filter((o) => o.payment_status === 'credito').length,
        },
      });
    } catch (err) {
      console.error('Error al realizar cierre de caja:', err);
      res.status(500).json({ error: 'Error al realizar cierre de caja' });
    }
  });

  router.get('/reporte-diario', requireRole('caja', 'admin'), async (req, res) => {
    try {
      const orders = await fetchAllOrders();
      const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

      const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);

      const byMethod = {
        Divisas: paidOrders.filter((o) => o.paymentMethod === 'Divisas').reduce((sum, o) => sum + o.totalUSD, 0),
        COP: paidOrders.filter((o) => o.paymentMethod === 'COP').reduce((sum, o) => sum + o.totalUSD, 0),
        Bs: paidOrders.filter((o) => o.paymentMethod === 'Bs').reduce((sum, o) => sum + o.totalUSD, 0),
        Binance: paidOrders.filter((o) => o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0),
      };

      const { rows: historyCierres } = await query(`SELECT * FROM caja_chica_cierres ORDER BY closed_at DESC`);

      res.json({
        totalSalesUSD: totalUSD,
        totalOrdersPaid: paidOrders.length,
        pendingOrders: orders.filter((o) => o.paymentStatus === 'no_pagado').length,
        byPaymentMethod: byMethod,
        historyCierres,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al generar reporte diario' });
    }
  });

  router.post('/ai-chat', async (req, res) => {
    try {
      const { message } = req.body;
      const lower = (message || '').toLowerCase();
      const orders = await fetchAllOrders();
      const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

      let reply = 'Consulta procesada en Crispy.';

      if (lower.includes('hamburguesa') || lower.includes('burger') || lower.includes('vendida') || lower.includes('top')) {
        const tally = {};
        paidOrders.forEach((o) => {
          o.items.forEach((it) => {
            tally[it.productName] = (tally[it.productName] || 0) + it.quantity;
          });
        });
        const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
          reply = '🍔 No hay registros de hamburguesas vendidas cobradas el día de hoy.';
        } else {
          reply = `🍔 Hamburguesas & Ítems Cobrados Hoy:\n` + entries.map(([name, qty]) => `• ${name}: ${qty} unidades`).join('\n');
        }
      } else if (lower.includes('bebida') || lower.includes('refresco') || lower.includes('tomar')) {
        let drinkQty = 0;
        paidOrders.forEach((o) => {
          o.items.forEach((it) => {
            if (it.productName.toLowerCase().includes('refresco') || it.productName.toLowerCase().includes('agua') || it.productName.toLowerCase().includes('bebida') || it.productName.toLowerCase().includes('jugo')) {
              drinkQty += it.quantity;
            }
          });
        });
        reply = `🥤 Total de Bebidas Cobradas hoy: ${drinkQty} unidades.`;
      } else if (lower.includes('caja') || lower.includes('cuadro') || lower.includes('resumen') || lower.includes('cierre')) {
        const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
        const pendingCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;
        reply = `💰 Resumen de Caja & Cierre:\n• Recaudado Total: $${totalUSD.toFixed(2)} USD\n• Comandas Cobradas: ${paidOrders.length}\n• Comandas Pendientes: ${pendingCount}`;
      } else {
        const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
        reply = `🤖 Asistente de Caja: Hay ${orders.length} comandas registradas (${paidOrders.length} cobradas) por un total de $${totalUSD.toFixed(2)} USD.`;
      }

      res.json({ reply });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error en asistente de caja' });
    }
  });

  return router;
};
