export function normalizeProteinName(name: string = ''): string {
  const n = String(name || '').trim().toLowerCase();
  if (n.includes('novillo') || (n.includes('carne') && !n.includes('mechada') && !n.includes('smash'))) return 'carne de novillo';
  if (n.includes('crispy') || (n.includes('pollo') && !n.includes('plancha'))) return 'pollo crispy';
  if (n.includes('plancha') || n.includes('grill') || (n.includes('pechuga'))) return 'pechuga de pollo a la plancha';
  if (n.includes('chuleta') || n.includes('pork') || n.includes('cerdo')) return 'chuleta de cerdo ahumada';
  if (n.includes('mechada') || n.includes('street')) return 'carne mechada';
  if (n.includes('smash')) return 'doble smash de carne';
  return n;
}

export function getDefaultProteins(burgerName: string = ''): string[] {
  const nameLower = String(burgerName || '').toLowerCase().trim();
  if (nameLower.includes('papas') || nameLower.includes('nugget')) return [];
  if (nameLower.includes('3.0') || nameLower.includes('triple')) return ['carne de novillo', 'pollo crispy', 'chuleta de cerdo ahumada'];
  if (nameLower.includes('mixtura')) return ['carne de novillo', 'pollo crispy'];
  if (nameLower.includes('house')) return ['pollo crispy', 'chuleta de cerdo ahumada'];
  if (nameLower.includes('super smash') || nameLower.includes('tasty')) return ['doble smash de carne'];
  if (nameLower.includes('mr pork') || nameLower.includes('pork')) return ['chuleta de cerdo ahumada'];
  if (nameLower.includes('street')) return ['carne mechada'];
  if (nameLower.includes('chicken grill') || nameLower.includes('grill')) return ['pechuga de pollo a la plancha'];
  if (nameLower.includes('crispy') || nameLower.includes('crispys')) return ['pollo crispy'];
  if (nameLower.includes('bistro')) return ['carne de novillo'];
  return ['carne de novillo'];
}

export function areProteinsDefault(burgerName: string, proteins?: string[]): boolean {
  if (!proteins || !Array.isArray(proteins) || proteins.length === 0) return true;
  const defaultList = getDefaultProteins(burgerName);
  if (defaultList.length === 0 && proteins.length === 0) return true;
  if (proteins.length !== defaultList.length) return false;

  const pSorted = [...proteins].map(normalizeProteinName).sort();
  const dSorted = [...defaultList].map(normalizeProteinName).sort();
  return pSorted.every((p, idx) => p === dSorted[idx]);
}
