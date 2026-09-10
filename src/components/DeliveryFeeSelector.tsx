import React from 'react';
import { IoBicycleOutline } from 'react-icons/io5';
import { roundCOP } from '../utils/currencyRounding';

interface DeliveryFeeSelectorProps {
  value?: number;
  valueUSD?: number;
  onChange: (fee: number) => void;
  exchangeRates?: { COP: number; Bs: number };
  label?: string;
  required?: boolean;
  className?: string;
  suggestedFees?: number[];
}

const DEFAULT_SUGGESTIONS = [1, 1.5, 2, 2.5, 3, 4, 5];

export const DeliveryFeeSelector: React.FC<DeliveryFeeSelectorProps> = ({
  value,
  valueUSD,
  onChange,
  exchangeRates = { COP: 3950, Bs: 36.5 },
  label = 'Costo de Envío Delivery:',
  required = true,
  className = '',
  suggestedFees = DEFAULT_SUGGESTIONS,
}) => {
  const currentVal = value !== undefined ? value : (valueUSD !== undefined ? valueUSD : 0);
  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val) || val < 0) {
      onChange(0);
    } else {
      onChange(Number(val.toFixed(2)));
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header con monto y conversiones */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <IoBicycleOutline className="text-yellow-600 text-base shrink-0" />
          <span className="text-xs font-black uppercase text-gray-800 tracking-wide">
            {label}
          </span>
          {required && <span className="text-red-500 font-black text-xs">*</span>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 hidden sm:inline">
            ≈ {roundCOP(currentVal * copRate).toLocaleString()} COP | {(currentVal * bsRate).toFixed(2)} Bs
          </span>
          <span className="text-xs font-black text-black bg-yellow-400 px-2.5 py-1 rounded-xl border border-yellow-500 shadow-2xs">
            ${currentVal.toFixed(2)} USD
          </span>
        </div>
      </div>

      {/* Botones sugeridos + Input editable manual */}
      <div className="flex flex-wrap items-center gap-1.5">
        {suggestedFees.map((fee) => {
          const isSelected = currentVal === fee;
          return (
            <button
              key={fee}
              type="button"
              onClick={() => onChange(fee)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-yellow-400 border-yellow-500 text-black shadow-xs scale-[1.03]'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400'
              }`}
            >
              ${fee.toFixed(fee % 1 === 0 ? 0 : 2)}
            </button>
          );
        })}

        {/* Input para monto manual personalizado */}
        <div className="relative flex items-center">
          <span className="absolute left-2.5 text-xs font-black text-gray-400 pointer-events-none">$</span>
          <input
            type="number"
            step="0.25"
            min="0"
            placeholder="Otro..."
            value={currentVal > 0 && !suggestedFees.includes(currentVal) ? currentVal : ''}
            onChange={handleInputChange}
            className={`w-24 pl-6 pr-2 py-1 text-xs font-black rounded-xl border outline-none transition-all ${
              currentVal > 0 && !suggestedFees.includes(currentVal)
                ? 'bg-yellow-100/60 border-yellow-500 text-black font-black ring-1 ring-yellow-400'
                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400'
            }`}
            title="Ingrese un monto manual personalizado si no está en las sugerencias"
          />
        </div>
      </div>
    </div>
  );
};
