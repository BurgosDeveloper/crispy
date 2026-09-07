import React, { useState } from 'react';
import { Order } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { reportService } from '../services/reportService';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote } from '../utils/burgerProteins';
import {
  IoClose,
  IoReceiptOutline,
  IoPersonOutline,
  IoCheckmarkCircleOutline,
  IoBicycleOutline,
  IoPrintOutline,
  IoCashOutline,
  IoAdd,
  IoTrashOutline,
  IoSwapHorizontal,
  IoCheckmarkDone,
  IoLockClosedOutline,
  IoPeopleOutline,
} from 'react-icons/io5';

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  exchangeRates: { COP: number; Bs: number };
  isSelectableMode?: boolean;
  selectedItemIds?: string[];
  onToggleSelectItem?: (itemId: string) => void;
  onConfirmItemSelection?: () => void;
  onPayOrder?: (order: Order) => void;
  onAppendOrder?: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  onChangeTable?: (order: Order) => void;
  onSplitPayment?: (order: Order) => void;
  onToggleDelivered?: (order: Order) => void;
  onCancelOrder?: (order: Order) => void;
  onPrintReceipt?: (order: Order) => void;
  userRole?: 'admin' | 'caja' | 'mesero' | 'cocina';
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

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  exchangeRates,
  isSelectableMode = false,
  selectedItemIds = [],
  onToggleSelectItem,
  onConfirmItemSelection,
  onPayOrder,
  onAppendOrder,
  onEditOrder,
  onChangeTable,
  onSplitPayment,
  onToggleDelivered,
  onCancelOrder,
  onPrintReceipt,
  userRole,
}) => {
  const { reprintKitchenOrder, printOrderReceipt } = useApp();
  const [isReprinting, setIsReprinting] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [reprintMessage, setReprintMessage] = useState('');

  if (!isOpen || !order) return null;

  const handlePrintReceipt = async () => {
    if (onPrintReceipt) {
      onPrintReceipt(order);
      return;
    }
    setIsPrintingReceipt(true);
    setReprintMessage('');
    try {
      reportService.generatePreCuentaTicket(order, exchangeRates);
      if (printOrderReceipt) {
        await printOrderReceipt(order.id, 'caja');
        setReprintMessage('✅ Pre-cuenta enviada a Caja');
        setTimeout(() => setReprintMessage(''), 3000);
      }
    } catch (e: any) {
      setReprintMessage(`⚠️ Ticket abierto (${e.message || 'Sin impresora térmica'})`);
      setTimeout(() => setReprintMessage(''), 4000);
    } finally {
      setIsPrintingReceipt(false);
    }
  };

  const handleReprint = async () => {
    setIsReprinting(true);
    setReprintMessage('');
    try {
      await reprintKitchenOrder(order.id);
      setReprintMessage('✅ Enviado a cocina');
      setTimeout(() => setReprintMessage(''), 3000);
    } catch (e: any) {
      setReprintMessage(`⚠️ ${e.message || 'Error al imprimir'}`);
      setTimeout(() => setReprintMessage(''), 4000);
    } finally {
      setIsReprinting(false);
    }
  };

  const totalUSD = order.totalUSD || 0;
  const paidAmountUSD = order.paidAmountUSD || 0;
  const remainingUSD = Math.max(0, totalUSD - paidAmountUSD);
  const totalCOP = roundCOP(totalUSD * exchangeRates.COP);
  const totalBs = (totalUSD * exchangeRates.Bs).toFixed(2);

  const isPaid = order.paymentStatus === 'pagado';
  const isCredito = order.paymentStatus === 'credito';
  const isDelivered = order.status === 'entregada';
  const isPrepared = order.status === 'preparada';

  // Calculate sum of currently selected items if in selectable mode
  const selectedTotalUSD = order.items
    .filter((it) => selectedItemIds.includes(it.id))
    .reduce((sum, it) => {
      let price = it.price || 0;
      if (it.extras && Array.isArray(it.extras)) {
        price += it.extras.reduce((exS, ex) => exS + (ex.price || 0), 0);
      }
      return sum + price * (it.quantity || 1);
    }, 0);

  const cleanOrderNumber = order.orderNumber.toString().replace(/^#+/, '');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Plano Crispy */}
        <div className="bg-white border-b border-gray-200 text-black p-4 sm:p-5 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center font-black shrink-0 text-black">
              <IoReceiptOutline size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black tracking-tight text-black">
                  {isSelectableMode ? 'Seleccionar Productos a Cobrar' : `Comanda #${cleanOrderNumber}`}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-yellow-400 border border-yellow-500 text-[11px] font-black uppercase text-black tracking-wider shadow-xs">
                  {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : order.type}
                </span>
                {/* Badges de Estado */}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                    isDelivered
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : isPrepared
                      ? 'bg-green-100 text-green-900 border-green-300'
                      : 'bg-yellow-100 text-yellow-900 border-yellow-300 animate-pulse'
                  }`}
                >
                  {isDelivered ? '📦 ENTREGADA' : isPrepared ? '🔥 LISTA' : '⏳ EN COCINA'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                    isPaid
                      ? 'bg-green-100 text-green-900 border-green-300'
                      : isCredito
                      ? 'bg-yellow-100 text-yellow-900 border-yellow-400'
                      : 'bg-red-100 text-red-900 border-red-300'
                  }`}
                >
                  {isPaid ? '💳 PAGADO' : isCredito ? '⚠️ A CRÉDITO' : '❌ PENDIENTE PAGO'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold text-gray-600 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1">
                  <IoPersonOutline className="text-sm" />
                  <span>Cliente: {order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')}</span>
                </span>
                {order.createdAt && (
                  <span className="text-gray-500">
                    🕒 {formatOrderTime(order.createdAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-700 transition-all cursor-pointer shrink-0 ml-2"
            title="Cerrar ventana"
          >
            <IoClose size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          {isSelectableMode && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs md:text-sm font-bold flex items-center justify-between shadow-sm">
              <span className="text-emerald-950 font-bold">Selecciona los productos que pagará esta persona:</span>
              <span className="font-black px-3.5 py-1.5 rounded-xl text-xs md:text-sm bg-emerald-600 text-slate-900 border border-emerald-500 shadow-sm">
                Seleccionado: ${selectedTotalUSD.toFixed(2)} USD
              </span>
            </div>
          )}

          {/* List of Items */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 px-1">
              PRODUCTOS DEL PEDIDO ({order.items.length})
            </h4>
            {order.items.map((item, index) => {
              const itemTotal = (item.price || 0) * (item.quantity || 1);
              const isSelected = selectedItemIds.includes(item.id);
              const isPaidIndividually = item.isPaidIndividually;

              return (
                <div
                  key={item.id || index}
                  onClick={() => {
                    if (isSelectableMode && !isPaidIndividually && onToggleSelectItem) {
                      onToggleSelectItem(item.id);
                    }
                  }}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                    isPaidIndividually
                      ? 'bg-slate-100 border-slate-300 opacity-60'
                      : isSelected
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-md ring-2 ring-emerald-400/40'
                      : 'bg-white border-slate-200 hover:border-emerald-400 shadow-xs'
                  } ${isSelectableMode && !isPaidIndividually ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {isSelectableMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPaidIndividually}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (onToggleSelectItem && !isPaidIndividually) {
                              onToggleSelectItem(item.id);
                            }
                          }}
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 font-black text-xs">
                            {item.quantity}x
                          </span>
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            {item.productName}
                          </span>
                          {item.size && (
                            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-sky-100 border border-sky-300 text-sky-900">
                              {item.size}
                            </span>
                          )}
                          {isPaidIndividually && (
                            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900">
                              ✅ Pagado por {item.paidByName || 'Cliente'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="font-black text-sm sm:text-base text-emerald-700 shrink-0">
                      ${itemTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Half and half details */}
                  {item.isHalfHalf && item.halfDetails && (
                    <div className="mt-2.5 pl-3 border-l-4 border-amber-500 bg-amber-50/90 rounded-r-xl p-2.5 space-y-1 text-xs text-slate-900">
                      <div>
                        <span className="font-black text-amber-900">🍕 1ra Mitad:</span> <span className="font-bold text-slate-900">{item.halfDetails.half1Name || 'Mitad 1'}</span>
                        {item.halfDetails.half1Removed && item.halfDetails.half1Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-red-600">
                            🚫 Sin: {item.halfDetails.half1Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half1Extras && item.halfDetails.half1Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-emerald-700">
                            ➕ Extras: {item.halfDetails.half1Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="font-black text-amber-900">🍕 2da Mitad:</span> <span className="font-bold text-slate-900">{item.halfDetails.half2Name || 'Mitad 2'}</span>
                        {item.halfDetails.half2Removed && item.halfDetails.half2Removed.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-red-600">
                            🚫 Sin: {item.halfDetails.half2Removed.join(', ')}
                          </span>
                        )}
                        {item.halfDetails.half2Extras && item.halfDetails.half2Extras.length > 0 && (
                          <span className="font-bold block text-xs pl-3 text-emerald-700">
                            ➕ Extras: {item.halfDetails.half2Extras.map(e => e.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Regular item extras & removed ingredients */}
                  {!item.isHalfHalf && (
                    <>
                      {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                        <div className="text-xs font-black pl-2 mt-1 text-amber-800 bg-yellow-50 px-2 py-0.5 rounded-lg border border-yellow-200 inline-block">
                          🥩 Proteína(s): {item.proteins.join(' + ')}
                        </div>
                      )}
                      {item.removedIngredients && item.removedIngredients.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1 text-red-600">
                          🚫 Sin: {item.removedIngredients.join(', ')}
                        </div>
                      )}
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1 text-emerald-700">
                          {item.category && item.category !== 'Pizzas' && item.category !== 'Hamburguesas' ? '🥗 Contorno(s):' : '➕ ADD:'} {item.extras.map(e => `${e.name}${e.price > 0 ? ` (+$${e.price.toFixed(2)})` : ''}`).join(', ')}
                        </div>
                      )}
                    </>
                  )}

                  {item.sugarPreference && (
                    <div className="text-xs font-black pl-2 mt-1 text-sky-800">
                      🥤 Preferencia: {item.sugarPreference}
                    </div>
                  )}

                  {getCleanItemNote(item.notes) && (
                    <div className="text-xs font-semibold italic pl-2 mt-1 text-slate-600">
                      📝 Nota: "{getCleanItemNote(item.notes)}"
                    </div>
                  )}
                </div>
              );
            })}

            {/* Servicio de Delivery */}
            {order.type === 'delivery' && (order.deliveryFeeUSD || 0) > 0 && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-sky-100 border border-sky-300 text-sky-900 font-black text-xs flex items-center gap-1">
                    <IoBicycleOutline /> 1x
                  </span>
                  <span className="font-black text-slate-900 text-sm sm:text-base">Servicio Delivery</span>
                </div>
                <span className="font-black text-sm sm:text-base text-emerald-700">
                  ${order.deliveryFeeUSD!.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Kitchen notes */}
          {order.kitchenNotes && (
            <div className="p-3 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs shadow-xs">
              <span className="font-black uppercase tracking-wider block mb-1 text-amber-900">
                📝 Observaciones Generales de Cocina:
              </span>
              <p className="font-bold text-slate-800">{order.kitchenNotes}</p>
            </div>
          )}

          {/* Resumen Financiero Claro y Limpio con 3 Monedas */}
          <div className="p-4 rounded-2xl bg-amber-50/40 border border-yellow-300 space-y-2 shadow-xs">
            <div className="flex justify-between text-xs font-bold text-gray-600">
              <span>Subtotal Productos:</span>
              <span className="text-black font-black">${((order.totalUSD || 0) - (order.deliveryFeeUSD || 0)).toFixed(2)} USD</span>
            </div>
            {order.deliveryFeeUSD ? (
              <div className="flex justify-between text-xs font-bold text-gray-600">
                <span>Servicio Delivery:</span>
                <span className="text-black font-black">+${order.deliveryFeeUSD.toFixed(2)} USD</span>
              </div>
            ) : null}
            <div className="border-t border-yellow-200 pt-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="font-black text-xs uppercase text-gray-600 block">
                  Total de la Comanda:
                </span>
                <div className="text-2xl sm:text-3xl font-black text-black tracking-tight flex items-center gap-2">
                  <span>${totalUSD.toFixed(2)}</span>
                  <span className="text-xs font-black uppercase text-black bg-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500 shadow-xs">USD</span>
                  {paidAmountUSD > 0 && !isPaid && (
                    <span className="text-xs font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                      Pagado: ${paidAmountUSD.toFixed(2)} | Debe: ${remainingUSD.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-black text-gray-800 bg-white border border-gray-300 px-2.5 py-1 rounded-xl shadow-xs">
                  🇨🇴 {totalCOP.toLocaleString()} COP
                </span>
                <span className="text-xs font-black text-gray-800 bg-white border border-gray-300 px-2.5 py-1 rounded-xl shadow-xs">
                  🇻🇪 {totalBs} Bs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Barra de Acciones de Comanda */}
        <div className="p-3 sm:p-4 bg-white border-t border-gray-200 flex flex-col gap-2.5 shrink-0">
          {isSelectableMode ? (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs transition-all cursor-pointer border border-gray-300 shadow-xs"
              >
                CERRAR
              </button>

              {onConfirmItemSelection && (
                <button
                  onClick={() => {
                    onConfirmItemSelection();
                    onClose();
                  }}
                  disabled={selectedItemIds.length === 0}
                  className="px-5 py-2.5 rounded-xl font-black text-xs md:text-sm shadow-xs transition-all flex items-center gap-2 cursor-pointer bg-yellow-400 hover:bg-yellow-500 border border-yellow-500 text-black disabled:opacity-50"
                >
                  <IoCheckmarkCircleOutline className="text-xl" />
                  <span>CONTINUAR CON COBRO (${selectedTotalUSD.toFixed(2)} USD)</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* FILA 1: ACCIONES PRINCIPALES (COBRAR, ADICIONAR, X PERSONAS, ENTREGAR) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 1. COBRAR */}
                {onPayOrder && !isPaid ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onPayOrder(order);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-yellow-500 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Proceder al cobro de la comanda"
                  >
                    <IoCashOutline className="text-base" />
                    <span>COBRAR (${remainingUSD > 0 ? remainingUSD.toFixed(2) : totalUSD.toFixed(2)})</span>
                  </button>
                ) : isPaid ? (
                  <div className="py-2.5 px-3 rounded-xl bg-green-100 border border-green-300 text-green-900 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs">
                    <IoCashOutline className="text-base text-green-700" />
                    <span>PAGADO COMPLETO</span>
                  </div>
                ) : null}

                {/* 2. ADICIONAR PRODUCTOS */}
                {onAppendOrder && !isPaid && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAppendOrder(order);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-emerald-700 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Adicionar nuevos productos a esta comanda activa"
                  >
                    <IoAdd className="text-base" />
                    <span>➕ ADICIONAR</span>
                  </button>
                )}

                {/* 3. X PERSONAS (COBRO DIVIDIDO) */}
                {onSplitPayment && !isPaid && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSplitPayment(order);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border-2 border-blue-300 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                    title="Cobro dividido por personas o ítems individuales"
                  >
                    <IoPeopleOutline className="text-base" />
                    <span>👥 X PERSONAS</span>
                  </button>
                )}

                {/* 4. MARCAR ENTREGADA / REACTIVAR */}
                {onToggleDelivered && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDelivered) {
                        onClose();
                      }
                      onToggleDelivered(order);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 ${
                      !isDelivered
                        ? isPaid
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700 animate-pulse'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300'
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                    }`}
                    title={!isDelivered ? 'Marcar orden como entregada al cliente' : 'Reactivar comanda'}
                  >
                    {!isDelivered ? (
                      <>
                        <IoCheckmarkDone className="text-base" />
                        <span>📦 ENTREGAR</span>
                      </>
                    ) : (
                      <>
                        <IoSwapHorizontal className="text-base" />
                        <span>↩️ REACTIVAR</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* FILA 2: GESTIÓN, PRE-CUENTA, COCINA, CAMBIO DE MESA Y ANULACIÓN */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs transition-all cursor-pointer border border-gray-300 shadow-xs"
                  >
                    CERRAR
                  </button>

                  {/* PRE-CUENTA CLIENTE */}
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    disabled={isPrintingReceipt}
                    className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title="Emitir ticket de pre-cuenta térmica con las 3 monedas para el cliente"
                  >
                    <IoPrintOutline className="text-base" />
                    <span>{isPrintingReceipt ? 'IMPRIMIENDO...' : '🧾 PRE-CUENTA'}</span>
                  </button>

                  {/* REIMPRIMIR COCINA */}
                  <button
                    type="button"
                    onClick={handleReprint}
                    disabled={isReprinting}
                    className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-black font-black text-xs flex items-center gap-1.5 border border-gray-300 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    title="Reenviar comanda a la impresora térmica de cocina"
                  >
                    <IoPrintOutline className="text-base" />
                    <span>{isReprinting ? 'ENVIANDO...' : '🖨️ COCINA'}</span>
                  </button>

                  {/* EDITAR COMANDA */}
                  {onEditOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditOrder(order);
                      }}
                      className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Editar productos o notas de la comanda activa"
                    >
                      <span>✏️ EDITAR</span>
                      {userRole === 'caja' && <IoLockClosedOutline className="text-amber-500 text-xs" />}
                    </button>
                  )}

                  {/* CAMBIAR MESA */}
                  {onChangeTable && order.type === 'mesa' && !isPaid && !isDelivered && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onChangeTable(order);
                      }}
                      className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Reubicar orden a otra mesa del salón"
                    >
                      <IoSwapHorizontal className="text-base" />
                      <span>🔄 CAMBIAR MESA</span>
                    </button>
                  )}

                  {reprintMessage && (
                    <span className="text-xs font-bold text-green-700 animate-in fade-in">
                      {reprintMessage}
                    </span>
                  )}
                </div>

                {/* ANULAR COMANDA */}
                {onCancelOrder && (
                  <button
                    type="button"
                    onClick={() => onCancelOrder(order)}
                    className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-700 border border-red-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    title="Anular y cancelar esta comanda"
                  >
                    <IoTrashOutline className="text-sm" />
                    <span>🗑️ ANULAR</span>
                    {userRole === 'caja' && <IoLockClosedOutline className="text-amber-400 text-xs" />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
