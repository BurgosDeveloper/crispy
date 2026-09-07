import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Product, OrderItem, Order } from '../data/mockData';
import { TableCompactGrid } from '../modules/mesero/TableCompactGrid';
import { ProductTextCatalog } from '../modules/mesero/ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from '../modules/mesero/BurgerBuilderModal';
import { DrinkSelectorModal } from '../modules/mesero/DrinkSelectorModal';
import { ChangeTableModal } from '../components/ChangeTableModal';
import { OrderAppendModal } from '../components/OrderAppendModal';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { PaymentLedgerModal } from '../components/PaymentLedgerModal';
import { PrinterSelectModal } from '../components/PrinterSelectModal';
import { reportService } from '../services/reportService';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName } from '../utils/burgerProteins';

import {
  IoReaderOutline,
  IoClose,
  IoTrashOutline,
  IoPaperPlane,
  IoSwapHorizontal,
  IoWarningOutline,
  IoPrintOutline,
} from 'react-icons/io5';

export const MeseroPage: React.FC = () => {
  const {
    tables,
    products,
    ingredients,
    orders,
    createOrder,
    exchangeRates,
    userSession,
    reprintKitchenOrder,
    printOrderReceipt,
  } = useApp();

  const [searchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') || 'pedidos';

  // Target of active order (Mesa, Delivery, PickUp)
  const [activeOrderTarget, setActiveOrderTarget] = useState<{
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    title: string;
  } | null>(null);

  // Cart & Order Form State
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(0);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [sentAlert, setSentAlert] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [targetPrinter, setTargetPrinter] = useState<'cocina' | 'caja' | 'ambas' | 'ninguna'>('cocina');

  // Modals for Products
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);

  // Secondary Modals for Orders
  const [tableChangeOrder, setTableChangeOrder] = useState<Order | null>(null);
  const [orderAppendModalOrder, setOrderAppendModalOrder] = useState<Order | null>(null);
  const [orderDetailModalOrder, setOrderDetailModalOrder] = useState<Order | null>(null);
  const [printerSelectOrder, setPrinterSelectOrder] = useState<Order | null>(null);
  const [activeOrderForPay, setActiveOrderForPay] = useState<Order | null>(null);
  const [isCompactComandasView, setIsCompactComandasView] = useState<boolean>(() => {
    return localStorage.getItem('crispy_mesero_view_mode') !== 'expanded';
  });
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const toggleExpandOrder = (orderId: string) => {
    setExpandedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  // Catalog Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeProducts = products
    .filter((p) => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const availableExtras = ingredients
    .filter((i) => (i.isExtra || i.isExtraForPizza) && (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  // Open order creation
  const handleOpenOrder = (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => {
    setActiveOrderTarget({
      type,
      tableNumber,
      title: title || (type === 'delivery' ? 'Orden Delivery' : type === 'pickup' ? 'Orden Para Llevar' : `Mesa #${tableNumber}`),
    });
    setCartItems([]);
    setCustomerName('');
    setKitchenNotes('');
    setDeliveryFeeUSD(0);
    setOrderError(null);
  };

  const areCartItemsIdentical = (a: OrderItem, b: OrderItem): boolean => {
    if (a.productId !== b.productId) return false;
    if (Boolean(a.isTakeaway) !== Boolean(b.isTakeaway)) return false;
    if (Boolean(a.isCut) !== Boolean(b.isCut)) return false;
    if ((a.cutPreference || 'Entera') !== (b.cutPreference || 'Entera')) return false;
    if ((a.sugarPreference || '') !== (b.sugarPreference || '')) return false;
    if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

    const aProt = [...(a.proteins || [])].map(normalizeProteinName).sort().join('|');
    const bProt = [...(b.proteins || [])].map(normalizeProteinName).sort().join('|');
    if (aProt !== bProt) return false;

    const aRem = [...(a.removedIngredients || [])].sort().join('|');
    const bRem = [...(b.removedIngredients || [])].sort().join('|');
    if (aRem !== bRem) return false;

    const aExtras = (a.extras || []).map((e) => `${e.name}:${e.price}`).sort().join('|');
    const bExtras = (b.extras || []).map((e) => `${e.name}:${e.price}`).sort().join('|');
    if (aExtras !== bExtras) return false;

    return Math.abs(a.price - b.price) < 0.01;
  };

  const mergeCartItem = (cart: OrderItem[], item: OrderItem): OrderItem[] => {
    const matchIndex = cart.findIndex((existing) => areCartItemsIdentical(existing, item));
    if (matchIndex !== -1) {
      const updated = [...cart];
      updated[matchIndex] = {
        ...updated[matchIndex],
        quantity: updated[matchIndex].quantity + item.quantity,
      };
      return updated;
    }
    return [...cart, item];
  };

  // Product Selection Click
  const handleSelectProduct = (product: Product) => {
    const isTargetTakeaway = activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery';

    if (product.category === 'Hamburguesas') {
      setSelectedBurger(product);
    } else if (product.category === 'Bebidas' && product.drinkType === 'jugo') {
      setSelectedDrink(product);
    } else {
      // Direct add to cart for sealed drinks, sides or combos
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
        category: product.category,
        drinkType: product.drinkType,
        isTakeaway: isTargetTakeaway,
        isNewOrModified: false,
      };
      setCartItems((prev) => mergeCartItem(prev, newItem));
    }
  };

  // Confirm Burger Add
  const handleConfirmBurgerAdd = (
    configOrList: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    setCartItems((prev) => {
      let current = [...prev];
      for (const config of list) {
        const item: OrderItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          productId: config.burger.id,
          productName: config.burger.name,
          price: config.finalPrice,
          quantity: config.quantity,
          category: config.burger.category,
          proteins: config.proteins && config.proteins.length > 0 ? config.proteins : undefined,
          removedIngredients: config.removedIngredients && config.removedIngredients.length > 0 ? config.removedIngredients : undefined,
          extras: config.extras && config.extras.length > 0 ? config.extras : undefined,
          isTakeaway: config.isTakeaway,
          isCut: config.isCut,
          cutPreference: config.cutPreference,
          notes: getCleanItemNote(config.notes) || undefined,
          isNewOrModified: false,
        };
        current = mergeCartItem(current, item);
      }
      return current;
    });
  };

  // Confirm Drink Add
  const handleConfirmDrinkAdd = (config: {
    drink: Product;
    quantity: number;
    sugarPreference?: string;
    isTakeaway: boolean;
    notes?: string;
  }) => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: config.drink.id,
      productName: config.drink.name,
      price: config.drink.price,
      quantity: config.quantity,
      category: config.drink.category,
      drinkType: config.drink.drinkType,
      sugarPreference: config.sugarPreference,
      isTakeaway: config.isTakeaway,
      notes: getCleanItemNote(config.notes) || undefined,
      isNewOrModified: false,
    };
    setCartItems((prev) => mergeCartItem(prev, newItem));
  };

  // Cart quantity adjustment
  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const removeCartItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Cart Totals
  const itemsSubtotalUSD = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTotalUSD = itemsSubtotalUSD + (activeOrderTarget?.type === 'delivery' ? deliveryFeeUSD : 0);

  // Submit Order to Server
  const handleSubmitOrder = async () => {
    if (!activeOrderTarget || cartItems.length === 0 || isSubmittingOrder) return;

    if (activeOrderTarget.type === 'delivery') {
      if (!customerName.trim()) {
        setOrderError('⚠️ Para Delivery es obligatorio ingresar nombre y dirección del cliente.');
        return;
      }
      if (deliveryFeeUSD <= 0) {
        setOrderError('⚠️ Debe seleccionar el costo del Delivery.');
        return;
      }
    }

    if (activeOrderTarget.type === 'pickup' && !customerName.trim()) {
      setOrderError('⚠️ Para PickUp es obligatorio ingresar el nombre o referencia del cliente.');
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    try {
      await createOrder({
        type: activeOrderTarget.type,
        tableNumber: activeOrderTarget.tableNumber,
        customerName: customerName.trim() || undefined,
        kitchenNotes: getCleanItemNote(kitchenNotes) || undefined,
        items: cartItems,
        totalUSD: cartTotalUSD,
        deliveryFeeUSD: activeOrderTarget.type === 'delivery' ? deliveryFeeUSD : 0,
        shift: userSession?.shift || 'ambos',
        targetPrinter,
      } as any);

      setSentAlert(`✅ Comanda enviada exitosamente (${activeOrderTarget.title})`);
      setTimeout(() => setSentAlert(null), 3500);

      setActiveOrderTarget(null);
      setCartItems([]);
      setCustomerName('');
      setKitchenNotes('');
      setDeliveryFeeUSD(0);
    } catch (err: any) {
      setOrderError(err?.message || 'Error al enviar la comanda a cocina y caja.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-2.5 sm:p-3 overflow-hidden bg-gray-100 text-gray-900">
      {/* Top Banner Alert (if any) */}
      {sentAlert && (
        <div className="mb-2 p-2 rounded-lg bg-green-500 text-black text-xs font-black text-center shadow-md animate-in fade-in shrink-0">
          {sentAlert}
        </div>
      )}

      {/* SUB-TAB 1: PEDIDOS & MAPA DE MESAS */}
      {(activeSubTab === 'pedidos' || activeSubTab === 'default') && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TableCompactGrid
            tables={tables}
            orders={orders}
            onSelectTarget={handleOpenOrder}
            onViewActiveOrder={(ord) => setOrderDetailModalOrder(ord)}
            onAppendOrder={(ord) => setOrderAppendModalOrder(ord)}
            canPay={userSession?.role === 'caja' || userSession?.role === 'admin'}
            onPayOrder={(ord) => setActiveOrderForPay(ord)}
            onPrintReceipt={(ord) => setPrinterSelectOrder(ord)}
          />
        </div>
      )}

      {/* SUB-TAB 2: MIS COMANDAS (MONITOR MESERO) */}
      {activeSubTab === 'comandas' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-2">
          <div className="flex flex-wrap items-center justify-between pb-1 border-b border-gray-200 shrink-0 gap-2">
            <h2 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <IoReaderOutline className="text-yellow-600 text-sm" />
              <span>ESTADO DE COMANDAS ACTIVAS</span>
            </h2>
            <div className="flex items-center gap-2">
              {/* Selector de Modo de Vista (Tarea 4) */}
              <button
                type="button"
                onClick={() => {
                  const next = !isCompactComandasView;
                  setIsCompactComandasView(next);
                  localStorage.setItem('crispy_mesero_view_mode', next ? 'compact' : 'expanded');
                }}
                className={`px-2.5 py-1 rounded-lg font-black text-[11px] flex items-center gap-1 border transition-all cursor-pointer shadow-xs ${
                  isCompactComandasView
                    ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
                title="Alternar vista compacta (50+ comandas) vs vista extendida"
              >
                <span>👁️</span>
                <span>{isCompactComandasView ? 'Modo Compacto (50+)' : 'Modo Extendido'}</span>
              </button>
              <span className="text-[11px] text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                Total: {orders.filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada').length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {orders.filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada').length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs font-bold">
                No hay comandas activas en este momento.
              </div>
            ) : isCompactComandasView ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                {orders
                  .filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada')
                  .map((ord) => {
                    const isReady = ord.status === 'preparada';
                    const isExpanded = expandedOrderIds.includes(ord.id);
                    const isDelivery = ord.type === 'delivery';
                    const titleText = ord.type === 'mesa'
                      ? `Mesa #${ord.tableNumber}`
                      : `${isDelivery ? '🛵' : '🛍️'} ${ord.customerName || (isDelivery ? 'Delivery' : 'PickUp')}`;
                    const itemsCount = (ord.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0);
                    const itemsSummary = (ord.items || []).map((i) => `${i.quantity}x ${i.productName}`).join(', ');

                    if (!isExpanded) {
                      // MINICOMANDA: Solo mesa o nombre delivery/pickup, montos en cada moneda y botón de ojito
                      return (
                        <div
                          key={ord.id}
                          className={`p-3 rounded-2xl border flex flex-col justify-between shadow-xs transition-all ${
                            isReady
                              ? 'bg-yellow-200/80 border-yellow-500 ring-2 ring-yellow-400'
                              : 'bg-white border-gray-200 hover:border-yellow-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-gray-100">
                            <span className="font-black text-xs text-black truncate" title={titleText}>
                              {titleText}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPrinterSelectOrder(ord)}
                                className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-black transition-all shadow-xs border border-amber-300 cursor-pointer"
                                title="Imprimir pre-cuenta del cliente"
                              >
                                🧾
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleExpandOrder(ord.id)}
                                className="px-1.5 py-0.5 rounded bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black transition-all shadow-xs border border-yellow-500 cursor-pointer shrink-0"
                                title="Expandir comanda"
                              >
                                👁️ Ver
                              </button>
                            </div>
                          </div>

                          <div className="pt-1.5 space-y-0.5">
                            <div className="text-sm font-black text-black">
                              ${ord.totalUSD.toFixed(2)} <span className="text-[9px] font-bold text-gray-500">USD</span>
                            </div>
                            <div className="text-[10px] font-bold text-gray-700 truncate">
                              🇨🇴 ${roundCOP(ord.totalUSD * exchangeRates.COP).toLocaleString()}
                            </div>
                            <div className="text-[10px] font-bold text-gray-700 truncate">
                              🇻🇪 {(ord.totalUSD * exchangeRates.Bs).toFixed(2)} Bs
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // COMANDA EXPANDIDA
                    return (
                      <div
                        key={ord.id}
                        className={`col-span-2 p-3 rounded-2xl border flex flex-col justify-between shadow-md space-y-2 transition-all ${
                          isReady
                            ? 'bg-yellow-100/90 border-yellow-500 ring-2 ring-yellow-400'
                            : 'bg-white border-gray-200 hover:border-yellow-400'
                        }`}
                      >
                        {/* Header con botón Colapsar */}
                        <div>
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-gray-100">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-black text-sm text-black">#{ord.orderNumber}</span>
                              <span className="text-[10px] font-extrabold text-black bg-yellow-400 px-1.5 py-0.5 rounded uppercase truncate">
                                {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleExpandOrder(ord.id)}
                              className="px-2 py-0.5 rounded bg-gray-100 hover:bg-yellow-400 text-black text-[10px] font-black transition-all shadow-xs border border-gray-300 cursor-pointer shrink-0"
                              title="Colapsar a minicomanda"
                            >
                              👁️ Colapsar
                            </button>
                          </div>

                          {/* Customer */}
                          {ord.customerName && (
                            <p className="text-xs text-gray-800 font-extrabold mt-1 truncate" title={ord.customerName}>
                              👤 {ord.customerName}
                            </p>
                          )}

                          {/* Items summary */}
                          <div className="my-1 py-1 px-1.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="text-[11px] font-black text-yellow-800">
                              🍔 {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'}
                            </div>
                            <p className="text-[10px] text-gray-600 font-medium" title={itemsSummary}>
                              {itemsSummary}
                            </p>
                          </div>

                          {/* Status */}
                          <div className="flex items-center justify-between text-[10px] font-black uppercase mb-1">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                isReady
                                  ? 'bg-green-600 text-white animate-pulse'
                                  : 'bg-yellow-400 text-black'
                              }`}
                            >
                              {isReady ? '¡LISTA!' : 'EN PREP.'}
                            </span>
                            <span className="text-black font-black text-xs">
                              ${ord.totalUSD.toFixed(2)} USD
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOrderAppendModalOrder(ord)}
                            className="flex-1 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black transition-all cursor-pointer text-center"
                            title="Adicionar ítem"
                          >
                            + Ítem
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrinterSelectOrder(ord)}
                            className="px-2 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400 text-xs font-black transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                            title="Imprimir pre-cuenta del cliente"
                          >
                            <IoPrintOutline className="text-sm" />
                            <span>Cuenta</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => reprintKitchenOrder(ord.id)}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs transition-all cursor-pointer"
                            title="Reimprimir en cocina"
                          >
                            <IoPrintOutline />
                          </button>

                          {ord.type === 'mesa' && ord.status !== 'entregada' && (
                            <button
                              type="button"
                              onClick={() => setTableChangeOrder(ord)}
                              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs transition-all cursor-pointer"
                              title="Cambiar mesa"
                            >
                              <IoSwapHorizontal />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {orders
                  .filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada')
                  .map((ord) => {
                    const isReady = ord.status === 'preparada';
                    return (
                      <div
                        key={ord.id}
                        className={`p-2.5 rounded-xl border flex flex-col justify-between shadow-sm transition-all ${
                          isReady
                            ? 'bg-green-50 border-green-400'
                            : 'bg-white border-gray-200 hover:border-yellow-400'
                        }`}
                      >
                        {/* Header */}
                        <div>
                          <div className="flex items-center justify-between gap-1 pb-1 border-b border-gray-100">
                            <div className="flex items-center gap-1">
                              <span className="font-black text-sm text-black">#{ord.orderNumber}</span>
                              <span className="text-[10px] font-bold text-gray-600 uppercase">
                                {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type}
                              </span>
                            </div>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                isReady
                                  ? 'bg-green-500 text-black animate-pulse'
                                  : 'bg-yellow-400 text-black'
                              }`}
                            >
                              {ord.status === 'preparada' ? '¡LISTA!' : 'EN PREP.'}
                            </span>
                          </div>

                          {/* Customer */}
                          {ord.customerName && (
                            <p className="text-[11px] text-gray-700 font-bold mt-1 truncate">
                              👤 {ord.customerName}
                            </p>
                          )}

                          {/* Items brief */}
                          <div className="my-1.5 space-y-0.5">
                            {(ord.items || []).map((it, idx) => (
                              <div key={idx} className="text-[11px] text-gray-800 flex justify-between font-semibold">
                                <span className="truncate">
                                  {it.quantity}x {it.productName}
                                </span>
                                <span className="text-black font-bold shrink-0 ml-1">
                                  ${(it.price * it.quantity).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-1">
                          <span className="text-xs font-black text-black">
                            ${ord.totalUSD.toFixed(2)} USD
                          </span>

                          <div className="flex items-center gap-1">
                            {ord.type === 'mesa' && ord.status !== 'entregada' && (
                              <button
                                type="button"
                                onClick={() => setTableChangeOrder(ord)}
                                className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold"
                                title="Cambiar de mesa"
                              >
                                <IoSwapHorizontal />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setOrderAppendModalOrder(ord)}
                              className="px-2 py-1 rounded bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black"
                              title="Adicionar ítem"
                            >
                              + Ítem
                            </button>

                            <button
                              type="button"
                              onClick={() => reprintKitchenOrder(ord.id)}
                              className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                              title="Reimprimir comanda en cocina"
                            >
                              <IoPrintOutline className="text-xs" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setOrderDetailModalOrder(ord)}
                              className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 text-[10px] font-bold"
                            >
                              Ver
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULLSCREEN / MODAL DE TOMA DE PEDIDOS (DESCENTRALIZADO) */}
      {activeOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[92vh] border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-yellow-400 text-black text-sm font-black">
                  {activeOrderTarget.type === 'delivery' ? '🛵' : activeOrderTarget.type === 'pickup' ? '🛍️' : '🍽️'}
                </span>
                <div>
                  <h3 className="font-black text-sm text-gray-900 leading-tight">
                    {activeOrderTarget.title}
                  </h3>
                  <span className="text-[10px] text-gray-500 font-bold uppercase">
                    Selección de Hamburguesas, Bebidas y Acompañantes
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveOrderTarget(null)}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-black transition-colors"
              >
                <IoClose className="text-xl" />
              </button>
            </div>

            {/* Error Message */}
            {orderError && (
              <div className="bg-red-50 text-red-700 px-3 py-1.5 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
                <IoWarningOutline />
                <span>{orderError}</span>
              </div>
            )}

            {/* Body: Split View (Catalog on Left 62%, Cart on Right 38%) */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              {/* LEFT: 100% TEXT CATALOG */}
              <div className="flex-1 md:w-[62%] p-3 border-r border-gray-200 flex flex-col overflow-hidden min-h-0">
                <ProductTextCatalog
                  products={activeProducts}
                  onSelectProduct={handleSelectProduct}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  exchangeRates={exchangeRates}
                />
              </div>

              {/* RIGHT: COMPACT CART & ORDER FORM */}
              <div className="md:w-[38%] p-3 flex flex-col justify-between bg-gray-50 overflow-hidden min-h-0">
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-2">
                  {/* Customer and General Notes Inputs */}
                  <div className="space-y-1.5 shrink-0 bg-white p-2.5 rounded-xl border border-gray-200">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-700 tracking-wider">
                        {activeOrderTarget.type === 'delivery'
                          ? 'Cliente y Dirección (*Obligatorio):'
                          : activeOrderTarget.type === 'pickup'
                          ? 'Cliente / Referencia (*Obligatorio):'
                          : 'Nombre o Referencia (Opcional):'}
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder={
                          activeOrderTarget.type === 'delivery'
                            ? 'Ej: Juan Pérez / Calle 5 #10-20'
                            : 'Ej: Juan Pérez'
                        }
                        className="w-full px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 font-bold mt-0.5"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-700 tracking-wider">
                        Nota de cocina / Observación general:
                      </label>
                      <input
                        type="text"
                        value={kitchenNotes}
                        onChange={(e) => setKitchenNotes(e.target.value)}
                        placeholder="Ej: Servir todo junto, sin cubiertos..."
                        className="w-full px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 font-semibold mt-0.5"
                      />
                    </div>

                    {/* Delivery Fee Selector (only for delivery) */}
                    {activeOrderTarget.type === 'delivery' && (
                      <div className="pt-1.5 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black uppercase text-gray-700">
                            Costo de Envío Delivery:
                          </span>
                          <span className="text-xs font-black text-black">
                            ${deliveryFeeUSD.toFixed(2)} USD
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[1, 1.5, 2, 2.5, 3, 4, 5].map((fee) => (
                            <button
                              key={fee}
                              type="button"
                              onClick={() => setDeliveryFeeUSD(fee)}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${
                                deliveryFeeUSD === fee
                                  ? 'bg-yellow-400 border-yellow-500 text-black shadow-xs font-black'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              ${fee}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cart Items List */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-[140px]">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase text-gray-500 px-1">
                      <span>Ítems Agregados ({cartItems.reduce((s, i) => s + i.quantity, 0)})</span>
                      <span>Total</span>
                    </div>

                    {cartItems.length === 0 ? (
                      <div className="h-28 flex flex-col items-center justify-center text-center text-gray-400 text-xs border border-dashed border-gray-300 rounded-xl bg-white/60">
                        <span>El carrito está vacío</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">
                          Toca un ítem del catálogo para agregarlo
                        </span>
                      </div>
                    ) : (
                      cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-2 rounded-xl bg-white border border-gray-200 shadow-xs flex flex-col gap-1"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <span className="text-xs font-black text-gray-900 block leading-tight">
                                {item.productName}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {item.isTakeaway && (
                                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 rounded inline-block">
                                    📦 Para Llevar
                                  </span>
                                )}
                                {(item.isCut || item.cutPreference === 'Picada') ? (
                                  <span className="text-[9px] font-bold text-red-700 bg-red-50 px-1 rounded inline-block">
                                    🔪 Picada
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-gray-600 bg-gray-100 px-1 rounded inline-block">
                                    🍔 Entera
                                  </span>
                                )}
                              </div>
                            </div>

                            <span className="text-xs font-black text-black shrink-0">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>

                          {/* Proteins (Tarea 3) */}
                          {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                            <div className="text-[10px] text-amber-800 font-extrabold bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200 inline-block">
                              🥩 {item.proteins.join(' + ')}
                            </div>
                          )}

                          {/* Removed ingredients (SIN) */}
                          {item.removedIngredients && item.removedIngredients.length > 0 && (
                            <div className="text-[10px] text-red-600 font-bold">
                              🚫 SIN: {item.removedIngredients.join(', ')}
                            </div>
                          )}

                          {/* Extra ingredients (ADD) */}
                          {item.extras && item.extras.length > 0 && (
                            <div className="text-[10px] text-gray-700 font-semibold space-y-0.5">
                              {item.extras.map((ex, exIdx) => (
                                <div key={exIdx} className="flex justify-between">
                                  <span>➕ ADD: {ex.name}</span>
                                  {ex.price > 0 && <span>+${ex.price.toFixed(2)}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Sugar preference */}
                          {item.sugarPreference && (
                            <div className="text-[10px] text-blue-600 font-semibold">
                              🥤 Azúcar: {item.sugarPreference}
                            </div>
                          )}

                          {/* Item Note */}
                          {getCleanItemNote(item.notes) && (
                            <div className="text-[10px] text-gray-500 italic">
                              📝 Nota: {getCleanItemNote(item.notes)}
                            </div>
                          )}

                          {/* Quantity Controls & Remove */}
                          <div className="flex items-center justify-between pt-1 border-t border-gray-100 mt-0.5">
                            <div className="flex items-center border border-gray-300 rounded bg-gray-50">
                              <button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.id, -1)}
                                className="px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
                              >
                                -
                              </button>
                              <span className="px-2 text-xs font-bold">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.id, 1)}
                                className="px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeCartItem(item.id)}
                              className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                              title="Eliminar este ítem"
                            >
                              <IoTrashOutline className="text-sm" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cart Footer: Totals & Submit Button */}
                <div className="pt-2 border-t border-gray-200 shrink-0 space-y-2 mt-2">
                  <div className="bg-white p-2 rounded-xl border border-gray-200 space-y-0.5">
                    <div className="flex justify-between text-xs font-bold text-gray-600">
                      <span>Subtotal Ítems:</span>
                      <span>${itemsSubtotalUSD.toFixed(2)} USD</span>
                    </div>

                    {activeOrderTarget.type === 'delivery' && (
                      <div className="flex justify-between text-xs font-bold text-gray-600">
                        <span>Costo Delivery:</span>
                        <span>+${deliveryFeeUSD.toFixed(2)} USD</span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline pt-1 border-t border-gray-100">
                      <span className="text-xs font-black text-gray-900 uppercase">Total a Pagar:</span>
                      <div className="text-right">
                        <span className="text-lg font-black text-black block leading-none">
                          ${cartTotalUSD.toFixed(2)} USD
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold">
                          ≈ ${(cartTotalUSD * exchangeRates.COP).toLocaleString()} COP | {(cartTotalUSD * exchangeRates.Bs).toFixed(2)} Bs
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Selector de Impresora al Enviar Pedido */}
                  <div className="pt-2 border-t border-gray-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1">
                        <IoPrintOutline className="text-xs text-yellow-600" />
                        <span>Imprimir Comanda:</span>
                      </span>
                      <span className="text-[9px] font-bold text-gray-500">
                        {targetPrinter === 'cocina'
                          ? 'Cocina (80mm LAN)'
                          : targetPrinter === 'caja'
                          ? 'Caja (58mm USB)'
                          : targetPrinter === 'ambas'
                          ? 'Ambas'
                          : 'Sin ticket'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { id: 'cocina', label: '🍳 Cocina' },
                        { id: 'caja', label: '💳 Caja' },
                        { id: 'ambas', label: '⚡ Ambas' },
                        { id: 'ninguna', label: '🚫 No' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setTargetPrinter(p.id as any)}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-black text-center transition-all border cursor-pointer ${
                            targetPrinter === p.id
                              ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs font-black'
                              : 'bg-stone-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={cartItems.length === 0 || isSubmittingOrder}
                    onClick={handleSubmitOrder}
                    className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                      cartItems.length === 0 || isSubmittingOrder
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 active:scale-[0.99]'
                    }`}
                  >
                    <IoPaperPlane className="text-sm" />
                    <span>{isSubmittingOrder ? 'ENVIANDO COMANDA...' : 'ENVIAR A COCINA & CAJA'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURADOR DE HAMBURGUESAS */}
      <BurgerBuilderModal
        burger={selectedBurger}
        availableExtras={availableExtras}
        isOpen={!!selectedBurger}
        onClose={() => setSelectedBurger(null)}
        onConfirm={handleConfirmBurgerAdd}
        defaultTakeaway={activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery'}
        exchangeRates={exchangeRates}
      />

      {/* MODAL 3: SELECTOR DE BEBIDAS / JUGOS */}
      <DrinkSelectorModal
        drink={selectedDrink}
        isOpen={!!selectedDrink}
        onClose={() => setSelectedDrink(null)}
        onConfirm={handleConfirmDrinkAdd}
        defaultTakeaway={activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery'}
        exchangeRates={exchangeRates}
      />

      {/* MODAL 4: CAMBIO DE MESA */}
      {tableChangeOrder && (
        <ChangeTableModal
          order={tableChangeOrder}
          isOpen={!!tableChangeOrder}
          onClose={() => setTableChangeOrder(null)}
        />
      )}

      {orderAppendModalOrder && (
        <OrderAppendModal
          order={orderAppendModalOrder}
          isOpen={!!orderAppendModalOrder}
          onClose={() => setOrderAppendModalOrder(null)}
        />
      )}

      {/* MODAL 6: VER DETALLE DE COMANDA */}
      {orderDetailModalOrder && (
        <OrderDetailModal
          order={orderDetailModalOrder}
          isOpen={!!orderDetailModalOrder}
          onClose={() => setOrderDetailModalOrder(null)}
          exchangeRates={exchangeRates}
          onPayOrder={userSession?.role === 'caja' || userSession?.role === 'admin' ? (ord) => setActiveOrderForPay(ord) : undefined}
        />
      )}

      {/* MODAL 7: COBRO DIRECTO DESDE MESAS (TAREA 5) */}
      {activeOrderForPay && (
        <PaymentLedgerModal
          order={activeOrderForPay}
          onClose={() => setActiveOrderForPay(null)}
          onViewOrder={(ord) => setOrderDetailModalOrder(ord)}
        />
      )}

      {/* MODAL 8: IMPRIMIR PRE-CUENTA CLIENTE */}
      <PrinterSelectModal
        isOpen={printerSelectOrder !== null}
        title={`🖨️ PRE-CUENTA COMANDA #${(printerSelectOrder?.orderNumber || '').toString().replace(/^#+/, '')}`}
        jobDescription="Selecciona la impresora térmica donde deseas emitir la pre-cuenta del cliente"
        defaultTarget="caja"
        onClose={() => setPrinterSelectOrder(null)}
        onSelectPrinter={async (target) => {
          if (printerSelectOrder) {
            reportService.generatePreCuentaTicket(printerSelectOrder, exchangeRates);
            await printOrderReceipt(printerSelectOrder.id, target);
            setSentAlert(`🧾 Pre-cuenta de la comanda #${printerSelectOrder.orderNumber} enviada a imprimir.`);
            setTimeout(() => setSentAlert(null), 4000);
          }
        }}
      />
    </div>
  );
};
