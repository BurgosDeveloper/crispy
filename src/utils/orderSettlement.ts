import { Order } from '../data/mockData';

export function roundCOP(value: number): number {
  if (!value || value <= 0) return 0;
  return Math.round(value / 100) * 100;
}

/**
 * Calcula el vuelto pendiente por entregar (en USD) de una comanda,
 * considerando el historial de pagos y el campo pendingChangeUSD del backend.
 */
export function getOrderPendingChangeUSD(
  ord: Order,
  fallbackRates?: { COP?: number; Bs?: number }
): number {
  if (ord.status === 'entregada' && ord.paymentStatus === 'pagado') {
    return 0;
  }
  const history = ord.paymentHistory || [];
  const rateCOPOrd = ord.copRateAtPayment || fallbackRates?.COP || 3950;
  const hasCop = history.some((p) => (p.cashTenderedCOP || 0) > 0 || (p.changeGivenCOP || 0) > 0);
  const maxTol = Math.max(0.05, hasCop && rateCOPOrd > 0 ? 1000 / rateCOPOrd : 0.05);

  if (history.length === 0) {
    return typeof ord.pendingChangeUSD === 'number' && ord.pendingChangeUSD > maxTol
      ? ord.pendingChangeUSD
      : 0;
  }

  let tenderedUSD = 0;
  let changeGivenUSD = 0;
  for (const item of history) {
    const rateCOP = item.copRate || ord.copRateAtPayment || fallbackRates?.COP || 3950;
    const rateBs = item.bsRate || ord.bsRateAtPayment || fallbackRates?.Bs || 36.5;
    let entryTendered = item.cashTenderedUSD || 0;
    if ((item.cashTenderedCOP || 0) > 0) {
      if ((item.amountPaidUSD || 0) > 0 && rateCOP > 0) {
        const requiredCOP = roundCOP((item.amountPaidUSD || 0) * rateCOP);
        const excessCOP = Math.max(0, (item.cashTenderedCOP || 0) - requiredCOP);
        entryTendered += (item.amountPaidUSD || 0) + excessCOP / rateCOP;
      } else if (rateCOP > 0) {
        entryTendered += (item.cashTenderedCOP || 0) / rateCOP;
      }
    }
    if ((item.cashTenderedBs || 0) > 0 && rateBs > 0) {
      entryTendered += (item.cashTenderedBs || 0) / rateBs;
    }
    tenderedUSD += entryTendered;
    changeGivenUSD +=
      (item.changeGivenUSD || 0) +
      (rateCOP > 0 ? (item.changeGivenCOP || 0) / rateCOP : 0) +
      (rateBs > 0 ? (item.changeGivenBs || 0) / rateBs : 0);
  }

  const totalUSD = ord.totalUSD || 0;
  const rawPendingChange = Math.max(0, tenderedUSD - totalUSD - changeGivenUSD);
  const computedChange = rawPendingChange > maxTol ? rawPendingChange : 0;

  if (typeof ord.pendingChangeUSD === 'number') {
    const backendChange = ord.pendingChangeUSD > maxTol ? ord.pendingChangeUSD : 0;
    return Math.max(computedChange, backendChange);
  }
  return computedChange;
}

/**
 * Calcula el saldo pendiente por cobrar (en USD) de una comanda.
 */
export function getOrderPendingDebtUSD(ord: Order): number {
  if (ord.paymentStatus === 'credito') return 0;
  const totalUSD = Number(ord.totalUSD) || 0;
  const paidUSD = Number(ord.paidAmountUSD) || 0;
  const rawDebt = Math.max(0, totalUSD - paidUSD);
  return rawDebt > 0.05 ? rawDebt : 0;
}

/**
 * Determina si una comanda está 100% cuadrada tanto en cobros como en vueltos
 * (o cerrada a crédito). Solo una comanda que cumple esta condición puede
 * marcarse como entregada para pasar al Histórico y retirarse del tablero activo.
 */
export function isOrderFullySettled(
  ord: Order,
  fallbackRates?: { COP?: number; Bs?: number }
): boolean {
  if (ord.paymentStatus === 'credito') return true;
  if (getOrderPendingChangeUSD(ord, fallbackRates) > 0) return false;
  if (getOrderPendingDebtUSD(ord) > 0) return false;
  return (
    ord.paymentStatus === 'pagado' ||
    ((ord.paidAmountUSD || 0) > 0 && Math.max(0, (ord.totalUSD || 0) - (ord.paidAmountUSD || 0)) <= 0.05)
  );
}

/**
 * Determina si una comanda debe permanecer visible en los tableros activos
 * (Mesas, Delivery, PickUp y Comandas Activas).
 */
export function isOrderActiveInBoard(
  ord: Order,
  fallbackRates?: { COP?: number; Bs?: number }
): boolean {
  if (ord.status === 'cancelado' || ord.status === 'fusionada') return false;
  if (ord.status === 'entregada' && isOrderFullySettled(ord, fallbackRates)) return false;
  return true;
}
