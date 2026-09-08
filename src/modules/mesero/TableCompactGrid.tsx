import React from 'react';
import { Table, Order } from '../../data/mockData';
import {
  IoCar,
  IoWalk,
  IoCashOutline,
  IoTimeOutline,
  IoCheckmarkDone,
} from 'react-icons/io5';

interface TableCompactGridProps {
  tables: Table[];
  orders: Order[];
  onSelectTarget: (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => void;
  onViewActiveOrder?: (order: Order) => void;
  onAppendOrder?: (order: Order) => void;
  onPayOrder?: (order: Order) => void;
  onMarkDelivered?: (order: Order) => void;
  onPrintReceipt?: (order: Order) => void;
  onViewHistory?: () => void;
  canPay?: boolean;
}

function cleanOrderNum(orderNumber?: string | number): string {
  if (!orderNumber) return '';
  return orderNumber.toString().replace(/^#+/, '');
}

function parseOrderNumberForSort(orderNumber?: string | number): number {
  if (!orderNumber) return 0;
  const match = orderNumber.toString().match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function formatOrderTime(dateValue?: string | Date): string {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const TableCompactGrid: React.FC<TableCompactGridProps> = ({
  tables,
  orders,
  onSelectTarget,
  onViewActiveOrder,
  onAppendOrder,
  onPayOrder,
  onMarkDelivered,
  onPrintReceipt,
  onViewHistory,
  canPay = false,
}) => {
  // Comandas activas en curso
  const activeOrders = orders.filter(
    (o) =>
      o.status !== 'cancelado' &&
      o.status !== 'fusionada' &&
      !(o.status === 'entregada' && (o.paymentStatus === 'pagado' || o.paymentStatus === 'credito'))
  );

  // Separación por tipo de servicio con orden ascendente (más antigua primero, ej: #35 antes de #40)
  const activeDeliveryOrders = activeOrders
    .filter((o) => o.type === 'delivery')
    .sort((a, b) => {
      const numA = parseOrderNumberForSort(a.orderNumber);
      const numB = parseOrderNumberForSort(b.orderNumber);
      if (numA && numB && numA !== numB) return numA - numB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const activePickupOrders = activeOrders
    .filter((o) => o.type === 'pickup' || (o.type as any) === 'llevar')
    .sort((a, b) => {
      const numA = parseOrderNumberForSort(a.orderNumber);
      const numB = parseOrderNumberForSort(b.orderNumber);
      if (numA && numB && numA !== numB) return numA - numB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const occupiedCount = tables.filter((t) =>
    activeOrders.some((o) => o.type === 'mesa' && o.tableNumber === t.number)
  ).length;

  return (
    <div className="flex flex-col h-full w-full space-y-2 select-none">
      {/* 1. BARRA SUPERIOR DE ACCIONES RÁPIDAS */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 shadow-xs shrink-0">
        {/* Indicadores de Mesas Libres / Ocupadas */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            <span className="text-gray-800 font-black">Libres: {tables.length - occupiedCount}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block border border-amber-500" />
            <span className="text-stone-900 font-black">Ocupadas: {occupiedCount}</span>
          </div>
        </div>

        {/* Botones de Acción: NUEVO DELIVERY (Azul), NUEVO PICK UP (Rojo), ULTIMOS PEDIDOS (Amarillo) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectTarget('delivery', undefined, 'Orden Delivery a Domicilio')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1d4ed8] hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Crear nuevo pedido delivery"
          >
            <IoCar className="text-sm" />
            <span>NUEVO DELIVERY</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTarget('pickup', undefined, 'Orden PickUp (Para Llevar)')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#b91c1c] hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Crear nuevo pedido para llevar"
          >
            <IoWalk className="text-sm" />
            <span>NUEVO PICK UP</span>
          </button>

          {onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#eab308] hover:bg-yellow-500 text-black font-black text-xs uppercase tracking-wider border border-yellow-500 transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Ver listado o historial de comandas"
            >
              <IoTimeOutline className="text-sm" />
              <span>ULTIMOS PEDIDOS</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. CUERPO PRINCIPAL DIVIDIDO EN 3 SECCIONES A PANTALLA COMPLETA */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2.5 overflow-hidden">
        {/* ========================================================= */}
        {/* SECCIÓN 1: MESAS (COLUMNA IZQUIERDA ~40-42%, 4 POR FILA)   */}
        {/* ========================================================= */}
        <div className="w-full lg:w-[42%] xl:w-[40%] flex flex-col min-h-0 bg-white/70 backdrop-blur-xs rounded-2xl border border-gray-200 p-2.5 overflow-hidden shadow-xs">
          <div className="text-center pb-1.5 shrink-0 border-b border-gray-100 mb-2 flex items-center justify-between px-1">
            <h3 className="font-black text-xs uppercase text-gray-700 tracking-widest">
              MESAS ({tables.length})
            </h3>
            <span className="text-[10px] font-bold text-gray-500">
              {occupiedCount} ocupadas
            </span>
          </div>

          {/* Cuadrícula de Mesas Compactas: 4 por fila */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-1.5 flex-1 overflow-y-auto pr-1">
            {tables.map((table) => {
              const activeOrder = activeOrders.find(
                (o) => o.type === 'mesa' && o.tableNumber === table.number
              );
              const isOccupied = !!activeOrder;
              const isReady = activeOrder?.status === 'preparada';

              return (
                <div
                  key={table.id}
                  onClick={() => {
                    if (!isOccupied) {
                      onSelectTarget('mesa', table.number, `Mesa #${table.number}`);
                    } else if (onViewActiveOrder && activeOrder) {
                      onViewActiveOrder(activeOrder);
                    }
                  }}
                  className={`relative rounded-xl border p-2 flex flex-col justify-between transition-all cursor-pointer select-none min-h-[86px] hover:shadow-md active:scale-[0.98] ${
                    isOccupied
                      ? isReady
                        ? 'bg-amber-300/90 border-amber-500 shadow-sm ring-2 ring-amber-400'
                        : 'bg-[#eab308] hover:bg-yellow-500 border-amber-500 shadow-xs text-stone-900'
                      : 'bg-[#e8f5e9] hover:bg-[#c8e6c9] border-[#a5d6a7] text-gray-800 shadow-xs'
                  }`}
                  title={
                    isOccupied
                      ? `Mesa #${table.number} - Comanda #${cleanOrderNum(activeOrder?.orderNumber)} ($${activeOrder?.totalUSD.toFixed(2)}) - Click para opciones`
                      : `Mesa #${table.number} - Libre (Click para tomar pedido)`
                  }
                >
                  {/* Cabecera: Nombre de Mesa */}
                  <div className="flex items-center justify-between leading-none">
                    <span className="font-black text-xs sm:text-sm tracking-tight text-stone-900 truncate">
                      Mesa {table.number}
                    </span>
                    {isOccupied && isReady && (
                      <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded bg-green-600 text-white animate-pulse">
                        ¡LISTA!
                      </span>
                    )}
                  </div>

                  {/* Cuerpo: Si ocupada muestra Comanda, Hora y Total */}
                  {isOccupied && activeOrder ? (
                    <div className="my-auto text-center py-0.5">
                      <div className="text-sm sm:text-base font-black text-stone-950 tracking-wider leading-none">
                        -#{cleanOrderNum(activeOrder.orderNumber)}-
                      </div>
                      <div className="text-[10px] sm:text-xs font-black text-stone-800 leading-tight mt-0.5">
                        {formatOrderTime(activeOrder.createdAt)}
                      </div>
                      <div className="text-xs sm:text-sm font-black text-stone-950 mt-0.5 leading-none">
                        ${activeOrder.totalUSD.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="my-auto text-center text-[10px] sm:text-xs font-bold text-emerald-800/70">
                      Cap: {table.capacity}p
                    </div>
                  )}

                  {/* Pie de Tarjeta: Info / Cobro rápido */}
                  {isOccupied && activeOrder ? (
                    <div className="flex items-center justify-between pt-1 border-t border-black/10 shrink-0 text-[10px] sm:text-xs">
                      <span className="font-bold text-stone-800 truncate">
                        {activeOrder.items.length} itm
                      </span>
                      {canPay && onPayOrder && activeOrder.paymentStatus !== 'pagado' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPayOrder(activeOrder);
                          }}
                          className="px-1.5 py-0.5 rounded bg-stone-900 hover:bg-black text-white font-black text-[10px] flex items-center gap-0.5 cursor-pointer shadow-xs active:scale-95"
                          title="Cobrar comanda directamente"
                        >
                          <span>Cobrar</span>
                        </button>
                      ) : (
                        <span className="font-black text-stone-900 uppercase text-[10px]">
                          {activeOrder.paymentStatus === 'pagado' ? 'PAGADO' : 'VER'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] sm:text-xs font-black text-emerald-800 text-center pt-1 border-t border-green-200 uppercase tracking-wide leading-none">
                      Libre
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECCIÓN 2 Y 3: DELIVERY Y PICKUP (COLUMNA DERECHA ~58-60%)*/}
        {/* ========================================================= */}
        <div className="w-full lg:w-[58%] xl:w-[60%] flex flex-col gap-2.5 min-h-0 overflow-hidden">
          {/* ------------------------------------------------------- */}
          {/* SECCIÓN 2: DELIVERY (ARRIBA DERECHA - COLOR AZUL)       */}
          {/* ------------------------------------------------------- */}
          <div className="flex-1 flex flex-col min-h-0 bg-white/70 backdrop-blur-xs rounded-2xl border border-blue-200 p-2.5 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-blue-100 mb-2 shrink-0">
              <span className="font-black text-xs uppercase text-blue-900 tracking-wider flex items-center gap-1.5">
                <IoCar className="text-sm text-blue-700" />
                <span>DELIVERY</span>
              </span>
              <span className="text-[11px] font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full border border-blue-200">
                {activeDeliveryOrders.length} activas
              </span>
            </div>

            {/* Rejilla de 4 comandas por fila */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 flex-1 overflow-y-auto pr-1">
              {activeDeliveryOrders.length === 0 ? (
                <div className="col-span-full h-full flex flex-col items-center justify-center text-center p-4 text-blue-400 text-xs font-bold">
                  <span>Sin pedidos delivery activos</span>
                </div>
              ) : (
                activeDeliveryOrders.map((ord) => {
                  const isReady = ord.status === 'preparada';
                  const isPaid = ord.paymentStatus === 'pagado';

                  return (
                    <div
                      key={ord.id}
                      onClick={() => {
                        if (onViewActiveOrder) onViewActiveOrder(ord);
                        else if (canPay && onPayOrder) onPayOrder(ord);
                      }}
                      className="rounded-xl p-2.5 bg-[#1d4ed8] hover:bg-blue-800 text-white shadow-xs border border-blue-900 transition-all cursor-pointer flex flex-col justify-between min-h-[118px] select-none hover:shadow-md active:scale-[0.98]"
                      title={`Comanda #${cleanOrderNum(ord.orderNumber)} - ${ord.customerName || 'Cliente'} - Click para opciones`}
                    >
                      {/* Cabecera */}
                      <div className="flex items-center justify-between leading-none pb-0.5">
                        <span className="font-black text-xs sm:text-sm uppercase tracking-wider text-blue-200 flex items-center gap-1.5">
                          <IoCar className="text-sm text-blue-300" /> Delivery
                        </span>
                        {isReady ? (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-500 text-white animate-pulse">
                            ¡LISTA!
                          </span>
                        ) : isPaid ? (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-400 text-stone-900">
                            PAGADO
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-black text-yellow-300">
                            ${ord.totalUSD.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Cuerpo */}
                      <div className="text-center py-1">
                        <div className="font-black text-lg sm:text-xl text-yellow-300 tracking-wider leading-none">
                          -#{cleanOrderNum(ord.orderNumber)}-
                        </div>
                        <div className="font-black text-sm sm:text-base truncate text-white mt-1 leading-tight" title={ord.customerName}>
                          {ord.customerName || 'Cliente Delivery'}
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-blue-200 mt-0.5 leading-none">
                          {formatOrderTime(ord.createdAt)}
                        </div>
                      </div>

                      {/* Pie con total y botones Cobrar y Entregar */}
                      <div className="flex items-center justify-between pt-1 border-t border-blue-700/60 shrink-0 gap-1 text-xs">
                        <span className="font-bold text-blue-100 truncate text-[11px] sm:text-xs">
                          {ord.items.length} {ord.items.length === 1 ? 'itm' : 'itms'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canPay && onPayOrder && !isPaid && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPayOrder(ord);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
                              title="Cobrar comanda"
                            >
                              <IoCashOutline className="text-sm" />
                              <span>Cobrar</span>
                            </button>
                          )}
                          {onMarkDelivered && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMarkDelivered(ord);
                              }}
                              className={`px-2.5 py-1 rounded-lg font-black text-xs flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95 ${
                                isPaid
                                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white ring-2 ring-emerald-300 animate-pulse'
                                  : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                              }`}
                              title="Marcar pedido como entregado"
                            >
                              <IoCheckmarkDone className="text-sm" />
                              <span>Entregar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ------------------------------------------------------- */}
          {/* SECCIÓN 3: PICKUP (ABAJO DERECHA - COLOR ROJO)          */}
          {/* ------------------------------------------------------- */}
          <div className="flex-1 flex flex-col min-h-0 bg-white/70 backdrop-blur-xs rounded-2xl border border-red-200 p-2.5 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-red-100 mb-2 shrink-0">
              <span className="font-black text-xs uppercase text-red-900 tracking-wider flex items-center gap-1.5">
                <IoWalk className="text-sm text-red-700" />
                <span>PICKUP</span>
              </span>
              <span className="text-[11px] font-black bg-red-100 text-red-900 px-2 py-0.5 rounded-full border border-red-200">
                {activePickupOrders.length} activas
              </span>
            </div>

            {/* Rejilla de 4 comandas por fila */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 flex-1 overflow-y-auto pr-1">
              {activePickupOrders.length === 0 ? (
                <div className="col-span-full h-full flex flex-col items-center justify-center text-center p-4 text-red-400 text-xs font-bold">
                  <span>Sin pedidos pickup activos</span>
                </div>
              ) : (
                activePickupOrders.map((ord) => {
                  const isReady = ord.status === 'preparada';
                  const isPaid = ord.paymentStatus === 'pagado';

                  return (
                    <div
                      key={ord.id}
                      onClick={() => {
                        if (onViewActiveOrder) onViewActiveOrder(ord);
                        else if (canPay && onPayOrder) onPayOrder(ord);
                      }}
                      className="rounded-xl p-2.5 bg-[#b91c1c] hover:bg-red-800 text-white shadow-xs border border-red-900 transition-all cursor-pointer flex flex-col justify-between min-h-[118px] select-none hover:shadow-md active:scale-[0.98]"
                      title={`Comanda #${cleanOrderNum(ord.orderNumber)} - ${ord.customerName || 'Cliente'} - Click para opciones`}
                    >
                      {/* Cabecera */}
                      <div className="flex items-center justify-between leading-none pb-0.5">
                        <span className="font-black text-xs sm:text-sm uppercase tracking-wider text-red-200 flex items-center gap-1">
                          <IoWalk className="text-sm text-red-300" /> Pickup
                        </span>
                        {isReady ? (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-500 text-white animate-pulse">
                            ¡LISTA!
                          </span>
                        ) : isPaid ? (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-400 text-stone-900">
                            PAGADO
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-black text-yellow-300">
                            ${ord.totalUSD.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Cuerpo */}
                      <div className="text-center py-1">
                        <div className="font-black text-lg sm:text-xl text-yellow-300 tracking-wider leading-none">
                          -#{cleanOrderNum(ord.orderNumber)}-
                        </div>
                        <div className="font-black text-sm sm:text-base truncate text-white mt-1 leading-tight" title={ord.customerName}>
                          {ord.customerName || 'Cliente Pickup'}
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-red-200 mt-0.5 leading-none">
                          {formatOrderTime(ord.createdAt)}
                        </div>
                      </div>

                      {/* Pie con total y botones Cobrar y Entregar */}
                      <div className="flex items-center justify-between pt-1 border-t border-red-700/60 shrink-0 gap-1 text-xs">
                        <span className="font-bold text-red-100 truncate text-[11px] sm:text-xs">
                          {ord.items.length} {ord.items.length === 1 ? 'itm' : 'itms'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canPay && onPayOrder && !isPaid && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPayOrder(ord);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
                              title="Cobrar comanda"
                            >
                              <IoCashOutline className="text-sm" />
                              <span>Cobrar</span>
                            </button>
                          )}
                          {onMarkDelivered && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMarkDelivered(ord);
                              }}
                              className={`px-2.5 py-1 rounded-lg font-black text-xs flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95 ${
                                isPaid
                                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white ring-2 ring-emerald-300 animate-pulse'
                                  : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                              }`}
                              title="Marcar pedido como entregado"
                            >
                              <IoCheckmarkDone className="text-sm" />
                              <span>Entregar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
