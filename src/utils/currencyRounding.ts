/**
 * Redondeo Comercial Contable para Crispy Burger POS
 *
 * Reglas de Moneda:
 * - COP (Pesos Colombianos): En operaciones comerciales en efectivo se maneja la denominación de 500 y 1.000 COP.
 *   La aproximación comercial a más SOLO opera cuando el residuo está estrictamente POR ENCIMA de 0.5 (500 pesos).
 *   - Si rem == 0 -> múltiplo exacto de 1.000
 *   - Si 0 < rem <= 500 -> 500 (ej. 39.500 COP se mantiene en 39.500 COP)
 *   - Si rem > 500 -> aproxima al millar comercial superior (ej. 39.600 COP -> 40.000 COP)
 * - Bs (Bolívares Digitales / Físicos): Se redondean con precisión contable de 2 decimales.
 * - USD (Dólares Estadounidenses): Se calculan y redondean con 2 decimales.
 *
 * Vueltos (Change Given):
 * - NUNCA se aproximan al alza. Son estrictamente exactos en todas las monedas.
 */

export function roundCOP(amountCOP: number): number {
  if (!amountCOP || amountCOP <= 0 || isNaN(amountCOP)) return 0;
  const base = Math.floor(amountCOP / 1000) * 1000;
  const rem = amountCOP - base;
  if (rem === 0) return base;
  if (rem <= 500) return base + 500;
  return base + 1000;
}

export function roundBs(amountBs: number): number {
  if (!amountBs || amountBs <= 0 || isNaN(amountBs)) return 0;
  return Math.round(amountBs * 100) / 100;
}

export function roundUSD(amountUSD: number): number {
  if (!amountUSD || amountUSD <= 0 || isNaN(amountUSD)) return 0;
  return Math.round(amountUSD * 100) / 100;
}

export function formatCOP(amountCOP: number): string {
  return roundCOP(amountCOP).toLocaleString('es-CO');
}

export function formatBs(amountBs: number): string {
  return roundBs(amountBs).toFixed(2);
}

export function formatUSD(amountUSD: number): string {
  return roundUSD(amountUSD).toFixed(2);
}
