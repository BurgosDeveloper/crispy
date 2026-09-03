import React from 'react';
import { Table, Order } from '../../data/mockData';
import {
  IoCar,
  IoWalk,
  IoAdd,
  IoEyeOutline,
  IoRestaurant,
  IoCashOutline,
} from 'react-icons/io5';

interface TableCompactGridProps {
  tables: Table[];
  orders: Order[];
  onSelectTarget: (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => void;
  onViewActiveOrder?: (order: Order) => void;
  onAppendOrder?: (order: Order) => void;
  onPayOrder?: (order: Order) => void;
  canPay?: boolean;
}

export const TableCompactGrid: React.FC<TableCompactGridProps> = ({
  tables,
  orders,
  onSelectTarget,
  onViewActiveOrder,
  onAppendOrder,
  onPayOrder,
  canPay = false,
}) => {
  const activeOrders = orders.filter(
    (o) =>
      o.status !== 'entregada' &&
      o.status !== 'cancelado' &&
      o.status !== 'fusionada' &&
      o.paymentStatus !== 'credito'
  );

  const occupiedCount = tables.filter((t) =>
    activeOrders.some((o) => o.tableNumber === t.number)
  ).length;

  return (
    <div className="flex flex-col h-full space-y-2.5">
      {/* Top Bar: Ultra-Compact Fast Actions (Delivery & PickUp chips) */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white border border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectTarget('delivery', undefined, 'Orden Delivery a Domicilio')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 transition-all shadow-sm active:scale-95"
            title="Crear nueva orden para delivery"
          >
            <IoCar className="text-sm" />
            <span>🛵 + DELIVERY</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTarget('pickup', undefined, 'Orden PickUp (Para Llevar)')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black hover:bg-gray-800 text-white font-black text-xs border border-black transition-all shadow-sm active:scale-95"
            title="Crear nueva orden para llevar"
          >
            <IoWalk className="text-sm" />
            <span>🛍️ + PICKUP</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            <span className="text-gray-600 font-bold">Libres: {tables.length - occupiedCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block border border-yellow-500" />
            <span className="text-black font-black">Ocupadas: {occupiedCount}</span>
          </div>
        </div>
      </div>

      {/* Compact Grid of Tables: auto-scales and fits without scroll */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 flex-1 auto-rows-fr">
        {tables.map((table) => {
          const activeOrder = activeOrders.find((o) => o.tableNumber === table.number);
          const isOccupied = !!activeOrder;
          const isReady = activeOrder?.status === 'preparada';

          return (
            <div
              key={table.id}
              className={`relative rounded-xl border p-2 flex flex-col justify-between transition-all select-none min-h-[95px] max-h-[135px] ${
                isOccupied
                  ? isReady
                    ? 'bg-yellow-200/80 border-yellow-500 shadow-md ring-2 ring-yellow-400'
                    : 'bg-yellow-50 border-yellow-400 shadow-sm'
                  : 'bg-white border-gray-200 hover:border-yellow-400 hover:bg-gray-50/80 shadow-sm cursor-pointer'
              }`}
              onClick={() => {
                if (!isOccupied) {
                  onSelectTarget('mesa', table.number, `Mesa #${table.number}`);
                }
              }}
            >
              {/* Top Row: Table Number & Status Pill */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <IoRestaurant className={`text-xs ${isOccupied ? 'text-black' : 'text-gray-400'}`} />
                  <span className="font-black text-sm text-gray-900">#{table.number}</span>
                </div>

                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    isOccupied
                      ? isReady
                        ? 'bg-green-600 text-white animate-pulse'
                        : 'bg-yellow-400 text-black border border-yellow-500'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {isOccupied ? (isReady ? '¡LISTA!' : 'OCUPADA') : 'LIBRE'}
                </span>
              </div>

              {/* Middle Section: Active Order info or Free prompt */}
              <div className="my-1">
                {isOccupied && activeOrder ? (
                  <div>
                    <div className="text-base font-black text-black leading-tight">
                      ${activeOrder.totalUSD.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-gray-600 truncate font-semibold">
                      {activeOrder.customerName || `Comanda #${activeOrder.orderNumber || ''}`}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-400 font-semibold">
                    Cap: {table.capacity} pers.
                  </div>
                )}
              </div>

              {/* Bottom Actions: If Occupied, provide compact action buttons */}
              {isOccupied && activeOrder ? (
                <div className="flex items-center gap-1 pt-1 border-t border-yellow-200/80 shrink-0">
                  {canPay && onPayOrder && activeOrder.paymentStatus !== 'pagado' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPayOrder(activeOrder);
                      }}
                      className="flex-1 py-1 rounded bg-yellow-400 hover:bg-yellow-500 text-black font-black text-[10px] flex items-center justify-center gap-0.5 border border-yellow-500 shadow-xs transition-all cursor-pointer"
                      title="Cobrar comanda de esta mesa"
                    >
                      <IoCashOutline className="text-xs" />
                      <span>Cobrar</span>
                    </button>
                  )}

                  {onAppendOrder && (!canPay || activeOrder.paymentStatus === 'pagado') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppendOrder(activeOrder);
                      }}
                      className="flex-1 py-1 rounded bg-yellow-400 hover:bg-yellow-500 text-black font-black text-[10px] flex items-center justify-center gap-0.5 shadow-sm transition-all cursor-pointer"
                      title="Adicionar productos a esta comanda"
                    >
                      <IoAdd className="text-xs" />
                      <span>+ Ítem</span>
                    </button>
                  )}

                  {canPay && onAppendOrder && activeOrder.paymentStatus !== 'pagado' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppendOrder(activeOrder);
                      }}
                      className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 transition-all cursor-pointer"
                      title="Adicionar productos a esta comanda"
                    >
                      <IoAdd className="text-xs" />
                    </button>
                  )}

                  {onViewActiveOrder && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewActiveOrder(activeOrder);
                      }}
                      className="p-1 rounded bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 transition-all cursor-pointer"
                      title="Ver detalle de comanda"
                    >
                      <IoEyeOutline className="text-xs" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-[9px] font-black text-yellow-600 uppercase text-center pt-1 border-t border-gray-100">
                  + Tomar Pedido
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
