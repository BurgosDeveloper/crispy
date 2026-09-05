const PAYMENT_METHODS_BY_CURRENCY = {
  USD: ['Efectivo USD', 'Binance', 'Zelle'],
  COP: ['Efectivo COP', 'Bancolombia', 'Nequi'],
  Bs: ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito'],
};

function isValidPaymentMethod(currency, paymentMethod) {
  return PAYMENT_METHODS_BY_CURRENCY[currency]?.includes(paymentMethod) || false;
}

function toUsd(amountLocal, currency, copRate, bsRate) {
  const amount = Number(amountLocal) || 0;
  if (currency === 'COP') return amount / copRate;
  if (currency === 'Bs') return amount / bsRate;
  return amount;
}

function paymentAmounts(amountLocal, currency) {
  const amount = Number(amountLocal) || 0;
  return {
    cashTenderedUSD: currency === 'USD' ? amount : 0,
    cashTenderedCOP: currency === 'COP' ? amount : 0,
    cashTenderedBs: currency === 'Bs' ? amount : 0,
  };
}

function changeAmounts(amountLocal, currency) {
  const amount = Number(amountLocal) || 0;
  return {
    changeGivenUSD: currency === 'USD' ? amount : 0,
    changeGivenCOP: currency === 'COP' ? amount : 0,
    changeGivenBs: currency === 'Bs' ? amount : 0,
  };
}

function paymentHistoryTotals(payments) {
  return payments.reduce((totals, payment) => {
    const copRate = Number(payment.cop_rate) || 3950;
    const bsRate = Number(payment.bs_rate) || 36.5;
    const paidUSD = Number(payment.amount_paid_usd) || 0;
    totals.paidUSD += paidUSD;

    let tenderedUSD = Number(payment.cash_tendered_usd) || 0;
    const cashCOP = Number(payment.cash_tendered_cop) || 0;
    const cashBs = Number(payment.cash_tendered_bs) || 0;

    if (cashCOP > 0) {
      if (paidUSD > 0 && copRate > 0) {
        // En cobros COP se redondea al millar comercial superior. El exceso sobre el cobro redondeado es el vuelto.
        const requiredCOP = Math.ceil((paidUSD * copRate) / 1000) * 1000;
        const excessCOP = Math.max(0, cashCOP - requiredCOP);
        tenderedUSD += paidUSD + (excessCOP / copRate);
      } else if (copRate > 0) {
        tenderedUSD += cashCOP / copRate;
      }
    }
    if (cashBs > 0 && bsRate > 0) {
      tenderedUSD += cashBs / bsRate;
    }
    totals.tenderedUSD += tenderedUSD;

    totals.changeGivenUSD +=
      (Number(payment.change_given_usd) || 0) +
      (Number(payment.change_given_cop) || 0) / copRate +
      (Number(payment.change_given_bs) || 0) / bsRate;
    return totals;
  }, { paidUSD: 0, tenderedUSD: 0, changeGivenUSD: 0 });
}

module.exports = {
  PAYMENT_METHODS_BY_CURRENCY,
  isValidPaymentMethod,
  toUsd,
  paymentAmounts,
  changeAmounts,
  paymentHistoryTotals,
};
