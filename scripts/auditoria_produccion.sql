-- =====================================================================
-- 🍔 CRISPY BURGER POS - AUDITORÍA COMPLETA DE SALUD Y CONTROL CONTABLE
-- =====================================================================
-- Este script realiza 9 pruebas de integridad sobre la base de datos PostgreSQL
-- para detectar cualquier fallo, descuadre de dinero, órdenes huérfanas
-- o inconsistencias operativas.
-- ES 100% DE SOLO LECTURA (SELECT). NO MODIFICA NI ELIMINA NINGÚN DATO.
-- =====================================================================

-- =====================================================================
-- 1. DESCUADRE DE PRODUCTOS VS TOTAL DE COMANDA
-- Objetivo: Comprobar que el total de cada comanda ($ total_usd) coincide
-- exactamente con la suma de sus ítems (precio * cantidad) + costo de delivery.
-- Resultado esperado: 0 FILAS (Si devuelve filas, hay pedidos con cálculos descuadrados).
-- =====================================================================
SELECT 
  '1. Descuadre de Ítems vs Total' AS prueba,
  o.id AS orden_id, 
  o.order_number AS comanda, 
  COALESCE(o.customer_name, 'Sin Nombre') AS cliente, 
  o.total_usd AS total_registrado, 
  o.delivery_fee_usd AS delivery,
  COALESCE(SUM(oi.price * oi.quantity), 0) AS suma_productos,
  ROUND((COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee_usd, 0)), 2) AS total_deberia_ser,
  ROUND(ABS(o.total_usd - (COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee_usd, 0))), 2) AS diferencia
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.status != 'cancelado'
GROUP BY o.id, o.order_number, o.customer_name, o.total_usd, o.delivery_fee_usd
HAVING ABS(o.total_usd - (COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee_usd, 0))) > 0.05;


-- =====================================================================
-- 2. DESCUADRE DE PAGOS RECIBIDOS VS SALDO REGISTRADO
-- Objetivo: Comprobar que el saldo pagado en la orden (paid_amount_usd) coincide
-- exactamente con la suma real de registros de pago en la tabla order_payments.
-- Resultado esperado: 0 FILAS (Si devuelve filas, hay pagos fantasmas o mal sumados).
-- =====================================================================
SELECT 
  '2. Descuadre de Pagos Recibidos' AS prueba,
  o.id AS orden_id, 
  o.order_number AS comanda, 
  COALESCE(o.customer_name, 'Sin Nombre') AS cliente, 
  o.total_usd, 
  o.paid_amount_usd AS pagado_en_orden,
  COALESCE(SUM(op.amount_paid_usd), 0) AS suma_pagos_reales,
  ROUND(ABS(COALESCE(o.paid_amount_usd, 0) - COALESCE(SUM(op.amount_paid_usd), 0)), 2) AS diferencia
FROM orders o
LEFT JOIN order_payments op ON op.order_id = o.id
WHERE o.payment_status != 'credito' AND o.status != 'cancelado'
GROUP BY o.id, o.order_number, o.customer_name, o.total_usd, o.paid_amount_usd
HAVING ABS(COALESCE(o.paid_amount_usd, 0) - COALESCE(SUM(op.amount_paid_usd), 0)) > 0.05;


-- =====================================================================
-- 3. ESTADOS DE PAGO INCONSISTENTES
-- Objetivo: Detectar si una comanda dice 'pagado' pero le falta dinero,
-- o si dice 'no_pagado' pero ya tiene el 100% cubierto.
-- Resultado esperado: 0 FILAS (Todos los estados reflejan la realidad financiera).
-- =====================================================================
SELECT 
  '3. Estado de Pago Inconsistente' AS prueba,
  id AS orden_id, 
  order_number AS comanda, 
  COALESCE(customer_name, 'Sin Nombre') AS cliente, 
  status AS estado_orden, 
  payment_status AS estado_pago, 
  total_usd, 
  paid_amount_usd AS pagado,
  CASE 
    WHEN payment_status = 'pagado' AND (total_usd - paid_amount_usd) > 0.05 
      THEN 'Marcada PAGADA pero debe $' || ROUND(total_usd - paid_amount_usd, 2)
    WHEN payment_status = 'no_pagado' AND (paid_amount_usd >= total_usd - 0.05) AND total_usd > 0
      THEN 'Marcada NO PAGADA pero ya tiene cubierto el 100%'
    ELSE 'OK'
  END AS anomalia
FROM orders
WHERE status != 'cancelado' AND payment_status != 'credito'
  AND (
    (payment_status = 'pagado' AND (total_usd - paid_amount_usd) > 0.05)
    OR
    (payment_status = 'no_pagado' AND (paid_amount_usd >= total_usd - 0.05) AND total_usd > 0)
  );


-- =====================================================================
-- 4. ESTADO DE MESAS VS COMANDAS REALES EN SALÓN
-- Objetivo: Detectar mesas 'ocupadas' que no tienen comanda, o 'libres'
-- que tienen personas comiendo en el salón.
-- Resultado esperado: 0 FILAS (El mapa de mesas refleja la ocupación real).
-- =====================================================================
SELECT 
  '4. Mesa Ocupada sin Comanda' AS prueba,
  tc.number AS numero_mesa, 
  tc.name AS nombre_mesa, 
  tc.status AS estado_en_sistema,
  'Mesa marcada OCUPADA pero no tiene ninguna comanda activa' AS detalle
FROM tables_config tc
WHERE tc.status = 'ocupada'
  AND NOT EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.type = 'mesa' 
      AND o.table_number = tc.number 
      AND o.status NOT IN ('entregada', 'cancelado', 'fusionada') 
      AND o.payment_status != 'credito' 
      AND o.archived_at IS NULL
  )
UNION ALL
SELECT 
  '4. Mesa Libre con Comanda Activa' AS prueba,
  tc.number AS numero_mesa, 
  tc.name AS nombre_mesa, 
  tc.status AS estado_en_sistema,
  'Mesa marcada LIBRE pero tiene comanda abierta comiendo en ella' AS detalle
FROM tables_config tc
WHERE tc.status = 'libre'
  AND EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.type = 'mesa' 
      AND o.table_number = tc.number 
      AND o.status NOT IN ('entregada', 'cancelado', 'fusionada') 
      AND o.payment_status != 'credito' 
      AND o.archived_at IS NULL
  );


-- =====================================================================
-- 5. COMANDAS A CRÉDITO CON MOVIMIENTOS EN EFECTIVO EN CAJA CHICA
-- Objetivo: Verificar que ningún crédito haya ingresado efectivo falso a la caja chica.
-- Resultado esperado: 0 FILAS (Caja chica limpia de dinero a crédito).
-- =====================================================================
SELECT 
  '5. Crédito en Caja Chica' AS prueba,
  o.id AS orden_id, 
  o.order_number AS comanda, 
  COALESCE(o.customer_name, 'Sin Nombre') AS deudor, 
  c.id AS transaccion_caja_id, 
  c.amount_usd, 
  c.description
FROM orders o
JOIN caja_chica_transactions c ON c.order_id = o.id
WHERE o.payment_status = 'credito'
  AND (c.description LIKE 'Cobro de comanda finalizada %' OR c.description LIKE 'Vuelto de comanda finalizada %');


-- =====================================================================
-- 6. COMANDAS HUÉRFANAS O VACÍAS (SIN PRODUCTOS)
-- Objetivo: Detectar pedidos guardados por error sin comidas ni bebidas.
-- Resultado esperado: 0 FILAS.
-- =====================================================================
SELECT 
  '6. Comanda Vacía' AS prueba,
  o.id AS orden_id, 
  o.order_number AS comanda, 
  COALESCE(o.customer_name, 'Sin Nombre') AS cliente, 
  o.created_at, 
  o.status, 
  o.total_usd
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE oi.id IS NULL AND o.status != 'cancelado';


-- =====================================================================
-- 7. PAGOS HUÉRFANOS (SIN COMANDA ASOCIADA)
-- Objetivo: Detectar registros de dinero que no tengan orden en el sistema.
-- Resultado esperado: 0 FILAS.
-- =====================================================================
SELECT 
  '7. Pago Huérfano' AS prueba,
  op.id AS pago_id, 
  op.order_id, 
  op.payer_name AS pagador, 
  op.amount_paid_usd AS monto_usd, 
  op.created_at
FROM order_payments op
LEFT JOIN orders o ON o.id = op.order_id
WHERE o.id IS NULL;


-- =====================================================================
-- 8. ESTADO DE APERTURA DE CAJA CHICA (ÚLTIMAS APERTURAS)
-- Objetivo: Ver con cuánto dinero abrió el cajero y cuándo fue.
-- =====================================================================
SELECT 
  '8. Apertura de Caja' AS info,
  id, 
  usd_cash AS base_dolares, 
  cop_cash AS base_pesos_cop, 
  shift AS turno, 
  timestamp AS fecha_apertura
FROM caja_chica_apertura
ORDER BY timestamp DESC
LIMIT 2;


-- =====================================================================
-- 9. FOTO GENERAL DEL TURNO ACTIVO (VENTAS, CRÉDITOS Y PENDIENTES)
-- Objetivo: Resumen global de control financiero para el cliente.
-- =====================================================================
SELECT 
  '9. Resumen Financiero Turno' AS reporte,
  COUNT(*) AS total_comandas,
  COUNT(CASE WHEN payment_status = 'pagado' THEN 1 END) AS comandas_cobradas,
  COUNT(CASE WHEN payment_status = 'no_pagado' THEN 1 END) AS comandas_pendientes,
  COUNT(CASE WHEN payment_status = 'credito' THEN 1 END) AS comandas_a_credito,
  COUNT(CASE WHEN status = 'cancelado' THEN 1 END) AS comandas_anuladas,
  ROUND(COALESCE(SUM(CASE WHEN payment_status = 'pagado' THEN total_usd ELSE 0 END), 0), 2) AS dinero_cobrado_usd,
  ROUND(COALESCE(SUM(CASE WHEN payment_status = 'credito' THEN total_usd ELSE 0 END), 0), 2) AS cuentas_por_cobrar_credito_usd,
  ROUND(COALESCE(SUM(CASE WHEN payment_status = 'no_pagado' THEN total_usd ELSE 0 END), 0), 2) AS dinero_pendiente_en_mesas_usd,
  ROUND(COALESCE(SUM(CASE WHEN payment_status IN ('pagado', 'credito') THEN total_usd ELSE 0 END), 0), 2) AS ventas_totales_del_turno_usd
FROM orders
WHERE archived_at IS NULL;
