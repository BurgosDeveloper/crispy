import React, { useState, useEffect, useMemo } from 'react';
import { Product, Ingredient } from '../../data/mockData';
import { getExtraPrice } from '../../utils/burgerPricing';
import { roundCOP } from '../../utils/currencyRounding';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoCheckmark,
  IoCloseCircle,
  IoChevronDown,
  IoChevronUp,
  IoBagOutline,
} from 'react-icons/io5';

export const AVAILABLE_BURGER_PROTEINS = [
  { id: 'novillo', name: 'Carne de Novillo', icon: '🥩' },
  { id: 'pollo_crispy', name: 'Pollo Crispy', icon: '🍗' },
  { id: 'pollo_plancha', name: 'Pechuga a la Plancha', icon: '🍳' },
  { id: 'chuleta', name: 'Chuleta Ahumada', icon: '🥓' },
  { id: 'mechada', name: 'Carne Mechada', icon: '🍲' },
  { id: 'smash', name: 'Smash de Carne', icon: '🍔' },
];

const OFFICIAL_FREE_TOPPINGS = [
  'Jalapeños Picantes',
  'Cebolla Caramelizada',
  'Sweet Relish',
  'Maíz',
  'Pepinillos',
];

const getInitialProteins = (burger: Product): string[] => {
  const nameLower = (burger.name || '').toLowerCase();
  const descLower = (burger.description || '').toLowerCase();

  // 1. Triple (3.0): Novillo + Pollo Crispy + Chuleta
  if (nameLower.includes('3.0') || nameLower.includes('triple')) {
    return ['Carne de Novillo', 'Pollo Crispy', 'Chuleta Ahumada'];
  }
  // 2. Dobles: Mixtura (Novillo + Pollo) o House (Pollo + Chuleta) o Smash (2 Smash)
  if (nameLower.includes('mixtura')) {
    return ['Carne de Novillo', 'Pollo Crispy'];
  }
  if (nameLower.includes('house')) {
    return ['Pollo Crispy', 'Chuleta Ahumada'];
  }
  if (nameLower.includes('super smash') || nameLower.includes('tasty')) {
    return ['Smash de Carne', 'Smash de Carne'];
  }
  if (nameLower.includes('doble')) {
    return ['Carne de Novillo', 'Carne de Novillo'];
  }
  // 3. Sencillas
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

interface BurgerBuilderModalProps {
  burger: Product | null;
  availableExtras: Ingredient[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: {
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
  }) => void;
  defaultTakeaway?: boolean;
  exchangeRates?: { COP: number; Bs: number };
}

const DEFAULT_BURGER_BASE_INGREDIENTS = [
  'Pan Brioche',
  'Queso Cheddar',
  'Lechuga',
  'Tomate',
  'Cebolla',
  'Salsa Crispy Especial',
];

export const BurgerBuilderModal: React.FC<BurgerBuilderModalProps> = ({
  burger,
  availableExtras,
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  exchangeRates = { COP: 3950, Bs: 36.5 },
}) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [isTakeaway, setIsTakeaway] = useState<boolean>(defaultTakeaway);
  const [isCut, setIsCut] = useState<boolean>(false);
  const [proteins, setProteins] = useState<string[]>([]);
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);
  const [selectedFreeToppings, setSelectedFreeToppings] = useState<string[]>([]);
  const [selectedPaidExtras, setSelectedPaidExtras] = useState<{ name: string; price: number }[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Toggles tipo acordeón para no sobrecargar la vista
  const [showPersonalizar, setShowPersonalizar] = useState<boolean>(false);
  const [showProteinas, setShowProteinas] = useState<boolean>(false);
  const [showAdicionales, setShowAdicionales] = useState<boolean>(false);

  useEffect(() => {
    if (burger) {
      setQuantity(1);
      setIsTakeaway(defaultTakeaway);
      setIsCut(false);
      setRemovedIngredients([]);
      setSelectedFreeToppings([]);
      setSelectedPaidExtras([]);
      setNotes('');
      setProteins(getInitialProteins(burger));
      setShowPersonalizar(false);
      setShowProteinas(false);
      setShowAdicionales(false);
    }
  }, [burger, defaultTakeaway]);

  // Lista de Toppings Gratis ($0.00)
  const freeToppingsList = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const extra of availableExtras) {
      const price = getExtraPrice(extra);
      if (price === 0) {
        seen.add(extra.name.toLowerCase());
        list.push({ id: extra.id, name: extra.name });
      }
    }

    for (const official of OFFICIAL_FREE_TOPPINGS) {
      if (!seen.has(official.toLowerCase())) {
        list.push({ id: `free-${official}`, name: official });
        seen.add(official.toLowerCase());
      }
    }

    return list;
  }, [availableExtras]);

  // Lista de Adicionales Pagos (> $0.00)
  const paidExtrasList = useMemo(() => {
    return availableExtras.filter((extra) => {
      const price = getExtraPrice(extra);
      return price > 0;
    });
  }, [availableExtras]);

  if (!isOpen || !burger) return null;

  // Base ingredients for this burger, filtrando proteínas porque las proteínas tienen su propio selector
  const rawBaseIngredients =
    burger.baseIngredients && burger.baseIngredients.length > 0
      ? burger.baseIngredients
      : DEFAULT_BURGER_BASE_INGREDIENTS;

  const isProteinName = (name: string) =>
    /carne|pollo|chuleta|mechada|smash|res|novillo|pechuga|proteina|proteína/i.test(name);

  const customizableBaseIngredients = rawBaseIngredients.filter((ing) => !isProteinName(ing));

  const toggleRemoveBase = (ingName: string) => {
    setRemovedIngredients((prev) =>
      prev.includes(ingName) ? prev.filter((i) => i !== ingName) : [...prev, ingName]
    );
  };

  const toggleFreeTopping = (toppingName: string) => {
    setSelectedFreeToppings((prev) =>
      prev.includes(toppingName) ? prev.filter((t) => t !== toppingName) : [...prev, toppingName]
    );
  };

  const togglePaidExtra = (extraIng: Ingredient) => {
    const price = getExtraPrice(extraIng);
    setSelectedPaidExtras((prev) => {
      const exists = prev.some((e) => e.name === extraIng.name);
      if (exists) {
        return prev.filter((e) => e.name !== extraIng.name);
      } else {
        return [...prev, { name: extraIng.name, price }];
      }
    });
  };

  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  const extrasTotal = selectedPaidExtras.reduce((sum, e) => sum + e.price, 0);
  const unitPrice = burger.price + extrasTotal;
  const totalPrice = unitPrice * quantity;

  const handleSave = () => {
    const combinedExtras: { name: string; price: number }[] = [
      ...selectedFreeToppings.map((name) => ({ name, price: 0 })),
      ...selectedPaidExtras,
    ];

    onConfirm({
      burger,
      quantity,
      proteins: proteins.length > 0 ? proteins : undefined,
      removedIngredients,
      extras: combinedExtras,
      isTakeaway,
      isCut,
      cutPreference: isCut ? 'Picada' : 'Entera',
      notes: notes.trim() || undefined,
      finalPrice: unitPrice,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-gray-900 w-screen h-screen overflow-hidden animate-in fade-in select-none">
      {/* 1. TOP HEADER (PANTALLA COMPLETA, TEXTO GRANDE) */}
      <header className="bg-slate-950 text-white px-6 py-4 flex items-center justify-between border-b-4 border-yellow-400 shrink-0 shadow-md">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-3xl">🍔</span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide flex items-center gap-3">
              <span>{burger.name.toUpperCase()}</span>
              <span className="bg-yellow-400 text-black text-xs sm:text-sm px-3 py-1 rounded-xl font-black">
                {proteins.length === 1 ? 'Sencilla' : proteins.length === 2 ? 'Doble Carne' : 'Triple Carne'}
              </span>
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm font-black">
              <span className="text-yellow-400 text-lg sm:text-xl font-black">${burger.price.toFixed(2)} USD</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-300">🇨🇴 {roundCOP(burger.price * copRate).toLocaleString()} COP</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-300">🇻🇪 {(burger.price * bsRate).toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition-colors cursor-pointer"
          title="Cerrar modal"
        >
          <IoClose className="text-3xl" />
        </button>
      </header>

      {/* 2. BODY SCROLLABLE */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* BARRA SUPERIOR: CANTIDAD, PARA LLEVAR Y PICADA / ENTERA */}
        <section className="bg-stone-50 p-4 sm:p-5 rounded-3xl border-2 border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
          {/* Selector de Cantidad */}
          <div className="flex items-center gap-3">
            <span className="text-base sm:text-lg font-black text-gray-800 uppercase">Cantidad:</span>
            <div className="flex items-center border-2 border-yellow-400 rounded-2xl bg-white shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-4 py-2 hover:bg-yellow-100 text-black font-black text-lg transition-colors cursor-pointer"
              >
                <IoRemove />
              </button>
              <span className="px-5 py-2 text-xl sm:text-2xl font-black text-black min-w-[3rem] text-center">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="px-4 py-2 hover:bg-yellow-100 text-black font-black text-lg transition-colors cursor-pointer"
              >
                <IoAdd />
              </button>
            </div>
          </div>

          {/* Opciones Rápidas: Para Llevar y Picada / Entera */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Para Llevar */}
            <button
              type="button"
              onClick={() => setIsTakeaway((prev) => !prev)}
              className={`px-5 py-3 rounded-2xl text-sm sm:text-base font-black flex items-center gap-2 border-2 transition-all cursor-pointer shadow-xs ${
                isTakeaway
                  ? 'bg-amber-400 text-black border-amber-500 shadow-md scale-102'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              <IoBagOutline className="text-xl" />
              <span>{isTakeaway ? '📦 PARA LLEVAR' : '🍽️ PARA COMER EN SALÓN'}</span>
            </button>

            {/* Picada vs Entera (Directiva de Usuario) */}
            <div className="flex items-center border-2 border-gray-300 rounded-2xl bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setIsCut(false)}
                className={`px-4 py-2.5 rounded-xl text-sm sm:text-base font-black transition-all cursor-pointer ${
                  !isCut
                    ? 'bg-yellow-400 text-black shadow-sm'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🍔 ENTERA
              </button>
              <button
                type="button"
                onClick={() => setIsCut(true)}
                className={`px-4 py-2.5 rounded-xl text-sm sm:text-base font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  isCut
                    ? 'bg-red-500 text-white shadow-sm scale-102'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                <span>🔪 PICADA (EN 2)</span>
              </button>
            </div>
          </div>
        </section>

        {/* 3. LO PRIMERO QUE CARGA ARRIBA: ADICIONALES GRATIS (TOPPINGS Y SALSAS $0.00) */}
        <section className="bg-amber-50/60 p-5 sm:p-6 rounded-3xl border-2 border-yellow-300 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base sm:text-lg font-black text-yellow-950 uppercase tracking-wide flex items-center gap-2">
              <span>✨</span>
              <span>SALSAS & TOPPINGS GRATIS (Sin costo adicional):</span>
            </h3>
            <span className="text-xs sm:text-sm font-bold text-amber-800 bg-yellow-200/80 px-3 py-1 rounded-xl">
              {selectedFreeToppings.length} seleccionados
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {freeToppingsList.map((top) => {
              const isSelected = selectedFreeToppings.includes(top.name);
              return (
                <button
                  key={top.id}
                  type="button"
                  onClick={() => toggleFreeTopping(top.name)}
                  className={`p-3.5 rounded-2xl text-left font-black text-sm sm:text-base transition-all border-2 flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-yellow-400 text-black border-yellow-500 shadow-md scale-[1.02]'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50/30'
                  }`}
                >
                  <span className="truncate">{top.name}</span>
                  <span className="text-lg shrink-0">
                    {isSelected ? '✓' : '+'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. TRES BOTONES DESPLEGABLES: PERSONALIZAR, PROTEÍNAS Y ADICIONALES */}
        <section className="space-y-4">
          {/* FILA SUPERIOR: BOTÓN PERSONALIZAR Y BOTÓN PROTEÍNAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* BOTÓN 1: PERSONALIZAR (Despliega ingredientes base sin proteínas) */}
            <button
              type="button"
              onClick={() => setShowPersonalizar((prev) => !prev)}
              className={`p-5 rounded-3xl border-2 font-black text-base sm:text-lg flex items-center justify-between transition-all cursor-pointer shadow-sm ${
                showPersonalizar
                  ? 'bg-slate-900 text-white border-slate-950 ring-2 ring-yellow-400'
                  : 'bg-white text-black border-gray-300 hover:border-yellow-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🛠️</span>
                <div className="text-left">
                  <div className="font-black">PERSONALIZAR INGREDIENTES</div>
                  <div className="text-xs sm:text-sm font-extrabold text-gray-500">
                    {removedIngredients.length > 0
                      ? `🚫 ${removedIngredients.length} ingrediente(s) quitado(s)`
                      : 'Lleva todos sus ingredientes'}
                  </div>
                </div>
              </div>
              {showPersonalizar ? <IoChevronUp className="text-2xl" /> : <IoChevronDown className="text-2xl" />}
            </button>

            {/* BOTÓN 2: PROTEÍNAS (Despliega cambio de carnes) */}
            <button
              type="button"
              onClick={() => setShowProteinas((prev) => !prev)}
              className={`p-5 rounded-3xl border-2 font-black text-base sm:text-lg flex items-center justify-between transition-all cursor-pointer shadow-sm ${
                showProteinas
                  ? 'bg-slate-900 text-white border-slate-950 ring-2 ring-yellow-400'
                  : 'bg-white text-black border-gray-300 hover:border-yellow-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🥩</span>
                <div className="text-left">
                  <div className="font-black">PROTEÍNA / CARNES</div>
                  <div className="text-xs sm:text-sm font-extrabold text-gray-500 truncate max-w-[200px] sm:max-w-xs">
                    {proteins.join(' + ')}
                  </div>
                </div>
              </div>
              {showProteinas ? <IoChevronUp className="text-2xl" /> : <IoChevronDown className="text-2xl" />}
            </button>
          </div>

          {/* FILA INFERIOR: BOTÓN 3 ADICIONALES (Despliega adicionales de costo) */}
          <button
            type="button"
            onClick={() => setShowAdicionales((prev) => !prev)}
            className={`w-full p-5 rounded-3xl border-2 font-black text-base sm:text-lg flex items-center justify-between transition-all cursor-pointer shadow-sm ${
              showAdicionales
                ? 'bg-slate-900 text-white border-slate-950 ring-2 ring-yellow-400'
                : 'bg-white text-black border-gray-300 hover:border-yellow-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">➕</span>
              <div className="text-left">
                <div className="font-black">ADICIONALES CON COSTO ($)</div>
                <div className="text-xs sm:text-sm font-extrabold text-gray-500">
                  {selectedPaidExtras.length > 0
                    ? `+${selectedPaidExtras.length} adicional(es) sumados (+$${extrasTotal.toFixed(2)} USD)`
                    : 'Sin adicionales con costo'}
                </div>
              </div>
            </div>
            {showAdicionales ? <IoChevronUp className="text-2xl" /> : <IoChevronDown className="text-2xl" />}
          </button>

          {/* DESPLIEGUE 1: PERSONALIZAR (INGREDIENTES QUE TRAE, SIN PROTEÍNAS) */}
          {showPersonalizar && (
            <div className="bg-stone-50 p-5 sm:p-6 rounded-3xl border-2 border-gray-300 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-black text-gray-800 uppercase">
                  Toca un ingrediente para quitarlo ("SIN"):
                </span>
                <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-xl border border-red-200">
                  Rojo tachado = Se quita de la preparación
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {customizableBaseIngredients.map((ing) => {
                  const isRemoved = removedIngredients.includes(ing);
                  return (
                    <button
                      key={ing}
                      type="button"
                      onClick={() => toggleRemoveBase(ing)}
                      className={`p-3.5 rounded-2xl text-left font-black text-sm sm:text-base transition-all border-2 flex items-center justify-between cursor-pointer ${
                        isRemoved
                          ? 'bg-red-100 text-red-800 border-red-400 line-through shadow-xs'
                          : 'bg-white text-gray-800 border-gray-200 hover:border-red-300 hover:bg-red-50/20'
                      }`}
                    >
                      <span className="truncate">{isRemoved ? `SIN ${ing}` : ing}</span>
                      {isRemoved && <IoCloseCircle className="text-red-600 text-xl shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DESPLIEGUE 2: PROTEÍNAS (SELECTOR SEGÚN SENCILLA, DOBLE O TRIPLE) */}
          {showProteinas && (
            <div className="bg-amber-50/50 p-5 sm:p-6 rounded-3xl border-2 border-yellow-300 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-black text-gray-900 uppercase">
                  Selecciona la proteína para cada carne de la receta:
                </span>
                <span className="text-xs font-extrabold text-amber-900 bg-yellow-200 px-3 py-1 rounded-xl">
                  {proteins.length === 1 ? '1 Carne' : `${proteins.length} Carnes`}
                </span>
              </div>

              <div className="space-y-4">
                {proteins.map((currentProtein, slotIndex) => (
                  <div key={slotIndex} className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-gray-200 space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-sm sm:text-base font-black text-gray-800">
                        {proteins.length === 1 ? 'Proteína principal:' : `Carne / Proteína #${slotIndex + 1}:`}
                      </span>
                      <span className="text-sm sm:text-base font-black text-black bg-yellow-400 px-3 py-1 rounded-xl border border-yellow-500 shadow-xs">
                        {currentProtein}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {AVAILABLE_BURGER_PROTEINS.map((prot) => {
                        const isSelected = currentProtein === prot.name;
                        return (
                          <button
                            key={prot.id}
                            type="button"
                            onClick={() => {
                              const updated = [...proteins];
                              updated[slotIndex] = prot.name;
                              setProteins(updated);
                            }}
                            className={`p-3 rounded-xl text-left font-black text-xs sm:text-sm flex items-center gap-2 transition-all border-2 cursor-pointer ${
                              isSelected
                                ? 'bg-yellow-400 text-black border-yellow-500 shadow-md scale-102'
                                : 'bg-stone-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                            }`}
                          >
                            <span className="text-lg">{prot.icon}</span>
                            <span className="truncate">{prot.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DESPLIEGUE 3: ADICIONALES CON COSTO ($) */}
          {showAdicionales && (
            <div className="bg-stone-50 p-5 sm:p-6 rounded-3xl border-2 border-gray-300 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-black text-gray-800 uppercase">
                  Adicionales con costo ($):
                </span>
                <span className="text-xs font-bold text-gray-600">Toca para sumar o retirar</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {paidExtrasList.map((extra) => {
                  const isSelected = selectedPaidExtras.some((e) => e.name === extra.name);
                  const price = getExtraPrice(extra);

                  return (
                    <button
                      key={extra.id}
                      type="button"
                      onClick={() => togglePaidExtra(extra)}
                      className={`p-4 rounded-2xl text-left font-black text-sm sm:text-base transition-all border-2 flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-md scale-[1.02]'
                          : 'bg-white text-gray-800 border-gray-200 hover:border-yellow-400'
                      }`}
                    >
                      <span className="truncate">{extra.name}</span>
                      <span className="font-black text-xs sm:text-sm shrink-0 ml-1">
                        +${price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 5. NOTAS DE COCINA */}
        <section className="bg-white p-5 rounded-3xl border-2 border-gray-200 space-y-2">
          <label className="block text-sm sm:text-base font-black uppercase text-gray-800 tracking-wider">
            Notas de preparación para Cocina:
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Carne bien cocida, aderezo aparte, bien caliente..."
            className="w-full px-5 py-3.5 text-base sm:text-lg bg-stone-50 border-2 border-gray-300 rounded-2xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
          />
        </section>
      </main>

      {/* 6. BOTTOM FOOTER (PANTALLA COMPLETA, TEXTO GRANDE Y 3 MONEDAS) */}
      <footer className="bg-slate-950 text-white px-6 py-5 border-t-4 border-yellow-400 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-2xl">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-400 block">
            Total a sumar ({quantity}x):
          </span>
          <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
            <span className="text-3xl sm:text-4xl font-black text-yellow-400">
              ${totalPrice.toFixed(2)} USD
            </span>
            <span className="text-base sm:text-lg font-black text-gray-300">
              🇨🇴 {roundCOP(totalPrice * copRate).toLocaleString()} COP
            </span>
            <span className="text-base sm:text-lg font-black text-gray-300">
              🇻🇪 {(totalPrice * bsRate).toFixed(2)} Bs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-4 rounded-2xl text-sm sm:text-base font-black text-gray-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-8 py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-base sm:text-xl border-2 border-yellow-500 flex items-center gap-2 shadow-lg transition-all active:scale-[0.98] cursor-pointer"
          >
            <IoCheckmark className="text-2xl" />
            <span>AGREGAR A LA COMANDA ({quantity})</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

