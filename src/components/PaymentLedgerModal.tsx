import React, { useEffect, useState, useRef } from 'react';
import {
  IoClose,
  IoEyeOutline,
  IoTrashOutline,
  IoCheckmark,
  IoWarningOutline,
  IoReceiptOutline,
} from 'react-icons/io5';
import { useApp } from '../context/AppContext';
import { Order, PaymentMethod } from '../data/mockData';
import { reportService } from '../services/reportService';

type Currency = 'USD' | 'COP' | 'Bs';
type EntryType = 'payment' | 'change';

const methodsByCurrency: Record<Currency, { value: PaymentMethod; label: string }[]> = {
  USD: [
    { value: 'Efectivo USD', label: 'EFECTIVO DÓLARES' },
    { value: 'Binance', label: 'BINANCE USDT' },
    { value: 'Zelle', label: 'ZELLE' },
  ],
  COP: [
    { value: 'Efectivo COP', label: 'EFECTIVO PESOS' },
    { value: 'Bancolombia', label: 'BANCOLOMBIA' },
    { value: 'Nequi', label: 'NEQUI' },
  ],
  Bs: [
    { value: 'Pago Móvil', label: 'PAGO MÓVIL' },
    { value: 'Tarjeta de Débito', label: 'PUNTO DÉBITO' },
    { value: 'Tarjeta de Crédito', label: 'PUNTO CRÉDITO' },
  ],
};

function asUSD(amount: number, currency: Currency, copRate: number, bsRate: number) {
  if (currency === 'COP') return copRate > 0 ? amount / copRate : 0;
  if (currency === 'Bs') return bsRate > 0 ? amount / bsRate : 0;
  return amount;
}

interface PaymentLedgerModalProps {
  order: Order | null;
  onClose: () => void;
  onViewOrder: (order: Order) => void;
  paymentScope?: {
    payerName: string;
    itemIds: string[];
  };
  onEditPaymentScope?: (order: Order) => void;
}

export const PaymentLedgerModal: React.FC<PaymentLedgerModalProps> = ({
  order,
  onClose,
  onViewOrder,
  paymentScope,
  onEditPaymentScope,
}) => {
  const {
    exchangeRates,
    registerLedgerEntry,
    deletePaymentEntry,
    finalizeOrder,
    closeOrderAsCredit,
  } = useApp();

  // Form Fields
  const [entryType, setEntryType] = useState<EntryType>('payment');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo USD');
  const [amountLocal, setAmountLocal] = useState('');
  const [payerName, setPayerName] = useState('Cliente General');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Credit Modal States
  const [isCreditPromptOpen, setIsCreditPromptOpen] = useState(false);
  const [creditDebtorInput, setCreditDebtorInput] = useState('');
  const [creditNotesInput, setCreditNotesInput] = useState('');
  const [creditError, setCreditError] = useState('');

  // Prompt de confirmación de impresión de recibo (Tarea 10)
  const [showReceiptPrompt, setShowReceiptPrompt] = useState(false);

  // Autofocus en monto (Tarea 14)
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!order) return;
    setPayerName(
      paymentScope?.payerName ||
        order.customerName ||
        (order.type === 'mesa' ? `Mesa #${order.tableNumber}` : 'Cliente General')
    );
    setEntryType('payment');
    setCurrency('USD');
    setPaymentMethod('Efectivo USD');
    setAmountLocal('');
    setError('');
    setIsCreditPromptOpen(false);
    setCreditError('');
    setShowReceiptPrompt(false);

    // Auto-enfocar campo de monto al abrir
    setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 120);
  }, [order, paymentScope?.payerName]);

  const history = order?.paymentHistory || [];
  const scopedItems = paymentScope
    ? (order?.items || []).filter((item) => paymentScope.itemIds.includes(item.id))
    : (order?.items || []);

  const scopeTotalUSD = paymentScope
    ? scopedItems.reduce((total, item) => total + item.price * item.quantity, 0)
    : (order?.totalUSD || 0);

  const scopedHistory = paymentScope
    ? history.filter((entry) => entry.itemIds?.some((itemId) => paymentScope.itemIds.includes(itemId)))
    : history;

  const paidUSD = scopedHistory.reduce((total, item) => total + (item.amountPaidUSD || 0), 0);
  const tenderedUSD = scopedHistory.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return (
      total +
      (item.cashTenderedUSD || 0) +
      (rateCOP > 0 ? (item.cashTenderedCOP || 0) / rateCOP : 0) +
      (rateBs > 0 ? (item.cashTenderedBs || 0) / rateBs : 0)
    );
  }, 0);

  const changeGivenUSD = scopedHistory.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return (
      total +
      (item.changeGivenUSD || 0) +
      (rateCOP > 0 ? (item.changeGivenCOP || 0) / rateCOP : 0) +
      (rateBs > 0 ? (item.changeGivenBs || 0) / rateBs : 0)
    );
  }, 0);

  const pendingDebtUSD = Math.max(0, scopeTotalUSD - paidUSD);
  const pendingChangeUSD = Math.max(0, tenderedUSD - scopeTotalUSD - changeGivenUSD);

  const fullOrderPaidUSD = history.reduce((total, item) => total + (item.amountPaidUSD || 0), 0);
  const fullOrderTenderedUSD = history.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return (
      total +
      (item.cashTenderedUSD || 0) +
      (rateCOP > 0 ? (item.cashTenderedCOP || 0) / rateCOP : 0) +
      (rateBs > 0 ? (item.cashTenderedBs || 0) / rateBs : 0)
    );
  }, 0);

  const fullOrderChangeUSD = history.reduce((total, item) => {
    const rateCOP = item.copRate || exchangeRates.COP;
    const rateBs = item.bsRate || exchangeRates.Bs;
    return (
      total +
      (item.changeGivenUSD || 0) +
      (rateCOP > 0 ? (item.changeGivenCOP || 0) / rateCOP : 0) +
      (rateBs > 0 ? (item.changeGivenBs || 0) / rateBs : 0)
    );
  }, 0);

  const entryUSD = asUSD(Number(amountLocal) || 0, currency, exchangeRates.COP, exchangeRates.Bs);

  const isReadyToClose =
    Math.max(0, (order?.totalUSD || 0) - fullOrderPaidUSD) <= 0.01 &&
    Math.max(0, fullOrderTenderedUSD - (order?.totalUSD || 0) - fullOrderChangeUSD) <= 0.01;

  // Auto-switch to change if debt is settled but change is owed
  useEffect(() => {
    if (!order) return;
    if (pendingDebtUSD <= 0.01 && pendingChangeUSD > 0.01 && entryType === 'payment') {
      setEntryType('change');
      setAmountLocal('');
    }
  }, [order, pendingDebtUSD, pendingChangeUSD, entryType]);

  if (!order) return null;

  const changeCurrency = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    setPaymentMethod(methodsByCurrency[nextCurrency][0].value);
    setError('');
  };

  const fillExactAmount = () => {
    if (entryType === 'payment') {
      if (currency === 'USD') setAmountLocal(pendingDebtUSD.toFixed(2));
      if (currency === 'COP') setAmountLocal(String(Math.round(pendingDebtUSD * exchangeRates.COP)));
      if (currency === 'Bs') setAmountLocal((pendingDebtUSD * exchangeRates.Bs).toFixed(2));
    } else {
      if (currency === 'USD') setAmountLocal(pendingChangeUSD.toFixed(2));
      if (currency === 'COP') setAmountLocal(String(Math.round(pendingChangeUSD * exchangeRates.COP)));
      if (currency === 'Bs') setAmountLocal((pendingChangeUSD * exchangeRates.Bs).toFixed(2));
    }
  };

  const handleRegisterEntry = async () => {
    const val = Number(amountLocal);
    if (!val || val <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      await registerLedgerEntry(order.id, {
        entryType,
        currency,
        amountLocal: val,
        paymentMethod,
        payerName: payerName.trim() || 'Cliente General',
        itemIds: paymentScope?.itemIds,
      });
      setAmountLocal('');
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEntry = async (paymentId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await deletePaymentEntry(order.id, paymentId);
    } catch (err: any) {
      setError(err?.message || 'Error al anular el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!isReadyToClose || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await finalizeOrder(order.id);
      setShowReceiptPrompt(true);
    } catch (err: any) {
      setError(err?.message || 'Error al finalizar la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreditConfirm = async () => {
    if (!creditDebtorInput.trim()) {
      setCreditError('⚠️ Es OBLIGATORIO ingresar el nombre del cliente o deudor.');
      return;
    }
    setIsSubmitting(true);
    setCreditError('');
    try {
      await closeOrderAsCredit(order.id, creditDebtorInput.trim(), creditNotesInput.trim() || undefined);
      setIsCreditPromptOpen(false);
      onClose();
    } catch (err: any) {
      setCreditError(err?.message || 'Error al cerrar comanda a crédito.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[95vh] border border-gray-300 shadow-2xl flex flex-col overflow-hidden text-gray-900">
        {/* Top Title Bar */}
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 font-black text-base">≡</span>
            <h2 className="font-black text-sm tracking-wide text-white">
              Sistema Crispy - FORMAS DE PAGO (Comanda #{order.orderNumber})
            </h2>
            {order.customerName && (
              <span className="text-xs text-yellow-400 font-bold ml-2">
                [{order.customerName}]
              </span>
            )}
            {order.type === 'mesa' && (
              <span className="text-xs text-gray-300 font-bold ml-1">
                (Mesa #{order.tableNumber})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (paymentScope && onEditPaymentScope ? onEditPaymentScope(order) : onViewOrder(order))}
              className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold border border-gray-700 flex items-center gap-1"
            >
              <IoEyeOutline />
              <span>Ver Comanda</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              <IoClose className="text-xl" />
            </button>
          </div>
        </div>

        {/* 3-COLUMN TOTALS (IDENTICAL TO USER PHOTO REFERENCE) */}
        <div className="bg-gray-50 border-b border-gray-200 p-3 sm:p-4 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* COLUMN 1: BOLIVARES */}
            <div className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-xs space-y-1 text-xs">
              <div className="flex justify-between font-bold text-gray-700">
                <span>Total en bolivares:</span>
                <span className="font-black text-black">{(scopeTotalUSD * exchangeRates.Bs).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-red-600">
                <span>Subtotal en bolivares:</span>
                <span className="font-black">{(paidUSD * exchangeRates.Bs).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-700">
                <span>Vueltos en bolivares:</span>
                <span className="font-black text-black">{(changeGivenUSD * exchangeRates.Bs).toFixed(2)}</span>
              </div>
            </div>

            {/* COLUMN 2: PESOS */}
            <div className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-xs space-y-1 text-xs">
              <div className="flex justify-between font-bold text-gray-700">
                <span>Total en pesos:</span>
                <span className="font-black text-black">{Math.round(scopeTotalUSD * exchangeRates.COP).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-red-600">
                <span>Subtotal en pesos:</span>
                <span className="font-black">{Math.round(paidUSD * exchangeRates.COP).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-700">
                <span>Vueltos en pesos:</span>
                <span className="font-black text-black">{Math.round(changeGivenUSD * exchangeRates.COP).toLocaleString()}</span>
              </div>
            </div>

            {/* COLUMN 3: DOLARES */}
            <div className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-xs space-y-1 text-xs">
              <div className="flex justify-between font-bold text-gray-700">
                <span>Total en dolares:</span>
                <span className="font-black text-black">{scopeTotalUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-red-600">
                <span>Subtotal en dolares:</span>
                <span className="font-black">{paidUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-700">
                <span>Vueltos en dolares:</span>
                <span className="font-black text-black">{changeGivenUSD.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Pending / Settled Status Alert */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            {pendingDebtUSD > 0.01 ? (
              <span className="font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                ⚠️ Pendiente por cobrar: ${pendingDebtUSD.toFixed(2)} USD (≈ {Math.round(pendingDebtUSD * exchangeRates.COP).toLocaleString()} COP / {(pendingDebtUSD * exchangeRates.Bs).toFixed(2)} Bs)
              </span>
            ) : pendingChangeUSD > 0.01 ? (
              <span className="font-black text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg animate-pulse">
                💵 Vuelto pendiente por entregar: ${pendingChangeUSD.toFixed(2)} USD (≈ {Math.round(pendingChangeUSD * exchangeRates.COP).toLocaleString()} COP / {(pendingChangeUSD * exchangeRates.Bs).toFixed(2)} Bs)
              </span>
            ) : (
              <span className="font-black text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">
                ✅ Cuenta completamente cubierta y balanceada
              </span>
            )}

            <div className="text-[11px] text-gray-500 font-bold">
              Tasa COP: {exchangeRates.COP.toLocaleString()} | Tasa Bs: {exchangeRates.Bs.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Scrollable Middle: Fast Payment Entry Form & History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-2 rounded-lg bg-red-100 text-red-800 text-xs font-bold flex items-center gap-1.5 border border-red-300">
              <IoWarningOutline className="text-base shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Row: AGREGAR METODO DE PAGO button & fast input form */}
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-gray-800 tracking-wider flex items-center gap-1.5">
                <IoReceiptOutline className="text-yellow-600" />
                <span>REGISTRAR LÍNEA DE PAGO / VUELTO:</span>
              </span>

              {((entryType === 'payment' && pendingDebtUSD > 0.01) ||
                (entryType === 'change' && pendingChangeUSD > 0.01)) && (
                <button
                  type="button"
                  onClick={fillExactAmount}
                  className="text-xs bg-yellow-400 hover:bg-yellow-500 text-black px-2 py-0.5 rounded font-black border border-yellow-500 transition-colors shadow-xs"
                >
                  ⚡ Saldo Exacto
                </button>
              )}
            </div>

            {/* Flat Row matching the reference layout */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              {/* Monto input */}
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-0.5">Monto:</label>
                <input
                  ref={amountInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountLocal}
                  onChange={(e) => setAmountLocal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRegisterEntry();
                    }
                  }}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-black text-sm text-black focus:outline-none focus:ring-1 focus:ring-yellow-400"
                />
              </div>

              {/* Moneda select */}
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-0.5">Moneda:</label>
                <select
                  value={currency}
                  onChange={(e) => changeCurrency(e.target.value as Currency)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-300 bg-white font-bold text-xs text-black focus:outline-none focus:ring-1 focus:ring-yellow-400"
                >
                  <option value="USD">DÓLARES (USD)</option>
                  <option value="COP">PESOS (COP)</option>
                  <option value="Bs">BOLÍVARES (Bs)</option>
                </select>
              </div>

              {/* Metodo select */}
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-gray-600 uppercase mb-0.5">Tipo de Pago:</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-300 bg-white font-bold text-xs text-black focus:outline-none focus:ring-1 focus:ring-yellow-400"
                >
                  {methodsByCurrency[currency].map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Checkbox Vueltos */}
              <div className="sm:col-span-2 flex items-center gap-1.5 pt-4 sm:pt-4">
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={entryType === 'change'}
                    onChange={(e) => setEntryType(e.target.checked ? 'change' : 'payment')}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                  />
                  <span>Vueltos</span>
                </label>
              </div>

              {/* Action Buttons: Confirm & Clear */}
              <div className="sm:col-span-2 flex items-center gap-1.5 pt-4 sm:pt-4">
                <button
                  type="button"
                  disabled={!Number(amountLocal) || isSubmitting}
                  onClick={handleRegisterEntry}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  title="Confirmar este método de pago"
                >
                  <IoCheckmark className="text-base" />
                  <span>{isSubmitting ? '...' : '✔'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAmountLocal('')}
                  className="p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700"
                  title="Limpiar monto"
                >
                  <IoTrashOutline className="text-base" />
                </button>
              </div>
            </div>

            {/* Equivalent live calculation */}
            {Number(amountLocal) > 0 && (
              <div className="text-[11px] text-gray-600 font-bold pt-1 border-t border-gray-200 flex items-center gap-2">
                <span>Equivalente: ${entryUSD.toFixed(2)} USD</span>
                <span>•</span>
                <span>{entryType === 'change' ? '🟠 Se registrará como Vuelto entregado al cliente' : '🟢 Se registrará como Pago recibido'}</span>
              </div>
            )}
          </div>

          {/* Movements History Table */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-black uppercase text-gray-700 tracking-wider">
              Movimientos Registrados ({scopedHistory.length}):
            </h4>

            {scopedHistory.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-400 font-bold bg-white">
                No hay movimientos registrados para esta comanda.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] border-b border-gray-200">
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Método</th>
                      <th className="p-2">Moneda Original</th>
                      <th className="p-2">Equivalente USD</th>
                      <th className="p-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-semibold">
                    {scopedHistory.map((mov) => {
                      const isChange = mov.entryType === 'change' || (mov.changeGivenUSD || 0) > 0;
                      return (
                        <tr key={mov.id} className="hover:bg-gray-50">
                          <td className="p-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                isChange
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-green-100 text-green-800 border border-green-200'
                              }`}
                            >
                              {isChange ? 'Vuelto' : 'Pago'}
                            </span>
                          </td>
                          <td className="p-2 font-bold text-gray-900">{mov.method}</td>
                          <td className="p-2 font-black text-black">
                            {mov.currency === 'USD' && `$${(mov.amountPaidUSD || mov.cashTenderedUSD || mov.changeGivenUSD || 0).toFixed(2)} USD`}
                            {mov.currency === 'COP' && `${Math.round(mov.cashTenderedCOP || mov.changeGivenCOP || 0).toLocaleString()} COP`}
                            {mov.currency === 'Bs' && `${(mov.cashTenderedBs || mov.changeGivenBs || 0).toFixed(2)} Bs`}
                          </td>
                          <td className="p-2 font-black text-gray-800">
                            ${(mov.amountPaidUSD || mov.cashTenderedUSD || mov.changeGivenUSD || 0).toFixed(2)} USD
                          </td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleRemoveEntry(mov.id)}
                              className="p-1 rounded text-red-600 hover:bg-red-50 transition-colors"
                              title="Anular este movimiento"
                            >
                              <IoTrashOutline className="text-sm" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions (Right-aligned, matching reference photo) */}
        <div className="bg-gray-100 px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            {!paymentScope && (
              <button
                type="button"
                onClick={() => setIsCreditPromptOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-white hover:bg-gray-50 text-gray-800 font-black text-xs border border-gray-300 shadow-xs transition-all"
              >
                📝 CERRAR A CRÉDITO
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors"
            >
              CANCELAR
            </button>

            <button
              type="button"
              disabled={!isReadyToClose || isSubmitting}
              onClick={handleFinalize}
              className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                isReadyToClose && !isSubmitting
                  ? 'bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 active:scale-[0.99]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed border border-gray-300'
              }`}
            >
              {isSubmitting ? 'PROCESANDO...' : 'FINALIZAR COBRO'}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL SECUNDARIO: CERRAR A CRÉDITO */}
      {isCreditPromptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 border border-gray-200 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="text-sm font-black text-gray-900">📝 CERRAR COMANDA A CRÉDITO</h3>
              <button
                type="button"
                onClick={() => setIsCreditPromptOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-black"
              >
                <IoClose className="text-lg" />
              </button>
            </div>

            {creditError && (
              <div className="p-2 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                {creditError}
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-gray-800 mb-1">
                Nombre del Cliente o Deudor <span className="text-red-600">(*Obligatorio)</span>:
              </label>
              <input
                type="text"
                value={creditDebtorInput}
                onChange={(e) => setCreditDebtorInput(e.target.value)}
                placeholder="Ej: Ing. Martínez / Teléfono"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-bold text-black focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-800 mb-1">
                Notas / Condiciones de Crédito (Opcional):
              </label>
              <input
                type="text"
                value={creditNotesInput}
                onChange={(e) => setCreditNotesInput(e.target.value)}
                placeholder="Ej: Cancela el viernes"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div className="text-[11px] text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-200">
              ℹ️ Las cuentas a crédito no ingresan dinero físico a la gaveta de caja chica y se reflejan en la sección contable de cuentas por cobrar.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsCreditPromptOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isSubmitting || !creditDebtorInput.trim()}
                onClick={handleCreditConfirm}
                className="px-4 py-1.5 text-xs font-black bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 rounded-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar Crédito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Impresión de Recibo (Tarea 10: Preguntar Siempre Antes de Imprimir) */}
      {showReceiptPrompt && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-5 shadow-2xl space-y-4 text-black animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center text-black text-xl font-black shrink-0">
                <IoReceiptOutline />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">¿Imprimir Recibo de Venta?</h3>
                <p className="text-[11px] text-gray-500 font-semibold">Comanda #{order.orderNumber}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 font-medium">
              El cobro se ha registrado correctamente en el sistema. ¿Deseas generar e imprimir el recibo físico para el cliente?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowReceiptPrompt(false);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs border border-gray-300 transition-all text-center"
              >
                ❌ No Imprimir
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReceiptPrompt(false);
                  reportService.generatePreCuentaTicket(order, exchangeRates);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-xs transition-all text-center"
              >
                🖨️ Sí, Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
