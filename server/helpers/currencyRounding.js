/**
 * Redondeo Comercial Contable para Crispy Burger POS Backend (Tarea 13)
 */

function roundCOP(amountCOP) {
  const num = parseFloat(amountCOP);
  if (!num || num <= 0 || isNaN(num)) return 0;
  return Math.ceil(num / 1000) * 1000;
}

function roundBs(amountBs) {
  const num = parseFloat(amountBs);
  if (!num || num <= 0 || isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

function roundUSD(amountUSD) {
  const num = parseFloat(amountUSD);
  if (!num || num <= 0 || isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

module.exports = {
  roundCOP,
  roundBs,
  roundUSD,
};
