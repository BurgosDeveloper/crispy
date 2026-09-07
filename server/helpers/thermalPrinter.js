const fs = require('fs');
const net = require('net');
const path = require('path');

const PRINTER_CONFIG_PATH = path.join(__dirname, '../config/thermal-printer.json');
const { roundCOP } = require('./currencyRounding');
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
    connectionType: 'lan',
    paperWidth: '80mm',
    host: fileConfig.host || '192.168.1.200',
    port: Number(fileConfig.port || 9100),
    usbDeviceName: '',
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  const cajaRaw = fileConfig.caja || {
    name: 'Impresora Caja / Mostrador',
    enabled: fileConfig.enabled !== undefined ? fileConfig.enabled : true,
    connectionType: 'usb',
    paperWidth: '58mm',
    host: fileConfig.host || '192.168.1.201',
    port: Number(fileConfig.port || 9100),
    usbDeviceName: 'POS-58',
    timeoutMs: Number(fileConfig.timeoutMs || 5000),
    copies: Math.max(1, Number(fileConfig.copies || 1)),
  };

  return {
    cocina: {
      name: cocinaRaw.name || 'Impresora Cocina / KDS',
      enabled: cocinaRaw.enabled === true,
      connectionType: cocinaRaw.connectionType === 'usb' ? 'usb' : 'lan',
      paperWidth: cocinaRaw.paperWidth === '58mm' ? '58mm' : '80mm',
      host: String(cocinaRaw.host || '').trim(),
      port: Number(cocinaRaw.port || 9100),
      usbDeviceName: String(cocinaRaw.usbDeviceName || '').trim(),
      timeoutMs: Number(cocinaRaw.timeoutMs || 5000),
      copies: Math.max(1, Number(cocinaRaw.copies || 1)),
    },
    caja: {
      name: cajaRaw.name || 'Impresora Caja / Mostrador',
      enabled: cajaRaw.enabled === true,
      connectionType: cajaRaw.connectionType === 'lan' ? 'lan' : 'usb',
      paperWidth: cajaRaw.paperWidth === '80mm' ? '80mm' : '58mm',
      host: String(cajaRaw.host || '').trim(),
      port: Number(cajaRaw.port || 9100),
      usbDeviceName: String(cajaRaw.usbDeviceName !== undefined ? cajaRaw.usbDeviceName : 'POS-58').trim(),
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
      connectionType: newConfig.cocina?.connectionType === 'usb' ? 'usb' : 'lan',
      paperWidth: newConfig.cocina?.paperWidth === '58mm' ? '58mm' : '80mm',
      port: Number(newConfig.cocina?.port || current.cocina.port || 9100),
      usbDeviceName: String(newConfig.cocina?.usbDeviceName !== undefined ? newConfig.cocina.usbDeviceName : current.cocina.usbDeviceName || '').trim(),
      copies: Math.max(1, Number(newConfig.cocina?.copies || current.cocina.copies || 1)),
    },
    caja: {
      ...current.caja,
      ...(newConfig.caja || {}),
      connectionType: newConfig.caja?.connectionType === 'lan' ? 'lan' : 'usb',
      paperWidth: newConfig.caja?.paperWidth === '80mm' ? '80mm' : '58mm',
      port: Number(newConfig.caja?.port || current.caja.port || 9100),
      usbDeviceName: String(newConfig.caja?.usbDeviceName !== undefined ? newConfig.caja.usbDeviceName : current.caja.usbDeviceName || 'POS-58').trim(),
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

function getDefaultProteins(burgerName = '') {
  const nameLower = (burgerName || '').toLowerCase();
  if (nameLower.includes('papas') || nameLower.includes('nugget')) return [];
  if (nameLower.includes('3.0') || nameLower.includes('triple')) return ['Carne de Novillo', 'Pollo Crispy', 'Chuleta Ahumada'];
  if (nameLower.includes('mixtura')) return ['Carne de Novillo', 'Pollo Crispy'];
  if (nameLower.includes('house')) return ['Pollo Crispy', 'Chuleta Ahumada'];
  if (nameLower.includes('super smash') || nameLower.includes('tasty')) return ['Smash de Carne', 'Smash de Carne'];
  if (nameLower.includes('doble')) return ['Carne de Novillo', 'Carne de Novillo'];
  if (nameLower.includes('mr pork') || nameLower.includes('pork')) return ['Chuleta Ahumada'];
  if (nameLower.includes('street')) return ['Carne Mechada'];
  if (nameLower.includes('chicken grill') || nameLower.includes('grill')) return ['Pechuga a la Plancha'];
  if (nameLower.includes('crispy')) return ['Pollo Crispy'];
  return ['Carne de Novillo'];
}

function areProteinsDefault(burgerName, proteins) {
  if (!proteins || !Array.isArray(proteins) || proteins.length === 0) return true;
  const defaultList = getDefaultProteins(burgerName);
  if (proteins.length !== defaultList.length) return false;
  const pSorted = [...proteins].map((p) => String(p).trim().toLowerCase()).sort();
  const dSorted = [...defaultList].map((d) => String(d).trim().toLowerCase()).sort();
  return pSorted.every((p, idx) => p === dSorted[idx]);
}

function abbreviateFreeTopping(name = '') {
  const n = String(name).trim().toLowerCase();
  if (n.includes('jalape')) return 'JAL';
  if (n.includes('cebolla')) return 'CEB';
  if (n.includes('relish')) return 'REL';
  if (n.includes('pepinillo')) return 'PEP';
  if (n.includes('maiz') || n.includes('maíz')) return 'MAIZ';
  return null;
}

function formatKitchenTime(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = hours < 10 ? `0${hours}` : `${hours}`;
  const strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${strHours}:${strMinutes} ${ampm}`;
}

function itemDetails(item, order = {}) {
  const details = [];
  const orderType = (order.type || '').toLowerCase();

  // 1. Para llevar en ítems: Solo si es mesa y este ítem se pidió específicamente para llevar
  if (orderType === 'mesa' && (item.isTakeaway || item.is_takeaway)) {
    details.push('*** PARA LLEVAR ***');
  }

  // 2. Picada: Solo si está marcada como picada (sin ENTERA)
  const isCut = !!(item.isCut || item.is_cut || item.cutPreference === 'Picada' || item.cut_preference === 'Picada');
  if (isCut) {
    details.push('🔪 PICADA (CORTADA EN DOS)');
  }

  // 3. Proteínas: Solo si cambiaron respecto a la receta original
  const prodName = item.productName || item.name || '';
  if (item.proteins && Array.isArray(item.proteins) && item.proteins.length > 0) {
    if (!areProteinsDefault(prodName, item.proteins)) {
      details.push(`PROTEINAS: ${item.proteins.join(' + ')}`);
    }
  }

  // 4. Ingredientes removidos (SIN)
  const removed = item.removedIngredients || item.removed_ingredients;
  if (Array.isArray(removed) && removed.length > 0) {
    details.push(`SIN: ${removed.join(', ')}`);
  }

  // 5. Toppings gratis abreviados y adicionales pagos completos
  const freeToppings = [];
  const paidExtras = [];

  let rawExtras = [];
  if (Array.isArray(item.extras)) rawExtras = item.extras;
  else if (item.extrasJson && Array.isArray(item.extrasJson)) rawExtras = item.extrasJson;
  else if (item.extras_json) {
    try {
      rawExtras = typeof item.extras_json === 'string' ? JSON.parse(item.extras_json) : item.extras_json;
    } catch (e) {}
  }

  for (const ext of rawExtras) {
    const extName = typeof ext === 'string' ? ext : (ext.name || '');
    const extPrice = typeof ext === 'object' ? Number(ext.price) || 0 : 0;
    const abbrev = abbreviateFreeTopping(extName);
    if (abbrev && extPrice === 0) {
      if (!freeToppings.includes(abbrev)) freeToppings.push(abbrev);
    } else if (extName) {
      paidExtras.push(extName);
    }
  }

  if (freeToppings.length > 0) {
    details.push(freeToppings.join(', '));
  }
  for (const paid of paidExtras) {
    details.push(`EXTRA: ${paid}`);
  }

  // 6. Bebidas / Azúcar
  if (item.sugarPreference) {
    details.push(`Azucar: ${item.sugarPreference}`);
  }

  // 7. Notas del ítem
  if (item.notes && item.notes.trim()) {
    details.push(`NOTA: ${item.notes.trim()}`);
  }

  return details;
}

function reportPaymentCurrency(method) {
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(method)) return 'COP';
  if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(method)) return 'Bs';
  return 'USD';
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
    hamburguesas: 'HAMBURGUESAS VENDIDAS',
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

  if (reportType === 'pizzas' || reportType === 'hamburguesas') {
    const grouped = new Map();
    for (const item of data.items || []) {
      const catLower = (item.category || '').toLowerCase();
      const isBurger = catLower.includes('burger') || catLower.includes('hamburguesa') || (item.productName || '').toLowerCase().includes('burger') || (item.productName || '').toLowerCase().includes('crispy');
      const fullName = (item.productName || item.name || 'Item')
        .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar)\)/gi, '')
        .trim();
      const category = isBurger ? 'Hamburguesas' : (item.category || 'Sin categoria');
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
      lines.push('SIN HAMBURGUESAS, BEBIDAS O ADICIONALES');
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
    const copRateGlobal = Number(data.exchangeRates?.COP) || 3950;
    const bsRateGlobal = Number(data.exchangeRates?.Bs) || 36.5;

    const billedTotals = { usd: 0, cop: 0, bs: 0 };
    const byMethod = new Map();

    for (const payment of data.payments || []) {
      if (payment.paymentMethod === 'Crédito') continue;
      const method = payment.paymentMethod || 'Efectivo USD';
      const curr = reportPaymentCurrency(method);
      const cRate = Number(payment.copRate) || copRateGlobal;
      const bRate = Number(payment.bsRate) || bsRateGlobal;

      const paidUSD = Number(payment.amountPaidUSD) || 0;
      let tenderUSD = Number(payment.cashTenderedUSD) || 0;
      let tenderCOP = Number(payment.cashTenderedCOP) || 0;
      let tenderBs = Number(payment.cashTenderedBs) || 0;

      if (tenderUSD === 0 && tenderCOP === 0 && tenderBs === 0 && paidUSD > 0) {
        if (curr === 'USD') tenderUSD = paidUSD;
        else if (curr === 'COP') tenderCOP = paidUSD * cRate;
        else if (curr === 'Bs') tenderBs = paidUSD * bRate;
      }

      const changeUSD = Number(payment.changeGivenUSD) || 0;
      const changeCOP = Number(payment.changeGivenCOP) || 0;
      const changeBs = Number(payment.changeGivenBs) || 0;

      const methodTotals = byMethod.get(method) || { currency: curr, incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };

      // 1. Sumar ingresos al método que recibió el dinero
      if (curr === 'USD') {
        methodTotals.incomeNative += tenderUSD;
        billedTotals.usd += tenderUSD;
      } else if (curr === 'COP') {
        methodTotals.incomeNative += tenderCOP;
        billedTotals.cop += tenderCOP;
      } else if (curr === 'Bs') {
        methodTotals.incomeNative += tenderBs;
        billedTotals.bs += tenderBs;
      }

      if (paidUSD > 0 || tenderUSD > 0 || tenderCOP > 0 || tenderBs > 0) {
        methodTotals.count += 1;
      }
      byMethod.set(method, methodTotals);

      // 2. Descontar vueltos estrictamente en su moneda nativa y método
      if (changeUSD > 0 || changeCOP > 0 || changeBs > 0) {
        if (paidUSD === 0) {
          if (changeUSD > 0) {
            methodTotals.changeNative += changeUSD;
            billedTotals.usd -= changeUSD;
          }
          if (changeCOP > 0) {
            methodTotals.changeNative += changeCOP;
            billedTotals.cop -= changeCOP;
          }
          if (changeBs > 0) {
            methodTotals.changeNative += changeBs;
            billedTotals.bs -= changeBs;
          }
          byMethod.set(method, methodTotals);
        } else {
          if (changeUSD > 0) {
            const m = byMethod.get('Efectivo USD') || { currency: 'USD', incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };
            m.changeNative += changeUSD;
            byMethod.set('Efectivo USD', m);
            billedTotals.usd -= changeUSD;
          }
          if (changeCOP > 0) {
            const m = byMethod.get('Efectivo COP') || { currency: 'COP', incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };
            m.changeNative += changeCOP;
            byMethod.set('Efectivo COP', m);
            billedTotals.cop -= changeCOP;
          }
          if (changeBs > 0) {
            const m = byMethod.get('Pago Móvil') || { currency: 'Bs', incomeNative: 0, changeNative: 0, netNative: 0, netUSD: 0, count: 0 };
            m.changeNative += changeBs;
            byMethod.set('Pago Móvil', m);
            billedTotals.bs -= changeBs;
          }
        }
      }
    }

    for (const [, m] of byMethod) {
      m.netNative = m.incomeNative - m.changeNative;
      if (m.currency === 'USD') m.netUSD = m.netNative;
      else if (m.currency === 'COP') m.netUSD = m.netNative / copRateGlobal;
      else if (m.currency === 'Bs') m.netUSD = m.netNative / bsRateGlobal;
    }

    const expenses = (data.transactions || []).filter((item) => item.type === 'egreso');

    const creditOrders = (data.orders || []).filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
    const cashOrders = (data.orders || []).filter((o) => o.paymentStatus === 'pagado' && o.paymentMethod !== 'Crédito');
    const cashOrderIds = new Set(cashOrders.map((o) => o.id));
    const cashItems = (data.items || []).filter((item) => cashOrderIds.has(item.orderId));

    const firstOrder = data.orders?.[0]?.orderNumber || 'N/A';
    const lastOrder = data.orders?.[data.orders.length - 1]?.orderNumber || 'N/A';

    lines.push(...wrapText(`COMANDA INICIAL: #${firstOrder}`, reportWidth));
    lines.push(...wrapText(`COMANDA FINAL:   #${lastOrder}`, reportWidth));

    // Desglose de Deliverys de Comandas al Contado
    const deliveryMap = new Map();
    for (const ord of cashOrders) {
      const fee = Number(ord.deliveryFeeUSD) || 0;
      if (ord.type === 'delivery' || fee > 0) {
        deliveryMap.set(fee, (deliveryMap.get(fee) || 0) + 1);
      }
    }

    // Desglose de Extras / Adicionales de Comandas al Contado
    const extrasMap = new Map();
    for (const it of cashItems) {
      const itQty = Number(it.quantity) || 1;
      const extrasList = [];
      if (Array.isArray(it.extras)) {
        extrasList.push(...it.extras);
      } else if (it.extrasJson && Array.isArray(it.extrasJson)) {
        extrasList.push(...it.extrasJson);
      }
      for (const extra of extrasList) {
        const price = Number(extra.price) || 0;
        if (price > 0) {
          const count = itQty;
          const subtotal = price * count;
          const prev = extrasMap.get(price) || { count: 0, totalUSD: 0 };
          prev.count += count;
          prev.totalUSD += subtotal;
          extrasMap.set(price, prev);
        }
      }
    }

    const totalFacturadoUSD = billedTotals.usd + (billedTotals.cop / copRateGlobal) + (billedTotals.bs / bsRateGlobal);

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
      for (const [method, totals] of byMethod) {
        if (totals.count === 0 && totals.netNative === 0) continue;
        const formatted = totals.currency === 'USD'
          ? `$${totals.netNative.toFixed(2)} USD`
          : totals.currency === 'COP'
          ? `$${Math.round(totals.netNative).toLocaleString('en-US')} COP`
          : `Bs ${totals.netNative.toFixed(2)}`;
        lines.push('', ...wrapText(`• ${method} (${totals.count}):`, reportWidth));
        lines.push(...wrapText(`    ${formatted}`, reportWidth));
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

    // SECCIÓN 6 — ÍTEMS FACTURADOS AL CONTADO (Lista Única Unificada)
    const paidExtrasMap = new Map();
    let freeToppingsCount = 0;
    const productMap = new Map();

    for (const it of cashItems) {
      const itQty = Number(it.quantity) || 1;
      const rawName = it.productName || it.name || 'Item';
      const cleanName = rawName
        .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '')
        .trim();

      const extrasList = [];
      if (Array.isArray(it.extras)) extrasList.push(...it.extras);
      else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);
      else if (typeof it.extrasJson === 'string') {
        try {
          const parsed = JSON.parse(it.extrasJson);
          if (Array.isArray(parsed)) extrasList.push(...parsed);
        } catch (e) {}
      }

      let paidExtrasUnitCost = 0;
      for (const extra of extrasList) {
        const extraPrice = Number(extra.price) || 0;
        const extraName = (extra.name || 'Adicional').trim();
        if (extraPrice > 0) {
          paidExtrasUnitCost += extraPrice;
          const current = paidExtrasMap.get(extraName) || { name: `ADD ${extraName}`, quantity: 0, subtotalUSD: 0 };
          current.quantity += itQty;
          current.subtotalUSD += extraPrice * itQty;
          paidExtrasMap.set(extraName, current);
        } else {
          freeToppingsCount += itQty;
        }
      }

      const rawPrice = Number(it.price) || 0;
      const baseUnitPrice = Math.max(0, rawPrice - paidExtrasUnitCost);
      const baseSubtotal = baseUnitPrice * itQty;

      const prevProd = productMap.get(cleanName) || { name: cleanName, quantity: 0, subtotalUSD: 0 };
      prevProd.quantity += itQty;
      prevProd.subtotalUSD += baseSubtotal;
      productMap.set(cleanName, prevProd);
    }

    const unifiedItems = [];

    // 1. Deliverys por tarifa
    const sortedFees = Array.from(deliveryMap.keys()).sort((a, b) => a - b);
    for (const fee of sortedFees) {
      const count = deliveryMap.get(fee) || 0;
      if (fee > 0 && count > 0) {
        unifiedItems.push({
          name: `Delivery ($${fee.toFixed(2)})`,
          quantity: count,
          subtotalUSD: fee * count,
        });
      }
    }

    // 2. Adicionales Pagos (ADD <Nombre>)
    const sortedExtras = Array.from(paidExtrasMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const extra of sortedExtras) {
      if (extra.quantity > 0) {
        unifiedItems.push({
          name: extra.name,
          quantity: extra.quantity,
          subtotalUSD: extra.subtotalUSD,
        });
      }
    }

    // 3. Toppings Gratis (conteo acumulado sin costo)
    if (freeToppingsCount > 0) {
      unifiedItems.push({
        name: 'Toppings Gratis',
        quantity: freeToppingsCount,
        subtotalUSD: 0,
      });
    }

    // 4. Hamburguesas y Productos de Menú (a precio base)
    const sortedProds = Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const prod of sortedProds) {
      if (prod.quantity > 0) {
        unifiedItems.push({
          name: prod.name,
          quantity: prod.quantity,
          subtotalUSD: prod.subtotalUSD,
        });
      }
    }

    addSection(lines, 'SECCION 6: ITEMS FACTURADOS', reportWidth);
    if (unifiedItems.length === 0) {
      lines.push('SIN ITEMS FACTURADOS');
    } else {
      const totalItemsUSD = unifiedItems.reduce((sum, it) => sum + it.subtotalUSD, 0);

      for (const it of unifiedItems) {
        lines.push(...wrapText(`${it.quantity} | ${it.name} | $${it.subtotalUSD.toFixed(2)}`, reportWidth));
      }

      lines.push(divider('-', reportWidth));
      lines.push('\x1BE\x01');
      lines.push(...wrapText('TOTAL EN $ PRODUCTOS:', reportWidth));
      lines.push(...wrapText(`$${totalItemsUSD.toFixed(2)} USD`, reportWidth));
      lines.push('\x1BE\x00');
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
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${formatKitchenTime(order.createdAt)}`,
  ];

  const orderType = (order.type || '').toLowerCase();
  if (orderType === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (orderType === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (orderType === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) {
    lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  }

  if (orderType === 'delivery' || orderType === 'pickup') {
    lines.push('PEDIDO PARA LLEVAR COMPLETO');
  }

  lines.push(kitchenDivider('-'));

  for (const item of kitchenItems) {
    const cleanName = (item.productName || item.name || 'Producto')
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar)\)/gi, '')
      .trim();
    lines.push(...kitchenWrap(`${item.quantity || 1}x ${cleanName}`));
    for (const detail of itemDetails(item, order)) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
    lines.push(kitchenDivider('-'));
  }

  if (order.kitchenNotes && order.kitchenNotes.trim()) {
    lines.push('NOTA COCINA:');
    lines.push(...kitchenWrap(order.kitchenNotes.trim()));
    lines.push(kitchenDivider('-'));
  }

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
    'ADICION COCINA',
    `COMANDA: #${printableText(order.orderNumber)}`,
    '\x1Ba\x00',
    `HORA: ${formatKitchenTime(new Date())}`,
  ];

  const orderType = (order.type || '').toLowerCase();
  if (orderType === 'mesa' && order.tableNumber) {
    lines.push(`SERVICIO: MESA #${order.tableNumber}`);
  } else if (orderType === 'delivery') {
    lines.push('SERVICIO: DELIVERY');
  } else if (orderType === 'pickup') {
    lines.push('SERVICIO: PICKUP');
  }

  if (order.customerName) {
    lines.push(...kitchenWrap(`CLIENTE: ${order.customerName}`));
  }

  if (orderType === 'delivery' || orderType === 'pickup') {
    lines.push('PEDIDO PARA LLEVAR COMPLETO');
  }

  lines.push(kitchenDivider('-'));

  for (const item of kitchenItems) {
    const cleanName = (item.productName || item.name || 'Producto')
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar)\)/gi, '')
      .trim();
    lines.push(...kitchenWrap(`${item.quantity || 1}x ${cleanName}`));
    for (const detail of itemDetails(item, order)) {
      lines.push(...kitchenWrap(`* ${detail}`));
    }
    lines.push(kitchenDivider('-'));
  }

  lines.push(`ITEMS ADICIONADOS: ${kitchenItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)}`);
  lines.push('');
  lines.push('\x1Ba\x01');
  lines.push('SOLO PREPARAR ADICION');
  lines.push('\x1Ba\x00');
  lines.push(PRINT_FORMAT_RESET, '\n\n\n\x1DV\x00');

  return Buffer.from(lines.join('\n'), 'ascii');
}

function sendRawTicket(payload, config) {
  if (config.connectionType === 'usb') {
    return new Promise((resolve, reject) => {
      const printerName = String(config.usbDeviceName || 'POS-58').trim();
      if (!printerName) {
        return reject(new Error('Nombre de impresora o dispositivo USB no configurado.'));
      }

      // 1. Puerto serial o paralelo directo (COMx o LPTx)
      if (/^(COM\d+|LPT\d+)$/i.test(printerName)) {
        try {
          fs.writeFileSync(`\\\\.\\${printerName}`, payload);
          return resolve();
        } catch (err) {
          return reject(err);
        }
      }

      // 2. Impresora USB en Windows (Spooler o recurso compartido)
      const os = require('os');
      const tempPath = path.join(os.tmpdir(), `ticket_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
      try {
        fs.writeFileSync(tempPath, payload);
      } catch (err) {
        return reject(err);
      }

      const escapedTempPath = tempPath.replace(/'/g, "''");
      const escapedPrinter = printerName.replace(/'/g, "''");

      // Script PowerShell para enviar bytes RAW directamente a la cola de impresión de Windows
      const psScript = `
        $printer = '${escapedPrinter}';
        $file = '${escapedTempPath}';
        try {
          # Intento 1: Copiar a puerto de red local/compartido
          Copy-Item -Path $file -Destination "\\\\localhost\\$printer" -Force -ErrorAction Stop
          exit 0
        } catch {
          try {
            # Intento 2: Usar comando copy de cmd
            cmd.exe /c "copy /b \`"$file\`" \`"\\\\localhost\\$printer\`"" | Out-Null
            exit 0
          } catch {
            exit 1
          }
        }
      `;

      require('child_process').exec(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, ' ')}"`,
        { timeout: config.timeoutMs || 5000 },
        (err) => {
          try { fs.unlinkSync(tempPath); } catch (_) {}
          if (err) {
            // Fallback a socket LAN si host y puerto están configurados
            if (config.host && Number.isInteger(config.port) && config.port > 0) {
              const socket = net.createConnection({ host: config.host, port: config.port });
              socket.setTimeout(config.timeoutMs || 5000);
              socket.once('connect', () => socket.end(payload, () => resolve()));
              socket.once('timeout', () => reject(new Error(`Fallo spooler USB (${printerName}) y tiempo de espera agotado en LAN (${config.host}:${config.port}).`)));
              socket.once('error', (netErr) => reject(new Error(`Fallo spooler USB (${printerName}) y fallback LAN falló: ${netErr.message}`)));
              return;
            }
            return reject(new Error(`No se pudo imprimir en USB "${printerName}". Verifique que la impresora esté conectada o compartida en Windows.`));
          }
          resolve();
        }
      );
    });
  }

  // Conexión TCP / Red estándar para LAN
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
  } else if (targetPrinter === 'ninguna') {
    return { printed: false, reason: 'skipped_by_user', results: [] };
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
    if (config.connectionType === 'lan') {
      if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        results.push({ printer: key, printed: false, reason: 'invalid_host_port' });
        continue;
      }
    } else if (config.connectionType === 'usb') {
      if (!config.usbDeviceName) {
        results.push({ printer: key, printed: false, reason: 'invalid_usb_device_name' });
        continue;
      }
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
  const is58mm = config.paperWidth === '58mm';
  const width = is58mm ? 20 : 28;
  const lines = [
    '\x1B@',
    PRINT_FORMAT_SETUP,
    '\x1Ba\x01',
    '\x1BE\x01',
    centered('CRISPY BURGER', width),
    centered('--- PRUEBA DE CONEXION ---', width),
    '\x1BE\x00',
    '\x1Ba\x00',
    divider('=', width),
    `IMPRESORA: ${printableText(printerName)}`,
    config.connectionType === 'usb'
      ? `CONEXION: USB (${printableText(config.usbDeviceName || 'Directo')})`
      : `DESTINO: ${printableText(config.host)}:${config.port}`,
    `FORMATO: PAPEL ${config.paperWidth || '80mm'}`,
    `FECHA: ${new Date().toLocaleString('es-VE')}`,
    divider('-', width),
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
    if (cfg.connectionType === 'lan' && (!cfg.host || !Number.isInteger(cfg.port))) {
      throw new Error(`La impresora de ${t} no tiene IP o puerto válido configurado.`);
    }
    if (cfg.connectionType === 'usb' && !cfg.usbDeviceName) {
      throw new Error(`La impresora de ${t} no tiene nombre de dispositivo USB configurado.`);
    }
    const payload = buildTestTicket(cfg.name, cfg);
    await sendRawTicket(payload, cfg);
    results.push({ printer: t, printed: true, host: cfg.host, port: cfg.port, connectionType: cfg.connectionType, paperWidth: cfg.paperWidth });
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
    centered('PRE-CUENTA / CONSUMO'),
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
    lines.push('\x1BE\x01', 'SERVICIO: PICKUP / LLEVAR', '\x1BE\x00');
  }

  if (order.customerName) lines.push(...wrapText(`CLIENTE: ${order.customerName}`));

  // Consolidar productos a precio base de menú y separar adicionales pagos
  const productsMap = new Map();
  const paidExtrasMap = new Map();

  for (const it of order.items || []) {
    const itQty = it.quantity || 1;
    const cleanName = (it.productName || 'Producto')
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '')
      .trim();

    const extrasList = [];
    if (Array.isArray(it.extras)) extrasList.push(...it.extras);
    else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);
    else if (typeof it.extrasJson === 'string') {
      try {
        const parsed = JSON.parse(it.extrasJson);
        if (Array.isArray(parsed)) extrasList.push(...parsed);
      } catch (e) {}
    }

    let paidExtrasUnitCost = 0;
    for (const extra of extrasList) {
      const extraPrice = Number(extra.price) || 0;
      const extraName = (extra.name || 'Adicional').trim();
      if (extraPrice > 0) {
        paidExtrasUnitCost += extraPrice;
        const current = paidExtrasMap.get(extraName) || { name: extraName, quantity: 0, totalUSD: 0 };
        current.quantity += itQty;
        current.totalUSD += extraPrice * itQty;
        paidExtrasMap.set(extraName, current);
      }
    }

    const rawPrice = Number(it.price) || 0;
    const baseUnitPrice = Math.max(0, rawPrice - paidExtrasUnitCost);
    const baseSubtotal = baseUnitPrice * itQty;

    const prev = productsMap.get(cleanName) || { name: cleanName, quantity: 0, subtotalUSD: 0 };
    prev.quantity += itQty;
    prev.subtotalUSD += baseSubtotal;
    productsMap.set(cleanName, prev);
  }

  const productsList = Array.from(productsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const paidExtrasList = Array.from(paidExtrasMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  lines.push(divider());
  lines.push('\x1BE\x01', centered('--- CONSUMO ---'), '\x1BE\x00');
  lines.push(divider());

  for (const p of productsList) {
    lines.push('\x1BE\x01');
    lines.push(...wrapText(`${p.quantity}x ${p.name}`));
    lines.push('\x1BE\x00');
    lines.push(`  $${p.subtotalUSD.toFixed(2)} USD`);
  }

  if (order.type === 'delivery' && Number(order.deliveryFeeUSD) > 0) {
    lines.push('\x1BE\x01');
    lines.push('1x SERVICIO DELIVERY');
    lines.push('\x1BE\x00');
    lines.push(`  $${Number(order.deliveryFeeUSD).toFixed(2)} USD`);
  }

  if (paidExtrasList.length > 0) {
    lines.push(divider('-'));
    lines.push('\x1BE\x01', centered('--- ADICIONALES ---'), '\x1BE\x00');
    lines.push(divider('-'));
    for (const extra of paidExtrasList) {
      lines.push('\x1BE\x01');
      lines.push(...wrapText(`${extra.quantity}x ADD ${extra.name}`));
      lines.push('\x1BE\x00');
      lines.push(`  $${extra.totalUSD.toFixed(2)} USD`);
    }
  }

  lines.push(divider('='));
  lines.push('\x1BE\x01');
  lines.push(`TOTAL USD: $${totalUSD.toFixed(2)} USD`);
  lines.push(`TOTAL COP: ${roundCOP(totalUSD * copRate).toLocaleString('en-US')} COP`);
  lines.push(`TOTAL Bs:  ${(totalUSD * bsRate).toFixed(2)} Bs`);
  lines.push('\x1BE\x00');
  lines.push(divider('='));
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