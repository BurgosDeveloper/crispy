import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  inline?: boolean;
}

const SUGAR_OPTIONS = ['Con azúcar', 'Sin azúcar', 'Poca azúcar'];

export const DrinkSelectorModal: React.FC<DrinkSelectorModalProps> = ({
  drink,
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  exchangeRates = { COP: 3950, Bs: 36.5 },
  inline = false,
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

  // Granizados NO son jugos ajustables de azúcar, son solo sabores
  const isGranizado = /granizado/i.test(drink.name) || drink.drinkType === 'granizado';
  const isJugo = (drink.drinkType === 'jugo' || /jugo/i.test(drink.name)) && !isGranizado;

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

  const modalInner = (
    <div className={inline ? "flex flex-col h-full w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden select-none" : "bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl flex flex-col overflow-hidden"}>
      {/* 1. Header */}
      <header className={`bg-white text-gray-900 ${inline ? 'px-4 py-3' : 'px-5 py-3.5'} border-b-2 border-yellow-400 flex items-center justify-between shrink-0 shadow-xs`}>
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <span className={inline ? "text-2xl sm:text-3xl" : "text-2xl sm:text-3xl"}>
            {isGranizado ? '🍧' : '🥤'}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`${inline ? 'text-lg sm:text-xl font-black text-gray-950 tracking-wide' : 'text-base sm:text-lg font-black text-gray-950'}`}>
                {drink.name.toUpperCase()}
              </h2>
              <span className="bg-yellow-400 text-black text-xs px-2.5 py-0.5 rounded-xl font-black shadow-xs border border-yellow-500">
                ${drink.price.toFixed(2)} USD
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs font-bold text-gray-700 flex-wrap">
              <span>🇨🇴 {roundCOP(drink.price * copRate).toLocaleString()} COP</span>
              <span className="text-gray-400">•</span>
              <span>🇻🇪 {(drink.price * bsRate).toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 hover:text-black transition-colors cursor-pointer flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-2xs border border-gray-300"
          title={inline ? "Volver al catálogo" : "Cerrar"}
        >
          <IoClose className={inline ? "text-xl text-gray-700" : "text-2xl"} />
          <span className="hidden sm:inline">Volver al Menú</span>
        </button>
      </header>

      {/* 2. Body Scrollable */}
      <main className={`flex-1 min-h-0 overflow-y-auto ${inline ? 'p-3 sm:p-4 space-y-3' : 'p-4 sm:p-5 space-y-4'}`}>
        {/* Cantidad y Para Llevar */}
        <section className="bg-stone-50 p-3 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">Cantidad:</span>
            <div className="flex items-center border-2 border-yellow-400 rounded-xl bg-white shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3.5 py-1.5 hover:bg-yellow-100 text-gray-900 font-black text-sm cursor-pointer transition-colors"
              >
                <IoRemove />
              </button>
              <span className="px-3.5 text-sm sm:text-base font-black text-black">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="px-3.5 py-1.5 hover:bg-yellow-100 text-gray-900 font-black text-sm cursor-pointer transition-colors"
              >
                <IoAdd />
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-black text-gray-800 select-none bg-white px-3 py-1.5 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors shadow-2xs">
            <input
              type="checkbox"
              checked={isTakeaway}
              onChange={(e) => setIsTakeaway(e.target.checked)}
              className="w-4 h-4 rounded text-yellow-500 focus:ring-yellow-400 cursor-pointer"
            />
            <span>📦 Para Llevar</span>
          </label>
        </section>

        {/* Selector de Sabor / Subtipo */}
        {drink.flavors && drink.flavors.length > 0 && (
          <section className="bg-stone-50 p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
                <span>🍹</span>
                <span>SELECCIONA EL SABOR (OBLIGATORIO):</span>
              </span>
              {selectedFlavor && (
                <span className="text-xs font-black text-yellow-950 bg-yellow-400 px-2.5 py-0.5 rounded-lg border border-yellow-500 shadow-2xs">
                  ✓ {selectedFlavor}
                </span>
              )}
            </div>

            <div className={`grid ${drink.flavors.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'} gap-2`}>
              {drink.flavors.map((flavor) => {
                const isSelected = selectedFlavor === flavor;
                return (
                  <button
                    key={flavor}
                    type="button"
                    onClick={() => setSelectedFlavor(flavor)}
                    className={`py-3 px-3 text-center rounded-xl font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-md ring-2 ring-yellow-400 scale-[1.01]'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-yellow-50 hover:border-yellow-300'
                    }`}
                  >
                    {isSelected && <IoCheckmark className="text-base shrink-0" />}
                    <span className="truncate">{flavor}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Selector de Azúcar (SOLO PARA JUGOS NATURALES, NUNCA GRANIZADOS) */}
        {isJugo && (
          <section className="bg-stone-50 p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
            <span className="text-xs sm:text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
              <span>🥄</span>
              <span>PREFERENCIA DE AZÚCAR:</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {SUGAR_OPTIONS.map((opt) => {
                const isSelected = sugarPreference === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSugarPreference(opt)}
                    className={`py-2.5 px-2 text-center rounded-xl text-xs sm:text-sm font-black transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs font-black'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Indicaciones especiales / Notas */}
        <section className="bg-stone-50 p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-1.5">
          <label className="block text-xs sm:text-sm font-black uppercase text-gray-900 tracking-wider">
            Indicaciones especiales (opcional):
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Con bastante hielo, sin pitillo, bien frío..."
            className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 shadow-2xs placeholder-gray-400"
          />
        </section>
      </main>

      {/* 3. Footer */}
      <footer className={`bg-white text-gray-900 ${inline ? 'px-4 py-2.5' : 'p-4'} border-t-2 border-yellow-400 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg`}>
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            Total a sumar ({quantity} {quantity === 1 ? 'unidad' : 'unidades'}):
          </span>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className={`${inline ? 'text-xl sm:text-2xl' : 'text-xl'} font-black text-black`}>
              ${totalPrice.toFixed(2)} <span className="text-xs sm:text-sm font-bold text-gray-500">USD</span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇨🇴 {roundCOP(totalPrice * copRate).toLocaleString()} COP
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-700">
              🇻🇪 {(totalPrice * bsRate).toFixed(2)} Bs
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
            disabled={isAddDisabled}
            className={`px-6 py-3 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all ${
              isAddDisabled
                ? 'bg-gray-200 text-gray-400 border-2 border-gray-300 cursor-not-allowed'
                : 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-[0.98] cursor-pointer'
            }`}
          >
            <IoCheckmark className="text-xl" />
            <span>AGREGAR AL PEDIDO ({quantity})</span>
          </button>
        </div>
      </footer>
    </div>
  );

  if (inline) {
    return modalInner;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      {modalInner}
    </div>,
    document.body
  );
};
