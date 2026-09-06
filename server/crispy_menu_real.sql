-- ============================================================
-- 🍔 CRISPY BURGER POS - MENÚ REAL OFICIAL (POSTGRESQL / PGADMIN)
-- ============================================================
-- Este script puebla la base de datos con el catálogo real de Crispy Burger:
-- 11 Hamburguesas y Platos, 7 Bebidas, 5 Adicionales, 5 Toppings Gratis
-- y los 21 Ingredientes Base para personalizaciones y exclusiones ("SIN").
-- ============================================================

BEGIN;

-- 1. Limpieza de catálogo anterior (preservando integridad de comandas históricas)
DELETE FROM products;
DELETE FROM ingredients;

-- 2. INSERCIÓN DE PRODUCTOS (Hamburguesas, Platos y Bebidas)
INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, shift) VALUES
-- --- HAMBURGUESAS Y PLATOS ---
(
  'prod-bistro',
  'Bistro',
  'Hamburguesas',
  NULL,
  7.00,
  'Carne de novillo, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Carne de novillo', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-crispys',
  'Crispys',
  'Hamburguesas',
  NULL,
  7.00,
  'Pollo crispy, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Pollo crispy', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-chicken-grill',
  'Chicken Grill',
  'Hamburguesas',
  NULL,
  7.00,
  'Pechuga de pollo a la plancha, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Pechuga de pollo a la plancha', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-mr-pork',
  'Mr Pork',
  'Hamburguesas',
  NULL,
  7.00,
  'Chuleta de cerdo ahumada, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Chuleta de cerdo ahumada', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-street',
  'Street',
  'Hamburguesas',
  NULL,
  7.00,
  'Carne mechada, salsa de la casa, queso, tocineta, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Carne mechada', 'Salsa de la casa', 'Queso', 'Tocineta', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-nuggets',
  'Nuggets',
  'Hamburguesas',
  NULL,
  7.00,
  '6 nuggets de pollo acompañado de papas fritas.',
  '',
  NULL,
  ARRAY['6 Nuggets de pollo', 'Papas fritas', 'Salsa de la casa'],
  'ambos'
),
(
  'prod-super-smash',
  'Super Smash',
  'Hamburguesas',
  NULL,
  7.00,
  'Doble smash de carne, doble tocineta, doble queso, pepinillos y salsa smash.',
  '',
  '¡NEW!',
  ARRAY['Doble smash de carne', 'Doble tocineta', 'Doble queso', 'Pepinillos', 'Salsa smash'],
  'ambos'
),
(
  'prod-tasty',
  'Tasty',
  'Hamburguesas',
  NULL,
  7.00,
  'Doble smash de carne, doble queso, tocineta, lechuga, tomate, cebolla y salsa tasty.',
  '',
  '¡NEW!',
  ARRAY['Doble smash de carne', 'Doble queso', 'Tocineta', 'Lechuga', 'Tomate', 'Cebolla', 'Salsa tasty'],
  'ambos'
),
(
  'prod-mixtura',
  'Mixtura',
  'Hamburguesas',
  NULL,
  9.00,
  'Carne de novillo, pollo crispy, doble queso, doble tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Carne de novillo', 'Pollo crispy', 'Doble queso', 'Doble tocineta', 'Salsa de la casa', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-house',
  'House',
  'Hamburguesas',
  NULL,
  9.00,
  'Pollo crispy, chuleta ahumada, doble queso, doble tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Pollo crispy', 'Chuleta de cerdo ahumada', 'Doble queso', 'Doble tocineta', 'Salsa de la casa', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-3-0',
  '3.0',
  'Hamburguesas',
  NULL,
  10.00,
  'Carne novillo, pollo crispy, chuleta ahumada, triple queso y triple tocineta, salsa de la casa, papas ralladas, huevo frito, lechuga, tomate y cebolla.',
  '',
  NULL,
  ARRAY['Carne de novillo', 'Pollo crispy', 'Chuleta de cerdo ahumada', 'Triple queso', 'Triple tocineta', 'Salsa de la casa', 'Papas ralladas', 'Huevo frito', 'Lechuga', 'Tomate', 'Cebolla'],
  'ambos'
),
(
  'prod-racion-papas',
  'Ración de Papas',
  'Hamburguesas',
  NULL,
  2.00,
  'Porción individual de papas fritas doradas y crujientes.',
  '',
  NULL,
  ARRAY['Papas fritas', 'Sal'],
  'ambos'
),

-- --- BEBIDAS (Sin imágenes, tarjetas compactas de texto) ---
(
  'prod-refresco-350ml',
  'Refresco 350ml',
  'Bebidas',
  'refresco',
  1.00,
  'Refresco personal en botella de 350ml bien frío.',
  '',
  NULL,
  NULL,
  'ambos'
),
(
  'prod-nestea',
  'Nestea',
  'Bebidas',
  'te',
  1.00,
  'Té frío Nestea (limón o durazno) bien frío.',
  '',
  NULL,
  NULL,
  'ambos'
),
(
  'prod-cerveza',
  'Cerveza',
  'Bebidas',
  'cerveza',
  1.00,
  'Cerveza nacional bien fría.',
  '',
  NULL,
  NULL,
  'ambos'
),
(
  'prod-refresco-2lt',
  'Refresco 2Lt',
  'Bebidas',
  'refresco',
  2.50,
  'Refresco familiar de 2 Litros surtido.',
  '',
  NULL,
  NULL,
  'ambos'
),
(
  'prod-agua-mineral',
  'Agua Mineral',
  'Bebidas',
  'agua',
  1.00,
  'Agua mineral embotellada bien fría.',
  '',
  NULL,
  NULL,
  'ambos'
),
(
  'prod-granizado',
  'Granizado',
  'Bebidas',
  'jugo',
  1.50,
  'Bebida granizada natural refrescante.',
  '',
  NULL,
  NULL,
  'ambos'
),
(
  'prod-lata',
  'Lata',
  'Bebidas',
  'refresco',
  1.50,
  'Refresco en lata 355ml bien frío surtido.',
  '',
  NULL,
  NULL,
  'ambos'
);

-- 3. INSERCIÓN DE INGREDIENTES, ADICIONALES Y TOPPINGS GRATIS
INSERT INTO ingredients (id, name, price_usd, is_base, is_extra, category, available, shift) VALUES
-- --- ADICIONALES PAGOS ---
('ing-adicional-tocineta', 'Tocineta', 1.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
('ing-adicional-queso-cheddar', 'Queso Cheddar', 1.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),
('ing-adicional-proteina', 'Proteína', 3.00, FALSE, TRUE, 'Adicionales', TRUE, 'ambos'),

-- --- TOPPINGS ¡GRATIS! ---
('ing-gratis-jalapenos', 'Jalapeños Picantes (Gratis)', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
('ing-gratis-cebolla-caramelizada', 'Cebolla Caramelizada (Gratis)', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
('ing-gratis-sweet-relish', 'Sweet Relish (Gratis)', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
('ing-gratis-maiz', 'Maíz (Gratis)', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),
('ing-gratis-pepinillos', 'Pepinillos (Gratis)', 0.00, FALSE, TRUE, 'Gratis', TRUE, 'ambos'),

-- --- INGREDIENTES BASE DE PREPARACIÓN (Permiten excluir "SIN") ---
('ing-base-novillo', 'Carne de novillo', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-pollo-crispy', 'Pollo crispy', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-pollo-plancha', 'Pechuga de pollo a la plancha', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-chuleta', 'Chuleta de cerdo ahumada', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-mechada', 'Carne mechada', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-doble-smash', 'Doble smash de carne', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-salsa-casa', 'Salsa de la casa', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-salsa-smash', 'Salsa smash', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-salsa-tasty', 'Salsa tasty', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-queso', 'Queso', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-doble-queso', 'Doble queso', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-triple-queso', 'Triple queso', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-tocineta', 'Tocineta', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-doble-tocineta', 'Doble tocineta', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-triple-tocineta', 'Triple tocineta', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-papas-ralladas', 'Papas ralladas', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-huevo-frito', 'Huevo frito', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-lechuga', 'Lechuga', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-tomate', 'Tomate', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-cebolla', 'Cebolla', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos'),
('ing-base-pepinillos', 'Pepinillos', 0.00, TRUE, FALSE, 'Ingredientes Base', TRUE, 'ambos');

COMMIT;
