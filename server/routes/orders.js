const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db');
const { fetchAllOrders, fetchAllTables } = require('../helpers/fetchAll');
const { postCompletedOrderCashMovements } = require('../helpers/cashLedger');
const { requireRole } = require('../helpers/sessionAuth');
const { assertShiftAccess } = require('../helpers/shiftScope');
const { getRatesForShift } = require('../helpers/exchangeRates');
const { printKitchenTicket, printKitchenAdditionTicket, printReceiptTicket, isKitchenItem } = require('../helpers/thermalPrinter');

async function assertOrderAccess(executor, user, orderId) {
  const { rows } = await executor.query(`SELECT shift FROM orders WHERE id = $1`, [orderId]);
  if (!rows[0]) {
    const error = new Error('Comanda no encontrada.');
    error.statusCode = 404;
    throw error;
  }
  assertShiftAccess(user, rows[0].shift);
}

module.exports = function(io) {
  router.delete('/purge-all', requireRole('admin'), async (req, res) => {
    try {
      const pgTables = [
        'order_payments',
        'order_items',
        'order_edits',
        'orders',
        'caja_chica_transactions',
        'caja_chica_cierres',
        'caja_chica_apertura',
        'exchange_rate_history',
      ];
      for (const t of pgTables) {
        await query(`TRUNCATE TABLE ${t} CASCADE`);
      }
      await query("UPDATE tables_config SET status = 'libre'");
      io.emit('orders:sync', []);
      io.emit('tables:sync', await fetchAllTables());
      io.emit('caja:updated');
      res.json({ message: 'Todos los datos de comandas, pagos, caja y mesas han sido purgados exitosamente.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al purgar los datos del sistema' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const orders = await fetchAllOrders(req.user);
      res.json(orders);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener comandas' });
    }
  });

  router.post('/', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { type, tableNumber, customerName, kitchenNotes, items, totalUSD, deliveryFeeUSD, targetPrinter } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La comanda debe incluir al menos un ítem.' });
      }

      if (type === 'delivery') {
        if (!customerName || !customerName.trim()) {
          return res.status(400).json({ error: 'Para órdenes Delivery es obligatorio ingresar el nombre del cliente.' });
        }
        if (!deliveryFeeUSD || Number(deliveryFeeUSD) <= 0) {
          return res.status(400).json({ error: 'Para órdenes Delivery es obligatorio ingresar el monto del servicio de delivery mayor a $0.' });
        }
      }

      if (type === 'pickup') {
        if (!customerName || !customerName.trim()) {
          return res.status(400).json({ error: 'Para órdenes PickUp / Para Llevar es obligatorio ingresar el nombre o referencia del cliente.' });
        }
      }

      client = await getClient();
      await client.query('BEGIN');
      const orderId = `ord-${Date.now()}`;

      let nextNum = 1;
      try {
        const maxRes = await client.query(
          `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '') AS INTEGER)), 0) AS max_num FROM orders WHERE archived_at IS NULL`
        );
        nextNum = 1 + parseInt(maxRes.rows[0]?.max_num || '0', 10);
      } catch (e) {
        const countRes = await client.query(`SELECT COUNT(*) FROM orders WHERE archived_at IS NULL`);
        nextNum = 1 + parseInt(countRes.rows[0]?.count || '0', 10);
      }
      const orderNumber = `#${nextNum}`;

      const isPickupOrDelivery = type === 'delivery' || type === 'pickup';
      const requiresKitchen = isPickupOrDelivery || (items || []).some(it => isKitchenItem(it));
      const initialStatus = requiresKitchen ? 'en_preparacion' : 'preparada';

      console.log(`📝 [COMANDA RECIBIDA] ${orderNumber} (${(type || 'mesa').toUpperCase()}) | Cliente: ${customerName || 'N/A'} | Items: ${items?.length || 0} | Total: $${totalUSD} | Requiere Cocina: ${requiresKitchen}`);

      await client.query(
        `INSERT INTO orders (id, order_number, type, table_number, customer_name, kitchen_notes, status, payment_status, total_usd, waiter_name, shift, delivery_fee_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'no_pagado', $8, 'Mesero', 'ambos', $9)`,
        [orderId, orderNumber, type || 'mesa', tableNumber || null, customerName || null, kitchenNotes || null, initialStatus, totalUSD || 0, deliveryFeeUSD || 0]
      );

      for (const item of items) {
        const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, notes, drink_type, category, proteins, is_cut, cut_preference)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            itemId,
            orderId,
            item.productId || 'prod-custom',
            item.productName || 'Producto',
            item.price || 0,
            item.quantity || 1,
            item.size || 'Grande',
            !!item.isHalfHalf,
            JSON.stringify(item.halfDetails || null),
            item.removedIngredients || [],
            JSON.stringify(item.extras || []),
            item.sugarPreference || null,
            !!item.isTakeaway,
            item.notes || '',
            item.drinkType || item.drink_type || null,
            item.category || null,
            item.proteins || [],
            !!(item.isCut || item.is_cut || item.cutPreference === 'Picada'),
            item.cutPreference || item.cut_preference || (item.isCut ? 'Picada' : 'Entera'),
          ]
        );
      }

      if (type === 'mesa' && tableNumber) {
        await client.query("UPDATE tables_config SET status = 'ocupada' WHERE number = $1", [tableNumber]);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const createdOrder = allOrders.find((o) => o.id === orderId) || {
        id: orderId,
        orderNumber,
        type,
        tableNumber,
        customerName,
        kitchenNotes,
        status: initialStatus,
        paymentStatus: 'no_pagado',
        totalUSD,
        deliveryFeeUSD,
        shift: req.user.shift || 'ambos',
        createdAt: new Date().toISOString(),
        items: items || []
      };

      io.emit('order:created', createdOrder);
      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);

      console.log(`✅ [COMANDA REGISTRADA OK] ${createdOrder.orderNumber} enviada a WebSocket`);
      if (requiresKitchen && targetPrinter !== 'ninguna') {
        void printKitchenTicket(createdOrder, targetPrinter || 'cocina')
          .then((result) => {
            if (result.printed) console.log(`🖨️ [COMANDA IMPRESA] ${createdOrder.orderNumber} en ${targetPrinter || 'cocina'} (${result.copies} copia${result.copies === 1 ? '' : 's'})`);
          })
          .catch((printError) => {
            console.error(`⚠️ [IMPRESIÓN PENDIENTE] ${createdOrder.orderNumber}: ${printError.message}`);
            io.emit('order:print_failed', {
              orderId: createdOrder.id,
              orderNumber: createdOrder.orderNumber,
              message: printError.message,
            });
          });
      }
      res.status(201).json(createdOrder);
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('❌ Error general al crear comanda:', err);
      res.status(500).json({ error: 'Error al crear la comanda en el servidor' });
    }
  });

  router.patch('/:id/status', requireRole('cocina', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!['en_preparacion', 'preparada', 'entregada', 'cancelado'].includes(status)) {
        return res.status(400).json({ error: 'El estado de comanda no es válido.' });
      }

      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);
      const { rows } = await client.query(
        `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      if (status === 'entregada') {
        const { rows: ordRows } = await client.query('SELECT table_number, type FROM orders WHERE id = $1', [id]);
        if (ordRows[0]?.type === 'mesa' && ordRows[0]?.table_number) {
          const { rows: otherOrders } = await client.query(
            `SELECT id FROM orders WHERE type = 'mesa' AND table_number = $1 AND id != $2 AND status NOT IN ('entregada', 'cancelado', 'fusionada') AND payment_status != 'credito' AND archived_at IS NULL`,
            [ordRows[0].table_number, id]
          );
          if (otherOrders.length === 0) {
            await client.query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [ordRows[0].table_number]);
          }
        }
      }

      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = allOrders.find((o) => o.id === id);

      io.emit('order:status_updated', updatedOrder);
      
      if (status === 'preparada') {
        io.emit('order:prepared_sound', updatedOrder);
      }

      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');

      res.json(updatedOrder);
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar estado de comanda' });
    }
  });

  router.delete('/:id', requireRole('caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, table_number, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const order = orderRows[0];

      // 1. Eliminar transacciones de caja chica vinculadas a la comanda
      await client.query(`DELETE FROM caja_chica_transactions WHERE order_id = $1`, [id]);

      // 2. Eliminar auditorías de edición
      await client.query(`DELETE FROM order_edits WHERE order_id = $1`, [id]);

      // 3. Eliminar pagos de la comanda
      await client.query(`DELETE FROM order_payments WHERE order_id = $1`, [id]);

      // 4. Eliminar ítems de la comanda
      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);

      // 5. Eliminar la comanda de la tabla orders
      await client.query(`DELETE FROM orders WHERE id = $1`, [id]);

      // 6. Liberar la mesa si corresponde
      if (order.table_number) {
        await client.query(`UPDATE tables_config SET status = 'libre' WHERE number = $1`, [order.table_number]);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables();

      io.emit('order:deleted', { id, orderNumber: order.order_number });
      io.emit('orders:sync', allOrders);
      io.emit('tables:sync', allTables);
      io.emit('caja:updated');

      console.log(`🗑️ [COMANDA ANULADA/ELIMINADA] ${order.order_number} (${id}) eliminada completamente del sistema por ${req.user.username}`);
      res.json({ success: true, message: `Comanda ${order.order_number} eliminada del sistema.`, deletedId: id });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al anular/eliminar comanda:', err);
      res.status(500).json({ error: 'Error al anular la comanda en el servidor: ' + (err.message || err) });
    }
  });

  router.patch('/:id/cancel', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;

      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);
      const { rows } = await client.query(
        `UPDATE orders SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
        [id]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const cancelledOrder = allOrders.find((o) => o.id === id);

      io.emit('order:cancelled', cancelledOrder);
      io.emit('order:cancelled_sound', cancelledOrder);
      io.emit('orders:sync', allOrders);
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');

      console.log(`🚫 [COMANDA CANCELADA] ${cancelledOrder?.orderNumber || id} - Alerta sonora enviada a Cocina`);
      res.json({ success: true, order: cancelledOrder });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al cancelar comanda:', err);
      res.status(500).json({ error: 'Error al cancelar la comanda' });
    }
  });

  router.patch('/:id/edit', requireRole('caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { items, kitchenNotes, totalUSD, deliveryFeeUSD, customerName, tableNumber, type, paymentStatus } = req.body;
      if (req.user.role !== 'admin' && req.user.role !== 'caja') return res.status(403).json({ error: 'Solo un administrador o usuario de caja puede editar una comanda.' });

      client = await getClient();
      await client.query('BEGIN');

      await assertOrderAccess({ query: (text, params) => client.query(text, params) }, req.user, id);

      const { rows: orderRows } = await client.query(
        `SELECT id, paid_amount_usd FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!orderRows[0]) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      if (Array.isArray(items)) {
        const { rows: paymentRows } = await client.query(
          `SELECT id FROM order_payments WHERE order_id = $1 LIMIT 1`,
          [id]
        );
        if (paymentRows.length > 0 || Number(orderRows[0].paid_amount_usd) > 0) {
          await client.query('ROLLBACK');
          client.release();
          client = null;
          return res.status(409).json({ error: 'Anula primero todos los pagos y vueltos antes de modificar los productos de la comanda.' });
        }
      }

      await client.query(
        `UPDATE orders SET 
           kitchen_notes = COALESCE($1, kitchen_notes), 
           total_usd = COALESCE($2, total_usd), 
           delivery_fee_usd = COALESCE($3, delivery_fee_usd),
           customer_name = COALESCE($4, customer_name),
           table_number = COALESCE($5, table_number),
           type = COALESCE($6, type),
           payment_status = COALESCE($7, payment_status),
           is_edited = true, 
           updated_at = CURRENT_TIMESTAMP 
         WHERE id = $8`,
        [kitchenNotes ?? null, totalUSD ?? null, deliveryFeeUSD ?? null, customerName ?? null, tableNumber ?? null, type ?? null, paymentStatus ?? null, id]
      );

      if (items && Array.isArray(items)) {
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);

        for (const item of items) {
          const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, is_new_or_modified, notes, drink_type, category, proteins, is_cut, cut_preference)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
            [
              itemId,
              id,
              item.productId || 'prod-custom',
              item.productName || 'Producto',
              item.price || 0,
              item.quantity || 1,
              item.size || 'Grande',
              !!item.isHalfHalf,
              JSON.stringify(item.halfDetails || null),
              item.removedIngredients || [],
              JSON.stringify(item.extras || []),
              item.sugarPreference || null,
              !!item.isTakeaway,
              item.isNewOrModified !== false,
              item.notes || '',
              item.drinkType || item.drink_type || null,
              item.category || null,
              item.proteins || [],
              !!(item.isCut || item.is_cut || item.cutPreference === 'Picada'),
              item.cutPreference || item.cut_preference || (item.isCut ? 'Picada' : 'Entera'),
            ]
          );
        }
      }

      // Registrar edición en historial
      const editDetails = [];
      if (items && Array.isArray(items)) editDetails.push('Productos modificados');
      if (kitchenNotes !== undefined) editDetails.push('Notas de cocina actualizadas');
      if (totalUSD !== undefined) editDetails.push(`Total actualizado a $${totalUSD}`);
      if (customerName !== undefined) editDetails.push(`Cliente: ${customerName}`);
      if (tableNumber !== undefined) editDetails.push(`Mesa: ${tableNumber}`);
      if (type !== undefined) editDetails.push(`Tipo: ${type}`);
      if (deliveryFeeUSD !== undefined) editDetails.push(`Delivery fee: $${deliveryFeeUSD}`);
      const editId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      try {
        const { rows: orderForEdit } = await client.query(`SELECT order_number FROM orders WHERE id = $1`, [id]);
        await client.query(
          `INSERT INTO order_edits (id, order_id, order_number, edited_by, edit_type, edit_details) VALUES ($1, $2, $3, $4, $5, $6)`,
          [editId, id, orderForEdit[0]?.order_number || '', req.user.username, 'modificacion', editDetails.join('; ') || 'Edición general']
        );
      } catch (editErr) {
        console.warn('Aviso: No se pudo registrar edición en historial:', editErr.message);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const allOrders = await fetchAllOrders(req.user);
      const updatedOrder = allOrders.find((o) => o.id === id);

      io.emit('order:edited', updatedOrder);
      io.emit('orders:sync', allOrders);

      console.log(`✏️ [COMANDA EDITADA] ${updatedOrder?.orderNumber} actualizada`);
      res.json(updatedOrder);
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        try { client.release(); } catch (_) {}
      }
      console.error('Error al editar comanda:', err);
      res.status(500).json({ error: 'Error al editar la comanda' });
    }
  });

  router.post('/:id/reopen', requireRole('cocina', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;

      client = await getClient();
      await client.query('BEGIN');
      await assertOrderAccess(client, req.user, id);

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, type, table_number, payment_status, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        client = null;
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const ord = orderRows[0];

      const isCreditOrder = ord.payment_status === 'credito' || ord.type === 'credito';

      if (isCreditOrder) {
        // Al reactivar una comanda que estaba a crédito, su tipo pasa a ser 'credito' permanente sin ocupar mesa física
        await client.query(
          `UPDATE orders SET
            status = 'preparada',
            payment_status = 'no_pagado',
            type = 'credito',
            table_number = NULL,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );
      } else {
        await client.query(
          `UPDATE orders SET
            status = 'preparada',
            payment_status = 'no_pagado',
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );

        // Si es comanda de mesa normal, marcar la mesa como ocupada
        if (ord.type === 'mesa' && ord.table_number) {
          await client.query(`UPDATE tables_config SET status = 'ocupada' WHERE number = $1`, [ord.table_number]);
        }
      }

      const cashLedgerResult = await postCompletedOrderCashMovements(client, id);
      await client.query('COMMIT');
      client.release();
      client = null;

      const updatedOrdersList = await fetchAllOrders(req.user);
      const updatedTablesList = await fetchAllTables(req.user);
      const updatedTarget = updatedOrdersList.find((o) => o.id === id);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('tables:sync', updatedTablesList);
      if (updatedTarget) {
        io.emit('order:status_updated', updatedTarget);
      }
      if (cashLedgerResult.posted || cashLedgerResult.removed) io.emit('caja:updated');

      console.log(`🔄 [REAPERTURA DE COMANDA] Comanda ${ord.order_number || id} reactivada exitosamente por ${req.user.username}`);
      res.json(updatedTarget || { success: true });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      console.error('Error al reabrir comanda:', err);
      res.status(500).json({ error: 'Error interno al reabrir la comanda' });
    }
  });

  router.post('/merge', requireRole('admin'), async (req, res) => {
    try {
      const { targetOrderId, sourceOrderIds } = req.body;

      if (!targetOrderId || !sourceOrderIds || !Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) {
        return res.status(400).json({ error: 'Debe especificar la comanda principal y las comandas a fusionar.' });
      }

      let mergedOrderNumber = '';
      const allOrders = await fetchAllOrders();
      const targetOrder = allOrders.find((o) => o.id === targetOrderId);
      if (!targetOrder) {
        return res.status(404).json({ error: 'Comanda principal no encontrada.' });
      }

      const sourceOrders = allOrders.filter((o) => sourceOrderIds.includes(o.id));
      if (sourceOrders.length !== sourceOrderIds.length || sourceOrderIds.includes(targetOrderId)) {
        return res.status(403).json({ error: 'Solo puedes fusionar comandas distintas y accesibles en tu turno.' });
      }
      const allInvolved = [targetOrder, ...sourceOrders];

      const hasAnyPayment = allInvolved.some(
        (o) => (o.paidAmountUSD || 0) > 0 || o.paymentStatus === 'pagado' || (o.paymentHistory && o.paymentHistory.length > 0)
      );

      if (hasAnyPayment) {
        return res.status(400).json({
          error: 'No se pueden unificar comandas que ya tengan abonos o estén pagadas. La única forma de unificar comandas es si ninguna tiene pagos registrados.'
        });
      }
      mergedOrderNumber = targetOrder.orderNumber;
      const sourceNumbers = sourceOrders.map((o) => o.orderNumber).join(', ');

      await query(`UPDATE order_payments SET order_id = $1 WHERE order_id = ANY($2::text[])`, [targetOrderId, sourceOrderIds]);
      await query(`UPDATE order_items SET order_id = $1 WHERE order_id = ANY($2::text[])`, [targetOrderId, sourceOrderIds]);

      const { rows: allTargetItems } = await query(`SELECT price, quantity, extras_json FROM order_items WHERE order_id = $1`, [targetOrderId]);
      let newTotalUSD = 0;
      for (const it of allTargetItems) {
        let itemPrice = parseFloat(it.price || 0);
        let extras = [];
        try {
          extras = typeof it.extras_json === 'string' ? JSON.parse(it.extras_json || '[]') : (it.extras_json || []);
        } catch(e) {}
        if (Array.isArray(extras)) {
          for (const ex of extras) {
            itemPrice += parseFloat(ex.price || 0);
          }
        }
        newTotalUSD += itemPrice * (parseInt(it.quantity) || 1);
      }

      const { rows: sumPayments } = await query(`SELECT COALESCE(SUM(amount_paid_usd), 0) as paid FROM order_payments WHERE order_id = $1`, [targetOrderId]);
      const newPaidUSD = parseFloat(sumPayments[0]?.paid || 0);
      const newPaymentStatus = newPaidUSD >= (newTotalUSD - 0.01) ? 'pagado' : 'no_pagado';

      const updatedNotes = `${targetOrder.kitchenNotes || ''} (Fusionada con comandas ${sourceNumbers})`.trim();
      await query(
        `UPDATE orders SET total_usd = $1, paid_amount_usd = $2, payment_status = $3, kitchen_notes = $4, merged_from_orders = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
        [newTotalUSD, newPaidUSD, newPaymentStatus, updatedNotes, sourceOrders.map((o) => o.orderNumber), targetOrderId]
      );

      await query(
        `UPDATE orders SET status = 'fusionada', kitchen_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2::text[])`,
        [`Fusionada en Comanda ${targetOrder.orderNumber}`, sourceOrderIds]
      );

      const updatedOrdersList = await fetchAllOrders(req.user);
      const updatedTarget = updatedOrdersList.find((o) => o.id === targetOrderId);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('order:status_updated', updatedTarget);

      console.log(`🔗 [FUSIÓN DE COMANDAS] Comandas ${sourceNumbers} unificadas en Comanda ${mergedOrderNumber}`);
      res.json(updatedTarget);
    } catch (err) {
      console.error('Error al fusionar comandas:', err);
      res.status(500).json({ error: 'Error al fusionar comandas' });
    }
  });

  // Imprimir comanda completa / pre-cuenta en impresora térmica
  router.post('/:id/print-receipt', async (req, res) => {
    try {
      const { id } = req.params;
      const { targetPrinter = 'caja' } = req.body || {};
      const allOrders = await fetchAllOrders(req.user);
      const targetOrder = allOrders.find((o) => o.id === id);

      if (!targetOrder) {
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      // Obtener tasas del sistema / turno (o priorizar las recibidas desde el cliente POS)
      let rates = req.body.rates;
      if (!rates || !rates.COP || !rates.Bs) {
        const orderShift = targetOrder.shift || req.user?.shift || 'manana';
        rates = await getRatesForShift({ query }, orderShift);
      }

      const result = await printReceiptTicket(targetOrder, rates, targetPrinter);
      console.log(`🧾 [PRE-CUENTA IMPRESA] Comanda #${targetOrder.orderNumber} ➔ Destino: ${targetPrinter.toUpperCase()} | Tasas: COP ${rates.COP}, Bs ${rates.Bs}`);
      res.json({ success: true, printed: result.printed, copies: result.copies, results: result.results });
    } catch (err) {
      console.error('Error al imprimir pre-cuenta térmica:', err);
      res.status(500).json({ error: err.message || 'Error al imprimir ticket' });
    }
  });

  // Cambiar mesa de una comanda de salón
  router.patch('/:id/change-table', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      const { newTableNumber } = req.body;
      const parsedTableNumber = parseInt(newTableNumber, 10);

      if (!parsedTableNumber || parsedTableNumber <= 0) {
        return res.status(400).json({ error: 'Debe especificar un número de mesa válido.' });
      }

      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (!orderRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }
      const order = orderRows[0];
      assertShiftAccess(req.user, order.shift);

      if (order.type !== 'mesa') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Solo se puede cambiar la mesa a comandas de salón (tipo mesa).' });
      }

      const oldTableNumber = order.table_number;
      if (oldTableNumber === parsedTableNumber) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'La comanda ya se encuentra en la mesa seleccionada.' });
      }

      // Actualizar mesa en la orden
      await client.query('UPDATE orders SET table_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        parsedTableNumber,
        id
      ]);

      // Marcar nueva mesa como ocupada
      await client.query("UPDATE tables_config SET status = 'ocupada' WHERE number = $1", [parsedTableNumber]);

      // Verificar si la mesa anterior todavía tiene otras órdenes activas
      if (oldTableNumber) {
        const { rows: otherOrders } = await client.query(
          "SELECT id FROM orders WHERE table_number = $1 AND id != $2 AND status NOT IN ('cancelado', 'fusionada') AND payment_status != 'pagado' AND archived_at IS NULL",
          [oldTableNumber, id]
        );
        if (otherOrders.length === 0) {
          await client.query("UPDATE tables_config SET status = 'libre' WHERE number = $1", [oldTableNumber]);
        }
      }

      await client.query('COMMIT');

      const updatedOrdersList = await fetchAllOrders(req.user);
      const allTables = await fetchAllTables(req.user);
      const updatedOrder = updatedOrdersList.find((o) => o.id === id);

      io.emit('orders:sync', updatedOrdersList);
      io.emit('tables:sync', allTables);
      io.emit('order:status_updated', updatedOrder);

      console.log(`🔄 [CAMBIO DE MESA] Comanda #${order.order_number} reubicada: Mesa #${oldTableNumber} ➔ Mesa #${parsedTableNumber}`);
      res.json(updatedOrder);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('Error al cambiar mesa:', err);
      res.status(500).json({ error: err.message || 'Error al cambiar mesa' });
    } finally {
      if (client) client.release();
    }
  });

  // Adicionar productos a una comanda abierta (Mesero, Caja, Admin)
  router.post('/:id/append-items', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    const { id } = req.params;
    const { addedItems = [], removedItemIds = [], targetPrinter = 'cocina' } = req.body;

    if (!Array.isArray(addedItems) && !Array.isArray(removedItemIds)) {
      return res.status(400).json({ error: 'Debes proporcionar los ítems a adicionar o remover.' });
    }

    if (addedItems.length === 0 && removedItemIds.length === 0) {
      return res.status(400).json({ error: 'No se indicaron cambios de adición ni eliminación.' });
    }

    let client = null;
    try {
      client = await getClient();
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `SELECT id, order_number, type, table_number, customer_name, waiter_name, status, payment_status, total_usd, delivery_fee_usd, shift FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (orderRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comanda no encontrada.' });
      }

      const order = orderRows[0];
      assertShiftAccess(req.user, order.shift);

      if (order.status === 'cancelado' || order.status === 'fusionada') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No se pueden adicionar productos a una comanda cancelada o fusionada.' });
      }

      // Si se indicaron ítems a remover
      if (Array.isArray(removedItemIds) && removedItemIds.length > 0) {
        await client.query(
          `DELETE FROM order_items WHERE order_id = $1 AND id = ANY($2::text[])`,
          [id, removedItemIds]
        );
      }

      // Insertar nuevos ítems adicionados
      if (Array.isArray(addedItems) && addedItems.length > 0) {
        for (const item of addedItems) {
          const itemId = item.id || `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, is_new_or_modified, notes, drink_type, category, proteins, is_cut, cut_preference)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, $14, $15, $16, $17, $18, $19)`,
            [
              itemId,
              id,
              item.productId || 'prod-custom',
              item.productName || 'Producto',
              Number(item.price) || 0,
              Number(item.quantity) || 1,
              item.size || 'Grande',
              !!item.isHalfHalf,
              JSON.stringify(item.halfDetails || null),
              item.removedIngredients || [],
              JSON.stringify(item.extras || []),
              item.sugarPreference || null,
              !!item.isTakeaway,
              item.notes || '',
              item.drinkType || item.drink_type || null,
              item.category || null,
              item.proteins || [],
              !!(item.isCut || item.is_cut || item.cutPreference === 'Picada'),
              item.cutPreference || item.cut_preference || (item.isCut ? 'Picada' : 'Entera'),
            ]
          );
        }
      }

      // Recalcular total_usd de la orden sumando items actuales (incluyendo extras)
      const { rows: currentItems } = await client.query(
        `SELECT price, quantity, extras_json FROM order_items WHERE order_id = $1`,
        [id]
      );

      let itemsTotalUSD = 0;
      for (const it of currentItems) {
        let itemPrice = Number(it.price) || 0;
        // Sumar precios de extras (adicionales pagos)
        let extras = [];
        try { extras = typeof it.extras_json === 'string' ? JSON.parse(it.extras_json || '[]') : (it.extras_json || []); } catch(e) {}
        if (Array.isArray(extras)) {
          for (const ex of extras) { itemPrice += parseFloat(ex.price || 0); }
        }
        const qty = Number(it.quantity) || 1;
        itemsTotalUSD += itemPrice * qty;
      }

      const deliveryFee = order.type === 'delivery' ? (Number(order.delivery_fee_usd) || 0) : 0;
      const newTotalUSD = Number((itemsTotalUSD + deliveryFee).toFixed(2));

      // Si la orden estaba como lista o entregada pero se le añadieron ítems de cocina (o cualquier ítem en delivery/pickup), reabrir a 'en_preparacion'
      const isPickupOrDelivery = order.type === 'delivery' || order.type === 'pickup';
      const kitchenItemsAdded = isPickupOrDelivery ? (addedItems || []) : (addedItems || []).filter(isKitchenItem);

      let nextStatus = order.status;
      if (kitchenItemsAdded.length > 0 && (order.status === 'preparada' || order.status === 'lista')) {
        nextStatus = 'en_preparacion';
      }

      await client.query(
        `UPDATE orders SET total_usd = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [newTotalUSD, nextStatus, id]
      );

      // Registrar auditoría de edición en order_edits
      const editDetails = [];
      if (addedItems.length > 0) {
        editDetails.push(`Adicionados ${addedItems.length} ítem(s): ${addedItems.map(it => it.productName || it.name || 'Producto').join(', ')}`);
      }
      if (removedItemIds.length > 0) {
        editDetails.push(`Eliminados ${removedItemIds.length} ítem(s)`);
      }
      const editId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      try {
        await client.query(
          `INSERT INTO order_edits (id, order_id, order_number, edited_by, edit_type, edit_details) VALUES ($1, $2, $3, $4, $5, $6)`,
          [editId, id, order.order_number || '', req.user.username || 'usuario', 'adicion_items', editDetails.join('; ')]
        );
      } catch (editErr) {
        console.warn('Aviso: No se pudo registrar auditoría de adición:', editErr.message);
      }

      await client.query('COMMIT');
      client.release();
      client = null;

      const updatedOrdersList = await fetchAllOrders(req.user);
      const updatedOrder = updatedOrdersList.find((o) => o.id === id);

      // Impresión térmica selectiva según destino
      if (kitchenItemsAdded.length > 0 && updatedOrder && targetPrinter !== 'ninguna') {
        try {
          await printKitchenAdditionTicket(updatedOrder, addedItems, targetPrinter);
          console.log(`🖨️ [TICKET ADICIÓN] Impreso exitosamente para comanda #${order.order_number} en destino: ${targetPrinter}`);
        } catch (err) {
          console.warn(`⚠️ [IMPRESORA TÉRMICA] No se pudo imprimir ticket de adición: ${err.message}`);
        }
      }

      io.emit('orders:sync', updatedOrdersList);
      io.emit('order:status_updated', updatedOrder);

      console.log(`➕ [ADICIÓN A COMANDA] #${order.order_number} (${order.type.toUpperCase()}) | ${addedItems.length} ítems añadidos | Nuevo Total: $${newTotalUSD} USD`);
      res.json({ success: true, order: updatedOrder, newTotalUSD });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('Error al adicionar productos a comanda:', err);
      res.status(500).json({ error: err.message || 'Error al adicionar productos' });
    } finally {
      if (client) client.release();
    }
  });

  router.post('/:id/reprint-kitchen', requireRole('mesero', 'caja', 'admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { targetPrinter = 'cocina' } = req.body || {};
      const { rows: orderRows } = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
      if (orderRows.length === 0) return res.status(404).json({ error: 'Comanda no encontrada' });
      const ord = orderRows[0];
      const { rows: items } = await query(`SELECT * FROM order_items WHERE order_id = $1`, [id]);
      const fullOrder = {
        ...ord,
        orderNumber: ord.order_number,
        customerName: ord.customer_name,
        tableNumber: ord.table_number,
        waiterName: ord.waiter_name || 'Mesero',
        kitchenNotes: ord.kitchen_notes,
        createdAt: ord.created_at,
        type: ord.type,
        shiftType: ord.shift_type || 'noche',
        items: items.map((it) => ({
          ...it,
          productName: it.product_name,
          price: parseFloat(it.price) || 0,
          quantity: parseInt(it.quantity, 10) || 1,
          drinkType: it.drink_type,
          category: it.category,
          sugarPreference: it.sugar_preference,
          size: it.size,
          isHalfHalf: it.is_half_half,
          halfDetails: safeJsonParseObj(it.half_details),
          extras: safeJsonParse(it.extras_json),
          removedIngredients: Array.isArray(it.removed_ingredients) ? it.removed_ingredients : (safeJsonParse(it.removed_ingredients) || []),
          notes: it.notes,
          isTakeaway: it.is_takeaway,
        }))
      };

      const printResult = await printKitchenTicket(fullOrder, targetPrinter);
      if (!printResult || printResult.printed === false) {
        if (printResult?.reason === 'no_kitchen_items') {
          return res.status(400).json({ error: 'Esta comanda no contiene ítems que requieran preparación en cocina.' });
        }
        return res.status(502).json({ error: 'No se pudo conectar con la impresora de cocina/caja.' });
      }
      return res.json({ success: true, message: 'Comanda de cocina reimpresa exitosamente.' });
    } catch (err) {
      console.error('Error al reimprimir comanda:', err);
      return res.status(500).json({ error: 'Error al procesar la reimpresión de comanda.' });
    }
  });

  return router;
};
