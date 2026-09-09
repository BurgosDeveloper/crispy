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

      `INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, protein_count, default_proteins, shift) VALUES
        ('prod-bistro', 'Bistro', 'Hamburguesas', NULL, 7.00, 'Carne de novillo, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Carne de novillo', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 1, ARRAY['Carne de novillo'], 'ambos'),
        ('prod-crispys', 'Crispys', 'Hamburguesas', NULL, 7.00, 'Pollo crispy, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Pollo crispy', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 1, ARRAY['Pollo crispy'], 'ambos'),
        ('prod-chicken-grill', 'Chicken Grill', 'Hamburguesas', NULL, 7.00, 'Pechuga de pollo a la plancha, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Pechuga de pollo a la plancha', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 1, ARRAY['Pechuga de pollo a la plancha'], 'ambos'),
        ('prod-mr-pork', 'Mr Pork', 'Hamburguesas', NULL, 7.00, 'Chuleta de cerdo ahumada, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Chuleta de cerdo ahumada', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 1, ARRAY['Chuleta de cerdo ahumada'], 'ambos'),
        ('prod-street', 'Street', 'Hamburguesas', NULL, 7.00, 'Carne mechada, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Carne mechada', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 1, ARRAY['Carne mechada'], 'ambos'),
        ('prod-nuggets', 'Nuggets', 'Hamburguesas', NULL, 7.00, '6 nuggets de pollo acompañado de papas fritas.', '', NULL, ARRAY['6 Nuggets de pollo', 'Papas fritas', 'Salsa de la casa'], 1, ARRAY[]::text[], 'ambos'),
        ('prod-super-smash', 'Super Smash', 'Hamburguesas', NULL, 7.00, 'Doble smash de carne, doble tocineta, doble queso, pepinillos y salsa smash.', '', '¡NEW!', ARRAY['Doble smash de carne', 'Doble tocineta', 'Doble queso', 'Pepinillos', 'Salsa smash'], 2, ARRAY['Doble smash de carne'], 'ambos'),
        ('prod-tasty', 'Tasty', 'Hamburguesas', NULL, 7.00, 'Doble smash de carne, doble queso, tocineta, lechuga, tomate, cebolla y salsa tasty.', '', '¡NEW!', ARRAY['Doble smash de carne', 'Doble queso', 'Tocineta', 'Lechuga', 'Tomate', 'Cebolla', 'Salsa tasty'], 2, ARRAY['Doble smash de carne'], 'ambos'),
        ('prod-mixtura', 'Mixtura', 'Hamburguesas', NULL, 9.00, 'Carne de novillo, pollo crispy, doble queso, doble tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Carne de novillo', 'Pollo crispy', 'Doble queso', 'Doble tocineta', 'Salsa de la casa', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 2, ARRAY['Carne de novillo', 'Pollo crispy'], 'ambos'),
        ('prod-house', 'House', 'Hamburguesas', NULL, 9.00, 'Pollo crispy, chuleta ahumada, doble queso, doble tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Pollo crispy', 'Chuleta de cerdo ahumada', 'Doble queso', 'Doble tocineta', 'Salsa de la casa', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 2, ARRAY['Pollo crispy', 'Chuleta de cerdo ahumada'], 'ambos'),
        ('prod-3-0', '3.0', 'Hamburguesas', NULL, 10.00, 'Carne novillo, pollo crispy, chuleta ahumada, triple queso y triple tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.', '', NULL, ARRAY['Carne de novillo', 'Pollo crispy', 'Chuleta de cerdo ahumada', 'Triple queso', 'Triple tocineta', 'Salsa de la casa', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'], 3, ARRAY['Carne de novillo', 'Pollo crispy', 'Chuleta de cerdo ahumada'], 'ambos'),
        ('prod-racion-papas', 'Ración de Papas', 'Hamburguesas', NULL, 2.00, 'Porción individual de papas fritas doradas y crujientes.', '', NULL, ARRAY['Papas fritas', 'Sal'], 0, ARRAY[]::text[], 'ambos'),
        ('prod-refresco-350ml', 'Refresco 350ml', 'Bebidas', 'refresco', 1.00, 'Refresco personal en botella de 350ml bien frío.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos'),
        ('prod-nestea', 'Nestea', 'Bebidas', 'te', 1.00, 'Té frío Nestea bien frío.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos'),
        ('prod-cerveza', 'Cerveza', 'Bebidas', 'cerveza', 1.00, 'Cerveza nacional bien fría.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos'),
        ('prod-refresco-2lt', 'Refresco 2Lt', 'Bebidas', 'refresco', 2.50, 'Refresco familiar de 2 Litros surtido.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos'),
        ('prod-agua-mineral', 'Agua Mineral', 'Bebidas', 'agua', 1.00, 'Agua mineral embotellada bien frío.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos'),
        ('prod-granizado', 'Granizado', 'Bebidas', 'jugo', 1.50, 'Bebida granizada natural refrescante.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos'),
        ('prod-lata', 'Lata', 'Bebidas', 'refresco', 1.50, 'Refresco en lata 355ml bien frío surtido.', '', NULL, NULL, 1, ARRAY[]::text[], 'ambos')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, category = EXCLUDED.category, protein_count = EXCLUDED.protein_count, default_proteins = EXCLUDED.default_proteins;`,

      `INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, protein_count, default_proteins, shift) VALUES
        ('prod-racion-papas', 'Ración de Papas', 'Hamburguesas', NULL, 2.00, 'Porción individual de papas fritas doradas y crujientes.', '', NULL, ARRAY['Papas fritas', 'Sal'], 0, ARRAY[]::text[], 'ambos')
        ON CONFLICT (id) DO UPDATE SET name = 'Ración de Papas', price = 2.00, category = 'Hamburguesas', protein_count = 0, default_proteins = ARRAY[]::text[];`,
      `DELETE FROM ingredients WHERE id IN ('ing-adicional-racion-papas', 'ing-servicio-papas-fritas');`,

      `INSERT INTO ingredients (id, name, ingredient_type, price_usd, is_base, is_extra, category, available, shift) VALUES
        ('ing-adicional-tocineta', 'Tocineta', 'adicional', 1.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
        ('ing-adicional-queso-cheddar', 'Queso Cheddar', 'adicional', 1.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
        ('ing-adicional-proteina', 'Proteína', 'adicional', 3.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
        ('ing-gratis-jalapenos', 'Jalapeños Picantes (Gratis)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-cebolla-caramelizada', 'Cebolla Caramelizada (Gratis)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-sweet-relish', 'Sweet Relish (Gratis)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-maiz', 'Maíz (Gratis)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-gratis-pepinillos', 'Pepinillos (Gratis)', 'gratis', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
        ('ing-base-novillo', 'Carne de novillo', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-pollo-crispy', 'Pollo crispy', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-pollo-plancha', 'Pechuga de pollo a la plancha', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-chuleta', 'Chuleta de cerdo ahumada', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-mechada', 'Carne mechada', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-doble-smash', 'Doble smash de carne', 'proteina', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-salsa-casa', 'Salsa de la casa', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-salsa-smash', 'Salsa smash', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-salsa-tasty', 'Salsa tasty', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-queso', 'Queso', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-doble-queso', 'Doble queso', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-triple-queso', 'Triple queso', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-tocineta', 'Tocineta', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-doble-tocineta', 'Doble tocineta', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-triple-tocineta', 'Triple tocineta', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-papas-ralladas', 'Papas ralladas', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-huevo-frito', 'Huevo frito', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-lechuga', 'Lechuga', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-tomate', 'Tomate', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-cebolla', 'Cebolla', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
        ('ing-base-pepinillos', 'Pepinillos', 'base', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos')
        ON CONFLICT (id) DO NOTHING;`,

      // Backfill dinámico de datos para BD existentes
      `UPDATE ingredients SET ingredient_type = 'proteina' WHERE id IN ('ing-base-novillo', 'ing-base-pollo-crispy', 'ing-base-pollo-plancha', 'ing-base-chuleta', 'ing-base-mechada', 'ing-base-doble-smash');`,
      `UPDATE ingredients SET ingredient_type = 'gratis', price_usd = 0.00 WHERE id IN ('ing-gratis-jalapenos', 'ing-gratis-cebolla-caramelizada', 'ing-gratis-sweet-relish', 'ing-gratis-maiz', 'ing-gratis-pepinillos') OR category = 'Gratis';`,
      `UPDATE ingredients SET ingredient_type = 'adicional' WHERE id IN ('ing-adicional-tocineta', 'ing-adicional-queso-cheddar', 'ing-adicional-proteina', 'ing-adicional-racion-papas', 'ing-servicio-papas-fritas') OR category = 'Adicionales';`,
      `UPDATE ingredients SET ingredient_type = 'base', price_usd = 0.00 WHERE (category = 'Ingredientes Base' OR is_base = TRUE) AND id NOT IN ('ing-base-novillo', 'ing-base-pollo-crispy', 'ing-base-pollo-plancha', 'ing-base-chuleta', 'ing-base-mechada', 'ing-base-doble-smash');`,

      `INSERT INTO ingredients (id, name, ingredient_type, price_usd, is_base, is_extra, is_base_for_pizza, is_extra_for_pizza, category, available, shift) VALUES
        ('ing-salsa-casa', 'Salsa de la Casa', 'salsa', 0.00, FALSE, TRUE, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-smash', 'Salsa Smash', 'salsa', 0.00, FALSE, TRUE, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-tasty', 'Salsa Tasty', 'salsa', 0.00, FALSE, TRUE, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-ajo', 'Salsa de Ajo', 'salsa', 0.00, FALSE, TRUE, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-bbq', 'Salsa BBQ', 'salsa', 0.00, FALSE, TRUE, FALSE, TRUE, 'Salsas', TRUE, 'ambos'),
        ('ing-salsa-tartara', 'Salsa Tártara', 'salsa', 0.00, FALSE, TRUE, FALSE, TRUE, 'Salsas', TRUE, 'ambos')
        ON CONFLICT (id) DO NOTHING;`,
      `UPDATE ingredients SET ingredient_type = 'salsa', category = 'Salsas' WHERE id LIKE 'ing-salsa-%' OR category = 'Salsas';`,

      `UPDATE products SET protein_count = 3, default_proteins = ARRAY['Carne de novillo', 'Pollo crispy', 'Chuleta de cerdo ahumada'] WHERE id = 'prod-3-0';`,
      `UPDATE products SET protein_count = 2, default_proteins = ARRAY['Carne de novillo', 'Pollo crispy'] WHERE id = 'prod-mixtura';`,
      `UPDATE products SET protein_count = 2, default_proteins = ARRAY['Pollo crispy', 'Chuleta de cerdo ahumada'] WHERE id = 'prod-house';`,
      `UPDATE products SET protein_count = 2, default_proteins = ARRAY['Doble smash de carne'] WHERE id IN ('prod-super-smash', 'prod-tasty');`,
      `UPDATE products SET protein_count = 1, default_proteins = ARRAY['Carne de novillo'] WHERE id = 'prod-bistro';`,
      `UPDATE products SET protein_count = 1, default_proteins = ARRAY['Pollo crispy'] WHERE id = 'prod-crispys';`,
      `UPDATE products SET protein_count = 1, default_proteins = ARRAY['Pechuga de pollo a la plancha'] WHERE id = 'prod-chicken-grill';`,
      `UPDATE products SET protein_count = 1, default_proteins = ARRAY['Chuleta de cerdo ahumada'] WHERE id = 'prod-mr-pork';`,
      `UPDATE products SET protein_count = 1, default_proteins = ARRAY['Carne mechada'] WHERE id = 'prod-street';`,
      `UPDATE products SET protein_count = 1, default_proteins = ARRAY[]::text[] WHERE id = 'prod-nuggets' OR default_proteins IS NULL;`,
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
