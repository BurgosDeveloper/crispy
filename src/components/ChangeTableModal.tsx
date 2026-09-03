import React, { useState } from 'react';
import { IoClose, IoSwapHorizontal, IoCheckmarkCircle, IoWarning } from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order } from '../data/mockData';

interface ChangeTableModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newTableNumber: number) => void;
}

export const ChangeTableModal: React.FC<ChangeTableModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { tables, orders, changeOrderTable } = useApp();
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !order || order.type !== 'mesa') return null;

  // Active table numbers with orders (excluding this current order)
  const occupiedTableNumbers = new Set(
    orders
      .filter(
        (o) =>
          o.type === 'mesa' &&
          o.tableNumber &&
          o.id !== order.id &&
          o.status !== 'cancelado' &&
          o.status !== 'fusionada' &&
          o.status !== 'entregada' &&
          o.paymentStatus !== 'pagado' &&
          o.paymentStatus !== 'credito'
      )
      .map((o) => o.tableNumber!)
  );

  const handleConfirmChange = async () => {
    if (!selectedTableNumber) {
      setError('Por favor seleccione una mesa de destino.');
      return;
    }
    if (selectedTableNumber === order.tableNumber) {
      setError('La comanda ya se encuentra en esta mesa.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await changeOrderTable(order.id, selectedTableNumber);
      if (onSuccess) onSuccess(selectedTableNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo trasladar la comanda a la mesa seleccionada.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white border border-gray-300 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-black">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2.5 text-black font-black text-base sm:text-lg">
            <IoSwapHorizontal className="text-2xl text-yellow-500" />
            <span className="tracking-wide">REUBICAR / CAMBIAR MESA</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
          >
            <IoClose size={22} />
          </button>
        </div>

        {/* Info Comanda Actual */}
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-gray-500 font-bold block text-[10px] uppercase tracking-wider">Comanda en Salón:</span>
            <span className="text-sm font-black text-black">#{order.orderNumber}</span>
            <span className="text-gray-600 font-bold ml-2">({order.customerName || 'Cliente General'})</span>
          </div>
          <div className="text-right">
            <span className="text-gray-500 font-bold block text-[10px] uppercase tracking-wider">Mesa Actual:</span>
            <span className="text-xs font-black text-black bg-yellow-400 border border-yellow-500 px-2 py-0.5 rounded-lg shadow-xs">
              Mesa #{order.tableNumber}
            </span>
          </div>
        </div>

        {/* Selector de Nueva Mesa */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-700 block uppercase tracking-wider">
            Seleccione la Nueva Mesa de Destino:
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
            {tables
              .sort((a, b) => a.number - b.number)
              .map((table) => {
                const isCurrentTable = table.number === order.tableNumber;
                const isOccupiedByOther = occupiedTableNumbers.has(table.number);
                const isSelected = selectedTableNumber === table.number;

                return (
                  <button
                    key={table.id || table.number}
                    type="button"
                    disabled={isCurrentTable || isOccupiedByOther}
                    onClick={() => {
                      setSelectedTableNumber(table.number);
                      setError('');
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                      isCurrentTable
                        ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed'
                        : isOccupiedByOther
                        ? 'bg-red-50 border-red-200 text-red-600 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'bg-yellow-400 text-black border-yellow-500 font-black shadow-xs'
                        : 'bg-white border-gray-300 text-gray-900 hover:bg-yellow-50 hover:border-yellow-400'
                    }`}
                  >
                    <span className="text-sm font-black">Mesa #{table.number}</span>
                    <span className="text-[10px] font-bold">
                      {isCurrentTable
                        ? '(Actual)'
                        : isOccupiedByOther
                        ? 'Ocupada'
                        : `${table.capacity || 2} pers.`}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Resumen del Traslado */}
        {selectedTableNumber && selectedTableNumber !== order.tableNumber && (
          <div className="p-3 rounded-xl bg-amber-50 border border-yellow-300 text-xs text-black flex items-center justify-between">
            <span className="font-bold">Trasladar Comanda #{order.orderNumber}:</span>
            <div className="flex items-center gap-2 font-black">
              <span className="text-gray-600">Mesa #{order.tableNumber}</span>
              <span>➔</span>
              <span className="text-black bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500 text-xs">Mesa #{selectedTableNumber}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-xl bg-red-100 border border-red-300 text-xs font-bold text-red-800 flex items-center gap-2">
            <IoWarning className="text-base shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmChange}
            disabled={!selectedTableNumber || selectedTableNumber === order.tableNumber || isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all border border-yellow-500"
          >
            <IoCheckmarkCircle className="text-base" />
            <span>{isSubmitting ? 'Trasladando...' : 'Confirmar Traslado'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
