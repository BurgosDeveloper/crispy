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
    : ['sdmaia1.', 'postgres', 'admin', 'root', ''];

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

      `CREATE TABLE IF NOT EXISTS ingredients (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, is_base BOOLEAN DEFAULT TRUE, is_extra BOOLEAN DEFAULT TRUE, category VARCHAR(64) DEFAULT 'Ingredientes', available BOOLEAN DEFAULT TRUE, shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
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

      `CREATE TABLE IF NOT EXISTS products (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, category VARCHAR(64) NOT NULL DEFAULT 'Hamburguesas', drink_type VARCHAR(32), price NUMERIC(10, 2) NOT NULL DEFAULT 0.00, description TEXT, image TEXT, badge VARCHAR(64), base_ingredients TEXT[], shift VARCHAR(32) DEFAULT 'ambos', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
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

      `INSERT INTO users (id, username, password, role, name, shift) VALUES
        ('u-admin', 'admin', 'admin', 'admin', 'Administrador General', 'ambos'),
        ('u-caja', 'caja', 'caja', 'caja', 'Cajero Principal', 'ambos'),
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

      `INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, shift) VALUES
        ('prod-1', 'Hamburguesa Crispy Clásica', 'Hamburguesas', NULL, 6.50, 'Carne de res 150g, queso cheddar fundido, lechuga, tomate, cebolla y salsa especial Crispy.', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80', 'POPULAR', ARRAY['Carne de Res', 'Queso Cheddar', 'Lechuga', 'Tomate', 'Cebolla', 'Salsa Crispy'], 'ambos'),
        ('prod-2', 'Hamburguesa Crispy Doble Bacon', 'Hamburguesas', NULL, 8.50, 'Doble carne de res 300g, doble cheddar fundido, tocineta crocante y salsa BBQ ahumada.', 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80', 'ESPECIAL', ARRAY['Doble Carne', 'Queso Cheddar', 'Tocineta Ahumada', 'Salsa BBQ'], 'ambos'),
        ('prod-3', 'Crispy Chicken Burger', 'Hamburguesas', NULL, 7.00, 'Pechuga de pollo extra crujiente, pepinillos encurtidos, ensalada coleslaw y mayonesa de ajo.', 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80', 'FAVORITA', ARRAY['Pollo Crujiente', 'Pepinillos', 'Coleslaw', 'Mayonesa de Ajo'], 'ambos'),
        ('prod-4', 'Papas Fritas Crispy Grandes', 'Acompañantes', NULL, 3.00, 'Papas crujientes recién fritas, sazonadas con toque de sal marina y páprika.', 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80', 'CRISPY', ARRAY['Papas'], 'ambos'),
        ('prod-5', 'Refresco 1.5L', 'Bebidas', 'refresco', 3.50, 'Botella de 1.5 litros bien fría surtida.', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80', NULL, NULL, 'ambos'),
        ('prod-6', 'Refresco en Lata 355ml', 'Bebidas', 'refresco', 1.50, 'Lata de 355ml bien fría (Coca-Cola, Pepsi, Sprite, etc.).', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80', NULL, NULL, 'ambos')
        ON CONFLICT (id) DO NOTHING;`,

      `INSERT INTO ingredients (id, name, price_usd, is_base, is_extra, category, available, shift) VALUES
        ('ing-1', 'Carne de Res', 0.00, true, false, 'Carnes', true, 'ambos'),
        ('ing-2', 'Doble Carne', 2.00, false, true, 'Carnes', true, 'ambos'),
        ('ing-3', 'Pollo Crujiente', 0.00, true, false, 'Carnes', true, 'ambos'),
        ('ing-4', 'Queso Cheddar', 1.00, true, true, 'Quesos', true, 'ambos'),
        ('ing-5', 'Tocineta Ahumada', 1.50, false, true, 'Extras', true, 'ambos'),
        ('ing-6', 'Huevo Frito', 1.00, false, true, 'Extras', true, 'ambos'),
        ('ing-7', 'Pepinillos Encurtidos', 0.50, true, true, 'Vegetales', true, 'ambos'),
        ('ing-8', 'Cebolla Caramelizada', 1.00, false, true, 'Vegetales', true, 'ambos'),
        ('ing-9', 'Lechuga', 0.00, true, false, 'Vegetales', true, 'ambos'),
        ('ing-10', 'Tomate', 0.00, true, false, 'Vegetales', true, 'ambos'),
        ('ing-11', 'Salsa Crispy Especial', 0.50, true, true, 'Salsas', true, 'ambos'),
        ('ing-12', 'Papas Fritas Ración', 2.00, false, true, 'Acompañantes', true, 'ambos')
        ON CONFLICT (id) DO NOTHING;`,
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
