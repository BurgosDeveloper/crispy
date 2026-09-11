const { Pool } = require('pg');

let pool = null;

async function tryPgPool(dbName, dbPassword) {
  const p = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: dbName,
    password: dbPassword,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    connectionTimeoutMillis: 3000,
  });
  const client = await p.connect();
  return { pool: p, client, dbName };
}

async function initDb() {
  const targetDbName = process.env.DB_NAME || 'crispy';
  const explicitPass = process.env.DB_PASSWORD;

  // Lista de posibles contraseñas a probar en orden
  const passwordsToTry = explicitPass
    ? [explicitPass]
    : ['crispy1.', 'sdmaia1.', 'postgres', 'admin', 'root', ''];

  const dbsToTry = [targetDbName, 'postgres'];

  let connectionObj = null;
  let lastError = null;

  // 1. Intentar conectar a la base de datos principal con las contraseñas posibles
  for (const pass of passwordsToTry) {
    try {
      connectionObj = await tryPgPool(targetDbName, pass);
      if (connectionObj) break;
    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes(`database "${targetDbName}" does not exist`)) {
        // La BD no existe pero la contraseña es correcta, intentar crearla
        try {
          console.log(`ℹ️ La base de datos "${targetDbName}" no existe. Creándola automáticamente en PostgreSQL...`);
          const adminConn = await tryPgPool('postgres', pass);
          await adminConn.client.query(`CREATE DATABASE "${targetDbName}"`);
          adminConn.client.release();
          await adminConn.pool.end();
          connectionObj = await tryPgPool(targetDbName, pass);
          if (connectionObj) break;
        } catch (createErr) {
          console.error(`⚠️ No se pudo crear la BD "${targetDbName}":`, createErr.message);
        }
      }
    }
  }

  // 2. Si aún no conectó, intentar con postgres administrativo
  if (!connectionObj) {
    for (const db of dbsToTry) {
      if (db === targetDbName) continue;
      for (const pass of passwordsToTry) {
        try {
          connectionObj = await tryPgPool(db, pass);
          if (connectionObj) break;
        } catch (e) {
          lastError = e;
        }
      }
      if (connectionObj) break;
    }
  }

  if (!connectionObj) {
    console.error('Fatal: Could not connect to PostgreSQL database.', lastError ? lastError.message : '');
    process.exit(1);
  }

  if (connectionObj) {
    pool = connectionObj.pool;
    pool.on('error', (err) => {
      console.error('⚠️ PG Pool Error (idle client):', err.message);
    });
    const client = connectionObj.client;
    console.log(`✅ Conectado exitosamente a PostgreSQL (${connectionObj.dbName})`);
    
    const migrationQueries = [
      `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, password VARCHAR(64) NOT NULL, role VARCHAR(32) NOT NULL DEFAULT 'admin', name VARCHAR(128) NOT NULL, shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'admin';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS ingredients (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, ingredient_type VARCHAR(32) DEFAULT 'adicional', price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, is_base BOOLEAN DEFAULT TRUE, is_extra BOOLEAN DEFAULT TRUE, category VARCHAR(64) DEFAULT 'Ingredientes', available BOOLEAN DEFAULT TRUE, shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS ingredient_type VARCHAR(32) DEFAULT 'adicional';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_base BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_base_for_pizza BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_extra_for_pizza BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'Ingredientes';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_grande_completa NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_grande_mitad NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_pequena_completa NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_pequena_mitad NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;`,

      `CREATE TABLE IF NOT EXISTS products (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, category VARCHAR(64) NOT NULL DEFAULT 'Hamburguesas', drink_type VARCHAR(32), price NUMERIC(10, 2) NOT NULL DEFAULT 0.00, description TEXT, image TEXT, badge VARCHAR(64), base_ingredients TEXT[], protein_count INT DEFAULT 1, default_proteins TEXT[], shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS protein_count INT DEFAULT 1;`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS default_proteins TEXT[];`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS flavors TEXT[];`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS price_small NUMERIC(10, 2);`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS tables_config (id VARCHAR(64) PRIMARY KEY, number INT NOT NULL UNIQUE, name VARCHAR(64) NOT NULL, capacity INT NOT NULL DEFAULT 4, status VARCHAR(32) NOT NULL DEFAULT 'libre', zone VARCHAR(64) NOT NULL DEFAULT 'Salón Principal');`,

      `CREATE TABLE IF NOT EXISTS orders (id VARCHAR(64) PRIMARY KEY, order_number VARCHAR(32) NOT NULL, type VARCHAR(32) NOT NULL DEFAULT 'mesa', table_number INT, customer_name VARCHAR(128), status VARCHAR(32) NOT NULL DEFAULT 'en_preparacion', payment_status VARCHAR(32) NOT NULL DEFAULT 'no_pagado', payment_method VARCHAR(32), total_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, waiter_name VARCHAR(64) DEFAULT 'Mesero', kitchen_notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cop_rate_at_payment NUMERIC(10, 2) DEFAULT 3950.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS bs_rate_at_payment NUMERIC(10, 2) DEFAULT 36.50;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount_usd NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS merged_from_orders TEXT[];`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_history_json JSONB;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_usd NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS debtor_name VARCHAR(128);`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS order_items (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, product_id VARCHAR(64) NOT NULL, product_name VARCHAR(128) NOT NULL, price NUMERIC(10, 2) NOT NULL, quantity INT NOT NULL DEFAULT 1, removed_ingredients TEXT[], extras_json JSONB, sugar_preference VARCHAR(32), is_takeaway BOOLEAN DEFAULT FALSE, notes TEXT);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size VARCHAR(32) DEFAULT 'Estándar';`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_half_half BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS half_details JSONB;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_new_or_modified BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_paid_individually BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR(128);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS drink_type VARCHAR(32);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS category VARCHAR(64);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS proteins TEXT[];`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_cut BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cut_preference VARCHAR(32) DEFAULT 'Entera';`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_delivery BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS flavor VARCHAR(64);`,

      `CREATE TABLE IF NOT EXISTS order_payments (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, payer_name VARCHAR(128) DEFAULT 'Cliente General', payment_method VARCHAR(32) NOT NULL, amount_paid_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, cash_tendered_usd NUMERIC(10, 2) DEFAULT 0.00, cash_tendered_cop NUMERIC(12, 2) DEFAULT 0.00, cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00, change_given_usd NUMERIC(10, 2) DEFAULT 0.00, change_given_cop NUMERIC(12, 2) DEFAULT 0.00, change_given_bs NUMERIC(12, 2) DEFAULT 0.00, item_ids TEXT[], cop_rate NUMERIC(10, 2) DEFAULT 3950.00, bs_rate NUMERIC(10, 2) DEFAULT 36.50, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00;`,
      `ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS change_given_bs NUMERIC(12, 2) DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS caja_chica_apertura (id VARCHAR(64) PRIMARY KEY, usd_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00, cop_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00, shift VARCHAR(32) DEFAULT 'ambos', timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE caja_chica_apertura ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,

      `CREATE TABLE IF NOT EXISTS caja_chica_transactions (id VARCHAR(64) PRIMARY KEY, type VARCHAR(32) NOT NULL, amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00, payment_method VARCHAR(32) NOT NULL, description TEXT NOT NULL, order_id VARCHAR(64), cierre_id VARCHAR(64), shift VARCHAR(32) DEFAULT 'ambos', timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS cierre_id VARCHAR(64);`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS caja_chica_cierres (id VARCHAR(64) PRIMARY KEY, opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_by VARCHAR(64) DEFAULT 'Caja', notes TEXT, shift VARCHAR(32) DEFAULT 'ambos');`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS exchange_rates (id INT PRIMARY KEY DEFAULT 1, cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3950.00, bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 36.50);`,
      `CREATE TABLE IF NOT EXISTS shift_exchange_rates (shift VARCHAR(32) PRIMARY KEY, cop_rate NUMERIC(10, 2) NOT NULL, bs_rate NUMERIC(10, 2) NOT NULL, updated_by VARCHAR(128) NOT NULL DEFAULT 'Sistema', updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS exchange_rate_history (id VARCHAR(64) PRIMARY KEY, shift VARCHAR(32) NOT NULL, cop_rate NUMERIC(10, 2) NOT NULL, bs_rate NUMERIC(10, 2) NOT NULL, changed_by VARCHAR(128) NOT NULL, changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,

      `CREATE TABLE IF NOT EXISTS order_edits (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, order_number VARCHAR(32), edited_by VARCHAR(128) DEFAULT 'admin', edit_type VARCHAR(64) DEFAULT 'modificacion', edit_details TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS system_settings (key VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,

      `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON orders(archived_at);`,
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_caja_tx_timestamp ON caja_chica_transactions(timestamp DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_caja_tx_cierre_id ON caja_chica_transactions(cierre_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_edits_created_at ON order_edits(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_order_edits_order_id ON order_edits(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_shift_changed_at ON exchange_rate_history(shift, changed_at DESC);`,

      `INSERT INTO exchange_rates (id, cop_rate, bs_rate) VALUES (1, 3950.00, 36.50) ON CONFLICT (id) DO NOTHING;`,
      `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('ambos', 3950.00, 36.50, 'Inicial Crispy') ON CONFLICT (shift) DO NOTHING;`,
      `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('manana', 3950.00, 36.50, 'Compatibilidad') ON CONFLICT (shift) DO NOTHING;`,
      `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('noche', 3950.00, 36.50, 'Compatibilidad') ON CONFLICT (shift) DO NOTHING;`,
      `INSERT INTO system_settings (key, value) VALUES ('admin_pin', '1234') ON CONFLICT (key) DO NOTHING;`,

      `DELETE FROM users WHERE (username = 'carlos' AND id != 'u-admin') OR (username = 'cajeroa' AND id != 'u-caja');`,
      `UPDATE users SET username = 'carlos', password = 'carloscrispys', name = 'Carlos', role = 'admin' WHERE id = 'u-admin' OR username = 'admin';`,
      `INSERT INTO users (id, username, password, role, name, shift) VALUES ('u-admin', 'carlos', 'carloscrispys', 'admin', 'Carlos', 'ambos') ON CONFLICT (username) DO UPDATE SET password = 'carloscrispys', role = 'admin', name = 'Carlos';`,
      `UPDATE users SET username = 'cajeroa', password = 'cajero', name = 'Cajero Principal', role = 'caja' WHERE id = 'u-caja' OR username = 'caja';`,
      `INSERT INTO users (id, username, password, role, name, shift) VALUES ('u-caja', 'cajeroa', 'cajero', 'caja', 'Cajero Principal', 'ambos') ON CONFLICT (username) DO UPDATE SET password = 'cajero', role = 'caja', name = 'Cajero Principal';`,
      `INSERT INTO users (id, username, password, role, name, shift) VALUES
        ('u-mesero', 'mesero', 'mesero', 'mesero', 'Mesero Principal', 'ambos'),
        ('u-cocina', 'cocina', 'cocina', 'cocina', 'Jefe de Cocina', 'ambos')
        ON CONFLICT (username) DO NOTHING;`,

      `INSERT INTO tables_config (id, number, name, capacity, status, zone) VALUES
        ('table-1', 1, 'Mesa #1', 4, 'libre', 'Salón Principal'),
        ('table-2', 2, 'Mesa #2', 4, 'libre', 'Salón Principal'),
        ('table-3', 3, 'Mesa #3', 2, 'libre', 'Salón Principal'),
        ('table-4', 4, 'Mesa #4', 4, 'libre', 'Salón Principal'),
        ('table-5', 5, 'Mesa #5', 2, 'libre', 'Salón Principal'),
        ('table-6', 6, 'Mesa #6', 4, 'libre', 'Salón Principal'),
        ('table-7', 7, 'Mesa #7', 2, 'libre', 'Salón Principal'),
        ('table-8', 8, 'Mesa #8', 6, 'libre', 'Salón Principal')
        ON CONFLICT (number) DO NOTHING;`,

      // 1. Limpieza segura de productos e ingredientes de muestra antiguos (preservando contabilidad)
      `DELETE FROM products WHERE id IN ('prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5', 'prod-6');`,
      `DELETE FROM ingredients WHERE id IN ('ing-1', 'ing-2', 'ing-3', 'ing-4', 'ing-5', 'ing-6', 'ing-7', 'ing-8', 'ing-9', 'ing-10', 'ing-11', 'ing-12', 'ing-adicional-racion-papas', 'ing-servicio-papas-fritas');`,

      // 2. Deduplicación inteligente: si existen productos duplicados con otro ID pero mismo nombre que los oficiales,
      // reasignar los order_items históricos al ID canónico (protegiendo las ventas) y eliminar el producto duplicado.
      `DO $$
      DECLARE
        dup RECORD;
      BEGIN
        FOR dup IN
          SELECT p_dup.id AS dup_id, p_canon.id AS canon_id
          FROM products p_dup
          JOIN products p_canon ON (
            UPPER(TRIM(p_dup.name)) = UPPER(TRIM(p_canon.name))
            OR (LOWER(TRIM(p_dup.name)) LIKE '%350%' AND LOWER(TRIM(p_canon.name)) = 'refresco 350ml')
            OR ((LOWER(TRIM(p_dup.name)) LIKE '%2lt%' OR LOWER(TRIM(p_dup.name)) LIKE '%2 lt%' OR LOWER(TRIM(p_dup.name)) LIKE '%2 litro%') AND LOWER(TRIM(p_canon.name)) = 'refresco 2lt')
            OR (LOWER(TRIM(p_dup.name)) = 'nestea' AND p_canon.id = 'prod-nestea-drink')
            OR (LOWER(TRIM(p_dup.name)) = 'lipton' AND p_canon.id = 'prod-nestea')
          )
          WHERE p_dup.id != p_canon.id
            AND p_canon.id IN (
              'prod-bistro', 'prod-crispys', 'prod-chicken-grill', 'prod-mr-pork',
              'prod-street', 'prod-nuggets', 'prod-super-smash', 'prod-tasty',
              'prod-mixtura', 'prod-house', 'prod-3-0', 'prod-racion-papas',
              'prod-refresco-350ml', 'prod-refresco-2lt', 'prod-lata',
              'prod-nestea-drink', 'prod-nestea', 'prod-agua-mineral',
              'prod-cerveza', 'prod-granizado'
            )
        LOOP
          UPDATE order_items SET product_id = dup.canon_id WHERE product_id = dup.dup_id;
          DELETE FROM products WHERE id = dup.dup_id;
        END LOOP;
      END $$;`,

      // 3. UPSERT oficial de Catálogo de Productos (Hamburguesas y Bebidas)
      // Si ya existen, actualiza sus ingredientes base, proteínas, sabores y precios sin alterar ventas ni pedidos.
      `INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, protein_count, default_proteins, flavors, shift) VALUES
        ('prod-bistro', 'BISTRO', 'Hamburguesas', NULL, 7.00, 'Carne de novillo, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['CARNE DE NOVILLO', 'SALSA DE LA CASA', 'QUESO', 'TOCINETA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 1, ARRAY['CARNE DE NOVILLO'], NULL, 'ambos'),
        ('prod-crispys', 'CRISPYS', 'Hamburguesas', NULL, 7.00, 'Pollo crispy, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['POLLO CRISPY', 'SALSA DE LA CASA', 'QUESO', 'TOCINETA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 1, ARRAY['POLLO CRISPY'], NULL, 'ambos'),
        ('prod-chicken-grill', 'CHICKEN GRILL', 'Hamburguesas', NULL, 7.00, 'Pechuga de pollo a la plancha, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['PECHUGA DE POLLO A LA PLANCHA', 'SALSA DE LA CASA', 'QUESO', 'TOCINETA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 1, ARRAY['PECHUGA DE POLLO A LA PLANCHA'], NULL, 'ambos'),
        ('prod-mr-pork', 'MR PORK', 'Hamburguesas', NULL, 7.00, 'Chuleta de cerdo ahumada, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['CHULETA DE CERDO AHUMADA', 'SALSA DE LA CASA', 'QUESO', 'TOCINETA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 1, ARRAY['CHULETA DE CERDO AHUMADA'], NULL, 'ambos'),
        ('prod-street', 'STREET', 'Hamburguesas', NULL, 7.00, 'Carne mechada, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['CARNE MECHADA', 'SALSA DE LA CASA', 'QUESO', 'TOCINETA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 1, ARRAY['CARNE MECHADA'], NULL, 'ambos'),
        ('prod-nuggets', 'NUGGETS', 'Hamburguesas', NULL, 7.00, '6 nuggets de pollo acompañado de papas fritas.', '', NULL, ARRAY['6 NUGGETS DE POLLO', 'PAPAS FRITAS', 'SALSA DE LA CASA'], 1, ARRAY[]::text[], NULL, 'ambos'),
        ('prod-super-smash', 'SUPER SMASH', 'Hamburguesas', NULL, 7.00, 'Doble smash de carne, doble tocineta, doble queso, pepinillos y salsa smash.', '', '¡NEW!', ARRAY['DOBLE SMASH DE CARNE', 'DOBLE TOCINETA', 'DOBLE QUESO', 'PEPINILLOS', 'SALSA SMASH'], 2, ARRAY['DOBLE SMASH DE CARNE'], NULL, 'ambos'),
        ('prod-tasty', 'TASTY', 'Hamburguesas', NULL, 7.00, 'Doble smash de carne, doble queso, tocineta, lechuga, tomate, cebolla y salsa tasty.', '', '¡NEW!', ARRAY['DOBLE SMASH DE CARNE', 'DOBLE QUESO', 'TOCINETA', 'LECHUGA', 'TOMATE', 'CEBOLLA', 'SALSA TASTY'], 2, ARRAY['DOBLE SMASH DE CARNE'], NULL, 'ambos'),
        ('prod-mixtura', 'MIXTURA', 'Hamburguesas', NULL, 9.00, 'Carne de novillo, pollo crispy, doble queso, doble tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['CARNE DE NOVILLO', 'POLLO CRISPY', 'DOBLE QUESO', 'DOBLE TOCINETA', 'SALSA DE LA CASA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 2, ARRAY['CARNE DE NOVILLO', 'POLLO CRISPY'], NULL, 'ambos'),
        ('prod-house', 'HOUSE', 'Hamburguesas', NULL, 9.00, 'Pollo crispy, chuleta ahumada, doble queso, doble tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['POLLO CRISPY', 'CHULETA DE CERDO AHUMADA', 'DOBLE QUESO', 'DOBLE TOCINETA', 'SALSA DE LA CASA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 2, ARRAY['POLLO CRISPY', 'CHULETA DE CERDO AHUMADA'], NULL, 'ambos'),
        ('prod-3-0', '3.0', 'Hamburguesas', NULL, 10.00, 'Carne novillo, pollo crispy, chuleta ahumada, triple queso y triple tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['CARNE DE NOVILLO', 'POLLO CRISPY', 'CHULETA DE CERDO AHUMADA', 'TRIPLE QUESO', 'TRIPLE TOCINETA', 'SALSA DE LA CASA', 'PAPAS RALLADAS', 'HUEVO FRITO', 'LECHUGA', 'TOMATE', 'CEBOLLA'], 3, ARRAY['CARNE DE NOVILLO', 'POLLO CRISPY', 'CHULETA DE CERDO AHUMADA'], NULL, 'ambos'),
        ('prod-racion-papas', 'RACIÓN DE PAPAS', 'Hamburguesas', NULL, 2.00, 'Porción individual de papas fritas doradas y crujientes.', '', NULL, ARRAY['PAPAS FRITAS', 'SAL'], 0, ARRAY[]::text[], NULL, 'ambos'),
        ('prod-refresco-350ml', 'REFRESCO 350ML', 'Bebidas', 'refresco', 1.00, 'Refresco personal en botella de 350ml bien frío.', '', NULL, NULL, 1, ARRAY[]::text[], ARRAY['COCACOLA ORIGINAL', 'COCACOLA ZERO', 'NARANJA', 'UVA', 'TORONJA', 'CHINOTO', 'FRESCOLITA'], 'ambos'),
        ('prod-nestea', 'LIPTON', 'Bebidas', 'te', 1.00, 'Té frío Lipton bien frío.', '', NULL, NULL, 1, ARRAY[]::text[], ARRAY['Limón', 'Durazno'], 'ambos'),
        ('prod-nestea-drink', 'NESTEA', 'Bebidas', 'te', 1.00, 'Té frío Nestea bien frío.', '', NULL, NULL, 1, ARRAY[]::text[], ARRAY['Limón', 'Durazno'], 'ambos'),
        ('prod-cerveza', 'CERVEZA', 'Bebidas', 'cerveza', 1.00, 'Cerveza nacional bien fría.', '', NULL, NULL, 1, ARRAY[]::text[], NULL, 'ambos'),
        ('prod-refresco-2lt', 'REFRESCO 2LT', 'Bebidas', 'refresco', 2.50, 'Refresco familiar de 2 Litros surtido.', '', NULL, NULL, 1, ARRAY[]::text[], ARRAY['COCACOLA ORIGINAL', 'COCACOLA ZERO', 'CHINOTO', '7UP', 'FRESCOLITA', 'TORONJA', 'NARANJA', 'UVA', 'PIÑA', 'GOLDEN MANZANA', 'GOLDEN PIÑA', 'GOLDEN COLITA', 'PEPSI ORIGINAL', 'PEPSI ZERO'], 'ambos'),
        ('prod-agua-mineral', 'AGUA MINERAL', 'Bebidas', 'agua', 1.00, 'Agua mineral embotellada bien fría.', '', NULL, NULL, 1, ARRAY[]::text[], NULL, 'ambos'),
        ('prod-granizado', 'GRANIZADO', 'Bebidas', 'granizado', 1.50, 'Bebida granizada natural refrescante.', '', NULL, NULL, 1, ARRAY[]::text[], ARRAY['Fresa', 'Parchita'], 'ambos'),
        ('prod-lata', 'LATA', 'Bebidas', 'refresco', 1.50, 'Refresco en lata 355ml bien frío surtido.', '', NULL, NULL, 1, ARRAY[]::text[], ARRAY['PIÑA', 'PEPSI ORIGINAL', 'PEPSI ZERO', 'GOLDEN COLITA', 'MANZANA', '7UP', 'COCA COLA ORIGINAL', 'COCACOLA ZERO'], 'ambos')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        drink_type = EXCLUDED.drink_type,
        price = EXCLUDED.price,
        description = EXCLUDED.description,
        base_ingredients = EXCLUDED.base_ingredients,
        protein_count = EXCLUDED.protein_count,
        default_proteins = EXCLUDED.default_proteins,
        flavors = COALESCE(EXCLUDED.flavors, products.flavors);`,

      // 4. Preservar y normalizar productos adicionales creados en producción (no los borra, respeta sus categorías)
      `UPDATE products SET name = UPPER(TRIM(name)) WHERE name IS NOT NULL;`,
      `UPDATE products SET category = 'Hamburguesas' WHERE category IS NULL OR category = '';`,
      `UPDATE products SET protein_count = 1 WHERE protein_count IS NULL AND category = 'Hamburguesas';`,
      `UPDATE products SET protein_count = 0 WHERE protein_count IS NULL AND category != 'Hamburguesas';`,

      // 5. UPSERT oficial de Ingredientes, Proteínas, Adicionales y Salsas
      `INSERT INTO ingredients (id, name, ingredient_type, price_usd, is_base, is_extra, category, available, shift) VALUES
        ('ing-adicional-tocineta', 'TOCINETA', 'adicional', 1.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
        ('ing-adicional-queso-cheddar', 'QUESO CHEDDAR', 'adicional', 1.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
        ('ing-adicional-proteina', 'PROTEÍNA', 'adicional', 3.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
        ('ing-gratis-jalapenos', 'JALAPEÑOS PICANTES (GRATIS)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-cebolla-caramelizada', 'CEBOLLA CARAMELIZADA (GRATIS)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-sweet-relish', 'SWEET RELISH (GRATIS)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-maiz', 'MAÍZ (GRATIS)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-pepinillos', 'PEPINILLOS (GRATIS)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-base-novillo', 'CARNE DE NOVILLO', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-pollo-crispy', 'POLLO CRISPY', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-pollo-plancha', 'PECHUGA DE POLLO A LA PLANCHA', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-chuleta', 'CHULETA DE CERDO AHUMADA', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-mechada', 'CARNE MECHADA', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-doble-smash', 'DOBLE SMASH DE CARNE', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-salsa-casa', 'SALSA DE LA CASA', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-salsa-smash', 'SALSA SMASH', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-salsa-tasty', 'SALSA TASTY', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-queso', 'QUESO', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-doble-queso', 'DOBLE QUESO', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-triple-queso', 'TRIPLE QUESO', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-tocineta', 'TOCINETA', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-doble-tocineta', 'DOBLE TOCINETA', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-triple-tocineta', 'TRIPLE TOCINETA', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-papas-ralladas', 'PAPAS RALLADAS', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-huevo-frito', 'HUEVO FRITO', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-lechuga', 'LECHUGA', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-tomate', 'TOMATE', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-cebolla', 'CEBOLLA', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-pepinillos', 'PEPINILLOS', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-salsa-casa', 'SALSA DE LA CASA', 'salsa', 0.00, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-smash', 'SALSA SMASH', 'salsa', 0.00, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-tasty', 'SALSA TASTY', 'salsa', 0.00, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-ajo', 'SALSA DE AJO', 'salsa', 0.00, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-bbq', 'SALSA BBQ', 'salsa', 0.00, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-tartara', 'SALSA TÁRTARA', 'salsa', 0.00, FALSE, TRUE, 'Salsas', TRUE, 'ambos')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        ingredient_type = EXCLUDED.ingredient_type,
        price_usd = EXCLUDED.price_usd,
        is_base = EXCLUDED.is_base,
        is_extra = EXCLUDED.is_extra,
        category = EXCLUDED.category,
        available = EXCLUDED.available;`,

      // 6. Normalización de ingredientes adicionales
      `UPDATE ingredients SET name = UPPER(TRIM(name)) WHERE name IS NOT NULL;`,
      `UPDATE ingredients SET ingredient_type = 'proteina' WHERE id IN ('ing-base-novillo', 'ing-base-pollo-crispy', 'ing-base-pollo-plancha', 'ing-base-chuleta', 'ing-base-mechada', 'ing-base-doble-smash');`,
      `UPDATE ingredients SET ingredient_type = 'gratis', price_usd = 0.00 WHERE id IN ('ing-gratis-jalapenos', 'ing-gratis-cebolla-caramelizada', 'ing-gratis-sweet-relish', 'ing-gratis-maiz', 'ing-gratis-pepinillos') OR category = 'Gratis';`,
      `UPDATE ingredients SET ingredient_type = 'adicional' WHERE id IN ('ing-adicional-tocineta', 'ing-adicional-queso-cheddar', 'ing-adicional-proteina') OR category = 'Adicionales';`,
      `UPDATE ingredients SET ingredient_type = 'base', price_usd = 0.00 WHERE (category = 'Ingredientes Base' OR is_base = TRUE) AND id NOT IN ('ing-base-novillo', 'ing-base-pollo-crispy', 'ing-base-pollo-plancha', 'ing-base-chuleta', 'ing-base-mechada', 'ing-base-doble-smash');`,
      `UPDATE ingredients SET ingredient_type = 'salsa', category = 'Salsas' WHERE id LIKE 'ing-salsa-%' OR category = 'Salsas';`,
    ];

    for (const q of migrationQueries) {
      try { await client.query(q); } catch (e) { console.warn('Aviso migración PG:', e.message); }
    }

    client.release();
    console.log('✅ Base de datos PostgreSQL configurada y lista.');
  }
}

module.exports = {
  initDb,
  query: async (text, params) => {
    if (pool) {
      return pool.query(text, params);
    }
    throw new Error('Database pool not initialized.');
  },
  getClient: async () => {
    if (pool) {
      return pool.connect();
    }
    throw new Error('Database pool not initialized.');
  }
};
