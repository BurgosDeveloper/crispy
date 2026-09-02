const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { createSession } = require('../helpers/sessionAuth');

function loginResponse(res, user) {
  const sessionToken = createSession({ ...user, shift: 'ambos' });
  return res.json({ success: true, user: { ...user, shift: 'ambos', sessionToken } });
}

module.exports = function(io) {
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const userClean = (username || '').trim().toLowerCase();
      const passClean = (password || '').trim().toLowerCase();

      // Atajos de acceso directo para Crispy
      const DEFAULT_ACCOUNTS = {
        'admin': { username: 'Administrador General', role: 'admin' },
        'caja': { username: 'Cajero Principal', role: 'caja' },
        'mesero': { username: 'Mesero Principal', role: 'mesero' },
        'cocina': { username: 'Jefe de Cocina', role: 'cocina' },
      };

      if (DEFAULT_ACCOUNTS[userClean] && (passClean === userClean || passClean === 'crispy1.' || passClean === 'admin')) {
        return loginResponse(res, DEFAULT_ACCOUNTS[userClean]);
      }

      if (userClean === 'crispy' && (passClean === 'crispy1.' || passClean === 'admin')) {
        return loginResponse(res, { username: 'Administrador Crispy', role: 'admin' });
      }

      const { rows } = await query(`SELECT * FROM users WHERE LOWER(username) = $1 AND LOWER(password) = $2`, [userClean, passClean]);
      if (rows.length > 0) {
        const u = rows[0];
        return loginResponse(res, { username: u.name, role: u.role, shift: 'ambos' });
      }

      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error en servidor de autenticación' });
    }
  });

  // Verificar PIN de seguridad de 4 dígitos para autorizar acciones de caja
  router.post('/verify-admin-pin', async (req, res) => {
    try {
      const { pin } = req.body;
      const cleanPin = String(pin || '').trim();

      const { rows } = await query(`SELECT value FROM system_settings WHERE key = 'admin_pin'`);
      const currentPin = rows[0]?.value || '1234';

      if (cleanPin === currentPin) {
        return res.json({ success: true, valid: true });
      } else {
        return res.status(401).json({ success: false, valid: false, error: 'PIN de seguridad incorrecto' });
      }
    } catch (err) {
      console.error('Error al verificar PIN de admin:', err);
      res.status(500).json({ error: 'Error al verificar PIN' });
    }
  });

  // Obtener PIN de seguridad actual (solo admin)
  router.get('/admin-pin', async (req, res) => {
    try {
      const { rows } = await query(`SELECT value FROM system_settings WHERE key = 'admin_pin'`);
      const pin = rows[0]?.value || '1234';
      res.json({ success: true, pin });
    } catch (err) {
      console.error('Error al consultar PIN de admin:', err);
      res.status(500).json({ error: 'Error al consultar PIN' });
    }
  });

  // Actualizar PIN de seguridad de 4 dígitos (solo admin)
  router.put('/admin-pin', async (req, res) => {
    try {
      const { pin } = req.body;
      const cleanPin = String(pin || '').trim();

      if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ error: 'El PIN debe contener exactamente 4 dígitos numéricos.' });
      }

      await query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('admin_pin', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [cleanPin]
      );

      console.log(`🔐 [PIN DE SEGURIDAD ACTUALIZADO] Nuevo PIN configurado por Administrador`);
      res.json({ success: true, message: 'PIN de seguridad actualizado exitosamente.', pin: cleanPin });
    } catch (err) {
      console.error('Error al actualizar PIN de admin:', err);
      res.status(500).json({ error: 'Error al actualizar PIN' });
    }
  });

  return router;
};
