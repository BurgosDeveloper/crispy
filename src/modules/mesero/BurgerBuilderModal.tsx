import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, Ingredient, BurgerUnitConfig } from '../../data/mockData';
import { getExtraPrice } from '../../utils/burgerPricing';
import { roundCOP } from '../../utils/currencyRounding';
import { getCleanItemNote, normalizeProteinName, areProteinsDefault } from '../../utils/burgerProteins';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoCheckmark,
  IoCloseCircle,
  IoChevronDown,
  IoChevronUp,
  IoBagOutline,
  IoCopyOutline,
  IoRefreshOutline,
} from 'react-icons/io5';

export const AVAILABLE_BURGER_PROTEINS = [
  { id: 'novillo', name: 'Carne de Novillo', icon: '🥩' },
  { id: 'pollo_crispy', name: 'Pollo Crispy', icon: '🍗' },
  { id: 'pollo_plancha', name: 'Pechuga a la Plancha', icon: '🍳' },
  { id: 'chuleta', name: 'Chuleta Ahumada', icon: '🥓' },
  { id: 'mechada', name: 'Carne Mechada', icon: '🍲' },
  { id: 'smash', name: 'Smash de Carne', icon: '🍔' },
];

export const STRICT_FREE_TOPPINGS = [
  { id: 'free-jalapenos', name: 'Jalapeños Picantes' },
  { id: 'free-cebolla-caram', name: 'Cebolla Caramelizada' },
  { id: 'free-sweet-relish', name: 'Sweet Relish' },
  { id: 'free-maiz', name: 'Maíz' },
  { id: 'free-pepinillos', name: 'Pepinillos' },
];

const DEFAULT_BURGER_BASE_INGREDIENTS = [
  'Pan Brioche',
  'Queso Cheddar',
  'Lechuga',
  'Tomate',
  'Cebolla',
  'Salsa Crispy Especial',
];

const getInitialProteins = (burger: Product): string[] => {
  const count = burger.proteinCount !== undefined && burger.proteinCount !== null ? burger.proteinCount : 1;
  const nameLower = (burger.name || '').toLowerCase();
  const descLower = (burger.description || '').toLowerCase();

  if (count === 0 || nameLower.includes('papas') || nameLower.includes('nuggets')) {
    return [];
  }

  if (burger.defaultProteins && Array.isArray(burger.defaultProteins) && burger.defaultProteins.length > 0) {
    return [...burger.defaultProteins];
  }

  if (nameLower.includes('3.0') || nameLower.includes('triple') || count === 3) {
    return ['Carne de Novillo', 'Pollo Crispy', 'Chuleta Ahumada'];
  }
  if (nameLower.includes('mixtura')) {
    return ['Carne de Novillo', 'Pollo Crispy'];
  }
  if (nameLower.includes('house')) {
    return ['Pollo Crispy', 'Chuleta Ahumada'];
  }
  if (nameLower.includes('super smash') || nameLower.includes('tasty')) {
    return ['Smash de Carne', 'Smash de Carne'];
  }
  if (nameLower.includes('doble') || count === 2) {
    return ['Carne de Novillo', 'Carne de Novillo'];
  }
  if (nameLower.includes('mr pork') || descLower.includes('chuleta')) {
    return ['Chuleta Ahumada'];
  }
  if (nameLower.includes('street') || descLower.includes('mechada')) {
    return ['Carne Mechada'];
  }
  if (nameLower.includes('chicken grill') || descLower.includes('plancha')) {
    return ['Pechuga a la Plancha'];
  }
  if (nameLower.includes('crispy') || descLower.includes('pollo')) {
    return ['Pollo Crispy'];
  }
  return ['Carne de Novillo'];
};

const createInitialUnitConfig = (
  unitIndex: number,
  burger: Product,
  defaultTakeaway: boolean
): BurgerUnitConfig => ({
  unitIndex,
  proteins: getInitialProteins(burger),
  removedIngredients: [],
  selectedFreeToppings: [],
  selectedPaidExtras: [],
  isTakeaway: defaultTakeaway,
  isCut: false,
  cutPreference: 'Entera',
  notes: '',
  subtotalUSD: burger.price,
});

function areUnitsIdentical(a: BurgerUnitConfig, b: BurgerUnitConfig): boolean {
  if (a.isTakeaway !== b.isTakeaway) return false;
  if (a.isCut !== b.isCut) return false;
  if (a.cutPreference !== b.cutPreference) return false;
  if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

  const aProt = [...(a.proteins || [])].map(normalizeProteinName).sort().join('|');
  const bProt = [...(b.proteins || [])].map(normalizeProteinName).sort().join('|');
  if (aProt !== bProt) return false;

  const aRem = [...a.removedIngredients].sort().join('|');
  const bRem = [...b.removedIngredients].sort().join('|');
  if (aRem !== bRem) return false;

  const aFree = [...a.selectedFreeToppings].sort().join('|');
  const bFree = [...b.selectedFreeToppings].sort().join('|');
  if (aFree !== bFree) return false;

  const aPaid = (a.selectedPaidExtras || []).map((e) => `${e.name}:${e.price}`).sort().join('|');
  const bPaid = (b.selectedPaidExtras || []).map((e) => `${e.name}:${e.price}`).sort().join('|');
  if (aPaid !== bPaid) return false;

  return true;
}

export interface BurgerOrderConfirmationItem {
  burger: Product;
  quantity: number;
  proteins?: string[];
  removedIngredients: string[];
  extras: { name: string; price: number }[];
  isTakeaway: boolean;
  isCut: boolean;
  cutPreference: 'Picada' | 'Entera';
  notes?: string;
  finalPrice: number;
}

interface BurgerBuilderModalProps {
  burger: Product | null;
  availableExtras: Ingredient[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]) => void;
  defaultTakeaway?: boolean;
  exchangeRates?: { COP: number; Bs: number };
}

export const BurgerBuilderModal: React.FC<BurgerBuilderModalProps> = ({
  burger,
  availableExtras,
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  exchangeRates = { COP: 3950, Bs: 36.5 },
}) => {
  const [units, setUnits] = useState<BurgerUnitConfig[]>([]);
  const [activeUnitIndex, setActiveUnitIndex] = useState<number>(0);
  const [copyToast, setCopyToast] = useState<string>('');

  // Toggles tipo acordeón para no sobrecargar la vista
  const [showPersonalizar, setShowPersonalizar] = useState<boolean>(false);
  const [showProteinas, setShowProteinas] = useState<boolean>(false);
  const [showAdicionales, setShowAdicionales] = useState<boolean>(false);

  useEffect(() => {
    if (burger) {
      setUnits([createInitialUnitConfig(0, burger, defaultTakeaway)]);
      setActiveUnitIndex(0);
      setShowPersonalizar(false);
      setShowProteinas(false);
      setShowAdicionales(false);
      setCopyToast('');
    }
  }, [burger, defaultTakeaway]);

  // Lista ESTRICTA de los únicos 5 toppings gratis (Instrucción explícita del usuario)
  const freeToppingsList = useMemo(() => STRICT_FREE_TOPPINGS, []);

  // Lista de Adicionales Pagos (> $0.00 y excluyendo los 5 gratis)
  const paidExtrasList = useMemo(() => {
    const freeNames = STRICT_FREE_TOPPINGS.map((t) => t.name.toLowerCase());
    return availableExtras.filter((extra) => {
      const price = getExtraPrice(extra);
      return price > 0 && !freeNames.includes(extra.name.toLowerCase().trim());
    });
  }, [availableExtras]);

  // Proteínas predeterminadas de la receta original
  const defaultRecipeProteins = useMemo(() => {
    if (!burger) return [];
    return getInitialProteins(burger);
  }, [burger]);

  if (!isOpen || !burger || units.length === 0) return null;

  const currentUnit = units[activeUnitIndex] || units[0];

  // Helper para modificar la unidad activa
  const updateCurrentUnit = (updater: (prev: BurgerUnitConfig) => BurgerUnitConfig) => {
    setUnits((prev) =>
      prev.map((u, idx) => (idx === activeUnitIndex ? updater(u) : u))
    );
  };

  // Manejo de Cantidad
  const handleIncreaseQuantity = () => {
    setUnits((prev) => {
      const nextIndex = prev.length;
      const source = prev[activeUnitIndex] || prev[0];
      const newUnit: BurgerUnitConfig = {
        ...source,
        unitIndex: nextIndex,
        proteins: [...source.proteins],
        removedIngredients: [...source.removedIngredients],
        selectedFreeToppings: [...source.selectedFreeToppings],
        selectedPaidExtras: source.selectedPaidExtras.map((e) => ({ ...e })),
      };
      return [...prev, newUnit];
    });
    // Cambiar automáticamente a la nueva unidad para que el usuario pueda personalizarla si desea
    setActiveUnitIndex(units.length);
  };

  const handleDecreaseQuantity = () => {
    if (units.length <= 1) return;
    setUnits((prev) => prev.slice(0, prev.length - 1));
    if (activeUnitIndex >= units.length - 1) {
      setActiveUnitIndex(Math.max(0, units.length - 2));
    }
  };

  // Copiar configuración activa a todas las demás
  const handleCopyActiveToAll = () => {
    const active = units[activeUnitIndex];
    if (!active) return;
    setUnits((prev) =>
      prev.map((u, idx) =>
        idx === activeUnitIndex
          ? u
          : {
              ...active,
              unitIndex: idx,
              proteins: [...active.proteins],
              removedIngredients: [...active.removedIngredients],
              selectedFreeToppings: [...active.selectedFreeToppings],
              selectedPaidExtras: active.selectedPaidExtras.map((e) => ({ ...e })),
            }
      )
    );
    setCopyToast(`¡Personalización de #${activeUnitIndex + 1} copiada a las ${units.length} hamburguesas!`);
    setTimeout(() => setCopyToast(''), 2500);
  };

  // Resetear unidad activa a valores iniciales
  const handleResetCurrentUnit = () => {
    if (!burger) return;
    const fresh = createInitialUnitConfig(activeUnitIndex, burger, defaultTakeaway);
    updateCurrentUnit(() => fresh);
    setCopyToast(`Hamburguesa #${activeUnitIndex + 1} restablecida a su receta base.`);
    setTimeout(() => setCopyToast(''), 2000);
  };

  // Base ingredients for this burger, filtrando proteínas porque las proteínas tienen su propio selector
  const rawBaseIngredients =
    burger.baseIngredients && burger.baseIngredients.length > 0
      ? burger.baseIngredients
      : DEFAULT_BURGER_BASE_INGREDIENTS;

  const isProteinName = (name: string) =>
    /carne|pollo|chuleta|mechada|smash|res|novillo|pechuga|proteina|proteína/i.test(name);

  const customizableBaseIngredients = rawBaseIngredients.filter((ing) => !isProteinName(ing));

  const toggleRemoveBase = (ingName: string) => {
    updateCurrentUnit((prev) => ({
      ...prev,
      removedIngredients: prev.removedIngredients.includes(ingName)
        ? prev.removedIngredients.filter((i) => i !== ingName)
        : [...prev.removedIngredients, ingName],
    }));
  };

  const toggleFreeTopping = (toppingName: string) => {
    updateCurrentUnit((prev) => ({
      ...prev,
      selectedFreeToppings: prev.selectedFreeToppings.includes(toppingName)
        ? prev.selectedFreeToppings.filter((t) => t !== toppingName)
        : [...prev.selectedFreeToppings, toppingName],
    }));
  };

  const togglePaidExtra = (extraIng: Ingredient) => {
    const price = getExtraPrice(extraIng);
    updateCurrentUnit((prev) => {
      const exists = prev.selectedPaidExtras.some((e) => e.name === extraIng.name);
      return {
        ...prev,
        selectedPaidExtras: exists
          ? prev.selectedPaidExtras.filter((e) => e.name !== extraIng.name)
          : [...prev.selectedPaidExtras, { name: extraIng.name, price }],
      };
    });
  };

  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  const currentUnitExtrasTotal = currentUnit.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0);
  const currentUnitPrice = burger.price + currentUnitExtrasTotal;

  const grandTotalPrice = units.reduce(
    (total, u) => total + (burger.price + u.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0)),
    0
  );

  const handleSave = () => {
    if (!burger || units.length === 0) return;

    // Agrupar unidades que tengan la MISMA configuración exacta
    const groups: { unit: BurgerUnitConfig; quantity: number }[] = [];

    for (const u of units) {
      const match = groups.find((g) => areUnitsIdentical(g.unit, u));
      if (match) {
        match.quantity += 1;
      } else {
        groups.push({ unit: u, quantity: 1 });
      }
    }

    const itemsToEmit: BurgerOrderConfirmationItem[] = groups.map(({ unit: u, quantity }) => {
      const combinedExtras: { name: string; price: number }[] = [
        ...u.selectedFreeToppings.map((name) => ({ name, price: 0 })),
        ...u.selectedPaidExtras,
      ];
      const extrasCost = u.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0);
      const unitPrice = burger.price + extrasCost;

      // NOTA: Únicamente si el usuario escribió una nota real en el input.
      // NUNCA agregar tags artificiales como [#1], [#2] si el usuario no escribió nada.
      const userNote = getCleanItemNote(u.notes);

      return {
        burger,
        quantity,
        proteins: u.proteins.length > 0 ? u.proteins : undefined,
        removedIngredients: u.removedIngredients,
        extras: combinedExtras,
        isTakeaway: u.isTakeaway,
        isCut: u.isCut,
        cutPreference: u.cutPreference,
        notes: userNote || undefined,
        finalPrice: unitPrice,
      };
    });

    if (itemsToEmit.length === 1) {
      onConfirm(itemsToEmit[0]);
    } else {
      onConfirm(itemsToEmit);
    }

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-stone-100 text-gray-900 w-full h-full max-h-screen overflow-hidden select-none">
      {/* 1. TOP HEADER (CORTE COMPACTO Y CLARO) */}
      <header className="bg-white text-gray-900 px-4 sm:px-6 py-3 flex items-center justify-between border-b-2 border-yellow-400 shrink-0 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl sm:text-3xl">🍔</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-wide">
                {burger.name.toUpperCase()}
              </h2>
              <span className="bg-yellow-400 text-black text-xs px-2.5 py-0.5 rounded-lg font-black shadow-xs">
                {currentUnit.proteins.length === 0
                  ? 'Plato / Ración'
                  : currentUnit.proteins.length === 1
                  ? 'Sencilla'
                  : currentUnit.proteins.length === 2
                  ? 'Doble Carne'
                  : 'Triple Carne'}
              </span>
              {units.length > 1 && (
                <span className="bg-stone-800 text-white text-xs px-2.5 py-0.5 rounded-lg font-black">
                  {units.length} UNIDADES EN PEDIDO
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm font-black text-gray-700 flex-wrap">
              <span className="text-black text-base font-black">${currentUnitPrice.toFixed(2)} USD</span>
              {currentUnitExtrasTotal > 0 && (
                <span className="text-emerald-700 text-xs font-bold">(Base ${burger.price.toFixed(2)} + Adicionales ${currentUnitExtrasTotal.toFixed(2)})</span>
              )}
              <span className="text-gray-400">•</span>
              <span>🇨🇴 {roundCOP(currentUnitPrice * copRate).toLocaleString()} COP</span>
              <span className="text-gray-400">•</span>
              <span>🇻🇪 {(currentUnitPrice * bsRate).toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-600 hover:text-black transition-colors cursor-pointer"
          title="Cerrar modal"
        >
          <IoClose className="text-2xl" />
        </button>
      </header>

      {/* 2. BODY SCROLLABLE (ESPACIOSO Y SIN CORTES) */}
      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-3.5 max-w-7xl mx-auto w-full pb-8">
        {/* BARRA SUPERIOR COMPACTA: CANTIDAD, PARA LLEVAR Y PICADA / ENTERA */}
        <section className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Selector de Cantidad */}
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black text-gray-800 uppercase">Cantidad Total:</span>
            <div className="flex items-center border-2 border-yellow-400 rounded-xl bg-white shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={handleDecreaseQuantity}
                className="px-3 py-1 hover:bg-yellow-100 text-black font-black text-base transition-colors cursor-pointer"
                title="Disminuir hamburguesas"
              >
                <IoRemove />
              </button>
              <span className="px-4 py-1 text-base sm:text-lg font-black text-black min-w-[2.5rem] text-center">
                {units.length}
              </span>
              <button
                type="button"
                onClick={handleIncreaseQuantity}
                className="px-3 py-1 hover:bg-yellow-100 text-black font-black text-base transition-colors cursor-pointer"
                title="Agregar otra hamburguesa para personalizar"
              >
                <IoAdd />
              </button>
            </div>
          </div>

          {/* Opciones Rápidas: Para Llevar y Picada / Entera de la unidad activa */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Para Llevar */}
            <button
              type="button"
              onClick={() =>
                updateCurrentUnit((prev) => ({ ...prev, isTakeaway: !prev.isTakeaway }))
              }
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 border transition-all cursor-pointer shadow-xs ${
                currentUnit.isTakeaway
                  ? 'bg-amber-400 text-black border-amber-500 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              <IoBagOutline className="text-base" />
              <span>{currentUnit.isTakeaway ? '📦 PARA LLEVAR' : '🍽️ EN SALÓN'}</span>
            </button>

            {/* Picada vs Entera */}
            <div className="flex items-center border border-gray-300 rounded-xl bg-white p-0.5 shadow-xs">
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isCut: false,
                    cutPreference: 'Entera',
                  }))
                }
                className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                  !currentUnit.isCut
                    ? 'bg-yellow-400 text-black shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🍔 ENTERA
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isCut: true,
                    cutPreference: 'Picada',
                  }))
                }
                className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1 ${
                  currentUnit.isCut
                    ? 'bg-red-500 text-white shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                <span>🔪 PICADA (EN 2)</span>
              </button>
            </div>
          </div>
        </section>

        {/* PESTAÑAS MULTI-UNIDAD CUANDO HAY MÁS DE 1 HAMBURGUESA */}
        {units.length > 1 && (
          <section className="bg-yellow-50/80 p-3 rounded-2xl border-2 border-yellow-300 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-yellow-950 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🍔</span>
                  <span>SELECCIONA LA UNIDAD A PERSONALIZAR ({units.length}):</span>
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyActiveToAll}
                  className="px-3 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black border border-yellow-500 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  title="Copiar los ingredientes, adicionales y notas de esta unidad a todas las demás"
                >
                  <IoCopyOutline className="text-sm" />
                  <span>Copiar #{activeUnitIndex + 1} a todas</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetCurrentUnit}
                  className="px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-700 text-xs font-bold border border-gray-300 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  title="Restablecer esta unidad a su receta original"
                >
                  <IoRefreshOutline className="text-sm" />
                  <span>Reset #{activeUnitIndex + 1}</span>
                </button>
              </div>
            </div>

            {copyToast && (
              <div className="text-xs font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl animate-in fade-in">
                {copyToast}
              </div>
            )}

            {/* Fila de Botones de Pestaña */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {units.map((u, idx) => {
                const isActive = idx === activeUnitIndex;
                const isModified =
                  u.removedIngredients.length > 0 ||
                  u.selectedFreeToppings.length > 0 ||
                  u.selectedPaidExtras.length > 0 ||
                  u.isCut ||
                  u.isTakeaway !== defaultTakeaway ||
                  !areProteinsDefault(burger.name, u.proteins) ||
                  Boolean(getCleanItemNote(u.notes));

                const unitExtrasSum = u.selectedPaidExtras.reduce((s, e) => s + e.price, 0);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveUnitIndex(idx)}
                    className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all border-2 flex items-center gap-2 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-sm scale-[1.02] ring-2 ring-yellow-400'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-300 hover:bg-yellow-50/50'
                    }`}
                  >
                    <span>🍔 #{idx + 1}</span>
                    {isModified ? (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-200 text-amber-950">
                        Modificada
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        Base
                      </span>
                    )}
                    {unitExtrasSum > 0 && (
                      <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded">
                        +${unitExtrasSum.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. ÚNICOS 5 ADICIONALES GRATIS OFICIALES */}
        <section className="bg-amber-50/60 p-3 sm:p-3.5 rounded-2xl border border-yellow-300 shadow-xs space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <h3 className="text-xs sm:text-sm font-black text-yellow-950 uppercase tracking-wide flex items-center gap-1.5">
              <span>✨</span>
              <span>
                TOPPINGS & SALSAS GRATIS ({units.length > 1 ? `HAMBURGUESA #${activeUnitIndex + 1}` : 'DISPONIBLES'}):
              </span>
            </h3>
            <span className="text-[11px] font-bold text-amber-800 bg-yellow-200/80 px-2 py-0.5 rounded-lg">
              {currentUnit.selectedFreeToppings.length} seleccionados
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {freeToppingsList.map((top) => {
              const isSelected = currentUnit.selectedFreeToppings.includes(top.name);
              return (
                <button
                  key={top.id}
                  type="button"
                  onClick={() => toggleFreeTopping(top.name)}
                  className={`p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-yellow-400 text-black border-yellow-500 shadow-sm scale-[1.02]'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50/30'
                  }`}
                >
                  <span className="truncate">{top.name}</span>
                  <span className="font-black text-sm">{isSelected ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. TRES BOTONES DESPLEGABLES COMPACTOS: PERSONALIZAR, PROTEÍNAS Y ADICIONALES */}
        <section className="space-y-2.5">
          <div className={`grid grid-cols-1 ${currentUnit.proteins.length > 0 ? 'md:grid-cols-2' : ''} gap-2.5`}>
            {/* BOTÓN 1: PERSONALIZAR (Despliega ingredientes base sin proteínas) */}
            <button
              type="button"
              onClick={() => setShowPersonalizar((prev) => !prev)}
              className={`p-3.5 rounded-2xl border font-black text-sm sm:text-base flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                showPersonalizar
                  ? 'bg-stone-800 text-white border-stone-900 ring-2 ring-yellow-400'
                  : 'bg-white text-black border-gray-200 hover:border-yellow-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🛠️</span>
                <div className="text-left">
                  <div className="font-black leading-tight">
                    {units.length > 1 ? `PERSONALIZAR #${activeUnitIndex + 1}` : 'PERSONALIZAR INGREDIENTES'}
                  </div>
                  <div className="text-[11px] font-bold text-gray-500">
                    {currentUnit.removedIngredients.length > 0
                      ? `🚫 ${currentUnit.removedIngredients.length} ingrediente(s) quitado(s)`
                      : 'Lleva todos sus ingredientes'}
                  </div>
                </div>
              </div>
              {showPersonalizar ? <IoChevronUp className="text-xl" /> : <IoChevronDown className="text-xl" />}
            </button>

            {/* BOTÓN 2: PROTEÍNAS (Despliega cambio de carnes solo si aplica) */}
            {currentUnit.proteins.length > 0 && (
              <button
                type="button"
                onClick={() => setShowProteinas((prev) => !prev)}
                className={`p-3.5 rounded-2xl border font-black text-sm sm:text-base flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                  showProteinas
                    ? 'bg-stone-800 text-white border-stone-900 ring-2 ring-yellow-400'
                    : 'bg-white text-black border-gray-200 hover:border-yellow-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🥩</span>
                  <div className="text-left">
                    <div className="font-black leading-tight">
                      {units.length > 1 ? `PROTEÍNAS #${activeUnitIndex + 1}` : 'PROTEÍNA / CARNES'}
                    </div>
                    <div className="text-[11px] font-bold text-gray-500 truncate max-w-[180px] sm:max-w-xs">
                      {currentUnit.proteins.join(' + ')}
                    </div>
                  </div>
                </div>
                {showProteinas ? <IoChevronUp className="text-xl" /> : <IoChevronDown className="text-xl" />}
              </button>
            )}
          </div>

          {/* FILA INFERIOR: BOTÓN 3 ADICIONALES (Despliega adicionales de costo) */}
          <button
            type="button"
            onClick={() => setShowAdicionales((prev) => !prev)}
            className={`w-full p-3.5 rounded-2xl border font-black text-sm sm:text-base flex items-center justify-between transition-all cursor-pointer shadow-xs ${
              showAdicionales
                ? 'bg-stone-800 text-white border-stone-900 ring-2 ring-yellow-400'
                : 'bg-white text-black border-gray-200 hover:border-yellow-400'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">➕</span>
              <div className="text-left">
                <div className="font-black leading-tight">
                  {units.length > 1
                    ? `ADICIONALES CON COSTO (#${activeUnitIndex + 1})`
                    : 'ADICIONALES CON COSTO ($)'}
                </div>
                <div className="text-[11px] font-bold text-gray-500">
                  {currentUnit.selectedPaidExtras.length > 0
                    ? `+${currentUnit.selectedPaidExtras.length} adicional(es) sumados (+$${currentUnitExtrasTotal.toFixed(2)} USD)`
                    : 'Sin adicionales con costo'}
                </div>
              </div>
            </div>
            {showAdicionales ? <IoChevronUp className="text-xl" /> : <IoChevronDown className="text-xl" />}
          </button>

          {/* DESPLIEGUE 1: PERSONALIZAR */}
          {showPersonalizar && (
            <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-2.5 shadow-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black text-gray-800 uppercase">
                  Toca un ingrediente para quitarlo ("SIN"):
                </span>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  Rojo tachado = Se quita
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {customizableBaseIngredients.map((ing) => {
                  const isRemoved = currentUnit.removedIngredients.includes(ing);
                  return (
                    <button
                      key={ing}
                      type="button"
                      onClick={() => toggleRemoveBase(ing)}
                      className={`p-2.5 rounded-xl text-left font-black text-xs sm:text-sm transition-all border flex items-center justify-between cursor-pointer ${
                        isRemoved
                          ? 'bg-red-50 text-red-700 border-red-300 line-through'
                          : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-red-300'
                      }`}
                    >
                      <span className="truncate">{isRemoved ? `SIN ${ing}` : ing}</span>
                      {isRemoved && <IoCloseCircle className="text-red-600 text-lg shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DESPLIEGUE 2: PROTEÍNAS */}
          {showProteinas && currentUnit.proteins.length > 0 && (
            <div className="bg-amber-50/40 p-4 rounded-2xl border border-yellow-300 space-y-3 shadow-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">
                  Selecciona la proteína para cada carne de la hamburguesa:
                </span>
                <span className="text-[11px] font-extrabold text-amber-900 bg-yellow-200 px-2.5 py-0.5 rounded-lg">
                  {currentUnit.proteins.length === 1 ? '1 Carne' : `${currentUnit.proteins.length} Carnes`}
                </span>
              </div>

              <div className="space-y-2.5">
                {currentUnit.proteins.map((currentProtein, slotIndex) => {
                  const defaultProteinForSlot = defaultRecipeProteins[slotIndex];

                  return (
                    <div key={slotIndex} className="bg-white p-3 rounded-xl border border-gray-200 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-black text-gray-800">
                          {currentUnit.proteins.length === 1
                            ? 'Proteína principal:'
                            : `Carne / Proteína #${slotIndex + 1}:`}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {defaultProteinForSlot && (
                            <span className="text-[10px] font-bold text-gray-500 bg-stone-100 px-2 py-0.5 rounded border border-gray-200">
                              Receta: {defaultProteinForSlot}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-black text-black bg-yellow-400 px-2.5 py-0.5 rounded-lg border border-yellow-500 shadow-xs">
                            {currentProtein}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                        {AVAILABLE_BURGER_PROTEINS.map((prot) => {
                          const isSelected = currentProtein === prot.name;
                          const isOriginal = defaultProteinForSlot === prot.name;

                          return (
                            <button
                              key={prot.id}
                              type="button"
                              onClick={() => {
                                updateCurrentUnit((prev) => {
                                  const updated = [...prev.proteins];
                                  updated[slotIndex] = prot.name;
                                  return { ...prev, proteins: updated };
                                });
                              }}
                              className={`p-2 rounded-xl text-left font-black text-xs flex flex-col justify-between gap-1 transition-all border cursor-pointer ${
                                isSelected
                                  ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02]'
                                  : 'bg-stone-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 w-full">
                                <span className="text-base shrink-0">{prot.icon}</span>
                                <span className="truncate">{prot.name}</span>
                              </div>
                              {isOriginal && (
                                <span
                                  className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded self-start mt-0.5 ${
                                    isSelected
                                      ? 'bg-amber-950/20 text-amber-950 border border-amber-950/30'
                                      : 'bg-yellow-100 text-yellow-900 border border-yellow-300'
                                  }`}
                                  title="Proteína predeterminada de la receta original"
                                >
                                  ⭐ Original
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DESPLIEGUE 3: ADICIONALES CON COSTO */}
          {showAdicionales && (
            <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-2.5 shadow-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black text-gray-800 uppercase">
                  Adicionales con costo ($):
                </span>
                <span className="text-[11px] font-bold text-gray-500">Toca para sumar o retirar</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {paidExtrasList.map((extra) => {
                  const isSelected = currentUnit.selectedPaidExtras.some((e) => e.name === extra.name);
                  const price = getExtraPrice(extra);

                  return (
                    <button
                      key={extra.id}
                      type="button"
                      onClick={() => togglePaidExtra(extra)}
                      className={`p-3 rounded-xl text-left font-black text-xs sm:text-sm transition-all border flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02]'
                          : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-yellow-400'
                      }`}
                    >
                      <span className="truncate">{extra.name}</span>
                      <span className="font-black text-xs shrink-0 ml-1">
                        +$${price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 5. NOTAS DE COCINA DE LA UNIDAD ACTIVA */}
        <section className="bg-white p-3.5 rounded-2xl border border-gray-200 space-y-1.5 shadow-xs">
          <label className="block text-xs sm:text-sm font-black uppercase text-gray-800 tracking-wider">
            {units.length > 1
              ? `Notas de preparación para Cocina (Hamburguesa #${activeUnitIndex + 1}):`
              : 'Notas de preparación para Cocina:'}
          </label>
          <input
            type="text"
            value={currentUnit.notes}
            onChange={(e) => updateCurrentUnit((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Ej: Carne bien cocida, salsa aparte, bien caliente..."
            className="w-full px-4 py-2 text-sm sm:text-base bg-stone-50 border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
          />
        </section>
      </main>

      {/* 6. BOTTOM FOOTER (CORTE COMPACTO Y CLARO) */}
      <footer className="bg-white text-gray-900 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t-2 border-yellow-400 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">
            Total a sumar ({units.length} hamburguesa{units.length > 1 ? 's' : ''}):
          </span>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-2xl sm:text-3xl font-black text-black">
              ${grandTotalPrice.toFixed(2)} <span className="text-sm font-bold text-gray-500">USD</span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇨🇴 {roundCOP(grandTotalPrice * copRate).toLocaleString()} COP
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇻🇪 {(grandTotalPrice * bsRate).toFixed(2)} Bs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black text-gray-600 hover:bg-gray-100 hover:text-black transition-colors cursor-pointer"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-sm sm:text-base border-2 border-yellow-500 flex items-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <IoCheckmark className="text-xl" />
            <span>AGREGAR A LA COMANDA ({units.length})</span>
          </button>
        </div>
      </footer>
    </div>,
    document.body
  );
};
