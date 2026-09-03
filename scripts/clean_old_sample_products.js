const { initDb, query } = require('../server/db');

async function clean() {
  await initDb();
  await query(`DELETE FROM products WHERE id IN ('prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5', 'prod-6')`);
  await query(`DELETE FROM ingredients WHERE id IN ('ing-1', 'ing-2', 'ing-3', 'ing-4', 'ing-5', 'ing-6', 'ing-7', 'ing-8', 'ing-9', 'ing-10', 'ing-11', 'ing-12')`);
  console.log('✅ Antiguos productos de muestra eliminados.');

  const p = await query(`SELECT id, name, category, price FROM products ORDER BY category, price`);
  console.log('\n--- CATÁLOGO REAL DE PRODUCTOS (18 PRODUCTOS) ---');
  console.table(p.rows);

  const i = await query(`SELECT name, price_usd, category FROM ingredients ORDER BY category, price_usd`);
  console.log('\n--- CATÁLOGO REAL DE INGREDIENTES Y EXTRAS ---');
  console.table(i.rows);
  process.exit(0);
}

clean().catch(err => {
  console.error(err);
  process.exit(1);
});
