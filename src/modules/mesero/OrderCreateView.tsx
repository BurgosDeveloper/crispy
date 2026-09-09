import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, OrderItem, Ingredient } from '../../data/mockData';
import { ProductTextCatalog } from './ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from './BurgerBuilderModal';
import { DrinkSelectorModal } from './DrinkSelectorModal';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName, formatRemovedIngredients } from '../../utils/burgerProteins';
import { isCustomizableProduct } from '../../utils/productClassifier';

import {
  IoClose,
  IoTrashOutline,
  IoPaperPlane,
  IoWarningOutline,
  IoPrintOutline,
  IoArrowBack,
} from 'react-icons/io5';

export interface OrderTarget {
  type: 'mesa' | 'delivery' | 'pickup';
  tableNumber?: number;
  title: string;
}

interface OrderCreateViewProps {
  target: OrderTarget;
  onClose: () => void;
  onOrderCreated?: () => void;
}

export const OrderCreateView: React.FC<OrderCreateViewProps> = ({
  target,
  onClose,
  onOrderCreated,
}) => {
  const {
    products,
    ingredients,
    createOrder,
    exchangeRates,
    userSession,
  } = useApp();

  // Estados de catálogo y búsqueda
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Carrito y Formulario de Orden
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(0);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [targetPrinter, setTargetPrinter] = useState<'cocina' | 'caja' | 'ambas' | 'ninguna'>('cocina');

  // Modales de Productos
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);

  // Filtrado de catálogo por turno
  const activeProducts = products
    .filter((p) => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const activeIngredients = ingredients
    .filter((i) => !i.shift || i.shift === 'ambos' || i.shift === userSession?.shift)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const availableExtras = activeIngredients.filter(
    (i) => i.isExtra || i.isExtraForPizza || i.ingredientType === 'adicional' || i.ingredientType === 'gratis' || i.category === 'Adicionales' || i.category === 'Toppings'
  );

  const availableProteins = activeIngredients.filter(
    (i) => i.ingredientType === 'proteina' || i.category === 'Proteínas' || i.category === 'Carnes'
  );

  const availableSalsas = activeIngredients.filter(
    (i) => i.category === 'Salsas' || i.ingredientType === 'salsa'
  );

  // Helper para comparar ítems idénticos en carrito
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

  // Selección de Producto desde Catálogo
  const handleSelectProduct = (product: Product) => {
    const isTargetTakeaway = target.type === 'pickup' || target.type === 'delivery';

    if (isCustomizableProduct(product)) {
      setSelectedBurger(product);
    } else if (product.drinkType === 'jugo') {
      setSelectedDrink(product);
    } else {
      // Adición directa al carrito para bebidas o acompañantes estándar
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

  // Adición directa de Salsa (Costo 0.00, no contable, directo a cocina)
  const handleSelectSalsa = (salsa: Ingredient) => {
    const isTargetTakeaway = target.type === 'pickup' || target.type === 'delivery';
    const newItem: OrderItem = {
      id: `item-salsa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: salsa.id,
      productName: salsa.name.toUpperCase(),
      price: 0,
      quantity: 1,
      category: 'Salsas',
      isTakeaway: isTargetTakeaway,
      isNewOrModified: false,
    };
    setCartItems((prev) => mergeCartItem(prev, newItem));
  };

  // Confirmar Hamburguesa personalizada
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

  // Confirmar Bebida seleccionada
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

  const itemsSubtotalUSD = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTotalUSD = itemsSubtotalUSD + (target.type === 'delivery' ? deliveryFeeUSD : 0);

  // Envío de Comanda
  const handleSubmitOrder = async () => {
    if (cartItems.length === 0 || isSubmittingOrder) return;

    if (target.type === 'delivery') {
      if (!customerName.trim()) {
        setOrderError('⚠️ Para Delivery es obligatorio ingresar nombre y dirección del cliente.');
        return;
      }
      if (deliveryFeeUSD <= 0) {
        setOrderError('⚠️ Debe seleccionar el costo del Delivery.');
        return;
      }
    }

    if (target.type === 'pickup' && !customerName.trim()) {
      setOrderError('⚠️ Para PickUp es obligatorio ingresar el nombre o referencia del cliente.');
      return;
    }

    setOrderError(null);
    setIsSubmittingOrder(true);

    try {
      await createOrder({
        type: target.type,
        tableNumber: target.tableNumber,
        customerName: customerName.trim() || undefined,
        kitchenNotes: getCleanItemNote(kitchenNotes) || undefined,
        items: cartItems,
        totalUSD: cartTotalUSD,
        deliveryFeeUSD: target.type === 'delivery' ? deliveryFeeUSD : 0,
        shift: userSession?.shift || 'ambos',
        targetPrinter,
      } as any);

      if (onOrderCreated) {
        onOrderCreated();
      }
      onClose();
    } catch (err: any) {
      setOrderError(err?.message || 'Error al enviar la comanda a cocina y caja.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-xs">
      {/* 1. Header de Toma de Pedidos */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-yellow-400 border-b border-yellow-500 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-black/10 hover:bg-black/20 text-black font-black transition-all cursor-pointer"
            title="Volver al tablero de mesas"
          >
            <IoArrowBack className="text-lg" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-black text-black uppercase tracking-tight">
              {target.title}
            </span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-black text-yellow-400">
              {target.type === 'delivery' ? 'DELIVERY' : target.type === 'pickup' ? 'PICKUP' : 'SALÓN'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-gray-800 hover:text-red-700 transition-colors flex items-center gap-1.5 font-black text-xs cursor-pointer border border-gray-200 shadow-xs"
        >
          <IoClose className="text-base" />
          <span>Cerrar Pedido</span>
        </button>
      </div>

      {/* Alerta de Error si la hay */}
      {orderError && (
        <div className="bg-red-50 text-red-700 px-3.5 py-2 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
          <IoWarningOutline className="text-base shrink-0" />
          <span>{orderError}</span>
        </div>
      )}

      {/* 2. Cuerpo: Split View (Catálogo a la izquierda 65%, Carrito a la derecha 35%) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-stone-100">
        {/* IZQUIERDA: Catálogo e Inline Burger Builder (65%) */}
        <div className={`flex-1 md:w-[65%] ${selectedBurger ? 'p-1 sm:p-1.5' : 'p-2.5 sm:p-3'} border-r border-gray-200 flex flex-col overflow-hidden min-h-0`}>
          {!selectedBurger ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <ProductTextCatalog
                products={activeProducts}
                onSelectProduct={handleSelectProduct}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                exchangeRates={exchangeRates}
                salsas={availableSalsas}
                onSelectSalsa={handleSelectSalsa}
              />
            </div>
          ) : (
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <BurgerBuilderModal
                burger={selectedBurger}
                availableExtras={availableExtras}
                availableProteins={availableProteins}
                isOpen={true}
                inline={true}
                onClose={() => setSelectedBurger(null)}
                onConfirm={(config) => {
                  handleConfirmBurgerAdd(config);
                  setSelectedBurger(null);
                }}
                defaultTakeaway={target.type === 'pickup' || target.type === 'delivery'}
                exchangeRates={exchangeRates}
              />
            </div>
          )}
        </div>

        {/* DERECHA: Carrito y Formulario (35%) */}
        <div className="md:w-[35%] p-2.5 sm:p-3 flex flex-col justify-between bg-gray-50 overflow-hidden min-h-0 border-l border-gray-200">
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-2">
            {/* Campos de Cliente y Notas */}
            <div className="space-y-2 shrink-0 bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
              <div>
                <label className="block text-xs font-black uppercase text-gray-800 tracking-wider">
                  {target.type === 'delivery'
                    ? 'Cliente y Dirección (*Obligatorio):'
                    : target.type === 'pickup'
                    ? 'Cliente / Referencia (*Obligatorio):'
                    : 'Nombre o Referencia (Opcional):'}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={
                    target.type === 'delivery'
                      ? 'Ej: Juan Pérez / Calle 5 #10-20'
                      : 'Ej: Juan Pérez'
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-bold mt-1 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-800 tracking-wider">
                  Nota de cocina / Observación general:
                </label>
                <input
                  type="text"
                  value={kitchenNotes}
                  onChange={(e) => setKitchenNotes(e.target.value)}
                  placeholder="Ej: Servir todo junto, sin cubiertos..."
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-semibold mt-1 shadow-2xs"
                />
              </div>

              {/* Selector de Envío para Delivery */}
              {target.type === 'delivery' && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black uppercase text-gray-800">
                      Costo de Envío Delivery:
                    </span>
                    <span className="text-sm font-black text-black bg-yellow-400 px-2 py-0.5 rounded-lg border border-yellow-500">
                      ${deliveryFeeUSD.toFixed(2)} USD
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 1.5, 2, 2.5, 3, 4, 5].map((fee) => (
                      <button
                        key={fee}
                        type="button"
                        onClick={() => setDeliveryFeeUSD(fee)}
                        className={`px-3 py-1 rounded-lg text-xs font-black border transition-all cursor-pointer ${
                          deliveryFeeUSD === fee
                            ? 'bg-yellow-400 border-yellow-500 text-black shadow-xs font-black scale-[1.03]'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        ${fee}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lista Scrollable de Ítems en el Carrito */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[140px]">
              <div className="flex items-center justify-between text-xs font-black uppercase text-gray-600 px-1">
                <span>Ítems Agregados ({cartItems.reduce((s, i) => s + i.quantity, 0)})</span>
                <span>Total</span>
              </div>

              {cartItems.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center text-gray-400 text-sm border border-dashed border-gray-300 rounded-2xl bg-white/60 p-3">
                  <span className="font-bold">El carrito está vacío</span>
                  <span className="text-xs text-gray-400 mt-1">
                    Toca un ítem del catálogo para agregarlo
                  </span>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl bg-white border border-gray-200 shadow-xs flex flex-col gap-1.5"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <span className="text-sm sm:text-base font-black text-gray-950 block leading-tight">
                          {item.productName}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {item.isTakeaway && (
                            <span className="text-[11px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md inline-block">
                              📦 Para Llevar
                            </span>
                          )}
                          {item.category === 'Salsas' ? (
                            <span className="text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md inline-block">
                              🥣 Salsa
                            </span>
                          ) : (item.isCut || item.cutPreference === 'Picada') ? (
                            <span className="text-[11px] font-black text-red-800 bg-red-100 px-1.5 py-0.5 rounded-md inline-block">
                              🔪 Picada
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-md inline-block">
                              🍔 Entera
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-sm sm:text-base font-black text-black shrink-0">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    {/* Proteínas */}
                    {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                      <div className="text-xs text-amber-950 font-black bg-yellow-100 px-2 py-0.5 rounded-lg border border-yellow-300 inline-block">
                        🥩 {item.proteins.join(' + ')}
                      </div>
                    )}

                    {/* Ingredientes Retirados (SIN) */}
                    {item.removedIngredients && item.removedIngredients.length > 0 && (
                      <div className="text-xs text-red-600 font-bold">
                        🚫 SIN: {formatRemovedIngredients(item.removedIngredients).join(', ')}
                      </div>
                    )}

                    {/* Ingredientes Extras (ADD) */}
                    {item.extras && item.extras.length > 0 && (
                      <div className="text-xs text-gray-800 font-bold space-y-0.5">
                        {item.extras.map((ex, exIdx) => (
                          <div key={exIdx} className="flex justify-between">
                            <span>➕ ADD: {ex.name}</span>
                            {ex.price > 0 && <span className="font-black text-emerald-700">+${ex.price.toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preferencia de Azúcar */}
                    {item.sugarPreference && (
                      <div className="text-xs text-blue-700 font-bold">
                        🥤 Azúcar: {item.sugarPreference}
                      </div>
                    )}

                    {/* Nota del ítem */}
                    {getCleanItemNote(item.notes) && (
                      <div className="text-xs text-gray-600 italic">
                        📝 Nota: {getCleanItemNote(item.notes)}
                      </div>
                    )}

                    {/* Controles de Cantidad y Eliminar */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 mt-1">
                      <div className="flex items-center border border-gray-300 rounded-xl bg-gray-50 overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.id, -1)}
                          className="px-3 py-1 text-sm font-black text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                          -
                        </button>
                        <span className="px-3 text-sm font-black text-black">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.id, 1)}
                          className="px-3 py-1 text-sm font-black text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeCartItem(item.id)}
                        className="text-gray-400 hover:text-red-600 p-1.5 transition-colors cursor-pointer"
                        title="Eliminar este ítem"
                      >
                        <IoTrashOutline className="text-base" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer del Carrito: Totales e Impresión */}
          <div className="pt-2 border-t border-gray-200 shrink-0 space-y-2 mt-2">
            <div className="bg-white p-3 rounded-2xl border border-gray-200 space-y-1 shadow-xs">
              <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-600">
                <span>Subtotal Ítems:</span>
                <span className="text-black font-black">${itemsSubtotalUSD.toFixed(2)} USD</span>
              </div>

              {target.type === 'delivery' && (
                <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-600">
                  <span>Costo Delivery:</span>
                  <span className="text-black font-black">+${deliveryFeeUSD.toFixed(2)} USD</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100">
                <span className="text-xs sm:text-sm font-black text-gray-900 uppercase">Total a Pagar:</span>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-black block leading-none">
                    ${cartTotalUSD.toFixed(2)} USD
                  </span>
                  <span className="text-xs text-gray-600 font-bold block mt-1">
                    ≈ ${(cartTotalUSD * exchangeRates.COP).toLocaleString()} COP | {(cartTotalUSD * exchangeRates.Bs).toFixed(2)} Bs
                  </span>
                </div>
              </div>
            </div>

            {/* Selector de Impresora */}
            <div className="pt-2 border-t border-gray-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <IoPrintOutline className="text-sm text-yellow-600" />
                  <span>Imprimir Comanda:</span>
                </span>
                <span className="text-[11px] font-black text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
                  {targetPrinter === 'cocina'
                    ? 'Cocina (80mm LAN)'
                    : targetPrinter === 'caja'
                    ? 'Caja (58mm USB)'
                    : targetPrinter === 'ambas'
                    ? 'Ambas'
                    : 'Sin ticket'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
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
                    className={`py-2 px-1 rounded-xl text-xs font-black text-center transition-all border cursor-pointer ${
                      targetPrinter === p.id
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs font-black scale-[1.02]'
                        : 'bg-stone-50 text-gray-700 border-gray-200 hover:bg-gray-100'
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
              className={`w-full py-3.5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                cartItems.length === 0 || isSubmittingOrder
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 active:scale-[0.99]'
              }`}
            >
              <IoPaperPlane className="text-base" />
              <span>{isSubmittingOrder ? 'ENVIANDO COMANDA...' : 'ENVIAR A COCINA & CAJA'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Selector Modal de Bebidas (si aplica) */}
      <DrinkSelectorModal
        drink={selectedDrink}
        isOpen={!!selectedDrink}
        onClose={() => setSelectedDrink(null)}
        onConfirm={handleConfirmDrinkAdd}
        defaultTakeaway={target.type === 'pickup' || target.type === 'delivery'}
        exchangeRates={exchangeRates}
      />
    </div>
  );
};
