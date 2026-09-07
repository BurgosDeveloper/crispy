import React, { useState, useEffect } from 'react';
import { Order, OrderItem, Product } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { ProductTextCatalog } from '../modules/mesero/ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from '../modules/mesero/BurgerBuilderModal';
import { DrinkSelectorModal } from '../modules/mesero/DrinkSelectorModal';
import { AdminPinModal } from './AdminPinModal';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault } from '../utils/burgerProteins';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoTrashOutline,
  IoAlertCircleOutline,
  IoCheckmarkCircle,
  IoRestaurantOutline,
  IoPrintOutline,
} from 'react-icons/io5';

interface OrderAppendModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OrderAppendModal: React.FC<OrderAppendModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const { products, ingredients, appendOrderItems, exchangeRates, userSession } = useApp();

  // Estados de catálogo y búsqueda
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [itemsToAdd, setItemsToAdd] = useState<OrderItem[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');
  const [targetPrinter, setTargetPrinter] = useState<'cocina' | 'caja' | 'ambas' | 'ninguna'>('cocina');

  // Modales de configuración
  const [configuringBurger, setConfiguringBurger] = useState<Product | null>(null);
  const [configuringDrink, setConfiguringDrink] = useState<Product | null>(null);

  // Modal de PIN para eliminar ítems ya existentes
  const [pinModalState, setPinModalState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionName: string;
    onSuccess: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionName: '',
    onSuccess: () => {},
  });

  // Reset al abrir modal
  useEffect(() => {
    if (isOpen) {
      setItemsToAdd([]);
      setRemovedItemIds([]);
      setError('');
      setSuccessToast('');
      setIsSubmitting(false);
      setSearchQuery('');
      setSelectedCategory('Todas');
      setConfiguringBurger(null);
      setConfiguringDrink(null);
    }
  }, [isOpen, order?.id]);

  if (!isOpen || !order) return null;

  // Filtrar productos por turno si aplica
  const activeProducts = products.filter(
    (p) => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift
  );

  // Manejo de clic en producto desde el catálogo
  const handleSelectProduct = (prod: Product) => {
    const isBurger =
      prod.category === 'Hamburguesas' ||
      (prod.baseIngredients && prod.baseIngredients.length > 0) ||
      /burger|hamburguesa|sencilla|doble|triple|smash|tasty|mixtura/i.test(prod.name);

    if (isBurger) {
      setConfiguringBurger(prod);
    } else if (prod.category === 'Bebidas') {
      setConfiguringDrink(prod);
    } else {
      // Producto directo (acompañantes, postres u otros)
      const newItem: OrderItem = {
        id: `add-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: prod.id,
        productName: prod.name,
        price: prod.price,
        quantity: 1,
        category: prod.category || 'Otros',
        isTakeaway: order.type === 'pickup' || order.type === 'delivery',
        isNewOrModified: true,
      };
      setItemsToAdd((prev) => [...prev, newItem]);
      setSuccessToast(`¡${prod.name} agregado!`);
      setTimeout(() => setSuccessToast(''), 3000);
    }
  };

  // Confirmar adición de hamburguesa desde BurgerBuilderModal
  const handleConfirmBurgerAdd = (
    configOrList: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const newItems: OrderItem[] = list.map((config) => ({
      id: `add-bg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: config.burger.id,
      productName: config.burger.name,
      price: config.finalPrice,
      quantity: config.quantity,
      category: config.burger.category || 'Hamburguesas',
      proteins: config.proteins && config.proteins.length > 0 ? config.proteins : undefined,
      removedIngredients: config.removedIngredients.length > 0 ? config.removedIngredients : undefined,
      extras: config.extras.length > 0 ? config.extras : undefined,
      isTakeaway: config.isTakeaway,
      isCut: config.isCut,
      cutPreference: config.cutPreference,
      notes: config.notes,
      isNewOrModified: true,
    }));
    setItemsToAdd((prev) => [...prev, ...newItems]);
    setConfiguringBurger(null);
    setSuccessToast(`¡${list.length} hamburguesa(s) agregada(s)!`);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  // Confirmar adición de bebida desde DrinkSelectorModal
  const handleConfirmDrinkAdd = (config: {
    drink: Product;
    quantity: number;
    sugarPreference?: string;
    isTakeaway: boolean;
    notes?: string;
  }) => {
    const newItem: OrderItem = {
      id: `add-dr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: config.drink.id,
      productName: config.drink.name,
      price: config.drink.price,
      quantity: config.quantity,
      category: config.drink.category || 'Bebidas',
      drinkType: config.drink.drinkType,
      sugarPreference: config.sugarPreference,
      isTakeaway: config.isTakeaway,
      notes: config.notes,
      isNewOrModified: true,
    };
    setItemsToAdd((prev) => [...prev, newItem]);
    setConfiguringDrink(null);
    setSuccessToast(`¡${config.drink.name} agregado!`);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  // Modificar cantidades de ítems por adicionar
  const handleUpdateAddedQuantity = (index: number, delta: number) => {
    setItemsToAdd((prev) => {
      const updated = [...prev];
      const newQty = (updated[index].quantity || 1) + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = { ...updated[index], quantity: newQty };
      }
      return updated;
    });
  };

  const handleRemoveAddedItem = (index: number) => {
    setItemsToAdd((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  // Eliminar ítem existente (requiere PIN si no es admin)
  const handleToggleRemoveExistingItem = (itemId: string) => {
    if (removedItemIds.includes(itemId)) {
      setRemovedItemIds((prev) => prev.filter((id) => id !== itemId));
    } else {
      if (userSession?.role === 'admin') {
        setRemovedItemIds((prev) => [...prev, itemId]);
      } else {
        setPinModalState({
          isOpen: true,
          title: '🔐 AUTORIZACIÓN REQUERIDA',
          description: 'Ingrese el PIN de administrador para remover este producto ya enviado a cocina:',
          actionName: 'Remover ítem de comanda',
          onSuccess: () => setRemovedItemIds((prev) => [...prev, itemId]),
        });
      }
    }
  };

  // Cálculos de montos
  const currentSubtotalUSD = (order.items || []).reduce((sum, item) => {
    if (removedItemIds.includes(item.id)) return sum;
    return sum + (item.price || 0) * (item.quantity || 1);
  }, 0);

  const addedSubtotalUSD = itemsToAdd.reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );

  const deliveryFee = order.type === 'delivery' ? (order.deliveryFeeUSD || 0) : 0;
  const newTotalUSD = currentSubtotalUSD + addedSubtotalUSD + deliveryFee;

  // Detección si hay productos de cocina entre los agregados
  const hasKitchenItemsToAdd = itemsToAdd.some(
    (item) => item.category !== 'Bebidas' || (item.drinkType && /jugo|merengada|malteada|batido/i.test(item.drinkType))
  );

  // Enviar al servidor
  const handleSaveAppend = async () => {
    if (itemsToAdd.length === 0 && removedItemIds.length === 0) {
      setError('Debes seleccionar al menos un producto del catálogo para adicionar.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await appendOrderItems(order.id, itemsToAdd, removedItemIds, targetPrinter);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al adicionar productos a la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none">
        <div className="relative w-full max-w-7xl h-[96vh] bg-white border-2 border-yellow-400 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col overflow-hidden text-gray-900">
          
          {/* HEADER PRINCIPAL */}
          <header className="flex items-center justify-between border-b border-gray-200 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-yellow-400 border border-yellow-500 flex items-center justify-center text-black text-2xl font-black shadow-xs">
                ➕
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">ADICIONAR A COMANDA</h3>
                  <span className="px-3 py-1 rounded-xl bg-yellow-400 text-black font-black text-sm border border-yellow-500 shadow-xs">
                    #{order.orderNumber.replace(/^#+/, '')}
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-stone-100 text-gray-800 font-black text-xs border border-gray-300">
                    {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : (order.type || 'mesa').toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-600 font-bold block mt-0.5">
                  👤 Cliente: <strong className="text-black">{order.customerName || 'General'}</strong>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-600 hover:text-black transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <IoClose className="text-2xl" />
            </button>
          </header>

          {/* MENSAJES DE NOTIFICACIÓN */}
          {error && (
            <div className="mt-2 p-2.5 rounded-2xl bg-red-50 border border-red-300 text-red-700 text-xs font-bold flex items-center gap-2 shrink-0">
              <IoAlertCircleOutline className="text-xl text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successToast && (
            <div className="mt-2 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black flex items-center gap-2 shrink-0 animate-in fade-in">
              <IoCheckmarkCircle className="text-xl text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* CUERPO PRINCIPAL: 2 COLUMNAS (IZQUIERDA: CATÁLOGO CRISPY 60% | DERECHA: RESUMEN Y CANASTA 40%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 my-3 flex-1 overflow-hidden min-h-0">
            
            {/* COLUMNA IZQUIERDA: CATÁLOGO CRISPY (7 COLS = ~58%) */}
            <div className="lg:col-span-7 flex flex-col overflow-hidden bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
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
            {/* COLUMNA DERECHA: RESUMEN Y PRODUCTOS ADICIONADOS (5 COLS = ~42%) */}
            <div className="lg:col-span-5 flex flex-col gap-3 overflow-hidden bg-stone-50 p-3.5 rounded-2xl border border-gray-200">
              
              <div className="flex items-center justify-between pb-2 border-b border-gray-200 shrink-0">
                <span className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <IoRestaurantOutline className="text-yellow-600 text-base" />
                  <span>Resumen de la Comanda</span>
                </span>
                <span className="text-xs font-black text-gray-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200">
                  Actual: ${currentSubtotalUSD.toFixed(2)} USD
                </span>
              </div>

              {/* LISTA SCROLLABLE DE ÍTEMS EXISTENTES Y NUEVOS */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                
                {/* 1. Ítems ya existentes en la mesa */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 block">
                    Ítems ya pedidos en esta comanda:
                  </span>
                  {(order.items || []).map((it) => {
                    const isRemoved = removedItemIds.includes(it.id);
                    return (
                      <div
                        key={it.id}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                          isRemoved
                            ? 'bg-red-50 border-red-300 text-red-700 line-through opacity-60'
                            : 'bg-white border-gray-200 text-gray-800 shadow-xs'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-black text-black truncate flex items-center gap-1.5">
                            <span>{it.quantity}x {it.productName}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase bg-gray-100 px-1.5 py-0.5 rounded">
                              ✓ En Comanda
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-semibold">
                            ${((it.price || 0) * (it.quantity || 1)).toFixed(2)} USD
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleRemoveExistingItem(it.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                            isRemoved
                              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={isRemoved ? 'Restaurar ítem' : 'Remover ítem de la comanda'}
                        >
                          <IoTrashOutline className="text-base" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* 2. Canasta de Nuevos Ítems a Adicionar */}
                <div className="space-y-1.5 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-yellow-900 flex items-center gap-1">
                      <span>✨</span>
                      <span>Nuevos Ítems a Adicionar ({itemsToAdd.reduce((s, i) => s + i.quantity, 0)}):</span>
                    </span>
                    {itemsToAdd.length > 0 && (
                      <span className="text-xs font-black text-emerald-700">
                        +${addedSubtotalUSD.toFixed(2)} USD
                      </span>
                    )}
                  </div>

                  {itemsToAdd.length === 0 ? (
                    <div className="p-6 rounded-xl border-2 border-dashed border-gray-300 bg-white text-center text-xs font-bold text-gray-400 space-y-1">
                      <p>No has agregado nuevos productos todavía.</p>
                      <p className="text-[10px] text-gray-500">
                        Toca una hamburguesa o bebida del catálogo para sumarla a esta comanda.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {itemsToAdd.map((item, idx) => {
                        const isKitchen =
                          item.category !== 'Bebidas' ||
                          (item.drinkType && /jugo|merengada|malteada|batido/i.test(item.drinkType));

                        return (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-xl bg-white border-2 border-yellow-300 shadow-xs space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-black text-xs text-black">{item.productName}</span>
                                  <span
                                    className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                      isKitchen
                                        ? 'bg-red-100 text-red-800 border border-red-200'
                                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                                    }`}
                                  >
                                    {isKitchen ? '🔥 COCINA' : '🥤 BARRA'}
                                  </span>
                                  {item.cutPreference === 'Picada' && (
                                    <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded">
                                      🔪 Picada
                                    </span>
                                  )}
                                  {item.isTakeaway && (
                                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 rounded">
                                      📦 Llevar
                                    </span>
                                  )}
                                </div>

                                {/* Modificadores */}
                                <div className="text-[10px] text-gray-500 space-y-0.5 mt-0.5">
                                  {item.proteins && item.proteins.length > 0 && !areProteinsDefault(item.productName, item.proteins) && (
                                    <div>🥩 {item.proteins.join(' + ')}</div>
                                  )}
                                  {item.removedIngredients && item.removedIngredients.length > 0 && (
                                    <div className="text-red-600 font-bold">
                                      🚫 SIN {item.removedIngredients.join(', ')}
                                    </div>
                                  )}
                                  {item.extras && item.extras.length > 0 && (
                                    <div className="text-gray-700 font-bold">
                                      {item.extras.map((e) => (e.price === 0 ? `✨ ${e.name}` : `+ ADD: ${e.name} ($${e.price.toFixed(2)})`)).join(' • ')}
                                    </div>
                                  )}
                                  {item.notes && item.notes.replace(/\[#\d+\]/g, '').trim() && (
                                    <div className="italic text-gray-600">"{item.notes.replace(/\[#\d+\]/g, '').trim()}"</div>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="text-xs font-black text-black">
                                  ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* Controles de Cantidad y Eliminar */}
                            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                              <div className="flex items-center border border-gray-300 rounded-lg bg-stone-50 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAddedQuantity(idx, -1)}
                                  className="px-2 py-0.5 hover:bg-gray-200 text-black font-black text-xs cursor-pointer"
                                >
                                  <IoRemove />
                                </button>
                                <span className="px-2.5 py-0.5 text-xs font-black text-black min-w-[1.5rem] text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAddedQuantity(idx, 1)}
                                  className="px-2 py-0.5 hover:bg-gray-200 text-black font-black text-xs cursor-pointer"
                                >
                                  <IoAdd />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveAddedItem(idx)}
                                className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                title="Eliminar ítem agregado"
                              >
                                <IoTrashOutline className="text-base" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* AVISO DE IMPRESIÓN TÉRMICA SELECTIVA (DIRECTIVA DE USUARIO) */}
              <div className="p-2.5 rounded-xl bg-amber-50/80 border border-yellow-300 text-[11px] text-yellow-950 font-bold flex items-center gap-2 shrink-0">
                <IoPrintOutline className="text-lg text-yellow-700 shrink-0" />
                <span>
                  {hasKitchenItemsToAdd ? (
                    <span>🔥 <strong>Cocina:</strong> Los ítems de cocina se imprimirán en el ticket térmico. Las bebidas solo se sumarán a la cuenta.</span>
                  ) : (
                    <span>🥤 <strong>Solo barra/bebidas:</strong> No se enviará ticket a cocina, solo se sumarán a la comanda.</span>
                  )}
                </span>
              </div>

              {/* TOTALES DE LA ADICIÓN Y ACCIÓN */}
              <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs space-y-2 shrink-0">
                <div className="flex items-baseline justify-between font-bold text-xs text-gray-600">
                  <span>Actual: ${currentSubtotalUSD.toFixed(2)}</span>
                  <span>+ Adición: <strong className="text-yellow-700 font-black">+${addedSubtotalUSD.toFixed(2)}</strong></span>
                </div>

                <div className="flex items-baseline justify-between pt-1 border-t border-gray-100">
                  <span className="text-xs font-black text-gray-800 uppercase">Nuevo Total:</span>
                  <div className="text-right">
                    <span className="text-xl font-black text-black">
                      ${newTotalUSD.toFixed(2)} <span className="text-xs font-bold text-gray-500">USD</span>
                    </span>
                    <div className="text-[11px] font-bold text-gray-600">
                      🇨🇴 ${roundCOP(newTotalUSD * copRate).toLocaleString()} COP • 🇻🇪 {(newTotalUSD * bsRate).toFixed(2)} Bs
                    </div>
                  </div>
                </div>

                {/* Selector de Impresora al Adicionar */}
                <div className="pt-2 border-t border-gray-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1">
                      <IoPrintOutline className="text-xs text-yellow-600" />
                      <span>Imprimir Adición en:</span>
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

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 font-black text-xs transition-colors border border-gray-300 cursor-pointer"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAppend}
                    disabled={isSubmitting || (itemsToAdd.length === 0 && removedItemIds.length === 0)}
                    className="flex-[2] py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs sm:text-sm border-2 border-yellow-500 shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <IoCheckmarkCircle className="text-base" />
                    <span>
                      {isSubmitting
                        ? 'GUARDANDO...'
                        : hasKitchenItemsToAdd
                        ? `CONFIRMAR Y ENVIAR A COCINA (${itemsToAdd.length})`
                        : `CONFIRMAR ADICIÓN (${itemsToAdd.length})`}
                    </span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* MODAL CONFIGURADOR DE HAMBURGUESAS (IDÉNTICO A CREAR PEDIDO) */}
      {configuringBurger && (
        <BurgerBuilderModal
          burger={configuringBurger}
          availableExtras={ingredients}
          isOpen={!!configuringBurger}
          onClose={() => setConfiguringBurger(null)}
          onConfirm={handleConfirmBurgerAdd}
          defaultTakeaway={order.type === 'pickup' || order.type === 'delivery'}
          exchangeRates={exchangeRates}
        />
      )}

      {/* MODAL SELECTOR DE BEBIDAS */}
      {configuringDrink && (
        <DrinkSelectorModal
          drink={configuringDrink}
          isOpen={!!configuringDrink}
          onClose={() => setConfiguringDrink(null)}
          onConfirm={handleConfirmDrinkAdd}
          defaultTakeaway={order.type === 'pickup' || order.type === 'delivery'}
          exchangeRates={exchangeRates}
        />
      )}

      {/* MODAL DE PIN PARA AUTORIZACIÓN DE ELIMINACIÓN */}
      <AdminPinModal
        isOpen={pinModalState.isOpen}
        title={pinModalState.title}
        description={pinModalState.description}
        actionName={pinModalState.actionName}
        onSuccess={pinModalState.onSuccess}
        onClose={() => setPinModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
