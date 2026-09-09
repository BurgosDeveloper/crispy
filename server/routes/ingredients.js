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
        ingredientType,
        priceUSD,
        priceGrandeCompleta,
        isBase,
        isExtra,
        category,
        available,
      } = req.body;
      const id = `ing-${Date.now()}`;
      const upperName = (name || '').trim().toUpperCase();
      const finalType = ingredientType || (category === 'Salsas' ? 'salsa' : (category === 'Gratis' ? 'gratis' : (category === 'Adicionales' ? 'adicional' : (isBase ? 'base' : 'adicional'))));
      const finalPrice = (finalType === 'gratis' || finalType === 'base') ? 0 : (priceUSD !== undefined ? (parseFloat(priceUSD) || 0) : (parseFloat(priceGrandeCompleta) || 0));
      const finalIsBase = finalType === 'base' || finalType === 'proteina' || isBase === true;
      const finalIsExtra = finalType === 'adicional' || finalType === 'gratis' || finalType === 'salsa' || isExtra === true;
      const finalCategory = category || (finalType === 'salsa' ? 'Salsas' : (finalType === 'gratis' ? 'Gratis' : (finalType === 'proteina' ? 'Proteínas' : (finalType === 'base' ? 'Ingredientes Base' : 'Adicionales'))));

      await query(
        `INSERT INTO ingredients (id, name, ingredient_type, price_usd, is_base, is_extra, is_base_for_pizza, is_extra_for_pizza, category, available, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ambos')`,
        [
          id,
          upperName,
          finalType,
          finalPrice,
          finalIsBase,
          finalIsExtra,
          finalIsBase,
          finalIsExtra,
          finalCategory,
          available !== false,
        ]
      );

      const allIngredients = await fetchAllIngredients();
      io.emit('ingredients:sync', allIngredients);
      res.status(201).json(allIngredients.find((i) => i.name === upperName) || { id, name: upperName });
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
        ingredientType,
        category,
        priceUSD,
        priceGrandeCompleta,
        isBase,
        isExtra,
        available,
      } = req.body;

      const upperName = (name || '').trim().toUpperCase();
      const finalType = ingredientType || (category === 'Salsas' ? 'salsa' : (category === 'Gratis' ? 'gratis' : (category === 'Adicionales' ? 'adicional' : (isBase ? 'base' : 'adicional'))));
      const finalPrice = (finalType === 'gratis' || finalType === 'base') ? 0 : (priceUSD !== undefined ? (parseFloat(priceUSD) || 0) : (parseFloat(priceGrandeCompleta) || 0));
      const finalIsBase = finalType === 'base' || finalType === 'proteina' || isBase === true;
      const finalIsExtra = finalType === 'adicional' || finalType === 'gratis' || finalType === 'salsa' || isExtra === true;
      const finalCategory = category || (finalType === 'salsa' ? 'Salsas' : (finalType === 'gratis' ? 'Gratis' : (finalType === 'proteina' ? 'Proteínas' : (finalType === 'base' ? 'Ingredientes Base' : 'Adicionales'))));

      let oldName = null;
      const { rows } = await query(`SELECT name FROM ingredients WHERE id = $1`, [id]);
      if (rows.length > 0) oldName = rows[0].name;

      await query(
        `UPDATE ingredients 
         SET name = $1, ingredient_type = $2, category = $3, price_usd = $4, 
             is_base = $5, is_extra = $6, is_base_for_pizza = $7, is_extra_for_pizza = $8, available = $9, shift = 'ambos'
         WHERE id = $10`,
        [
          upperName, 
          finalType,
          finalCategory, 
          finalPrice,
          finalIsBase,
          finalIsExtra,
          finalIsBase,
          finalIsExtra,
          available !== false, 
          id
        ]
      );

      if (oldName && oldName !== upperName) {
        await query(
          `UPDATE products 
           SET base_ingredients = array_replace(base_ingredients, $1, $2),
               default_proteins = array_replace(default_proteins, $1, $2)
           WHERE $1 = ANY(base_ingredients) OR $1 = ANY(default_proteins)`,
          [oldName, upperName]
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
