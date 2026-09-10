import React, { useState, useEffect } from 'react';
import { Product } from '../../data/mockData';
import { roundCOP } from '../../utils/currencyRounding';
import { IoClose, IoAdd, IoRemove, IoCheckmark } from 'react-icons/io5';

interface DrinkSelectorModalProps {
  drink: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: {
    drink: Product;
    quantity: number;
    sugarPreference?: string;
    isTakeaway: boolean;
    notes?: string;
    flavor?: string;
  }) => void;
  defaultTakeaway?: boolean;
  exchangeRates?: { COP: number; Bs: number };
}

const SUGAR_OPTIONS = ['Con azúcar', 'Sin azúcar', 'Poca azúcar'];

export const DrinkSelectorModal: React.FC<DrinkSelectorModalProps> = ({
  drink,
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  exchangeRates = { COP: 3950, Bs: 36.5 },
}) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [sugarPreference, setSugarPreference] = useState<string>('Con azúcar');
  const [isTakeaway, setIsTakeaway] = useState<boolean>(defaultTakeaway);
  const [notes, setNotes] = useState<string>('');
  const [selectedFlavor, setSelectedFlavor] = useState<string>('');

  useEffect(() => {
    if (drink) {
      setQuantity(1);
      setSugarPreference('Con azúcar');
      setIsTakeaway(defaultTakeaway);
      setNotes('');
      setSelectedFlavor(drink.flavors && drink.flavors.length > 0 ? drink.flavors[0] : '');
    }
  }, [drink, defaultTakeaway]);

  if (!isOpen || !drink) return null;
  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  const isJugo = drink.drinkType === 'jugo';
  const totalPrice = drink.price * quantity;
  const isFlavorRequired = Boolean(drink.flavors && drink.flavors.length > 0);
  const isAddDisabled = isFlavorRequired && !selectedFlavor;

  const handleSave = () => {
    if (isAddDisabled) return;
    onConfirm({
      drink,
      quantity,
      sugarPreference: isJugo ? sugarPreference : undefined,
      isTakeaway,
      notes: notes.trim() || undefined,
      flavor: isFlavorRequired ? selectedFlavor : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header con las 3 monedas */}
        <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-black text-base sm:text-lg text-gray-950 flex items-center gap-2">
              <span className="text-xl">🥤</span> {drink.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-xs font-black text-black bg-yellow-400 px-2 py-0.5 rounded-lg border border-yellow-500 shadow-2xs">
                ${drink.price.toFixed(2)} USD
              </span>
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                ${roundCOP(drink.price * copRate).toLocaleString()} COP
              </span>
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                {(drink.price * bsRate).toFixed(2)} Bs
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-200 text-gray-600 transition-colors cursor-pointer border border-gray-200"
          >
            <IoClose className="text-2xl" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Quantity & Takeaway */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2.5">
              <span className="text-xs sm:text-sm font-black text-gray-800">Cantidad:</span>
              <div className="flex items-center border border-gray-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-1.5 hover:bg-gray-100 text-gray-800 font-black text-sm cursor-pointer"
                >
                  <IoRemove />
                </button>
                <span className="px-3 text-sm sm:text-base font-black text-black">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 py-1.5 hover:bg-gray-100 text-gray-800 font-black text-sm cursor-pointer"
                >
                  <IoAdd />
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-black text-gray-800">
              <input
                type="checkbox"
                checked={isTakeaway}
                onChange={(e) => setIsTakeaway(e.target.checked)}
                className="w-4 h-4 rounded text-yellow-500 focus:ring-yellow-400"
              />
              <span>📦 Para Llevar</span>
            </label>
          </div>

          {/* Flavor / Subtype selector */}
          {drink.flavors && drink.flavors.length > 0 && (
            <div>
              <label className="block text-xs font-black uppercase text-gray-800 tracking-wider mb-2">
                Sabor / Subtipo:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {drink.flavors.map((flavor) => {
                  const isSelected = selectedFlavor === flavor;
                  return (
                    <button
                      key={flavor}
                      type="button"
                      onClick={() => setSelectedFlavor(flavor)}
                      className={`py-2 px-2.5 text-center rounded-xl text-xs sm:text-sm font-black transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02]'
                          : 'bg-stone-50 text-gray-800 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}{flavor}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sugar Preference for Fresh Juices */}
          {isJugo && (
            <div>
              <label className="block text-xs font-black uppercase text-gray-800 tracking-wider mb-2">
                Preferencia de Azúcar:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SUGAR_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSugarPreference(opt)}
                    className={`py-2.5 px-2 text-center rounded-xl text-xs sm:text-sm font-black transition-all border cursor-pointer ${
                      sugarPreference === opt
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs scale-[1.02]'
                        : 'bg-stone-50 text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-black uppercase text-gray-800 tracking-wider mb-1.5">
              Indicaciones especiales:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Con hielo, bien frío..."
              className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 font-bold shadow-2xs"
            />
          </div>
        </div>

        {/* Footer con las 3 monedas */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2.5">
          <div>
            <span className="text-[11px] text-gray-500 block uppercase font-bold">Total a sumar:</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg sm:text-xl font-black text-black">${totalPrice.toFixed(2)} USD</span>
              <span className="text-xs font-bold text-gray-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200">
                ${roundCOP(totalPrice * copRate).toLocaleString()} COP
              </span>
              <span className="text-xs font-bold text-gray-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200">
                {(totalPrice * bsRate).toFixed(2)} Bs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isAddDisabled}
              className={`px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all ${
                isAddDisabled
                  ? 'bg-gray-200 text-gray-400 border-2 border-gray-300 cursor-not-allowed'
                  : 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-[0.98] cursor-pointer'
              }`}
            >
              <IoCheckmark className="text-lg" />
              <span>AGREGAR ({quantity})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
