import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DualPrintersConfig } from '../data/mockData';
import {
  IoClose,
  IoPrintOutline,
  IoRestaurantOutline,
  IoCardOutline,
  IoLayersOutline,
  IoCheckmarkCircle,
  IoAlertCircleOutline,
} from 'react-icons/io5';

interface PrinterSelectModalProps {
  isOpen: boolean;
  title?: string;
  jobDescription?: string;
  defaultTarget?: 'cocina' | 'caja' | 'ambas';
  onClose: () => void;
  onSelectPrinter: (target: 'cocina' | 'caja' | 'ambas') => Promise<void> | void;
}

export const PrinterSelectModal: React.FC<PrinterSelectModalProps> = ({
  isOpen,
  title = 'SELECCIONAR IMPRESORA DE DESTINO',
  jobDescription = '¿A cuál impresora térmica deseas enviar este documento?',
  defaultTarget = 'caja',
  onClose,
  onSelectPrinter,
}) => {
  const { getPrintersConfig } = useApp();
  const [printersConfig, setPrintersConfig] = useState<DualPrintersConfig | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<'cocina' | 'caja' | 'ambas'>(defaultTarget);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSelectedTarget(defaultTarget);
      void getPrintersConfig()
        .then((cfg) => setPrintersConfig(cfg))
        .catch(() => {});
    }
  }, [isOpen, defaultTarget, getPrintersConfig]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsPrinting(true);
    setError('');
    try {
      await onSelectPrinter(selectedTarget);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al enviar a la impresora seleccionada.');
    } finally {
      setIsPrinting(false);
    }
  };

  const cocina = printersConfig?.cocina;
  const caja = printersConfig?.caja;

  const cleanTitle = title.replace(/##+/g, '#');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none">
      <div className="relative w-full max-w-lg bg-white border-2 border-yellow-400 rounded-3xl p-6 shadow-2xl space-y-5 text-gray-900">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-yellow-100 border border-yellow-400 flex items-center justify-center text-black text-xl font-black shadow-xs">
              <IoPrintOutline />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">{cleanTitle}</h3>
              <p className="text-xs text-gray-600 font-bold">{jobDescription}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-600 hover:text-black transition-colors cursor-pointer"
          >
            <IoClose className="text-xl" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-300 text-red-700 text-xs font-bold flex items-center gap-2">
            <IoAlertCircleOutline className="text-lg text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* PRINTER OPTIONS */}
        <div className="space-y-3">
          {/* Opción 1: Impresora de Cocina */}
          <button
            type="button"
            onClick={() => setSelectedTarget('cocina')}
            className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
              selectedTarget === 'cocina'
                ? 'bg-amber-50 border-yellow-400 text-black shadow-md ring-2 ring-yellow-400'
                : 'bg-stone-50 border-gray-200 text-gray-800 hover:border-yellow-400 hover:bg-stone-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-100 border border-yellow-400 flex items-center justify-center text-black text-xl shadow-xs">
                <IoRestaurantOutline />
              </div>
              <div>
                <div className="font-black text-sm text-gray-900 flex items-center gap-2">
                  <span>🍳 IMPRESORA DE COCINA</span>
                  {cocina?.enabled ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold">(Deshabilitada)</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-600 font-mono font-bold">
                  {cocina?.host || '192.168.1.200'}:{cocina?.port || 9100}
                </div>
              </div>
            </div>
            {selectedTarget === 'cocina' && (
              <IoCheckmarkCircle className="text-2xl text-yellow-600" />
            )}
          </button>

          {/* Opción 2: Impresora de Caja */}
          <button
            type="button"
            onClick={() => setSelectedTarget('caja')}
            className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
              selectedTarget === 'caja'
                ? 'bg-emerald-50 border-emerald-500 text-black shadow-md ring-2 ring-emerald-400'
                : 'bg-stone-50 border-gray-200 text-gray-800 hover:border-emerald-400 hover:bg-stone-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-400 flex items-center justify-center text-emerald-800 text-xl shadow-xs">
                <IoCardOutline />
              </div>
              <div>
                <div className="font-black text-sm text-gray-900 flex items-center gap-2">
                  <span>💳 IMPRESORA DE CAJA</span>
                  {caja?.enabled ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
                  ) : (
                    <span className="text-[10px] text-red-600 font-bold">(Deshabilitada)</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-600 font-mono font-bold">
                  {caja?.host || '192.168.1.201'}:{caja?.port || 9100}
                </div>
              </div>
            </div>
            {selectedTarget === 'caja' && (
              <IoCheckmarkCircle className="text-2xl text-emerald-600" />
            )}
          </button>

          {/* Opción 3: Ambas Impresoras */}
          <button
            type="button"
            onClick={() => setSelectedTarget('ambas')}
            className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
              selectedTarget === 'ambas'
                ? 'bg-yellow-100/80 border-yellow-500 text-black shadow-md ring-2 ring-yellow-400'
                : 'bg-stone-50 border-gray-200 text-gray-800 hover:border-yellow-400 hover:bg-stone-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-200 border border-yellow-400 flex items-center justify-center text-black text-xl shadow-xs">
                <IoLayersOutline />
              </div>
              <div>
                <div className="font-black text-sm text-gray-900">
                  🖨️ IMPRIMIR EN AMBAS IMPRESORAS
                </div>
                <div className="text-[11px] text-gray-600 font-bold">
                  Envía el ticket tanto a Cocina como a Caja simultáneamente
                </div>
              </div>
            </div>
            {selectedTarget === 'ambas' && (
              <IoCheckmarkCircle className="text-2xl text-yellow-600" />
            )}
          </button>
        </div>

        {/* FOOTER BUTTONS */}
        <div className="pt-3 border-t border-gray-200 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 font-black text-xs transition-colors border border-gray-300 cursor-pointer"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPrinting}
            className="flex-1 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs shadow-md border-2 border-yellow-500 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <IoPrintOutline className="text-base" />
            <span>{isPrinting ? 'IMPRIMIENDO...' : 'CONFIRMAR E IMPRIMIR'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
