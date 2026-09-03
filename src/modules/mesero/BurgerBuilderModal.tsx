import React, { useState, useEffect } from 'react';
import { Product, Ingredient } from '../../data/mockData';
import { getExtraPrice } from '../../utils/burgerPricing';
import { IoClose, IoAdd, IoRemove, IoCheckmark, IoCloseCircle } from 'react-icons/io5';

export const AVAILABLE_BURGER_PROTEINS = [
  { id: 'res', name: 'Carne de Res', icon: '🥩' },
  { id: 'pollo_crispy', name: 'Pollo Crispy', icon: '🍗' },
  { id: 'pollo_plancha', name: 'Pollo a la Plancha', icon: '🍳' },
  { id: 'mixta', name: 'Carne Mixta', icon: '🥓' },
  { id: 'smash', name: 'Carne Smash', icon: '🍔' },
];

const getInitialProteins = (burger: Product): string[] => {
  const nameLower = (burger.name || '').toLowerCase();
  const isChicken = nameLower.includes('chicken') || nameLower.includes('pollo');
  const defaultProtein = isChicken ? 'Pollo Crispy' : 'Carne de Res';

  if (nameLower.includes('triple') || nameLower.includes('3 carnes')) {
    return [defaultProtein, defaultProtein, defaultProtein];
  }
  if (nameLower.includes('doble') || nameLower.includes('2 carnes')) {
    return [defaultProtein, defaultProtein];
  }
  return [defaultProtein];
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
    notes?: string;
    finalPrice: number;
  }) => void;
  defaultTakeaway?: boolean;
  exchangeRates?: { COP: number; Bs: number };
}

const DEFAULT_BURGER_BASE_INGREDIENTS = [
  'Carne de Res',
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
  const [proteins, setProteins] = useState<string[]>([]);
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<{ name: string; price: number }[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (burger) {
      setQuantity(1);
      setIsTakeaway(defaultTakeaway);
      setRemovedIngredients([]);
      setSelectedExtras([]);
      setNotes('');
      setProteins(getInitialProteins(burger));
    }
  }, [burger, defaultTakeaway]);

  if (!isOpen || !burger) return null;

  // Base ingredients for this burger
  const baseIngredients =
    burger.baseIngredients && burger.baseIngredients.length > 0
      ? burger.baseIngredients
      : DEFAULT_BURGER_BASE_INGREDIENTS;

  const toggleRemoveBase = (ingName: string) => {
    setRemovedIngredients((prev) =>
      prev.includes(ingName) ? prev.filter((i) => i !== ingName) : [...prev, ingName]
    );
  };

  const toggleExtra = (extraIng: Ingredient) => {
    const price = getExtraPrice(extraIng);
    setSelectedExtras((prev) => {
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

  const extrasTotal = selectedExtras.reduce((sum, e) => sum + e.price, 0);
  const unitPrice = burger.price + extrasTotal;
  const totalPrice = unitPrice * quantity;

  const handleSetPattyCount = (count: number) => {
    const defaultProt = proteins[0] || (burger.name.toLowerCase().includes('chicken') ? 'Pollo Crispy' : 'Carne de Res');
    if (count === 1) {
      setProteins([proteins[0] || defaultProt]);
    } else if (count === 2) {
      setProteins([proteins[0] || defaultProt, proteins[1] || defaultProt]);
    } else if (count === 3) {
      setProteins([proteins[0] || defaultProt, proteins[1] || defaultProt, proteins[2] || defaultProt]);
    }
  };

  const handleSave = () => {
    onConfirm({
      burger,
      quantity,
      proteins: proteins.length > 0 ? proteins : undefined,
      removedIngredients,
      extras: selectedExtras,
      isTakeaway,
      notes: notes.trim() || undefined,
      finalPrice: unitPrice,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header con las 3 monedas */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
              <span>🍔</span> {burger.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="text-[10px] font-black text-black bg-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500">
                Base: ${burger.price.toFixed(2)} USD
              </span>
              <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                ${Math.round(burger.price * copRate).toLocaleString()} COP
              </span>
              <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {(burger.price * bsRate).toFixed(2)} Bs
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <IoClose className="text-xl" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Quantity & Takeaway Bar */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700">Cantidad:</span>
              <div className="flex items-center border border-gray-300 rounded-lg bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-1.5 hover:bg-gray-100 text-gray-700"
                >
                  <IoRemove className="text-xs" />
                </button>
                <span className="px-3 text-xs font-black">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="p-1.5 hover:bg-gray-100 text-gray-700"
                >
                  <IoAdd className="text-xs" />
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
              <input
                type="checkbox"
                checked={isTakeaway}
                onChange={(e) => setIsTakeaway(e.target.checked)}
                className="w-4 h-4 rounded text-yellow-500 focus:ring-yellow-400"
              />
              <span>📦 Para Llevar</span>
            </label>
          </div>

          {/* SECCIÓN CAMBIO DE PROTEÍNA PERSONALIZADA (Tarea 3) */}
          <div className="space-y-2.5 p-3 rounded-xl bg-amber-50/50 border border-yellow-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-gray-900 flex items-center gap-1.5">
                <span>🥩</span>
                <span>
                  {proteins.length === 1
                    ? 'Proteína de la Hamburguesa (Sencilla)'
                    : proteins.length === 2
                    ? 'Proteínas de la Hamburguesa (Doble - 2 Carnes)'
                    : 'Proteínas de la Hamburguesa (Triple - 3 Carnes)'}
                </span>
              </span>

              {/* Selector de número de carnes */}
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-300">
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleSetPattyCount(num)}
                    className={`px-2 py-0.5 text-[10px] font-black rounded transition-all ${
                      proteins.length === num
                        ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    {num === 1 ? '1 Carne' : num === 2 ? '2 Carnes' : '3 Carnes'}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-gray-600 font-medium leading-tight">
              {proteins.length === 1
                ? 'Puedes cambiar la proteína base de la hamburguesa:'
                : `Puedes cambiar cada una de las ${proteins.length} proteínas de forma independiente:`}
            </p>

            <div className="space-y-2">
              {proteins.map((currentProtein, slotIndex) => (
                <div key={slotIndex} className="bg-white p-2.5 rounded-xl border border-gray-200 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-black text-gray-800">
                      {proteins.length === 1 ? 'Proteína seleccionada:' : `Carne / Proteína #${slotIndex + 1}:`}
                    </span>
                    <span className="font-black text-black bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500 text-xs shadow-xs">
                      {currentProtein}
                    </span>
                  </div>

                  {/* Botones de selección de proteína */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-black text-left flex items-center gap-1.5 transition-all border ${
                            isSelected
                              ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02]'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                          }`}
                        >
                          <span>{prot.icon}</span>
                          <span className="truncate">{prot.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Base Ingredients (Tap to remove "SIN:") */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-black uppercase text-gray-700 tracking-wider">
                Ingredientes que trae (Toca para quitar "SIN"):
              </label>
              <span className="text-[10px] text-gray-400">Rojo = Se quita</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {baseIngredients.map((ing) => {
                const isRemoved = removedIngredients.includes(ing);
                return (
                  <button
                    key={ing}
                    type="button"
                    onClick={() => toggleRemoveBase(ing)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border ${
                      isRemoved
                        ? 'bg-red-50 text-red-700 border-red-300 line-through'
                        : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {isRemoved && <IoCloseCircle className="text-red-600 text-xs" />}
                    <span>{isRemoved ? `SIN ${ing}` : ing}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Available Extras (Tap to add "EXTRA:") */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-black uppercase text-gray-700 tracking-wider">
                Adicionales & Extras:
              </label>
              <span className="text-[10px] text-gray-400">Amarillo = Agregado</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {availableExtras.map((extra) => {
                const isSelected = selectedExtras.some((e) => e.name === extra.name);
                const price = getExtraPrice(extra);

                return (
                  <button
                    key={extra.id}
                    type="button"
                    onClick={() => toggleExtra(extra)}
                    className={`p-2 rounded-xl text-left text-xs font-bold transition-all border flex items-center justify-between ${
                      isSelected
                        ? 'bg-yellow-100 border-yellow-500 text-black shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="truncate">
                      <span>{extra.name}</span>
                    </div>
                    <span className={`text-[11px] font-black shrink-0 ${isSelected ? 'text-black' : 'text-gray-500'}`}>
                      +${price.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preparation Notes */}
          <div>
            <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1">
              Notas de preparación (Cocina):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Carne bien cocida, aderezo aparte..."
              className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 font-semibold"
            />
          </div>
        </div>

        {/* Footer con las 3 monedas */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2 shrink-0">
          <div>
            <span className="text-[10px] text-gray-500 block uppercase font-bold">Total a sumar:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-black text-black">${totalPrice.toFixed(2)} USD</span>
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                ${Math.round(totalPrice * copRate).toLocaleString()} COP
              </span>
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {(totalPrice * bsRate).toFixed(2)} Bs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 flex items-center gap-1 shadow-sm transition-all active:scale-[0.98]"
            >
              <IoCheckmark className="text-base" />
              <span>AGREGAR ({quantity})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
