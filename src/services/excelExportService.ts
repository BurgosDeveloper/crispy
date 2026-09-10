import * as XLSX from 'xlsx';
import { roundCOP } from '../utils/currencyRounding';

export interface ReporteIntervaloData {
  orders: Array<{
    id: string;
    orderNumber: string;
    type: string;
    tableNumber?: number;
    customerName?: string;
    status: string;
    paymentStatus: string;
    paymentMethod?: string;
    totalUSD: number;
    paidAmountUSD: number;
    deliveryFeeUSD?: number;
    copRateAtPayment: number;
    bsRateAtPayment: number;
    createdAt: string;
    isEdited: boolean;
  }>;
  items: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    productName: string;
    price: number;
    quantity: number;
    size?: 'Grande' | 'Pequeña' | string;
    category: string;
    drinkType?: string;
    sugarPreference?: string;
    isHalfHalf?: boolean;
    halfDetails?: any;
    isTakeaway?: boolean;
    notes?: string;
    extras?: Array<{ name: string; price: number }>;
    extrasJson?: Array<{ name: string; price: number }>;
  }>;
  payments: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    payerName: string;
    paymentMethod: string;
    amountPaidUSD: number;
    cashTenderedUSD: number;
    cashTenderedCOP: number;
    cashTenderedBs: number;
    changeGivenUSD: number;
    changeGivenCOP: number;
    changeGivenBs: number;
    copRate: number;
    bsRate: number;
    createdAt: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amountUSD: number;
    amountCOP: number;
    amountBs: number;
    paymentMethod: string;
    description: string;
    orderId?: string;
    orderNumber?: string;
    timestamp: string;
  }>;
  edits: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    editedBy: string;
    editType: string;
    editDetails: string;
    createdAt: string;
  }>;
  exchangeRates: { COP: number; Bs: number };
  dateRange: { from: string; to: string };
  apertura?: { usdCash: number; copCash: number; openedAt?: string };
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function paymentCurrency(method: string): 'USD' | 'COP' | 'Bs' {
  if (['Efectivo COP', 'Bancolombia', 'Nequi', 'Binance COP'].includes(method)) return 'COP';
  if (['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'].includes(method)) return 'Bs';
  return 'USD';
}

export function exportToExcel(data: ReporteIntervaloData): void {
  const wb = XLSX.utils.book_new();

  const copRateGlobal = Number(data.exchangeRates?.COP) || 3950;
  const bsRateGlobal = Number(data.exchangeRates?.Bs) || 36.5;

  // --- Hoja 1: Totales Consolidados con Venta Neta ---
  const billedTotals = { usd: 0, cop: 0, bs: 0 };
  const methodTotals: Record<string, { count: number; usd: number; cop: number; bs: number; currency: string }> = {};

  data.payments.forEach((payment) => {
    const method = payment.paymentMethod || 'Efectivo USD';
    const curr = paymentCurrency(method);
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

    if (!methodTotals[method]) {
      methodTotals[method] = { count: 0, usd: 0, cop: 0, bs: 0, currency: curr };
    }
    const m = methodTotals[method];

    if (curr === 'USD') {
      m.usd += tenderUSD;
      billedTotals.usd += tenderUSD;
    } else if (curr === 'COP') {
      m.cop += tenderCOP;
      billedTotals.cop += tenderCOP;
    } else if (curr === 'Bs') {
      m.bs += tenderBs;
      billedTotals.bs += tenderBs;
    }

    if (paidUSD > 0 || tenderUSD > 0 || tenderCOP > 0 || tenderBs > 0) {
      m.count += 1;
    }

    // Descontar vueltos
    if (changeUSD > 0 || changeCOP > 0 || changeBs > 0) {
      if (paidUSD === 0) {
        if (changeUSD > 0) { m.usd -= changeUSD; billedTotals.usd -= changeUSD; }
        if (changeCOP > 0) { m.cop -= changeCOP; billedTotals.cop -= changeCOP; }
        if (changeBs > 0) { m.bs -= changeBs; billedTotals.bs -= changeBs; }
      } else {
        if (changeUSD > 0) {
          if (!methodTotals['Efectivo USD']) methodTotals['Efectivo USD'] = { count: 0, usd: 0, cop: 0, bs: 0, currency: 'USD' };
          methodTotals['Efectivo USD'].usd -= changeUSD;
          billedTotals.usd -= changeUSD;
        }
        if (changeCOP > 0) {
          if (!methodTotals['Efectivo COP']) methodTotals['Efectivo COP'] = { count: 0, usd: 0, cop: 0, bs: 0, currency: 'COP' };
          methodTotals['Efectivo COP'].cop -= changeCOP;
          billedTotals.cop -= changeCOP;
        }
        if (changeBs > 0) {
          if (!methodTotals['Pago Móvil']) methodTotals['Pago Móvil'] = { count: 0, usd: 0, cop: 0, bs: 0, currency: 'Bs' };
          methodTotals['Pago Móvil'].bs -= changeBs;
          billedTotals.bs -= changeBs;
        }
      }
    }
  });

  const cashOrders = data.orders.filter((o) => o.paymentStatus === 'pagado' && o.paymentMethod !== 'Crédito');
  const creditOrders = data.orders.filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
  const billedOrders = data.orders.filter((o) => o.paymentStatus === 'pagado' || o.paymentStatus === 'credito');
  const billedOrderIds = new Set(billedOrders.map((o) => o.id));
  const cashItems = data.items.filter((it) => billedOrderIds.has(it.orderId));

  // Desglose de Deliverys de Comandas Facturadas
  const deliveryMap: Record<number, number> = {};
  let totalDeliveryServices = 0;
  let totalDeliveryUSD = 0;
  billedOrders.forEach((ord) => {
    const fee = Number(ord.deliveryFeeUSD) || 0;
    if (ord.type === 'delivery' || fee > 0) {
      totalDeliveryServices += 1;
      totalDeliveryUSD += fee;
      deliveryMap[fee] = (deliveryMap[fee] || 0) + 1;
    }
  });

  // Desglose de Extras / Adicionales de Comandas al Contado
  const extrasMap: Record<number, { count: number; totalUSD: number }> = {};
  let totalExtrasCount = 0;
  let totalExtrasUSD = 0;
  cashItems.forEach((it: any) => {
    const itQty = Number(it.quantity) || 1;
    const extrasList: any[] = [];
    if (Array.isArray(it.extras)) extrasList.push(...it.extras);
    else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);

    extrasList.forEach((extra) => {
      const price = Number(extra.price) || 0;
      if (price > 0) {
        const count = itQty;
        const subtotal = price * count;
        totalExtrasCount += count;
        totalExtrasUSD += subtotal;
        if (!extrasMap[price]) extrasMap[price] = { count: 0, totalUSD: 0 };
        extrasMap[price].count += count;
        extrasMap[price].totalUSD += subtotal;
      }
    });
  });

  const totalFacturadoUSD = billedTotals.usd + (billedTotals.cop / copRateGlobal) + (billedTotals.bs / bsRateGlobal);

  const totalesData = [
    ['CIERRE DE CAJA EN EL INTERVALO CONSOLIDADO'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    ['Concepto', 'USD', 'COP', 'Bs'],
    ['Total Facturado (Vendido)', billedTotals.usd.toFixed(2), Math.round(billedTotals.cop).toLocaleString(), billedTotals.bs.toFixed(2)],
    ['Total Venta Facturada (Equiv. USD)', `$${totalFacturadoUSD.toFixed(2)} USD`, '', ''],
    [],
    ['Total Comandas', data.orders.length.toString()],
    ['Comandas de Contado', cashOrders.length.toString()],
    ['Comandas a Crédito', creditOrders.length.toString()],
    [],
    ['Total Servicios Delivery', `${totalDeliveryServices} envíos ($${totalDeliveryUSD.toFixed(2)} USD)`],
    ['Total Adicionales / Extras', `${totalExtrasCount} extras ($${totalExtrasUSD.toFixed(2)} USD)`],
    [],
    ['Comanda Inicial', data.orders.length > 0 ? `#${data.orders[0].orderNumber}` : 'N/A'],
    ['Comanda Final', data.orders.length > 0 ? `#${data.orders[data.orders.length - 1].orderNumber}` : 'N/A'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(totalesData);
  ws1['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Totales');

  // --- Hoja 2: Desglose por Cuenta/Caja ---
  const cuentasHeader = ['Método de Pago', 'Cantidad', 'Total Facturado Moneda Original', 'Moneda'];
  const cuentasRows = Object.entries(methodTotals)
    .filter(([, info]) => info.count > 0 || info.usd !== 0 || info.cop !== 0 || info.bs !== 0)
    .map(([method, info]) => {
      const formatted = info.currency === 'USD'
        ? `$${info.usd.toFixed(2)}`
        : info.currency === 'COP'
        ? `$${Math.round(info.cop).toLocaleString()}`
        : `Bs ${info.bs.toFixed(2)}`;
      return [
        method,
        info.count.toString(),
        formatted,
        info.currency,
      ];
    });

  const cuentasData = [
    ['DESGLOSE POR TIPO DE CUENTA Y CAJA'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    cuentasHeader,
    ...cuentasRows,
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(cuentasData);
  ws2['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 25 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Cuentas');

  // --- Hoja 3: Ítems Vendidos al Contado (Lista Única Unificada) ---
  const paidExtrasMap = new Map<string, { name: string; quantity: number; subtotalUSD: number }>();
  let freeToppingsCount = 0;
  const productMap = new Map<string, { name: string; quantity: number; subtotalUSD: number }>();

  cashItems.forEach((it: any) => {
    const itQty = Number(it.quantity) || 1;
    const rawName = it.productName || it.name || 'Producto';
    const cleanName = rawName
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar|Modificada|Modificado)\)/gi, '')
      .trim();

    const extrasList: any[] = [];
    if (Array.isArray(it.extras)) extrasList.push(...it.extras);
    else if (it.extrasJson && Array.isArray(it.extrasJson)) extrasList.push(...it.extrasJson);
    else if (typeof it.extrasJson === 'string') {
      try {
        const parsed = JSON.parse(it.extrasJson);
        if (Array.isArray(parsed)) extrasList.push(...parsed);
      } catch (e) {}
    }

    let paidExtrasUnitCost = 0;
    extrasList.forEach((extra) => {
      const price = Number(extra.price) || 0;
      const extraName = (extra.name || 'Adicional').trim();
      if (price > 0) {
        paidExtrasUnitCost += price;
        const current = paidExtrasMap.get(extraName) || { name: `ADD ${extraName}`, quantity: 0, subtotalUSD: 0 };
        current.quantity += itQty;
        current.subtotalUSD += price * itQty;
        paidExtrasMap.set(extraName, current);
      } else {
        freeToppingsCount += itQty;
      }
    });

    const rawPrice = Number(it.price) || 0;
    const baseUnitPrice = Math.max(0, rawPrice - paidExtrasUnitCost);
    const baseSubtotal = baseUnitPrice * itQty;

    const prev = productMap.get(cleanName) || { name: cleanName, quantity: 0, subtotalUSD: 0 };
    prev.quantity += itQty;
    prev.subtotalUSD += baseSubtotal;
    productMap.set(cleanName, prev);
  });

  const unifiedItems: Array<{ name: string; quantity: number; subtotalUSD: number }> = [];

  // 1. Deliverys
  const sortedDeliveryFees = Object.keys(deliveryMap).map(Number).sort((a, b) => a - b);
  sortedDeliveryFees.forEach((fee) => {
    const count = deliveryMap[fee] || 0;
    if (fee > 0 && count > 0) {
      unifiedItems.push({
        name: `Delivery ($${fee.toFixed(2)})`,
        quantity: count,
        subtotalUSD: fee * count,
      });
    }
  });

  // 2. Adicionales Pagos (ADD <Nombre>)
  const sortedExtras = Array.from(paidExtrasMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  sortedExtras.forEach((extra) => {
    if (extra.quantity > 0) {
      unifiedItems.push({
        name: extra.name,
        quantity: extra.quantity,
        subtotalUSD: extra.subtotalUSD,
      });
    }
  });

  // 3. Toppings Gratis
  if (freeToppingsCount > 0) {
    unifiedItems.push({
      name: 'Toppings Gratis',
      quantity: freeToppingsCount,
      subtotalUSD: 0,
    });
  }

  // 4. Hamburguesas y Productos de Menú (a precio base)
  const sortedProds = Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  sortedProds.forEach((prod) => {
    if (prod.quantity > 0) {
      unifiedItems.push({
        name: prod.name,
        quantity: prod.quantity,
        subtotalUSD: prod.subtotalUSD,
      });
    }
  });

  const totalItemsUnits = unifiedItems.reduce((sum, it) => sum + it.quantity, 0);
  const totalItemsUSD = unifiedItems.reduce((sum, it) => sum + it.subtotalUSD, 0);

  const itemsHeader = ['Ítem / Concepto', 'Cantidad', 'Total USD'];
  const itemsRows = unifiedItems.map((info) => [
    info.name,
    info.quantity.toString(),
    info.subtotalUSD.toFixed(2),
  ]);

  itemsRows.push(['TOTAL ÍTEMS FACTURADOS', totalItemsUnits.toString(), totalItemsUSD.toFixed(2)]);

  const itemsData = [
    ['ÍTEMS FACTURADOS EN EL INTERVALO (CONTADO)'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    itemsHeader,
    ...itemsRows,
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(itemsData);
  ws3['!cols'] = [{ wch: 38 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Items Vendidos');

  // --- Hoja 4: Historial de Pagos ---
  const historialHeader = ['Fecha', 'Comanda #', 'Método', 'Pagador', 'Aplicado USD', 'Recibido USD', 'Recibido COP', 'Recibido Bs', 'Vuelto USD', 'Vuelto COP', 'Vuelto Bs'];
  const historialRows = data.payments.map((p) => [
    formatDate(p.createdAt),
    `#${p.orderNumber}`,
    p.paymentMethod,
    p.payerName,
    p.amountPaidUSD.toFixed(2),
    (p.cashTenderedUSD || 0).toFixed(2),
    Math.round(p.cashTenderedCOP || 0).toLocaleString(),
    (p.cashTenderedBs || 0).toFixed(2),
    (p.changeGivenUSD || 0).toFixed(2),
    Math.round(p.changeGivenCOP || 0).toLocaleString(),
    (p.changeGivenBs || 0).toFixed(2),
  ]);

  const historialData = [
    ['HISTORIAL DE PAGOS POR COMANDA Y MÉTODO'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    historialHeader,
    ...historialRows,
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(historialData);
  ws4['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Historial Pagos');

  // --- Hoja 5: Cuentas a Crédito / Deudas ---
  const creditOrdersList = data.orders.filter((o) => o.paymentStatus === 'credito' || o.paymentMethod === 'Crédito');
  const creditRows = creditOrdersList.map((ord) => {
    const orderItems = data.items
      .filter((it) => it.orderId === ord.id)
      .map((it) => `${it.quantity}x ${it.productName}`)
      .join(', ');
    return [
      formatDate(ord.createdAt),
      `#${ord.orderNumber}`,
      ord.customerName || 'Cliente Deudor',
      orderItems || 'Consumo general',
      ord.totalUSD.toFixed(2),
      roundCOP(ord.totalUSD * (ord.copRateAtPayment || data.exchangeRates.COP)).toLocaleString(),
      (ord.totalUSD * (ord.bsRateAtPayment || data.exchangeRates.Bs)).toFixed(2),
    ];
  });

  const creditData = [
    ['DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR'],
    ['Desde:', formatDate(data.dateRange.from), 'Hasta:', formatDate(data.dateRange.to)],
    [],
    ['Fecha / Hora', 'Comanda #', 'Cliente / Deudor', 'Ítems Solicitados', 'Deuda USD', 'Equivalente COP', 'Equivalente Bs'],
    ...creditRows,
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(creditData);
  ws5['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 25 }, { wch: 40 }, { wch: 15 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Créditos');

  // Generar y descargar
  const fromFormatted = new Date(data.dateRange.from).toISOString().slice(0, 10);
  const toFormatted = new Date(data.dateRange.to).toISOString().slice(0, 10);
  const fileName = `Basilico_Reporte_${fromFormatted}_a_${toFormatted}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
