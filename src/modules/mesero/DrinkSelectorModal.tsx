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

  useEffect(() => {
    if (drink) {
      setQuantity(1);
      setSugarPreference('Con azúcar');
      setIsTakeaway(defaultTakeaway);
      setNotes('');
    }
  }, [drink, defaultTakeaway]);

  if (!isOpen || !drink) return null;
  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  const isJugo = drink.drinkType === 'jugo';
  const totalPrice = drink.price * quantity;

  const handleSave = () => {
    onConfirm({
      drink,
      quantity,
      sugarPreference: isJugo ? sugarPreference : undefined,
      isTakeaway,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header con las 3 monedas */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
              <span>🥤</span> {drink.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="text-[10px] font-black text-black bg-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500">
                ${drink.price.toFixed(2)} USD
              </span>
              <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                ${roundCOP(drink.price * copRate).toLocaleString()} COP
              </span>
              <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {(drink.price * bsRate).toFixed(2)} Bs
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

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Quantity & Takeaway */}
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

          {/* Sugar Preference for Fresh Juices */}
          {isJugo && (
            <div>
              <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1.5">
                Preferencia de Azúcar:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {SUGAR_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSugarPreference(opt)}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all border ${
                      sugarPreference === opt
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs'
                        : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
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
            <label className="block text-[11px] font-black uppercase text-gray-700 tracking-wider mb-1">
              Indicaciones especiales:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Con hielo, bien frío..."
              className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 font-semibold"
            />
          </div>
        </div>

        {/* Footer con las 3 monedas */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] text-gray-500 block uppercase font-bold">Total:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-black text-black">${totalPrice.toFixed(2)} USD</span>
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                ${roundCOP(totalPrice * copRate).toLocaleString()} COP
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
