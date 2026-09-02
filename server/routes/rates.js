const express = require('express');
const router = express.Router();
const { query, getClient } = require('../db');
const { requireRole } = require('../helpers/sessionAuth');
const { getRatesForShift } = require('../helpers/exchangeRates');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      return res.json(await getRatesForShift({ query }, req.user.shift));
    } catch (err) {
      return res.status(500).json({ error: 'Error al consultar tasas.' });
    }
  });

  router.post('/', requireRole('caja', 'admin'), async (req, res) => {
    const COP = Number(req.body.COP);
    const Bs = Number(req.body.Bs);
    if (!Number.isFinite(COP) || !Number.isFinite(Bs) || COP <= 0 || Bs <= 0) {
      return res.status(400).json({ error: 'Las tasas COP y Bs deben ser números positivos.' });
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      await client.query(
        `UPDATE exchange_rates SET cop_rate = $1, bs_rate = $2 WHERE id = 1`,
        [COP, Bs]
      );
      for (const sh of ['ambos', 'manana', 'noche']) {
        await client.query(
          `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (shift) DO UPDATE SET cop_rate = EXCLUDED.cop_rate, bs_rate = EXCLUDED.bs_rate,
             updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
          [sh, COP, Bs, req.user?.username || 'admin']
        );
      }
      await client.query(
        `INSERT INTO exchange_rate_history (id, shift, cop_rate, bs_rate, changed_by)
         VALUES ($1, 'ambos', $2, $3, $4)`,
        [`rate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, COP, Bs, req.user?.username || 'admin']
      );
      await client.query('COMMIT');
      client.release();
      client = null;

      io.emit('rates:updated', { COP, Bs });
      return res.json({ success: true, COP, Bs });
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {}
        client.release();
      }
      return res.status(500).json({ error: 'Error al actualizar tasas.' });
    }
  });

  return router;
};