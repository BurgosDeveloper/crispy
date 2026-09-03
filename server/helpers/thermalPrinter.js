const fs = require('fs');
const net = require('net');
const path = require('path');

const PRINTER_CONFIG_PATH = path.join(__dirname, '../config/thermal-printer.json');
// Font expansion in ESC/POS uses discrete sizes. Extra character spacing gives
// the 80 mm ticket approximately 40% more horizontal presence without relying
// on vendor-specific font modes.
const LINE_WIDTH = 28;
// Configuración ESC/POS con fuente 40% más grande y espaciado optimizado:
// - \x1B \x08: ESC SP 8 -> Aumenta el espaciado horizontal entre caracteres en 8 puntos (~40-50% más ancho y legible)
// - \x1B3\x2C: ESC 3 44 -> Altura de línea ampliada a 44 puntos (~40% más alto)
// - \x1BM\x00: ESC M 0 -> Fuente A estándar (12x24 puntos, máxima definición)
const PRINT_FORMAT_SETUP = '\x1B \x08\x1B3\x2C\x1BM\x00';
const PRINT_FORMAT_RESET = '\x1B \x00\x1B2';

const KITCHEN_LINE_WIDTH = 21;
// Configuración ESC/POS para COCINA y REPORTE CONTABLE (doble alto + doble ancho + negrita):
// - \x1B \x00: 0 espacio extra entre letras (texto continuo y natural)
// - \x1B3\x26: Interlineado compacto adecuado para fuente doble altura
// - \x1BM\x00: Fuente A estándar
// - \x1D!\x11: Doble alto + Doble ancho en TODO el ticket (tamaño gigante idéntico a COMANDA:#6)
// - \x1BE\x01: Negrita de alto contraste
const KITCHEN_FORMAT_SETUP = '\x1B \x00\x1B3\x26\x1BM\x00\x1D!\x11\x1BE\x01';

function loadDualPrinterConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(PRINTER_CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Aviso: no se pudo leer la configuración de impresoras: ${error.message}`);
    }
  }

  // Compatibilidad hacia atrás si el JSON no tiene las claves 'cocina' o 'caja'
  const cocinaRaw = fileConfig.cocina || {
    name: 'Impresora Cocina / KDS',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    host: fileConfig.host || '192.168.1.200',
    port: Number(fileConfig.port || 9100),
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  const cajaRaw = fileConfig.caja || {
    name: 'Impresora Caja / Mostrador',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    host: fileConfig.host || '192.168.1.201',
    port: Number(fileConfig.port || 9100),
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  return {
    cocina: {
      name: cocinaRaw.name || 'Impresora Cocina / KDS',
      enabled: cocinaRaw.enabled === true,
      host: String(cocinaRaw.host || '').trim(),
      port: Number(cocinaRaw.port || 9100),
      timeoutMs: Number(cocinaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cocinaRaw.copies || 1)),
    },
    caja: {
      name: cajaRaw.name || 'Impresora Caja / Mostrador',
      enabled: cajaRaw.enabled === true,
      host: String(cajaRaw.host || '').trim(),
      port: Number(cajaRaw.port || 9100),
      timeoutMs: Number(cajaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cajaRaw.copies || 1)),
    }
  };
}

function saveDualPrinterConfig(newConfig) {
  const current = loadDualPrinterConfig();
  const merged = {
    cocina: {
      ...current.cocina,
      ...(newConfig.cocina || {}),
      port: Number(newConfig.cocina?.port || current.cocina.port || 9100),
      copies: Math.max(1, Number(newConfig.cocina?.copies || current.cocina.copies || 1)),
    },
    caja: {
      ...current.caja,
      ...(newConfig.caja || {}),
      port: Number(newConfig.caja?.port || current.caja.port || 9100),
      copies: Math.max(1, Number(newConfig.caja?.copies || current.caja.copies || 1)),
    }
  };
  fs.writeFileSync(PRINTER_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function loadPrinterConfig(target = 'caja') {
  const dual = loadDualPrinterConfig();
  return dual[target] || dual.caja;
}

function printableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(value, width = LINE_WIDTH, indent = '') {
  const words = printableText(value).split(' ').filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = indent;
  for (const word of words) {
    if (current.trim() && (current.length + 1 + word.length) > width) {
      lines.push(current);
      current = indent;
    }

    if (current.trim()) {
      current += ` ${word}`;
    } else {
      let remaining = word;
      const availableWidth = Math.max(1, width - indent.length);
      while (remaining.length > availableWidth) {
        lines.push(`${indent}${remaining.slice(0, availableWidth)}`);
        remaining = remaining.slice(availableWidth);
      }
      current = `${indent}${remaining}`;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function divider(character = '-', width = LINE_WIDTH) {
  return character.repeat(width);
}

function centered(value, width = LINE_WIDTH) {
  const text = printableText(value).slice(0, width);
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(padding)}${text}`;
}

function isKitchenItem(item) {
  if (!item) return false;

  const category = String(item.category || '').trim().toLowerCase();
  const drinkType = String(item.drinkType || item.drink_type || '').trim().toLowerCase();
  const rawName = String(item.productName || item.name || '').trim();
  const name = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nameClean = name.replace(/[^a-z0-9]/g, '');

  // 1. Detección de jugos naturales y merengadas/malteadas/batidos preparados
  const isJuiceOrShake = (
    drinkType === 'jugo' ||
    drinkType === 'merengada' ||
    drinkType === 'malteada' ||
    drinkType === 'batido' ||
    !!item.sugarPreference ||
    name.includes('jugo') ||
    name.includes('merengada') ||
    name.includes('malteada') ||
    name.includes('batido')
  );

  // 2. REGLA ESTRICTA DE BEBIDAS:
  // Si pertenece a la categoría de Bebidas / Licores / Refrescos, la ÚNICA bebida que va a cocina es jugo/merengada/malteada.
  if (
    category === 'bebidas' ||
    category === 'bebida' ||
    category === 'licores' ||
    category === 'licor' ||
    category === 'cervezas' ||
    category === 'cerveza' ||
    category === 'gaseosas' ||
    category === 'refrescos' ||
    category === 'bebidas comerciales' ||
    category === 'bebida comercial'
  ) {
    return isJuiceOrShake;
  }

  // 3. Si tiene tipo de bebida explícito comercial o embotellado (refresco, licor, etc.)
  if (['refresco', 'gaseosa', 'licor', 'cerveza', 'comercial', 'soda', 'agua', 'te'].includes(drinkType)) {
    return false;
  }

  // 4. Todos los demás ítems (Pizzas, Platos, Entradas, Pastas, Especialidades, Postres, etc.) SI van a cocina
  return true;
}

function itemDetails(item, order = {}) {
  const details = [];

  if (item.isTakeaway || item.is_takeaway) details.push('*** PARA LLEVAR ***');
  if (item.proteins?.length) details.push(`PROTEINA: ${item.proteins.join(' + ')}`);
  if (item.removedIngredients?.length) details.push(`SIN: ${item.removedIngredients.join(', ')}`);
  if (item.extras?.length) {
    details.push(`EXTRA: ${item.extras.map((extra) => extra.name || extra).join(', ')}`);
  }
  if (item.sugarPreference) details.push(`Azucar: ${item.sugarPreference}`);
  if (item.notes) details.push(`NOTA: ${item.notes}`);
  return details;
}

function reportAmounts(payment) {
  let usd = Number(payment.cashTenderedUSD) || 0;
  let cop = Number(payment.cashTenderedCOP) || 0;
  let bs = Number(payment.cashTenderedBs) || 0;
  const paidUSD = Number(payment.amountPaidUSD) || 0;
  if (usd === 0 && cop === 0 && bs === 0 && paidUSD > 0) {
    if (['Efectivo COP', 'Bancolombia', 'Nequi'].includes(payment.paymentMethod)) cop = paidUSD * (Number(payment.copRate) || 3950);
    else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) bs = paidUSD * (Number(payment.bsRate) || 36.5);
    else usd = paidUSD;
  }
  return { usd, cop, bs };
}

function reportSaleAmounts(payment) {
  const paidUSD = Number(payment.amountPaidUSD) || 0;
  let usd = 0;
  let cop = 0;
  let bs = 0;
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(payment.paymentMethod)) {
    cop = paidUSD * (Number(payment.copRate) || 3950);
  } else if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(payment.paymentMethod)) {
    bs = paidUSD * (Number(payment.bsRate) || 36.5);
  } else {
    usd = paidUSD;
  }
  return { usd, cop, bs, equivalentUSD: paidUSD };
}

function monetaryLines(amounts, prefix = '') {
  const lines = [];
  if (amounts.usd > 0) lines.push(`${prefix}$${amounts.usd.toFixed(2)} USD`);
  if (amounts.cop > 0) lines.push(`${prefix}${Math.round(amounts.cop).toLocaleString('en-US')} COP`);
  if (amounts.bs > 0) lines.push(`${prefix}${amounts.bs.toFixed(2)} Bs`);
  return lines;
}

function reportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printableText(value) : date.toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function reportTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? printableText(value) : date.toLocaleString('es-VE', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function reportService(order) {
  if (order.type === 'mesa') return `MESA #${order.tableNumber || '?'}`;
  if (order.type === 'delivery') return 'DELIVERY';
  if (order.type === 'pickup') return 'PARA LLEVAR';
  return printableText(order.type || 'SIN TIPO');
}

function addSection(lines, title, width = LINE_WIDTH) {
  lines.push('', divider('-', width), '\x1BE\x01', ...wrapText(title, width), '\x1BE\x00');
}

function addAmountLines(lines, amounts, prefix = '  ', includeZeroAmounts = false) {
  const values = includeZeroAmounts
    ? [
      `${prefix}$${(Number(amounts.usd) || 0).toFixed(2)} USD`,
      `${prefix}${Math.round(Number(amounts.cop) || 0).toLocaleString('en-US')} COP`,
      `${prefix}${(Number(amounts.bs) || 0).toFixed(2)} Bs`,
    ]
    : monetaryLines(amounts, prefix);
  lines.push(...(values.length > 0 ? values : [`${prefix}SIN MONTO REGISTRADO`]));
}

function paymentChangeAmounts(payment) {
  return {
    usd: Number(payment.changeGivenUSD) || 0,
    cop: Number(payment.changeGivenCOP) || 0,
    bs: Number(payment.changeGivenBs) || 0,
  };
}

function addReportHeader(lines, title, data, width = LINE_WIDTH, formatSetup = PRINT_FORMAT_SETUP) {
  lines.push(
    '\x1B@',
    formatSetup,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('CRISPY BURGER', width),
    centered(title, width),
    '\x1BE\x00',
    `EMITIDO: ${reportTimestamp(new Date().toISOString())}`,
    '\x1Ba\x00',
    divider('=', width),
  );
  lines.push(...wrapText(`DESDE: ${reportTimestamp(data?.dateRange?.from)}`, width));
  lines.push(...wrapText(`HASTA: ${reportTimestamp(data?.dateRange?.to)}`, width));
  lines.push(...wrapText(`TASAS: 1 USD = ${Number(data?.exchangeRates?.COP) || 3950} COP | ${Number(data?.exchangeRates?.Bs) || 36.5} Bs`, width));
}

function buildReportTicket(reportType, data) {
  const titles = {
    contable: 'REPORTE CONTABLE',
    pizzas: 'HAMBURGUESAS VENDIDAS',
    ingresos: 'INGRESOS Y COBROS',
    egresos: 'VUELTOS Y EGRESOS',
    cocina: 'REPORTE DE COCINA',
  };
  const title = titles[reportType];
  if (!title) throw new Error('Tipo de reporte térmico no válido.');

  const isContable = reportType === 'contable';
  const reportWidth = isContable ? KITCHEN_LINE_WIDTH : LINE_WIDTH;
  const formatSetup = isContable ? KITCHEN_FORMAT_SETUP : PRINT_FORMAT_SETUP;

  const lines = [];
  addReportHeader(lines, title, data, reportWidth, formatSetup);

  if (reportType === 'pizzas') {
    const grouped = new Map();
    for (const item of data.items || []) {
      const isPizza = (item.category || '').toLowerCase().includes('pizza') || (item.productName || '').toLowerCase().includes('pizza') || !!item.size || !!item.isHalfHalf;
      const sizeLabel = item.size ? ` (${item.size})` : '';
      const fullName = `${item.productName || item.name || 'Item'}${sizeLabel}`;
      const category = isPizza ? 'Pizzas' : (item.category || 'Sin categoria');
      const key = `${category}|${fullName}`;
      const current = grouped.get(key) || { category, name: fullName, quantity: 0, totalUSD: 0 };
      current.quantity += Number(item.quantity) || 0;
      current.totalUSD += (Number(item.price) || 0) * (Number(item.quantity) || 0);
      grouped.set(key, current);
    }
    const items = [...grouped.values()].sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
    const totalUnits = items.reduce((total, item) => total + item.quantity, 0);
    const totalUSD = items.reduce((total, item) => total + item.totalUSD, 0);
    addSection(lines, 'DETALLE DE ITEMS FACTURADOS');
    if (items.length === 0) {
      lines.push('SIN PIZZAS, BEBIDAS O ADICIONALES');
    } else {
      let category = '';
      for (const item of items) {
        if (item.category !== category) {
          category = item.category;
          lines.push('', ...wrapText(`CATEGORIA: ${category}`));
        }
        lines.push(...wrapText(`${item.quantity}x ${item.name}`, LINE_WIDTH, '  '));
        lines.push(`  SUBTOTAL: $${item.totalUSD.toFixed(2)} USD`);
      }
    }
    addSection(lines, 'RESUMEN DE VENTAS');
    const rates = data.exchangeRates || {};
    lines.push(`PRODUCTOS DIFERENTES: ${items.length}`, `UNIDADES FACTURADAS: ${totalUnits}`, 'TOTAL PRODUCTOS:');
    addAmountLines(lines, {
      usd: totalUSD,
      cop: totalUSD * (Number(rates.COP) || 3950),
      bs: totalUSD * (Number(rates.Bs) || 36.5),
    }, '  ', true);
  } else if (reportType === 'ingresos') {
    const totals = { usd: 0, cop: 0, bs: 0 };
    const changes = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();
    addSection(lines, 'COBROS REGISTRADOS');
    if ((data.payments || []).length === 0) lines.push('SIN COBROS EN EL INTERVALO');
    for (const payment of data.payments || []) {
      const received = reportAmounts(payment);
      const change = paymentChangeAmounts(payment);
      totals.usd += received.usd; totals.cop += received.cop; totals.bs += received.bs;
      changes.usd += change.usd; changes.cop += change.cop; changes.bs += change.bs;
      const methodTotal = byMethod.get(payment.paymentMethod) || { count: 0, usd: 0, cop: 0, bs: 0 };
      methodTotal.count += 1; methodTotal.usd += received.usd; methodTotal.cop += received.cop; methodTotal.bs += received.bs;
      byMethod.set(payment.paymentMethod, methodTotal);
      lines.push('', ...wrapText(`${reportDate(payment.createdAt)} | #${payment.orderNumber || '?'}`));
      lines.push(...wrapText(`METODO: ${payment.paymentMethod || 'SIN METODO'}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`PAGADOR: ${payment.payerName || 'CLIENTE GENERAL'}`, LINE_WIDTH, '  '));
      lines.push('  RECIBIDO:');
      addAmountLines(lines, received, '    ');
      if (change.usd > 0 || change.cop > 0 || change.bs > 0) {
        lines.push('  VUELTO ENTREGADO:');
        addAmountLines(lines, change, '    ');
      }
    }
    addSection(lines, 'RESUMEN DE INGRESOS');
    lines.push(`MOVIMIENTOS: ${(data.payments || []).length}`, 'TOTAL RECIBIDO:');
    addAmountLines(lines, totals, '  ', true);
    lines.push('TOTAL VUELTOS:');
    addAmountLines(lines, changes, '  ', true);
    addSection(lines, 'TOTALES POR METODO');
    for (const [method, amounts] of byMethod) {
      lines.push('', ...wrapText(`${method} (${amounts.count})`));
      addAmountLines(lines, amounts, '  ');
    }
  } else if (reportType === 'egresos') {
    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');
    const totals = { usd: 0, cop: 0, bs: 0 };
    addSection(lines, 'MOVIMIENTOS DE SALIDA');
    if (expenses.length === 0) lines.push('SIN VUELTOS O EGRESOS EN EL INTERVALO');
    for (const transaction of expenses) {
      const amounts = { usd: Number(transaction.amountUSD) || 0, cop: Number(transaction.amountCOP) || 0, bs: Number(transaction.amountBs) || 0 };
      totals.usd += amounts.usd; totals.cop += amounts.cop; totals.bs += amounts.bs;
      lines.push('', ...wrapText(`${reportDate(transaction.timestamp)} | ${transaction.orderNumber ? `#${transaction.orderNumber}` : 'SIN COMANDA'}`));
      lines.push(...wrapText(`METODO: ${transaction.paymentMethod || 'EGRESO'}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`CONCEPTO: ${transaction.description || 'SIN DESCRIPCION'}`, LINE_WIDTH, '  '));
      lines.push('  ENTREGADO:');
      addAmountLines(lines, amounts, '    ');
    }
    addSection(lines, 'RESUMEN DE EGRESOS');
    lines.push(`MOVIMIENTOS DE SALIDA: ${expenses.length}`, 'TOTAL ENTREGADO:');
    addAmountLines(lines, totals, '  ', true);
  } else if (reportType === 'cocina') {
    const itemsByOrder = new Map();
    for (const item of data.items || []) {
      itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) || []), item]);
    }
    addSection(lines, 'COMANDAS DEL INTERVALO');
    if ((data.orders || []).length === 0) lines.push('SIN COMANDAS COBRADAS EN EL INTERVALO');
    for (const order of data.orders || []) {
      const orderItems = itemsByOrder.get(order.id) || [];
      lines.push('', '\x1BE\x01', ...wrapText(`#${order.orderNumber || '?'} | ${reportService(order)}`), '\x1BE\x00');
      lines.push(...wrapText(`RECIBIDA: ${reportDate(order.createdAt)} | ESTADO: ${order.status || 'SIN ESTADO'}`, LINE_WIDTH, '  '));
      if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`, LINE_WIDTH, '  '));
      lines.push(...wrapText(`PAGO: ${order.paymentMethod || 'SEGUN MOVIMIENTO'}`, LINE_WIDTH, '  '));
      for (const item of orderItems) lines.push(...wrapText(`${item.quantity || 1}x ${item.productName || 'ITEM'}`, LINE_WIDTH, '  '));
      if (orderItems.length === 0) lines.push('  SIN ITEMS DISPONIBLES');
      lines.push(`  TOTAL: $${(Number(order.totalUSD) || 0).toFixed(2)} USD`);
    }
    addSection(lines, 'RESUMEN DE COCINA');
    lines.push(`COMANDAS: ${(data.orders || []).length}`, `ITEMS FACTURADOS: ${(data.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  } else {
    // REPORTE CONTABLE CONSOLIDADO
    const billedTotals = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();
    const paymentCounts = new Map();

    for (const payment of data.payments || []) {
      if (payment.paymentMethod === 'Crédito') continue;
      const paidUSD = Number(payment.amountPaidUSD) || 0;
      if (paidUSD <= 0) continue;
      const amounts = reportSaleAmounts(payment);
      billedTotals.usd += amounts.usd;
      billedTotals.cop += amounts.cop;
      billedTotals.bs += amounts.bs;
      const methodTotals = byMethod.get(payment.paymentMethod) || { usd: 0, cop: 0, bs: 0 };
      methodTotals.usd += amounts.usd;
      methodTotals.cop += amounts.cop;
      methodTotals.bs += amounts.bs;
      byMethod.set(payment.paymentMethod, methodTotals);
      paymentCounts.set(payment.paymentMethod, (paymentCounts.get(payment.paymentMethod) || 0) + 1);
    }

    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');

    const creditOrders = (data.orders || []).filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
    const cashOrders = (data.orders || []).filter((o) => o.paymentStatus === 'pagado' && o.paymentMethod !== 'Crédito');
    const firstOrder = data.orders?.[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders?.[data.orders.length - 1]?.orderNumber || 'N/A';

    lines.push(...wrapText(`COMANDA INICIAL: #${firstOrder}`, reportWidth));
    lines.push(...wrapText(`COMANDA FINAL:   #${lastOrder}`, reportWidth));

    // Desglose de Deliverys por tarifa
    const deliveryMap = new Map();
    let totalDeliveryServices = 0;
    let totalDeliveryUSD = 0;
    for (const ord of (data.orders || [])) {
      const fee = Number(ord.deliveryFeeUSD) || 0;
      if (ord.type === 'delivery' || fee > 0) {
        totalDeliveryServices += 1;
        totalDeliveryUSD += fee;
        deliveryMap.set(fee, (deliveryMap.get(fee) || 0) + 1);
      }
    }

    // Desglose de Extras / Adicionales por precio
    const extrasMap = new Map();
    let totalExtrasCount = 0;
    let totalExtrasUSD = 0;
    for (const it of (data.items || [])) {
      const itQty = Number(it.quantity) || 1;
      const extrasList = [];
      if (Array.isArray(it.extras)) {
        extrasList.push(...it.extras);
      } else if (it.extrasJson && Array.isArray(it.extrasJson)) {
        extrasList.push(...it.extrasJson);
      }
      if (it.isHalfHalf && it.halfDetails) {
        if (Array.isArray(it.halfDetails.half1Extras)) extrasList.push(...it.halfDetails.half1Extras);
        if (Array.isArray(it.halfDetails.half2Extras)) extrasList.push(...it.halfDetails.half2Extras);
      }
      for (const extra of extrasList) {
        const price = Number(extra.price) || 0;
        const count = itQty;
        const subtotal = price * count;
        totalExtrasCount += count;
        totalExtrasUSD += subtotal;
        const prev = extrasMap.get(price) || { count: 0, totalUSD: 0 };
        prev.count += count;
        prev.totalUSD += subtotal;
        extrasMap.set(price, prev);
      }
    }

    const totalFacturadoUSD = Array.from(byMethod.values()).reduce((sum, m) => {
      const equiv = m.usd + (m.cop / (Number(data.exchangeRates?.COP) || 3950)) + (m.bs / (Number(data.exchangeRates?.Bs) || 36.5));
      return sum + equiv;
    }, 0);

    // SECCIÓN 2 — TOTAL FACTURADO POR MONEDA
    addSection(lines, 'SECCION 2: FACTURADO', reportWidth);
    lines.push(...wrapText(`USD: $${billedTotals.usd.toFixed(2)}`, reportWidth));
    lines.push(...wrapText(`COP: $${Math.round(billedTotals.cop).toLocaleString('en-US')} COP`, reportWidth));
    lines.push(...wrapText(`Bs:  Bs ${billedTotals.bs.toFixed(2)}`, reportWidth));
    lines.push(divider('-', reportWidth));
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`TOTAL: $${totalFacturadoUSD.toFixed(2)} USD`, reportWidth));
    lines.push('\x1BE\x00');
    lines.push(divider('-', reportWidth));
    lines.push(...wrapText(`TOTAL COMANDAS: ${(data.orders || []).length}`, reportWidth));
    lines.push(...wrapText(`  • Al Contado: ${cashOrders.length}`, reportWidth));
    lines.push(...wrapText(`  • A Credito:  ${creditOrders.length}`, reportWidth));

    // SECCIÓN 3 — DESGLOSE DE COBROS POR TIPO DE PAGO
    addSection(lines, 'SECCION 3: POR METODO', reportWidth);
    if (byMethod.size === 0) {
      lines.push('SIN COBROS EN EL INTERVALO');
    } else {
      for (const [method, amounts] of byMethod) {
        const count = paymentCounts.get(method) || 1;
        lines.push('', ...wrapText(`• ${method} (${count}):`, reportWidth));
        addAmountLines(lines, amounts, '    ');
      }
    }

    // SECCIÓN 4 — CAJA CHICA DEL EFECTIVO ESPERADA
    const aperturaUSD = Number(data.apertura?.usdCash) || 0;
    const aperturaCOP = Number(data.apertura?.copCash) || 0;

    let totalIngresosEfectivoUSD = 0;
    let totalIngresosEfectivoCOP = 0;
    for (const payment of data.payments || []) {
      const amounts = reportAmounts(payment);
      if (payment.paymentMethod === 'Efectivo USD') totalIngresosEfectivoUSD += amounts.usd;
      if (payment.paymentMethod === 'Efectivo COP') totalIngresosEfectivoCOP += amounts.cop;
    }
    for (const t of (data.transactions || [])) {
      if (t.type === 'ingreso' && !t.orderId) {
        if (t.paymentMethod === 'Efectivo USD') totalIngresosEfectivoUSD += (Number(t.amountUSD) || 0);
        if (t.paymentMethod === 'Efectivo COP') totalIngresosEfectivoCOP += (Number(t.amountCOP) || 0);
      }
    }

    let totalEgresosEfectivoUSD = 0;
    let totalEgresosEfectivoCOP = 0;
    for (const tx of expenses) {
      if (tx.paymentMethod === 'Efectivo USD' || (Number(tx.amountUSD) > 0 && !tx.paymentMethod?.includes('COP') && !tx.paymentMethod?.includes('Bs') && !tx.paymentMethod?.includes('Móvil') && !tx.paymentMethod?.includes('Tarjeta'))) {
        totalEgresosEfectivoUSD += (Number(tx.amountUSD) || 0);
      }
      if (tx.paymentMethod === 'Efectivo COP' || (Number(tx.amountCOP) > 0 && !tx.paymentMethod?.includes('USD') && !tx.paymentMethod?.includes('Bs') && !tx.paymentMethod?.includes('Móvil') && !tx.paymentMethod?.includes('Tarjeta'))) {
        totalEgresosEfectivoCOP += (Number(tx.amountCOP) || 0);
      }
    }

    const cajaChicaEsperadaUSD = aperturaUSD + totalIngresosEfectivoUSD - totalEgresosEfectivoUSD;
    const cajaChicaEsperadaCOP = aperturaCOP + totalIngresosEfectivoCOP - totalEgresosEfectivoCOP;

    addSection(lines, 'SECCION 4: CAJA CHICA', reportWidth);
    lines.push(...wrapText('EFECTIVO USD:', reportWidth));
    lines.push(...wrapText(` 1.Apertura:  $${aperturaUSD.toFixed(2)}`, reportWidth));
    lines.push(...wrapText(` 2.(+)Cobros: +$${totalIngresosEfectivoUSD.toFixed(2)}`, reportWidth));
    lines.push(...wrapText(` 3.(-)Egresos:-$${totalEgresosEfectivoUSD.toFixed(2)}`, reportWidth));
    lines.push(...wrapText(` 4.ESPERADO:  $${cajaChicaEsperadaUSD.toFixed(2)}`, reportWidth));
    lines.push('');
    lines.push(...wrapText('EFECTIVO COP:', reportWidth));
    lines.push(...wrapText(` 1.Apertura:  $${Math.round(aperturaCOP).toLocaleString('en-US')}`, reportWidth));
    lines.push(...wrapText(` 2.(+)Cobros: +$${Math.round(totalIngresosEfectivoCOP).toLocaleString('en-US')}`, reportWidth));
    lines.push(...wrapText(` 3.(-)Egresos:-$${Math.round(totalEgresosEfectivoCOP).toLocaleString('en-US')}`, reportWidth));
    lines.push(...wrapText(` 4.ESPERADO:  $${Math.round(cajaChicaEsperadaCOP).toLocaleString('en-US')}`, reportWidth));

    // SECCIÓN 5 — DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR (SI APLICA)
    if (creditOrders.length > 0) {
      const totalCreditUSD = creditOrders.reduce((sum, o) => sum + (Number(o.totalUSD) || 0), 0);
      addSection(lines, 'SECCION 5: CUENTAS POR COBRAR', reportWidth);
      for (const ord of creditOrders) {
        lines.push('', ...wrapText(`#${ord.orderNumber} | ${ord.customerName || 'Cliente'}`, reportWidth));
        lines.push(...wrapText(`  DEUDA: $${(Number(ord.totalUSD) || 0).toFixed(2)} USD`, reportWidth));
      }
      lines.push(divider('-', reportWidth));
      lines.push(...wrapText(`TOTAL A CREDITO: $${totalCreditUSD.toFixed(2)} USD`, reportWidth));
    }

    // SECCIÓN FINAL — ÍTEMS FACTURADOS (DE ÚLTIMO)
    const itemMap = new Map();
    for (const item of (data.items || [])) {
      const category = item.category || 'General';
      const isPizza = category.toLowerCase().includes('pizza') || (item.productName || '').toLowerCase().includes('pizza') || !!item.size || !!item.isHalfHalf;
      const sizeLabel = item.size ? ` (${item.size})` : '';
      const fullName = `${item.productName || item.name || 'Item'}${sizeLabel}`;
      const key = `${category}|${fullName}`;
      const current = itemMap.get(key) || { category, name: fullName, quantity: 0 };
      current.quantity += Number(item.quantity) || 1;
      itemMap.set(key, current);
    }

    // Agregar Deliverys
    deliveryMap.forEach((count, fee) => {
      if (fee > 0 && count > 0) {
        const key = `Delivery|Delivery de $${fee.toFixed(2)}`;
        itemMap.set(key, { category: 'Delivery', name: `Delivery de $${fee.toFixed(2)}`, quantity: count });
      }
    });

    // Agregar Adicionales
    extrasMap.forEach((info, price) => {
      if (info.count > 0) {
        const key = `Adicionales|Adicional de $${price.toFixed(2)}`;
        itemMap.set(key, { category: 'Adicionales', name: `Adicional de $${price.toFixed(2)}`, quantity: info.count });
      }
    });

    addSection(lines, 'SECCION 6: ITEMS FACTURADOS', reportWidth);
    if (itemMap.size === 0) {
      lines.push('SIN ITEMS FACTURADOS');
    } else {
      let currentCategory = '';
      const sortedItems = [...itemMap.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      for (const it of sortedItems) {
        if (it.category !== currentCategory) {
          currentCategory = it.category;
          lines.push('', ...wrapText(`• ${currentCategory}:`, reportWidth));
        }
        lines.push(...wrapText(`  ${it.quantity}x ${it.name}`, reportWidth, '  '));
      }
    }
  }

  lines.push('', divider('=', reportWidth), centered('FIN DEL REPORTE', reportWidth), centered('CRISPY BURGER', reportWidth), PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');
  return Buffer.from(lines.join('\n'), 'ascii');
}

function kitchenDivider(char = '=') {
  return char.repeat(KITCHEN_LINE_WIDTH);
}

function kitchenCentered(value) {
  const text = printableText(value).slice(0, KITCHEN_LINE_WIDTH);
  const padding = Math.max(0, Math.floor((KITCHEN_LINE_WIDTH - text.length) / 2));
  return `${' '.repeat(padding)}${text}`;
}

function kitchenWrap(value, indent = '') {
  return wrapText(value, KITCHEN_LINE_WIDTH, indent);
}

function buildKitchenTicket(order) {
  const allItems = order.items || [];
  const kitchenItems = allItems.filter(isKitchenItem);

  if (kitchenItems.length === 0) {
    return null;
  }

  const lines = [
    '\x1B@',
    KITCHEN_FORMAT_SETUP,
    '\x1Ba\x01',
    kitchenCentered('CRISPY BURGER'),
    kitchenCentered('COMANDA COCINA'),
    '\x1Ba\x00',
    kitchenDivider('='),
    '\x1Ba\x01',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${new Date(order.createdAt || Date.now()).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (order.type === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (order.type === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...kitchenWrap(`MESERO: ${order.waiterName}`));

  lines.push(kitchenDivider('-'));
  lines.push('\x1Ba\x01', 'DETALLE PREPARACION', '\x1Ba\x00');
  lines.push(kitchenDivider('-'));

  for (const item of kitchenItems) {
    lines.push(...kitchenWrap(`${item.quantity || 1}x ${item.productName || 'Producto'}`));
    for (const detail of itemDetails(item, order)) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
  }

  if (order.kitchenNotes) {
    lines.push(kitchenDivider('-'));
    lines.push('NOTA COCINA:');
    lines.push(...kitchenWrap(order.kitchenNotes));
  }

  lines.push(kitchenDivider('='));
  lines.push(`ITEMS COCINA: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('REVISAR ORDEN');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function buildKitchenAdditionTicket(order, addedItems) {
  const allItems = addedItems || [];
  const kitchenItems = allItems.filter(isKitchenItem);

  if (kitchenItems.length === 0) {
    return null;
  }

  const lines = [
    '\x1B@',
    KITCHEN_FORMAT_SETUP,
    '\x1Ba\x01',
    kitchenCentered('CRISPY BURGER'),
    kitchenCentered('ADICION COCINA'),
    '\x1Ba\x00',
    kitchenDivider('='),
    '\x1Ba\x01',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (order.type === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (order.type === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...kitchenWrap(`MESERO: ${order.waiterName}`));

  lines.push(kitchenDivider('-'));
  lines.push('\x1Ba\x01', 'NUEVOS ITEMS', '\x1Ba\x00');
  lines.push(kitchenDivider('-'));

  for (const item of kitchenItems) {
    lines.push(...kitchenWrap(`${item.quantity || 1}x ${item.productName || 'Producto'}`));
    for (const detail of itemDetails(item, order)) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
  }

  lines.push(kitchenDivider('='));
  lines.push(`ITEMS ADICIONADOS: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('SOLO PREPARAR ADICION');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function sendRawTicket(payload, config) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let settled = false;
    const complete = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(config.timeoutMs || 5000);
    socket.once('connect', () => socket.end(payload, () => complete()));
    socket.once('timeout', () => complete(new Error(`Tiempo de espera agotado al conectar con ${config.host}:${config.port}.`)));
    socket.once('error', complete);
  });
}

async function sendRawTicketToTarget(payload, targetPrinter = 'auto', defaultFallback = 'caja') {
  const configs = loadDualPrinterConfig();
  let targets = [];

  if (targetPrinter === 'cocina') {
    targets.push({ key: 'cocina', config: configs.cocina });
  } else if (targetPrinter === 'caja') {
    targets.push({ key: 'caja', config: configs.caja });
  } else if (targetPrinter === 'ambas') {
    targets.push({ key: 'cocina', config: configs.cocina });
    targets.push({ key: 'caja', config: configs.caja });
  } else {
    // 'auto': defaultFallback determines primary
    if (defaultFallback === 'cocina') {
      targets.push({ key: 'cocina', config: configs.cocina });
    } else {
      targets.push({ key: 'caja', config: configs.caja });
    }
  }

  const results = [];
  for (const { key, config } of targets) {
    if (!config.enabled) {
      results.push({ printer: key, printed: false, reason: 'disabled' });
      continue;
    }
    if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      results.push({ printer: key, printed: false, reason: 'invalid_host_port' });
      continue;
    }
    try {
      for (let copy = 0; copy < config.copies; copy += 1) {
        await sendRawTicket(payload, config);
      }
      results.push({ printer: key, printed: true, copies: config.copies });
    } catch (err) {
      console.warn(`⚠️ [IMPRESORA ${key.toUpperCase()}] Error al enviar ticket: ${err.message}`);
      results.push({ printer: key, printed: false, error: err.message });
    }
  }

  const printedAny = results.some(r => r.printed);
  return {
    printed: printedAny,
    results,
    copies: targets[0]?.config?.copies || 1,
  };
}

function buildTestTicket(printerName, config) {
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('CRISPY BURGER'),
    centered('--- PRUEBA DE CONEXION ---'),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    `IMPRESORA: ${printableText(printerName)}`,
    `DESTINO: ${printableText(config.host)}:${config.port}`,
    `FECHA: ${new Date().toLocaleString('es-VE')}`,
    divider(),
    '\x1Ba\x01',
    'CONEXION EXITOSA',
    'IMPRESORA OPERATIVA Y LISTA',
    '\x1Ba\x00',
    PRINT_FORMAT_RESET,
    '\n\n\n\x1DV\x00',
  ];
  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printTestTicket(targetPrinter = 'caja') {
  const configs = loadDualPrinterConfig();
  const targets = targetPrinter === 'ambas' ? ['cocina', 'caja'] : [targetPrinter];
  const results = [];

  for (const t of targets) {
    const cfg = configs[t] || configs.caja;
    if (!cfg.host || !Number.isInteger(cfg.port)) {
      throw new Error(`La impresora de ${t} no tiene IP o puerto válido configurado.`);
    }
    const payload = buildTestTicket(cfg.name, cfg);
    await sendRawTicket(payload, cfg);
    results.push({ printer: t, printed: true, host: cfg.host, port: cfg.port });
  }

  return { success: true, results };
}

async function printKitchenTicket(order, targetPrinter = 'cocina') {
  const payload = buildKitchenTicket(order);
  if (!payload) {
    return { printed: false, reason: 'no_kitchen_items' };
  }
  return sendRawTicketToTarget(payload, targetPrinter, 'cocina');
}

async function printKitchenAdditionTicket(order, addedItems, targetPrinter = 'cocina') {
  const payload = buildKitchenAdditionTicket(order, addedItems);
  if (!payload) {
    return { printed: false, reason: 'no_kitchen_items' };
  }
  return sendRawTicketToTarget(payload, targetPrinter, 'cocina');
}

function buildReceiptTicket(order, rates = {}) {
  // Priorizar las tasas enviadas explícitamente desde el sistema / UI, luego las guardadas en la comanda, luego las del turno
  const copRate = Number(rates.COP || order.copRateAtPayment || order.copRate || 3300);
  const bsRate = Number(rates.Bs || order.bsRateAtPayment || order.bsRate || 850);
  const totalUSD = Number(order.totalUSD || 0);

  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('CRISPY BURGER'),
    centered('PRE-CUENTA / TICKET DE CONSUMO'),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    '\x1BE\x01',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1BE\x00',
    `FECHA: ${new Date(order.createdAt || Date.now()).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}`,
  ];

  if (order.type === 'mesa' && order.tableNumber) {
    lines.push('\x1BE\x01', `SERVICIO: MESA #${order.tableNumber}`, '\x1BE\x00');
  } else if (order.type === 'delivery') {
    lines.push('\x1BE\x01', 'SERVICIO: DELIVERY', '\x1BE\x00');
  } else if (order.type === 'pickup') {
    lines.push('\x1BE\x01', 'SERVICIO: PICKUP / PARA LLEVAR', '\x1BE\x00');
  }

  if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`));
  if (order.waiterName) lines.push(...wrapText(`MESERO: ${order.waiterName}`));

  lines.push(divider());
  lines.push('\x1BE\x01', centered('--- DETALLE DE CONSUMO ---'), '\x1BE\x00');
  lines.push(divider());

  for (const item of order.items || []) {
    const qty = item.quantity || 1;
    const itemSubtotal = (Number(item.price) || 0) * qty;
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`${qty}x ${item.productName || 'Producto'}`));
    lines.push('\x1BE\x00');
    for (const detail of itemDetails(item, order)) {
      lines.push(...wrapText(detail, LINE_WIDTH, '  '));
    }
    lines.push(`  SUBTOTAL: $${itemSubtotal.toFixed(2)} USD`);
  }

  if (order.type === 'delivery' && Number(order.deliveryFeeUSD) > 0) {
    lines.push('\x1BE\x01');
    lines.push('1x SERVICIO DELIVERY');
    lines.push('\x1BE\x00');
    lines.push(`  $${Number(order.deliveryFeeUSD).toFixed(2)} USD`);
  }

  lines.push(divider('='));
  lines.push('\x1BE\x01');
  lines.push(`TOTAL USD: $${totalUSD.toFixed(2)} USD`);
  lines.push(`TOTAL COP: ${Math.round(totalUSD * copRate).toLocaleString('en-US')} COP`);
  lines.push(`TOTAL Bs:  ${(totalUSD * bsRate).toFixed(2)} Bs`);
  lines.push('\x1BE\x00');
  lines.push(divider('-'));
  lines.push(`TASAS: 1 USD = ${copRate} COP | ${bsRate} Bs`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('¡GRACIAS POR SU PREFERENCIA!');
  lines.push('CRISPY BURGER');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printReceiptTicket(order, rates = {}, targetPrinter = 'caja') {
  const payload = buildReceiptTicket(order, rates);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

function buildCierreShiftTicket(data) {
  const shiftName = data.shift === 'noche' ? 'NOCHE' : data.shift === 'manana' ? 'MAÑANA' : 'GENERAL';
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('CRISPY BURGER'),
    centered(`ARQUEO Y CIERRE DE TURNO (${shiftName})`),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('='),
    `FECHA: ${new Date().toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}`,
    `CERRADO POR: ${printableText(data.closedBy || 'Caja')}`,
    `NOTAS: ${printableText(data.notes || 'Cierre de turno')}`,
    divider(),
    '\x1BE\x01',
    centered('--- APERTURA DE CAJA ---'),
    '\x1BE\x00',
    `Fondo USD: $${Number(data.openedUSD || 0).toFixed(2)} USD`,
    `Fondo COP: ${Math.round(Number(data.openedCOP || 0)).toLocaleString('en-US')} COP`,
    divider(),
    '\x1BE\x01',
    centered('--- TOTALES POR METODO DE PAGO ---'),
    '\x1BE\x00',
  ];

  const methods = data.paymentMethods || [];
  if (methods.length === 0) {
    lines.push('Sin movimientos registrados.');
  } else {
    for (const m of methods) {
      lines.push('\x1BE\x01');
      lines.push(...wrapText(`• ${printableText(m.payment_method)} (${m.count} pagos):`));
      lines.push('\x1BE\x00');
      const isCOP = ['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(m.payment_method);
      const isBs = ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(m.payment_method);
      if (isCOP && Number(m.total_cop) > 0) {
        lines.push(`  ${Math.round(Number(m.total_cop)).toLocaleString('en-US')} COP`);
      } else if (isBs && Number(m.total_bs) > 0) {
        lines.push(`  ${Number(m.total_bs).toFixed(2)} Bs`);
      } else if (Number(m.total_usd) > 0) {
        lines.push(`  $${Number(m.total_usd).toFixed(2)} USD`);
      }
    }
  }

  if (Number(data.creditsUSD) > 0 || Number(data.creditsCount) > 0) {
    lines.push(divider());
    lines.push('\x1BE\x01');
    lines.push(`• CREDITOS / CUENTAS POR COBRAR:`);
    lines.push(`  ${data.creditsCount || 0} comanda(s) a credito`);
    lines.push(`  Total Deuda: $${Number(data.creditsUSD || 0).toFixed(2)} USD`);
    lines.push('\x1BE\x00');
  }

  lines.push(divider('='));
  lines.push('\x1BE\x01', centered('--- ARQUEO DE EFECTIVO EN GAVETA ---'), '\x1BE\x00');
  lines.push(`Esperado USD: $${Number(data.expectedUSD || 0).toFixed(2)} USD`);
  lines.push(`Contado USD:  $${Number(data.actualUSD || 0).toFixed(2)} USD`);
  const diffUSD = Number(data.differenceUSD || 0);
  lines.push(`Diferencia USD: ${diffUSD >= 0 ? '+' : ''}$${diffUSD.toFixed(2)} USD`);
  lines.push(divider());
  lines.push(`Esperado COP: ${Math.round(Number(data.expectedCOP || 0)).toLocaleString('en-US')} COP`);
  lines.push(`Contado COP:  ${Math.round(Number(data.actualCOP || 0)).toLocaleString('en-US')} COP`);
  const diffCOP = Number(data.differenceCOP || 0);
  lines.push(`Diferencia COP: ${diffCOP >= 0 ? '+' : ''}${Math.round(diffCOP).toLocaleString('en-US')} COP`);

  lines.push(divider('='));
  lines.push('\x1BE\x01');
  lines.push(`TOTAL FACTURADO TURNO:`);
  lines.push(`$${Number(data.totalSalesUSD || 0).toFixed(2)} USD`);
  lines.push(`TOTAL COMANDAS PROCESADAS: ${data.totalOrdersCount || 0}`);
  lines.push('\x1BE\x00');
  lines.push(divider('-'));
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('TURNO CERRADO EXITOSAMENTE');
  lines.push('CRISPY BURGER');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

async function printReportTicket(reportType, data, targetPrinter = 'caja') {
  const payload = buildReportTicket(reportType, data);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

async function printCierreShiftTicket(cierreData, targetPrinter = 'caja') {
  const payload = buildCierreShiftTicket(cierreData);
  return sendRawTicketToTarget(payload, targetPrinter, 'caja');
}

module.exports = {
  LINE_WIDTH,
  PRINT_FORMAT_SETUP,
  KITCHEN_LINE_WIDTH,
  KITCHEN_FORMAT_SETUP,
  isKitchenItem,
  buildKitchenTicket,
  buildKitchenAdditionTicket,
  buildReceiptTicket,
  buildReportTicket,
  buildCierreShiftTicket,
  loadDualPrinterConfig,
  saveDualPrinterConfig,
  loadPrinterConfig,
  printKitchenTicket,
  printKitchenAdditionTicket,
  printReceiptTicket,
  printReportTicket,
  printCierreShiftTicket,
  printTestTicket,
};