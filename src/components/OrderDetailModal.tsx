import React, { useState } from 'react';
import { Order } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { reportService } from '../services/reportService';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote } from '../utils/burgerProteins';
import { IoClose, IoReceiptOutline, IoPersonOutline, IoCheckmarkCircleOutline, IoBicycleOutline, IoPrintOutline, IoCashOutline } from 'react-icons/io5';

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
}) => {
  const { reprintKitchenOrder, printOrderReceipt } = useApp();
  const [isReprinting, setIsReprinting] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [reprintMessage, setReprintMessage] = useState('');

  if (!isOpen || !order) return null;

  const handlePrintReceipt = async () => {
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
  const totalCOP = roundCOP(totalUSD * exchangeRates.COP);
  const totalBs = (totalUSD * exchangeRates.Bs).toFixed(2);

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Plano Crispy */}
        <div className="bg-white border-b border-gray-200 text-black p-4 sm:p-5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center font-black shrink-0 text-black">
              <IoReceiptOutline size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black tracking-tight text-black">
                  {isSelectableMode ? 'Seleccionar Productos a Cobrar' : `Comanda #${cleanOrderNumber}`}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-yellow-400 border border-yellow-500 text-[11px] font-black uppercase text-black tracking-wider shadow-xs">
                  {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : order.type}
                </span>
              </div>
              <p className="text-xs font-bold flex items-center gap-1.5 mt-0.5 text-gray-600">
                <IoPersonOutline className="text-sm" />
                <span>Cliente: {order.customerName || (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-700 transition-all cursor-pointer shrink-0"
            title="Cerrar ventana"
          >
            <IoClose size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
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
                  className={`p-4 rounded-2xl border transition-all ${
                    isPaidIndividually
                      ? 'bg-slate-100 border-slate-300 opacity-60'
                      : isSelected
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-md ring-2 ring-emerald-400/40'
                      : 'bg-white border-slate-200 hover:border-emerald-400 shadow-sm'
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
                          <span className="font-black text-slate-900 text-base md:text-lg">
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
                    <span className="font-black text-base md:text-lg text-emerald-700 shrink-0">
                      ${itemTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Half and half details */}
                  {item.isHalfHalf && item.halfDetails && (
                    <div className="mt-3 pl-3.5 border-l-4 border-amber-500 bg-amber-50/90 rounded-r-2xl p-3 space-y-1.5 text-xs text-slate-900">
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

                  {/* Regular pizza/item extras & removed ingredients */}
                  {!item.isHalfHalf && (
                    <>
                      {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                        <div className="text-xs font-black pl-2 mt-1 text-amber-800 bg-yellow-50 px-2 py-0.5 rounded-lg border border-yellow-200 inline-block">
                          🥩 Proteína(s): {item.proteins.join(' + ')}
                        </div>
                      )}
                      {item.removedIngredients && item.removedIngredients.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1.5 text-red-600">
                          🚫 Sin: {item.removedIngredients.join(', ')}
                        </div>
                      )}
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-xs font-bold pl-2 mt-1.5 text-emerald-700">
                          {item.category && item.category !== 'Pizzas' && item.category !== 'Hamburguesas' ? '🥗 Contorno(s):' : '➕ ADD:'} {item.extras.map(e => `${e.name}${e.price > 0 ? ` (+$${e.price.toFixed(2)})` : ''}`).join(', ')}
                        </div>
                      )}
                    </>
                  )}

                  {item.sugarPreference && (
                    <div className="text-xs font-black pl-2 mt-1.5 text-sky-800">
                      🥤 Preferencia: {item.sugarPreference}
                    </div>
                  )}

                  {getCleanItemNote(item.notes) && (
                    <div className="text-xs font-semibold italic pl-2 mt-1.5 text-slate-600">
                      📝 Nota: "{getCleanItemNote(item.notes)}"
                    </div>
                  )}
                </div>
              );
            })}

            {/* Servicio de Delivery */}
            {order.type === 'delivery' && (order.deliveryFeeUSD || 0) > 0 && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-sky-100 border border-sky-300 text-sky-900 font-black text-xs flex items-center gap-1">
                    <IoBicycleOutline /> 1x
                  </span>
                  <span className="font-black text-slate-900 text-base md:text-lg">Servicio Delivery</span>
                </div>
                <span className="font-black text-base md:text-lg text-emerald-700">
                  ${order.deliveryFeeUSD!.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Kitchen notes */}
          {order.kitchenNotes && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs shadow-sm">
              <span className="font-black uppercase tracking-wider block mb-1 text-amber-900">
                📝 Observaciones Generales de Cocina:
              </span>
              <p className="font-bold text-slate-800">{order.kitchenNotes}</p>
            </div>
          )}

          {/* Resumen Financiero Claro y Limpio con 3 Monedas */}
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/40 border border-yellow-300 space-y-2.5 shadow-xs">
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
            <div className="border-t border-yellow-200 pt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="font-black text-xs uppercase text-gray-600 block">
                  Total de la Comanda:
                </span>
                <div className="text-3xl font-black text-black tracking-tight">
                  ${totalUSD.toFixed(2)} <span className="text-xs font-black uppercase text-black bg-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500 shadow-xs">USD</span>
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

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-200 flex flex-wrap justify-between items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs transition-all cursor-pointer border border-gray-300 shadow-xs"
            >
              CERRAR
            </button>

            {/* BOTÓN PRE-CUENTA CLIENTE */}
            <button
              type="button"
              onClick={handlePrintReceipt}
              disabled={isPrintingReceipt}
              className="px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center gap-1.5 border border-yellow-500 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              title="Emitir pre-cuenta con todos los productos y las 3 monedas para el cliente"
            >
              <IoPrintOutline className="text-base" />
              <span>{isPrintingReceipt ? 'IMPRIMIENDO...' : '🧾 PRE-CUENTA CLIENTE'}</span>
            </button>

            {onPayOrder && order.paymentStatus !== 'pagado' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPayOrder(order);
                }}
                className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center gap-1.5 border border-yellow-500 transition-all cursor-pointer shadow-xs"
              >
                <IoCashOutline className="text-base" />
                <span>💳 COBRAR (${(order.totalUSD - (order.paidAmountUSD || 0)).toFixed(2)} USD)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReprint}
              disabled={isReprinting}
              className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 hover:text-black font-black text-xs flex items-center gap-1.5 border border-gray-300 transition-all cursor-pointer shadow-xs"
            >
              <IoPrintOutline className="text-base" />
              <span>{isReprinting ? 'ENVIANDO...' : '🖨️ REIMPRIMIR COCINA'}</span>
            </button>
            {reprintMessage && (
              <span className="text-xs font-bold text-green-700 animate-in fade-in">
                {reprintMessage}
              </span>
            )}
          </div>

          {isSelectableMode && onConfirmItemSelection && (
            <button
              onClick={() => {
                onConfirmItemSelection();
                onClose();
              }}
              disabled={selectedItemIds.length === 0}
              className="px-5 py-2 rounded-xl font-black text-xs md:text-sm shadow-xs transition-all flex items-center gap-2 cursor-pointer bg-yellow-400 hover:bg-yellow-500 border border-yellow-500 text-black disabled:opacity-50"
            >
              <IoCheckmarkCircleOutline className="text-xl" />
              <span>CONTINUAR CON COBRO (${selectedTotalUSD.toFixed(2)} USD)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

