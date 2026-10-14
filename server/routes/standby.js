const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllStandbyOrders } = require('../helpers/fetchAll');

module.exports = function(io) {
  // GET /api/standby - Listar todos los pedidos en espera
  router.get('/', async (req, res) => {
    try {
      const orders = await fetchAllStandbyOrders();
      res.json(orders);
    } catch (err) {
      console.error('Error al obtener standby orders:', err);
      res.status(500).json({ error: 'Error al obtener pedidos en espera.' });
    }
  });

  // POST /api/standby - Guardar o actualizar pedido en espera
  router.post('/', async (req, res) => {
    try {
      const {
        id,
        target,
        cartItems = [],
        customerName = '',
        kitchenNotes = '',
        deliveryFeeUSD = 0,
        targetPrinter = 'cocina',
        totalUSD = 0,
        itemCount = 0,
        shift = 'ambos',
      } = req.body;

      if (!target || !target.type) {
        return res.status(400).json({ error: 'El target del pedido es obligatorio.' });
      }

      const standbyId = id || `standby_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const targetType = target.type;
      const tableNumber = target.tableNumber || null;
      const title = target.title || (targetType === 'mesa' ? `Mesa ${tableNumber}` : (targetType === 'delivery' ? 'Delivery' : 'Para Llevar'));
      const itemsJson = JSON.stringify(cartItems);
      const fee = parseFloat(deliveryFeeUSD) || 0;
      const total = parseFloat(totalUSD) || 0;
      const count = parseInt(itemCount, 10) || cartItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
      const createdBy = req.user?.username || 'mesero';

      await query(
        `INSERT INTO standby_orders (
          id, target_type, table_number, title, cart_items, customer_name, kitchen_notes,
          delivery_fee_usd, target_printer, total_usd, item_count, shift, created_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          target_type = EXCLUDED.target_type,
          table_number = EXCLUDED.table_number,
          title = EXCLUDED.title,
          cart_items = EXCLUDED.cart_items,
          customer_name = EXCLUDED.customer_name,
          kitchen_notes = EXCLUDED.kitchen_notes,
          delivery_fee_usd = EXCLUDED.delivery_fee_usd,
          target_printer = EXCLUDED.target_printer,
          total_usd = EXCLUDED.total_usd,
          item_count = EXCLUDED.item_count,
          shift = EXCLUDED.shift,
          updated_at = CURRENT_TIMESTAMP`,
        [
          standbyId,
          targetType,
          tableNumber,
          title,
          itemsJson,
          customerName,
          kitchenNotes,
          fee,
          targetPrinter,
          total,
          count,
          shift,
          createdBy,
        ]
      );

      const all = await fetchAllStandbyOrders();
      io.emit('standby:sync', all);
      console.log(`⚡ [STANDBY GUARDADO] ${standbyId} (${title}) sincronizado vía WebSocket a todos los terminales`);
      res.json({ message: 'Pedido guardado en standby.', id: standbyId });
    } catch (err) {
      console.error('Error al guardar standby order:', err);
      res.status(500).json({ error: 'Error al guardar pedido en espera.' });
    }
  });

  // DELETE /api/standby/:id - Eliminar un pedido individual de standby
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM standby_orders WHERE id = $1`, [id]);
      const all = await fetchAllStandbyOrders();
      io.emit('standby:sync', all);
      console.log(`⚡ [STANDBY ELIMINADO] ${id} sincronizado vía WebSocket`);
      res.json({ message: 'Pedido eliminado de standby.', id });
    } catch (err) {
      console.error('Error al eliminar standby order:', err);
      res.status(500).json({ error: 'Error al eliminar pedido en espera.' });
    }
  });

  // DELETE /api/standby - Limpiar todos los pedidos de standby
  router.delete('/', async (req, res) => {
    try {
      await query(`DELETE FROM standby_orders`);
      io.emit('standby:sync', []);
      console.log(`⚡ [STANDBY VACIADO] Todos los borradores eliminados vía WebSocket`);
      res.json({ message: 'Todos los pedidos en standby han sido eliminados.' });
    } catch (err) {
      console.error('Error al limpiar standby orders:', err);
      res.status(500).json({ error: 'Error al limpiar pedidos en espera.' });
    }
  });

  return router;
};
