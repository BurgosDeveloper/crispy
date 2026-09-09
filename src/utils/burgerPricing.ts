import { Ingredient } from '../data/mockData';

export function getExtraPrice(ingredient: Ingredient | undefined | null): number {
  if (!ingredient) return 0;
  return Number(ingredient.priceUSD ?? ingredient.priceGrandeCompleta ?? 0);
}
