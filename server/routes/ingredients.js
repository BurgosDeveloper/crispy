const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllIngredients, fetchAllProducts } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const ingredients = await fetchAllIngredients(req.user);
      res.json(ingredients);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener ingredientes' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const {
        name,
        priceUSD,
        priceGrandeCompleta,
        isBase,
        isExtra,
        isBaseForPizza,
        isExtraForPizza,
        category,
        available,
      } = req.body;
      const id = `ing-${Date.now()}`;
      const finalPrice = priceUSD !== undefined ? (parseFloat(priceUSD) || 0) : (parseFloat(priceGrandeCompleta) || 0);
      const finalIsBase = isBase !== undefined ? !!isBase : (isBaseForPizza !== false);
      const finalIsExtra = isExtra !== undefined ? !!isExtra : (isExtraForPizza !== false);

      await query(
        `INSERT INTO ingredients (id, name, price_usd, is_base, is_extra, is_base_for_pizza, is_extra_for_pizza, category, available, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ambos')`,
        [
          id,
          name,
          finalPrice,
          finalIsBase,
          finalIsExtra,
          finalIsBase,
          finalIsExtra,
          category || 'Ingredientes',
          available !== false,
        ]
      );

      const allIngredients = await fetchAllIngredients();
      io.emit('ingredients:sync', allIngredients);
      res.status(201).json(allIngredients.find((i) => i.name === name) || { id, name });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al guardar ingrediente' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        category,
        priceUSD,
        priceGrandeCompleta,
        isBase,
        isExtra,
        isBaseForPizza,
        isExtraForPizza,
        available,
      } = req.body;

      const finalPrice = priceUSD !== undefined ? (parseFloat(priceUSD) || 0) : (parseFloat(priceGrandeCompleta) || 0);
      const finalIsBase = isBase !== undefined ? !!isBase : (isBaseForPizza !== false);
      const finalIsExtra = isExtra !== undefined ? !!isExtra : (isExtraForPizza !== false);

      let oldName = null;
      const { rows } = await query(`SELECT name FROM ingredients WHERE id = $1`, [id]);
      if (rows.length > 0) oldName = rows[0].name;

      await query(
        `UPDATE ingredients 
         SET name = $1, category = $2, price_usd = $3, 
             is_base = $4, is_extra = $5, is_base_for_pizza = $6, is_extra_for_pizza = $7, available = $8, shift = 'ambos'
         WHERE id = $9`,
        [
          name, 
          category || 'Ingredientes', 
          finalPrice,
          finalIsBase,
          finalIsExtra,
          finalIsBase,
          finalIsExtra,
          available !== false, 
          id
        ]
      );

      if (oldName && oldName !== name) {
        await query(
          `UPDATE products 
           SET base_ingredients = array_replace(base_ingredients, $1, $2) 
           WHERE $1 = ANY(base_ingredients)`,
          [oldName, name]
        );
      }

      const allIngredients = await fetchAllIngredients();
      const allProducts = await fetchAllProducts();
      io.emit('ingredients:sync', allIngredients);
      if (oldName && oldName !== name) {
        io.emit('products:sync', allProducts);
      }
      res.json(allIngredients.find((i) => i.id === id) || { success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar ingrediente' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM ingredients WHERE id = $1`, [id]);
      
      const allIngredients = await fetchAllIngredients();
      io.emit('ingredients:sync', allIngredients);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar ingrediente' });
    }
  });

  return router;
};
