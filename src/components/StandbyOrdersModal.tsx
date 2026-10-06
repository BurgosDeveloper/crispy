import React from 'react';
import { createPortal } from 'react-dom';
import {
  StandbyOrder,
  useStandbyOrders,
} from '../utils/standbyOrders';
import { roundCOP } from '../utils/currencyRounding';
import {
  IoClose,
  IoTrashOutline,
  IoPlay,
  IoPauseCircle,
  IoTimeOutline,
  IoAlertCircleOutline,
} from 'react-icons/io5';

interface StandbyOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder: (order: StandbyOrder) => void;
  exchangeRates?: { COP: number; Bs: number };
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const StandbyOrdersModal: React.FC<StandbyOrdersModalProps> = ({
  isOpen,
  onClose,
  onSelectOrder,
  exchangeRates = { COP: 3950, Bs: 36.5 },
}) => {
  const { standbyOrders, removeStandbyOrder, clearAllStandbyOrders } = useStandbyOrders();

  if (!isOpen) return null;

  const handleClearAll = () => {
    if (standbyOrders.length === 0) return;
    if (
      window.confirm(
        `¿Estás seguro de que deseas eliminar TODOS los ${standbyOrders.length} pedidos en espera? Esta acción no se puede deshacer.`
      )
    ) {
      clearAllStandbyOrders();
    }
  };

  const handleSelect = (order: StandbyOrder) => {
    onSelectOrder(order);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs select-none animate-in fade-in">
      <div className="relative w-full max-w-xl bg-white border border-gray-200 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Cabecera */}
        <div className="px-5 py-4 bg-yellow-400 border-b-2 border-yellow-500 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-black text-yellow-400 text-lg flex items-center justify-center shadow-xs">
              <IoPauseCircle />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-black text-black leading-tight flex items-center gap-2">
                <span>PEDIDOS EN ESPERA (STANDBY)</span>
                <span className="px-2 py-0.5 rounded-full bg-black text-yellow-300 text-xs font-black">
                  {standbyOrders.length}
                </span>
              </h3>
              <p className="text-[11px] font-bold text-black/70">
                Borradores pausados pendientes por confirmar y enviar a cocina
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-black/10 hover:bg-black/20 text-black transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <IoClose className="text-2xl" />
          </button>
        </div>

        {/* Barra de Acciones Globales */}
        {standbyOrders.length > 0 && (
          <div className="px-5 py-2.5 bg-stone-50 border-b border-gray-200 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-gray-500">
              Selecciona un pedido para terminarlo o descártalo si fue cancelado
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-black text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-red-200"
              title="Eliminar todos los pedidos en espera"
            >
              <IoTrashOutline className="text-sm" />
              <span>Vaciar todos</span>
            </button>
          </div>
        )}

        {/* Lista de Pedidos en Espera */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {standbyOrders.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto text-3xl">
                <IoPauseCircle />
              </div>
              <h4 className="text-base font-black text-gray-800">
                No hay pedidos en espera
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto font-medium">
                Cuando estés tomando un pedido y el cliente necesite esperar, toca el botón{' '}
                <strong className="text-black font-black">"Poner en Standby"</strong> en la pantalla de
                pedido para pausarlo aquí sin ocupar numeración de comanda.
              </p>
            </div>
          ) : (
            standbyOrders.map((ord) => {
              const copTotal = roundCOP(ord.totalUSD * (exchangeRates?.COP || 3950));
              const bsTotal = (ord.totalUSD * (exchangeRates?.Bs || 36.5)).toFixed(2);

              return (
                <div
                  key={ord.id}
                  className="p-3.5 rounded-2xl bg-white border-2 border-gray-200 hover:border-yellow-400 transition-all shadow-xs space-y-2.5"
                >
                  {/* Fila Superior: Tipo, Destino y Tiempo */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-gray-100 text-lg">
                        {ord.target.type === 'delivery'
                          ? '🛵'
                          : ord.target.type === 'pickup'
                          ? '🛍️'
                          : '🍽️'}
                      </span>
                      <div>
                        <div className="font-black text-sm text-gray-900 leading-tight">
                          {ord.target.title}
                          {ord.customerName ? ` • ${ord.customerName}` : ''}
                        </div>
                        <div className="text-[11px] text-gray-400 font-bold flex items-center gap-1">
                          <IoTimeOutline className="text-xs" />
                          <span>{formatRelativeTime(ord.createdAt)}</span>
                          <span>•</span>
                          <span>{ord.itemCount} ítem(s)</span>
                        </div>
                      </div>
                    </div>

                    {/* Total en Grande */}
                    <div className="text-right shrink-0">
                      <div className="text-base font-black text-black">
                        ${ord.totalUSD.toFixed(2)} USD
                      </div>
                      <div className="text-[10px] text-gray-500 font-bold">
                        ${copTotal.toLocaleString()} COP | {bsTotal} Bs
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Productos */}
                  <div className="bg-stone-50 p-2.5 rounded-xl border border-gray-100 text-xs space-y-1">
                    <div className="font-bold text-gray-700 leading-snug">
                      {ord.cartItems.map((it, idx) => (
                        <span key={it.id || idx}>
                          <strong className="text-black font-black">{it.quantity || 1}x</strong>{' '}
                          {it.productName}
                          {idx < ord.cartItems.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>

                    {ord.kitchenNotes && (
                      <div className="text-[11px] text-amber-900 font-bold italic pt-0.5 border-t border-gray-200/60">
                        Nota: "{ord.kitchenNotes}"
                      </div>
                    )}
                  </div>

                  {/* Botones de Acción */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Deseas descartar y eliminar este pedido en espera (${ord.target.title})?`
                          )
                        ) {
                          removeStandbyOrder(ord.id);
                        }
                      }}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-700 font-black text-xs transition-colors cursor-pointer border border-gray-200"
                      title="Eliminar este borrador de espera"
                    >
                      <IoTrashOutline className="text-base" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelect(ord)}
                      className="flex-1 py-2 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs sm:text-sm uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98] border border-yellow-500"
                    >
                      <IoPlay className="text-sm" />
                      <span>CONTINUAR / TERMINAR PEDIDO</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-stone-100 border-t border-gray-200 flex items-center justify-between shrink-0 text-xs text-gray-600 font-bold">
          <div className="flex items-center gap-1.5">
            <IoAlertCircleOutline className="text-base text-amber-600 shrink-0" />
            <span>Al abrir un pedido y enviarlo a cocina se le asignará su número de comanda oficial.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-black font-black border border-gray-300 transition-colors cursor-pointer shrink-0 ml-2"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
