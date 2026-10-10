import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../data/mockData';
import { OrderDetailModal } from './OrderDetailModal';
import { roundCOP } from '../utils/currencyRounding';
import {
  IoSearchOutline,
  IoCalendarOutline,
  IoReceiptOutline,
  IoTimeOutline,
  IoAlertCircleOutline,
  IoPrintOutline,
  IoEyeOutline,
  IoPersonOutline,
  IoRefreshOutline,
} from 'react-icons/io5';

function formatDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

function formatDisplayDate(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export const HistoricalOrdersSearch: React.FC = () => {
  const { searchHistoricalOrders, exchangeRates, printOrderReceipt, reprintKitchenOrder, userSession } = useApp();

  // Search filter states
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to last 7 days
    d.setHours(0, 0, 0, 0);
    return formatDateInput(d);
  });
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return formatDateInput(d);
  });
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');

  // Results & UI state
  const [results, setResults] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [printFeedback, setPrintFeedback] = useState<{ id: string; msg: string; isError?: boolean } | null>(null);

  // Quick preset functions
  const handlePreset = (type: 'hoy' | 'ayer' | '3dias' | '7dias' | 'mes' | 'todos') => {
    const now = new Date();
    setSearchError('');

    if (type === 'hoy') {
      const d1 = new Date(now);
      d1.setHours(0, 0, 0, 0);
      const d2 = new Date(now);
      d2.setHours(23, 59, 59, 999);
      setFromDate(formatDateInput(d1));
      setToDate(formatDateInput(d2));
    } else if (type === 'ayer') {
      const d1 = new Date(now);
      d1.setDate(d1.getDate() - 1);
      d1.setHours(0, 0, 0, 0);
      const d2 = new Date(now);
      d2.setDate(d2.getDate() - 1);
      d2.setHours(23, 59, 59, 999);
      setFromDate(formatDateInput(d1));
      setToDate(formatDateInput(d2));
    } else if (type === '3dias') {
      const d1 = new Date(now);
      d1.setDate(d1.getDate() - 3);
      d1.setHours(0, 0, 0, 0);
      const d2 = new Date(now);
      d2.setHours(23, 59, 59, 999);
      setFromDate(formatDateInput(d1));
      setToDate(formatDateInput(d2));
    } else if (type === '7dias') {
      const d1 = new Date(now);
      d1.setDate(d1.getDate() - 7);
      d1.setHours(0, 0, 0, 0);
      const d2 = new Date(now);
      d2.setHours(23, 59, 59, 999);
      setFromDate(formatDateInput(d1));
      setToDate(formatDateInput(d2));
    } else if (type === 'mes') {
      const d1 = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const d2 = new Date(now);
      d2.setHours(23, 59, 59, 999);
      setFromDate(formatDateInput(d1));
      setToDate(formatDateInput(d2));
    } else if (type === 'todos') {
      setFromDate('');
      setToDate('');
    }
  };

  const executeSearch = async () => {
    setIsLoading(true);
    setSearchError('');
    setHasSearched(true);

    try {
      const orders = await searchHistoricalOrders({
        from: fromDate || undefined,
        to: toDate || undefined,
        orderNumber: orderNumber.trim() || undefined,
        search: searchText.trim() || undefined,
        type: typeFilter,
        paymentStatus: paymentStatusFilter,
        limit: 150,
      });
      setResults(orders);
    } catch (err: any) {
      setSearchError(err.message || 'Error al realizar la búsqueda.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setOrderNumber('');
    setSearchText('');
    setTypeFilter('all');
    setPaymentStatusFilter('all');
    handlePreset('7dias');
    setResults([]);
    setHasSearched(false);
    setSearchError('');
  };

  // Perform initial search on mount (last 7 days)
  useEffect(() => {
    executeSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrintReceipt = async (ord: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setPrintingOrderId(ord.id);
    setPrintFeedback(null);
    try {
      await printOrderReceipt(ord.id, 'caja');
      setPrintFeedback({ id: ord.id, msg: '✅ Comprobante impreso' });
      setTimeout(() => setPrintFeedback(null), 3000);
    } catch (err: any) {
      setPrintFeedback({ id: ord.id, msg: `⚠️ ${err.message || 'Error al imprimir'}`, isError: true });
      setTimeout(() => setPrintFeedback(null), 4000);
    } finally {
      setPrintingOrderId(null);
    }
  };

  const totalUSD = results.reduce((sum, o) => sum + (o.totalUSD || 0), 0);
  const totalCOP = roundCOP(totalUSD * exchangeRates.COP);
  const totalBs = (totalUSD * exchangeRates.Bs).toFixed(2);

  return (
    <div className="space-y-4">
      {/* Panel Superior: Filtros de Búsqueda */}
      <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-black uppercase tracking-wider flex items-center gap-2">
              <IoSearchOutline className="text-lg text-yellow-600" />
              <span>BÚSQUEDA Y AUDITORÍA DE COMANDAS DE DÍAS ANTERIORES</span>
            </h3>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">
              Consulta comandas pasadas con el 100% de sus productos, ingredientes, carnes, adicionales y pagos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black transition-all cursor-pointer border border-gray-300"
            >
              LIMPIAR FILTROS
            </button>
            <button
              type="button"
              onClick={executeSearch}
              disabled={isLoading}
              className="px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black transition-all cursor-pointer border border-yellow-500 shadow-xs flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <IoRefreshOutline className="animate-spin text-base" />
                  <span>BUSCANDO...</span>
                </>
              ) : (
                <>
                  <IoSearchOutline className="text-base" />
                  <span>BUSCAR COMANDAS</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Botones de Intervalo Rápido */}
        <div className="flex flex-wrap gap-2 pt-1 items-center">
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider mr-1 flex items-center gap-1">
            <IoCalendarOutline /> Atajos:
          </span>
          <button
            type="button"
            onClick={() => handlePreset('hoy')}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200 cursor-pointer"
          >
            📅 Hoy
          </button>
          <button
            type="button"
            onClick={() => handlePreset('ayer')}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200 cursor-pointer"
          >
            ⏪ Ayer
          </button>
          <button
            type="button"
            onClick={() => handlePreset('3dias')}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200 cursor-pointer"
          >
            🕒 Últimos 3 Días
          </button>
          <button
            type="button"
            onClick={() => handlePreset('7dias')}
            className="px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-900 text-xs font-black transition-all border border-yellow-300 cursor-pointer"
          >
            📆 Últimos 7 Días
          </button>
          <button
            type="button"
            onClick={() => handlePreset('mes')}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200 cursor-pointer"
          >
            📊 Este Mes
          </button>
          <button
            type="button"
            onClick={() => handlePreset('todos')}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-300 cursor-pointer"
            title="Sin límite de fecha (para buscar cualquier comanda histórica por número o nombre)"
          >
            ♾️ Todo el Historial
          </button>
        </div>

        {/* Formulario de Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end pt-1">
          {/* Fecha Inicio */}
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Desde Fecha/Hora</label>
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-semibold"
            />
          </div>

          {/* Fecha Fin */}
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Hasta Fecha/Hora</label>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-semibold"
            />
          </div>

          {/* Número de Comanda */}
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">N° Comanda</label>
            <input
              type="text"
              placeholder="Ej: #3, 58, 120"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-bold"
            />
          </div>

          {/* Cliente / Deudor / Notas */}
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Cliente / Deudor</label>
            <input
              type="text"
              placeholder="Nombre o referencia..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-semibold"
            />
          </div>

          {/* Tipo de Servicio */}
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Tipo de Servicio</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-bold"
            >
              <option value="all">Todos los Servicios</option>
              <option value="mesa">🍽️ Salón (Mesas)</option>
              <option value="delivery">🛵 Delivery</option>
              <option value="pickup">🛍️ PickUp (Llevar)</option>
              <option value="credito">🤝 Crédito</option>
            </select>
          </div>

          {/* Estado de Pago */}
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Estado de Pago</label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-bold"
            >
              <option value="all">Todos los Estados</option>
              <option value="pagado">✅ Pagadas</option>
              <option value="credito">⚠️ A Crédito</option>
              <option value="cancelado">❌ Canceladas</option>
            </select>
          </div>
        </div>

        {searchError && (
          <div className="text-red-700 text-xs font-bold bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <IoAlertCircleOutline className="text-base shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Resultados de la Búsqueda */}
      <div className="space-y-3">
        {hasSearched && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-800 uppercase tracking-wider">
                RESULTADOS ({results.length} comanda{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''}):
              </span>
            </div>

            {results.length > 0 && (
              <div className="flex items-center gap-2 text-xs font-black">
                <span className="bg-yellow-400 text-black px-2.5 py-1 rounded-xl border border-yellow-500 shadow-xs">
                  Total: ${totalUSD.toFixed(2)} USD
                </span>
                <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-xl border border-gray-300 shadow-xs">
                  🇨🇴 {totalCOP.toLocaleString()} COP
                </span>
                <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-xl border border-gray-300 shadow-xs">
                  🇻🇪 {totalBs} Bs
                </span>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
            <IoRefreshOutline className="text-4xl text-yellow-500 animate-spin mx-auto" />
            <p className="text-xs text-gray-600 font-bold">Consultando historial en PostgreSQL...</p>
          </div>
        ) : results.length === 0 ? (
          hasSearched ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
              <IoReceiptOutline className="text-4xl text-gray-400 mx-auto" />
              <p className="text-sm text-gray-800 font-black">No se encontraron comandas con los filtros especificados.</p>
              <p className="text-xs text-gray-500 font-semibold">
                Prueba ampliando el rango de fechas, seleccionando "Todo el Historial" o buscando solo por número de comanda.
              </p>
            </div>
          ) : null
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {results.map((ord) => {
              const isPaid = ord.paymentStatus === 'pagado';
              const isCredito = ord.paymentStatus === 'credito';
              const isCancelado = ord.status === 'cancelado';
              const cleanNum = String(ord.orderNumber || '').replace(/^#+/, '');
              const ordCOP = roundCOP((ord.totalUSD || 0) * exchangeRates.COP);
              const ordBs = ((ord.totalUSD || 0) * exchangeRates.Bs).toFixed(2);

              return (
                <div
                  key={ord.id}
                  onClick={() => setSelectedOrder(ord)}
                  className="p-4 rounded-2xl border border-gray-200 bg-white hover:border-yellow-400 hover:shadow-md transition-all space-y-3 cursor-pointer shadow-xs group"
                >
                  {/* Encabezado de la Tarjeta */}
                  <div className="flex justify-between items-start border-b border-gray-100 pb-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-black text-black group-hover:text-yellow-600 transition-colors">
                          #{cleanNum}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-yellow-400 text-black border border-yellow-500 text-[10px] font-black uppercase">
                          {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type}
                        </span>
                        {isPaid && (
                          <span className="px-2 py-0.5 rounded-lg bg-green-100 text-green-800 border border-green-200 text-[10px] font-black uppercase">
                            ✅ Pagada
                          </span>
                        )}
                        {isCredito && (
                          <span className="px-2 py-0.5 rounded-lg bg-yellow-100 text-yellow-900 border border-yellow-300 text-[10px] font-black uppercase">
                            ⚠️ A Crédito
                          </span>
                        )}
                        {isCancelado && (
                          <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-800 border border-red-200 text-[10px] font-black uppercase">
                            ❌ Cancelada
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <IoPersonOutline />
                          {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : 'Cliente General')}
                        </span>
                        {ord.waiterName && (
                          <span className="text-gray-400 text-[11px]">&bull; Mesero: {ord.waiterName}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-black text-black">
                        ${(ord.totalUSD || 0).toFixed(2)} USD
                      </div>
                      <div className="text-[10px] font-bold text-gray-500">
                        🇨🇴 {ordCOP.toLocaleString()} | 🇻🇪 {ordBs} Bs
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Productos Pedidos */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Productos ({ord.items.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ord.items.slice(0, 4).map((it, idx) => (
                        <span
                          key={it.id || idx}
                          className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-800"
                        >
                          {it.quantity}x {it.productName}
                        </span>
                      ))}
                      {ord.items.length > 4 && (
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[10px] font-black">
                          +{ord.items.length - 4} más...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pie de la Tarjeta con Fecha y Botones de Acción */}
                  <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-gray-100">
                    <div className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                      <IoTimeOutline className="text-sm" />
                      <span>{formatDisplayDate(ord.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handlePrintReceipt(ord, e)}
                        disabled={printingOrderId === ord.id}
                        className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-[11px] flex items-center gap-1 border border-gray-300 transition-all cursor-pointer"
                        title="Reimprimir ticket de la comanda en impresora de caja"
                      >
                        <IoPrintOutline className="text-sm" />
                        <span>{printingOrderId === ord.id ? '...' : 'Imprimir'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedOrder(ord)}
                        className="px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black font-black text-[11px] flex items-center gap-1 border border-yellow-500 shadow-xs transition-all cursor-pointer"
                      >
                        <IoEyeOutline className="text-sm" />
                        <span>Ver Detalle</span>
                      </button>
                    </div>
                  </div>

                  {printFeedback && printFeedback.id === ord.id && (
                    <div className={`text-[10px] font-bold p-1 rounded-lg text-center ${printFeedback.isError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      {printFeedback.msg}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Detalle Completo de la Comanda Histórica */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          exchangeRates={exchangeRates}
          onPrintReceipt={async (ord) => {
            try {
              await printOrderReceipt(ord.id, 'caja');
            } catch (e) {}
          }}
          onReprintKitchen={async (ord) => {
            try {
              await reprintKitchenOrder(ord.id, 'cocina');
            } catch (e) {}
          }}
          userRole={userSession?.role || 'caja'}
        />
      )}
    </div>
  );
};
