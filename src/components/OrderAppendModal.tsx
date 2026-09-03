import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderItem, Product } from '../data/mockData';
import { getIngredientExtraPrice } from '../utils/pizzaPricing';
import { useApp } from '../context/AppContext';
import { AdminPinModal } from './AdminPinModal';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoTrashOutline,
  IoPizza,
  IoBeer,
  IoLockClosedOutline,
  IoFlashOutline,
  IoAlertCircleOutline,
  IoSearchOutline,
  IoCheckmarkCircle,
  IoArrowBack,
  IoRestaurantOutline,
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
  const isMorningShift = userSession?.shift === 'manana';

  // Estados de navegación y catálogo
  const [activeCategory, setActiveCategory] = useState<'Pizzas' | 'Bebidas' | 'Otros'>('Pizzas');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsToAdd, setItemsToAdd] = useState<OrderItem[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // --- CONFIGURADOR DE PIZZAS / PLATOS ---
  const [configuringPizza, setConfiguringPizza] = useState<Product | null>(null);
  const [pizzaSize, setPizzaSize] = useState<'Grande' | 'Pequeña'>('Grande');
  const [isHalfHalf, setIsHalfHalf] = useState(false);
  const [pizzaHalf2, setPizzaHalf2] = useState<Product | null>(null);
  const [activeHalfTab, setActiveHalfTab] = useState<'half1' | 'half2'>('half1');
  
  // Modificadores para pizza completa / plato
  const [pizzaRemoved, setPizzaRemoved] = useState<string[]>([]);
  const [pizzaExtras, setPizzaExtras] = useState<{ name: string; price: number }[]>([]);
  
  // Modificadores para mitades independientes
  const [pizzaHalf1Removed, setPizzaHalf1Removed] = useState<string[]>([]);
  const [pizzaHalf2Removed, setPizzaHalf2Removed] = useState<string[]>([]);
  const [pizzaHalf1Extras, setPizzaHalf1Extras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaHalf2Extras, setPizzaHalf2Extras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaNotes, setPizzaNotes] = useState('');
  const [pizzaIsTakeaway, setPizzaIsTakeaway] = useState(false);

  // --- CONFIGURADOR DE BEBIDAS / JUGOS ---
  const [configuringDrink, setConfiguringDrink] = useState<Product | null>(null);
  const [drinkSugar, setDrinkSugar] = useState<'Con Azúcar' | 'Poca Azúcar' | 'Sin Azúcar'>('Con Azúcar');
  const [drinkNotes, setDrinkNotes] = useState('');
  const [drinkIsTakeaway, setDrinkIsTakeaway] = useState(false);

  // --- MODAL DE PIN PARA AUTORIZACIÓN ---
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

  // Reset de estados al abrir
  useEffect(() => {
    if (isOpen) {
      setItemsToAdd([]);
      setRemovedItemIds([]);
      setError('');
      setSuccessToast('');
      setIsSubmitting(false);
      setSearchQuery('');
      setActiveCategory('Pizzas');
      resetPizzaConfig();
      resetDrinkConfig();
    }
  }, [isOpen, order?.id]);

  const resetPizzaConfig = () => {
    setConfiguringPizza(null);
    setPizzaSize('Grande');
    setIsHalfHalf(false);
    setPizzaHalf2(null);
    setActiveHalfTab('half1');
    setPizzaRemoved([]);
    setPizzaExtras([]);
    setPizzaHalf1Removed([]);
    setPizzaHalf2Removed([]);
    setPizzaHalf1Extras([]);
    setPizzaHalf2Extras([]);
    setPizzaNotes('');
    setPizzaIsTakeaway(order?.type === 'pickup' || order?.type === 'delivery');
  };

  const resetDrinkConfig = () => {
    setConfiguringDrink(null);
    setDrinkSugar('Con Azúcar');
    setDrinkNotes('');
    setDrinkIsTakeaway(order?.type === 'pickup' || order?.type === 'delivery');
  };

  const handlePizzaSizeChange = (newSize: 'Grande' | 'Pequeña') => {
    setPizzaSize(newSize);
    setPizzaExtras((prev) =>
      prev.map((e) => {
        const ing = ingredients.find((i) => i.name === e.name);
        return { name: e.name, price: getIngredientExtraPrice(ing, newSize, false) };
      })
    );
    setPizzaHalf1Extras((prev) =>
      prev.map((e) => {
        const ing = ingredients.find((i) => i.name === e.name);
        return { name: e.name, price: getIngredientExtraPrice(ing, newSize, true) };
      })
    );
    setPizzaHalf2Extras((prev) =>
      prev.map((e) => {
        const ing = ingredients.find((i) => i.name === e.name);
        return { name: e.name, price: getIngredientExtraPrice(ing, newSize, true) };
      })
    );
  };

  // Listas ordenadas alfabéticamente A-Z
  const availableExtras = useMemo(() => {
    return ingredients
      .filter((i) => i.isExtraForPizza && (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  const pizzaProducts = useMemo(() => {
    return products
      .filter((p) => (isMorningShift ? ['Entradas', 'Especialidades', 'Pastas', 'Pizzas'].includes(p.category) : p.category === 'Pizzas') && (!p.shift || p.shift === 'ambos' || p.shift === userSession?.shift))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, userSession?.shift, isMorningShift]);

  const drinkProducts = useMemo(() => {
    return products
      .filter((p) => p.category === 'Bebidas' && (!p.shift || p.shift === 'ambos' || p.shift === userSession?.shift))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, userSession?.shift]);

  const otherProducts = useMemo(() => {
    return products
      .filter((p) => (isMorningShift ? !['Entradas', 'Especialidades', 'Pastas', 'Pizzas', 'Bebidas'].includes(p.category) : (p.category !== 'Pizzas' && p.category !== 'Bebidas')) && (!p.shift || p.shift === 'ambos' || p.shift === userSession?.shift))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, userSession?.shift, isMorningShift]);

  const filteredProducts = useMemo(() => {
    const currentList = activeCategory === 'Pizzas' ? pizzaProducts : activeCategory === 'Bebidas' ? drinkProducts : otherProducts;
    if (!searchQuery.trim()) return currentList;
    const q = searchQuery.toLowerCase().trim();
    return currentList.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  }, [activeCategory, pizzaProducts, drinkProducts, otherProducts, searchQuery]);

  if (!isOpen || !order) return null;

  // Totales financieros de la comanda
  const currentItems = (order.items || []).filter((item) => !removedItemIds.includes(item.id));
  const currentSubtotalUSD = currentItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const deliveryFee = order.type === 'delivery' ? Number(order.deliveryFeeUSD) || 0 : 0;
  const addedSubtotalUSD = itemsToAdd.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const projectedTotalUSD = Number((currentSubtotalUSD + addedSubtotalUSD + deliveryFee).toFixed(2));

  // --- PIN DE SEGURIDAD ---
  const requireAdminPin = (actionName: string, title: string, callback: () => void, description?: string) => {
    if (userSession?.role === 'admin') {
      callback();
    } else {
      setPinModalState({
        isOpen: true,
        title: title || '🔐 AUTORIZACIÓN DE ADMINISTRADOR',
        description: description || 'Ingrese el PIN de 4 dígitos para autorizar el borrado de este ítem:',
        actionName,
        onSuccess: callback,
      });
    }
  };

  const handleRemoveExistingItem = (item: OrderItem) => {
    if (item.isPaidIndividually) {
      setError(`El producto "${item.productName}" ya fue pagado individualmente. Anula el abono antes de eliminarlo.`);
      return;
    }
    setError('');
    requireAdminPin(`Eliminar ítem "${item.productName}"`, 'Autorizar Eliminación de Producto', () => {
      setRemovedItemIds((prev) => [...prev, item.id]);
    });
  };

  const handleRestoreExistingItem = (itemId: string) => {
    setRemovedItemIds((prev) => prev.filter((id) => id !== itemId));
  };

  // --- CÁLCULO DE PRECIO DE PIZZA / PLATO ---
  const calculatePizzaPrice = () => {
    if (!configuringPizza) return 0;
    if (isMorningShift) {
      const extrasTotal = pizzaExtras.reduce((sum, e) => sum + (e.price || 0), 0);
      return configuringPizza.price + extrasTotal;
    }

    let basePrice = configuringPizza.price;
    let smallPrice = configuringPizza.priceSmall ?? (configuringPizza.price > 4 ? configuringPizza.price - 4 : configuringPizza.price * 0.7);

    if (isHalfHalf && pizzaHalf2) {
      basePrice = Math.max(configuringPizza.price, pizzaHalf2.price);
      const small1 = configuringPizza.priceSmall ?? (configuringPizza.price > 4 ? configuringPizza.price - 4 : configuringPizza.price * 0.7);
      const small2 = pizzaHalf2.priceSmall ?? (pizzaHalf2.price > 4 ? pizzaHalf2.price - 4 : pizzaHalf2.price * 0.7);
      smallPrice = Math.max(small1, small2);
    }

    const effectiveBase = pizzaSize === 'Pequeña' ? smallPrice : basePrice;
    const extrasTotal = isHalfHalf
      ? [...pizzaHalf1Extras, ...pizzaHalf2Extras].reduce((sum, e) => sum + (e.price || 0), 0)
      : pizzaExtras.reduce((sum, e) => sum + (e.price || 0), 0);

    return Math.max(2.0, effectiveBase + extrasTotal);
  };

  // --- AGREGAR PIZZA / PLATO CONFIGURADO ---
  const handleConfirmAddPizza = () => {
    if (!configuringPizza) return;
    const unitPrice = calculatePizzaPrice();

    if (isMorningShift) {
      const newItem: OrderItem = {
        id: `add-pl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        productId: configuringPizza.id,
        productName: configuringPizza.name,
        price: unitPrice,
        quantity: 1,
        category: configuringPizza.category,
        removedIngredients: pizzaRemoved.length ? pizzaRemoved : undefined,
        extras: pizzaExtras.length ? pizzaExtras : undefined,
        notes: pizzaNotes || '',
        isTakeaway: pizzaIsTakeaway,
        isNewOrModified: true,
      };

      setItemsToAdd((prev) => [...prev, newItem]);
      setSuccessToast(`¡${newItem.productName} agregado a la adición!`);
      setTimeout(() => setSuccessToast(''), 3000);
      resetPizzaConfig();
      return;
    }

    const isHH = isHalfHalf && !!pizzaHalf2;

    const newItem: OrderItem = {
      id: `add-pz-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: configuringPizza.id,
      productName: isHH ? `Pizza 1/2 ${configuringPizza.name} + 1/2 ${pizzaHalf2?.name}` : configuringPizza.name,
      price: unitPrice,
      quantity: 1,
      category: configuringPizza.category,
      size: pizzaSize,
      isHalfHalf: isHH,
      halfDetails: isHH
        ? {
            half1Name: configuringPizza.name,
            half2Name: pizzaHalf2?.name,
            half1Removed: pizzaHalf1Removed,
            half2Removed: pizzaHalf2Removed,
            half1Extras: pizzaHalf1Extras,
            half2Extras: pizzaHalf2Extras,
          }
        : undefined,
      removedIngredients: !isHH ? pizzaRemoved : [],
      extras: !isHH ? pizzaExtras : [],
      notes: pizzaNotes || '',
      isTakeaway: pizzaIsTakeaway,
      isNewOrModified: true,
    };

    setItemsToAdd((prev) => [...prev, newItem]);
    setSuccessToast(`¡${newItem.productName} agregada a la lista de adición!`);
    setTimeout(() => setSuccessToast(''), 3000);
    resetPizzaConfig();
  };

  // --- AGREGAR BEBIDA CONFIGURADA ---
  const handleConfirmAddDrink = () => {
    if (!configuringDrink) return;
    const isJugo = configuringDrink.drinkType === 'jugo';

    const newItem: OrderItem = {
      id: `add-dk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: configuringDrink.id,
      productName: configuringDrink.name,
      price: configuringDrink.price,
      quantity: 1,
      category: configuringDrink.category,
      drinkType: configuringDrink.drinkType,
      sugarPreference: isJugo ? drinkSugar : undefined,
      notes: drinkNotes || '',
      isTakeaway: drinkIsTakeaway,
      isNewOrModified: true,
    };

    setItemsToAdd((prev) => [...prev, newItem]);
    setSuccessToast(`¡${newItem.productName} agregada a la lista de adición!`);
    setTimeout(() => setSuccessToast(''), 3000);
    resetDrinkConfig();
  };

  // --- CLICK EN PRODUCTO DEL CATÁLOGO ---
  const handleSelectProduct = (prod: Product) => {
    const defaultTakeaway = order?.type === 'pickup' || order?.type === 'delivery';

    if (isMorningShift) {
      if (prod.category === 'Bebidas' && prod.drinkType === 'jugo') {
        setConfiguringDrink(prod);
        setDrinkSugar('Con Azúcar');
        setDrinkNotes('');
        setDrinkIsTakeaway(defaultTakeaway);
      } else if (prod.category === 'Bebidas') {
        const newItem: OrderItem = {
          id: `add-dk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          productId: prod.id,
          productName: prod.name,
          price: prod.price,
          quantity: 1,
          category: prod.category,
          drinkType: prod.drinkType,
          isTakeaway: defaultTakeaway,
          isNewOrModified: true,
        };
        setItemsToAdd((prev) => [...prev, newItem]);
        setSuccessToast(`¡${newItem.productName} agregado!`);
        setTimeout(() => setSuccessToast(''), 3000);
      } else {
        // Platos de la mañana (Entradas, Especialidades, Pastas, etc.)
        setConfiguringPizza(prod);
        setPizzaSize('Grande');
        setIsHalfHalf(false);
        setPizzaHalf2(null);
        setPizzaRemoved([]);
        setPizzaExtras([]);
        setPizzaHalf1Removed([]);
        setPizzaHalf2Removed([]);
        setPizzaHalf1Extras([]);
        setPizzaHalf2Extras([]);
        setPizzaNotes('');
        setPizzaIsTakeaway(defaultTakeaway);
      }
      return;
    }

    if (prod.category === 'Pizzas') {
      setConfiguringPizza(prod);
      setPizzaSize('Grande');
      setIsHalfHalf(false);
      setPizzaHalf2(pizzaProducts.find((p) => p.id !== prod.id) || null);
      setPizzaRemoved([]);
      setPizzaExtras([]);
      setPizzaHalf1Removed([]);
      setPizzaHalf2Removed([]);
      setPizzaHalf1Extras([]);
      setPizzaHalf2Extras([]);
      setPizzaNotes('');
      setPizzaIsTakeaway(defaultTakeaway);
    } else if (prod.category === 'Bebidas' && prod.drinkType === 'jugo') {
      setConfiguringDrink(prod);
      setDrinkSugar('Con Azúcar');
      setDrinkNotes('');
      setDrinkIsTakeaway(defaultTakeaway);
    } else {
      const newItem: OrderItem = {
        id: `add-ot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        productId: prod.id,
        productName: prod.name,
        price: prod.price,
        quantity: 1,
        category: prod.category,
        drinkType: prod.drinkType,
        isTakeaway: defaultTakeaway,
        isNewOrModified: true,
      };
      setItemsToAdd((prev) => [...prev, newItem]);
      setSuccessToast(`¡${newItem.productName} agregado!`);
      setTimeout(() => setSuccessToast(''), 3000);
    }
  };

  // Manipulación de cantidades en carrito
  const handleUpdateAddedQuantity = (index: number, delta: number) => {
    const updated = [...itemsToAdd];
    const newQty = (updated[index].quantity || 1) + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      updated[index] = { ...updated[index], quantity: newQty };
    }
    setItemsToAdd(updated);
  };

  const handleRemoveAddedItem = (index: number) => {
    const updated = [...itemsToAdd];
    updated.splice(index, 1);
    setItemsToAdd(updated);
  };

  // --- ENVIAR AL SERVIDOR ---
  const handleSaveAppend = async () => {
    if (itemsToAdd.length === 0 && removedItemIds.length === 0) {
      setError('Debes adicionar al menos un nuevo producto o eliminar un ítem existente.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await appendOrderItems(order.id, itemsToAdd, removedItemIds);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al adicionar productos a la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
        <div className="relative w-full max-w-7xl h-[96vh] bg-white border border-gray-300 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col overflow-hidden text-black">
          
          {/* HEADER PRINCIPAL */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center text-black text-2xl font-black shadow-xs">
                ➕
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-xl font-black text-black tracking-tight">ADICIONAR PRODUCTOS A COMANDA</h3>
                  <span className="px-3 py-1 rounded-xl bg-yellow-400 text-black font-black text-sm border border-yellow-500 shadow-xs">
                    #{order.orderNumber}
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-gray-100 text-gray-800 font-bold text-xs border border-gray-300">
                    {order.type === 'mesa' ? `Mesa #${order.tableNumber}` : (order.type || 'mesa').toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-500 font-bold block mt-0.5">
                  👤 Cliente: <strong className="text-black">{order.customerName || 'General'}</strong>
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-black transition-colors"
            >
              <IoClose className="text-2xl" />
            </button>
          </div>

          {/* MENSAJES DE NOTIFICACIÓN */}
          {error && (
            <div className="mt-3 p-3 rounded-2xl bg-red-500/20 border border-red-500/50 text-red-200 text-xs font-bold flex items-center gap-2 flex-shrink-0">
              <IoAlertCircleOutline className="text-xl text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {successToast && (
            <div className="mt-3 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-xs font-black flex items-center gap-2 flex-shrink-0 animate-in fade-in">
              <IoCheckmarkCircle className="text-xl text-emerald-400" />
              <span>{successToast}</span>
            </div>
          )}

          {/* CUERPO EN 2 COLUMNAS (IZQUIERDA: RESUMEN Y CANASTA | DERECHA: CATÁLOGO Y PERSONALIZADOR) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 my-3 flex-1 overflow-hidden">
            
            {/* COLUMNA IZQUIERDA: RESUMEN DE ORDEN + CANASTA DE ADICIÓN (5 COLS) */}
            <div className="lg:col-span-5 flex flex-col gap-3 overflow-hidden bg-black/40 p-4 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <IoRestaurantOutline className="text-emerald-400 text-sm" />
                  Estado de la Comanda
                </span>
                <span className="text-xs font-black text-emerald-400">
                  Actual: ${currentSubtotalUSD.toFixed(2)} USD
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {/* ÍTEMS EXISTENTES */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 block">
                    Ítems Existentes en Mesa:
                  </span>
                  {(order.items || []).map((it) => {
                    const isRemoved = removedItemIds.includes(it.id);
                    return (
                      <div
                        key={it.id}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                          isRemoved
                            ? 'bg-red-500/10 border-red-500/30 opacity-50 line-through'
                            : 'bg-white/[0.03] border-white/10 text-gray-200'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="font-bold flex items-center gap-1.5 flex-wrap">
                            <span className="text-emerald-400 font-black">{it.quantity}x</span>
                            <span>{it.productName}</span>
                            {it.size && <span className="text-[10px] text-gray-400">({it.size})</span>}
                            {it.isTakeaway && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black">
                                📦 LLEVAR
                              </span>
                            )}
                          </div>
                          {it.sugarPreference && (
                            <span className="text-[10px] text-amber-300 block">Azúcar: {it.sugarPreference}</span>
                          )}
                          <div className="text-[11px] font-mono text-gray-400">
                            ${((it.price || 0) * (it.quantity || 1)).toFixed(2)} USD
                          </div>
                        </div>

                        {isRemoved ? (
                          <button
                            type="button"
                            onClick={() => handleRestoreExistingItem(it.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-black"
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingItem(it)}
                            title="Eliminar ítem (requiere PIN)"
                            className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors flex items-center gap-1 text-xs"
                          >
                            <IoTrashOutline />
                            {userSession?.role === 'caja' && <IoLockClosedOutline className="text-[10px] text-amber-300" />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* NUEVAS ADICIONES PENDIENTES */}
                <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                      <span>✨ Nuevos Productos a Adicionar:</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                        {itemsToAdd.length}
                      </span>
                    </span>
                    {itemsToAdd.length > 0 && (
                      <span className="text-xs font-mono font-black text-emerald-400">
                        +${addedSubtotalUSD.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {itemsToAdd.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-gray-500 text-xs font-bold">
                      Selecciona pizzas o bebidas del catálogo para adicionar a esta comanda.
                    </div>
                  ) : (
                    itemsToAdd.map((it, idx) => (
                      <div
                        key={it.id || idx}
                        className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-white space-y-1.5 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-emerald-200 text-sm">{it.productName}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setItemsToAdd((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, isTakeaway: !item.isTakeaway } : item
                                    )
                                  );
                                }}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all border flex items-center gap-1 cursor-pointer ${
                                  it.isTakeaway
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                    : 'bg-white/10 text-gray-300 border-white/15 hover:bg-white/20'
                                }`}
                                title="Click para alternar entre Para Llevar y En Mesa"
                              >
                                <span>📦</span>
                                <span>{it.isTakeaway ? 'PARA LLEVAR' : 'EN MESA'}</span>
                              </button>
                            </div>
                            {it.size && <span className="text-[11px] text-emerald-400 font-bold block">Tamaño: {it.size}</span>}
                            {it.sugarPreference && <span className="text-[10px] text-amber-300 block">Azúcar: {it.sugarPreference}</span>}
                            
                            {/* Desglose de modificadores */}
                            {it.isHalfHalf && it.halfDetails ? (
                              <div className="mt-1 space-y-0.5 text-[10px] text-gray-300">
                                <div><strong className="text-emerald-300">1ra Mitad:</strong> {it.halfDetails.half1Name}</div>
                                {it.halfDetails.half1Removed?.length ? <div className="text-red-300">  Sin: {it.halfDetails.half1Removed.join(', ')}</div> : null}
                                {it.halfDetails.half1Extras?.length ? <div className="text-amber-300">  Extra: {it.halfDetails.half1Extras.map(e => e.name).join(', ')}</div> : null}
                                <div><strong className="text-emerald-300">2da Mitad:</strong> {it.halfDetails.half2Name}</div>
                                {it.halfDetails.half2Removed?.length ? <div className="text-red-300">  Sin: {it.halfDetails.half2Removed.join(', ')}</div> : null}
                                {it.halfDetails.half2Extras?.length ? <div className="text-amber-300">  Extra: {it.halfDetails.half2Extras.map(e => e.name).join(', ')}</div> : null}
                              </div>
                            ) : (
                              <>
                                {it.removedIngredients?.length ? (
                                  <span className="text-[10px] text-red-300 block">Sin: {it.removedIngredients.join(', ')}</span>
                                ) : null}
                                {it.extras?.length ? (
                                  <span className="text-[10px] text-amber-300 block">Extra: {it.extras.map(e => e.name).join(', ')}</span>
                                ) : null}
                              </>
                            )}

                            {it.notes ? <span className="text-[10px] text-gray-400 italic block">Nota: {it.notes}</span> : null}
                          </div>

                          <span className="font-mono font-black text-emerald-400 text-sm whitespace-nowrap">
                            +${((it.price || 0) * (it.quantity || 1)).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateAddedQuantity(idx, -1)}
                              className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-white hover:bg-emerald-900"
                            >
                              <IoRemove />
                            </button>
                            <span className="font-black text-sm px-1">{it.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateAddedQuantity(idx, 1)}
                              className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-white hover:bg-emerald-900"
                            >
                              <IoAdd />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAddedItem(idx)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-[10px] font-black transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
{/* COLUMNA DERECHA: CATÁLOGO DE MENÚ O CONFIGURADOR ACTIVO (7 COLS) */}
            <div className="lg:col-span-7 flex flex-col gap-3 overflow-hidden bg-black/40 p-4 rounded-2xl border border-white/10">
              
              {configuringPizza ? (
                /* ============================================================ */
                /* 🍕 / 🍽️ CONFIGURADOR INTEGRAL (PLATOS O PIZZAS)             */
                /* ============================================================ */
                <div className="flex-1 flex flex-col overflow-hidden space-y-3 bg-[#062215] p-4 sm:p-5 rounded-2xl border border-emerald-500/50 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-lg font-black">
                        {isMorningShift ? <IoRestaurantOutline /> : <IoPizza />}
                      </span>
                      <div>
                        <h4 className="text-base font-black text-white">Personalizar {configuringPizza.name}</h4>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {isMorningShift ? 'Selecciona acompañantes y contornos' : 'Selecciona tamaño, ingredientes a remover y adicionales'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={resetPizzaConfig}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-gray-300 font-bold flex items-center gap-1 transition-colors"
                    >
                      <IoArrowBack />
                      Volver
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1.5 text-xs">
                    {isMorningShift ? (
                      /* PANEL TURNO MAÑANA: ACOMPAÑANTES Y CONTORNOS */
                      <div className="space-y-4">
                        {/* Acompañantes / Ingredientes base */}
                        {(configuringPizza.baseIngredients && configuringPizza.baseIngredients.length > 0) && (
                          <div>
                            <label className="text-[10px] font-black uppercase text-red-400 block mb-1.5">
                              1. Acompañantes / Ingredientes Base (Marcar "Sin"):
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {configuringPizza.baseIngredients.map((ing) => {
                                const isRemoved = pizzaRemoved.includes(ing);
                                return (
                                  <button
                                    key={ing}
                                    type="button"
                                    onClick={() => {
                                      setPizzaRemoved((prev) =>
                                        isRemoved ? prev.filter((i) => i !== ing) : [...prev, ing]
                                      );
                                    }}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                                      isRemoved
                                        ? 'bg-red-500/30 border-red-500 text-red-200 line-through shadow-md'
                                        : 'bg-black/50 border-white/15 text-gray-300 hover:border-white/30'
                                    }`}
                                  >
                                    {isRemoved ? `✕ Sin ${ing}` : `✓ ${ing}`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Contornos del Plato */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-black uppercase text-emerald-400">
                              2. Contornos del Plato (Selecciona 1 o más contornos):
                            </label>
                            {pizzaExtras.length > 0 && (
                              <span className="text-[10px] font-black text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                {pizzaExtras.length} seleccionado(s)
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                            {availableExtras.map((extra) => {
                              const isSelected = pizzaExtras.some((e) => e.name === extra.name);
                              return (
                                <button
                                  key={extra.id || extra.name}
                                  type="button"
                                  onClick={() => {
                                    setPizzaExtras((prev) =>
                                      isSelected
                                        ? prev.filter((e) => e.name !== extra.name)
                                        : [...prev, { name: extra.name, price: extra.priceUSD || 0 }]
                                    );
                                  }}
                                  className={`p-2.5 rounded-xl text-left border text-xs font-bold transition-all flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-md scale-[1.02]'
                                      : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
                                  }`}
                                >
                                  <span className="line-clamp-1">{isSelected ? '✅ ' : '➕ '} {extra.name}</span>
                                  {extra.priceUSD > 0 ? (
                                    <span className="text-xs font-mono text-emerald-400 font-black">+${extra.priceUSD.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">Incluido</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* PANEL TURNO NOCHE: PIZZAS (TAMAÑO, MITADES, EXTRAS) */
                      <>
                        {/* TAMAÑO DE PIZZA */}
                        <div>
                          <label className="text-[10px] font-black uppercase text-emerald-400 block mb-1.5">
                            1. Seleccionar Tamaño de Pizza:
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => handlePizzaSizeChange('Grande')}
                              className={`p-3 rounded-2xl border text-left transition-all ${
                                pizzaSize === 'Grande'
                                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg font-black'
                                  : 'bg-black/50 text-gray-300 border-white/15 hover:bg-white/5 font-bold'
                              }`}
                            >
                              <div className="text-xs uppercase">🍕 Pizza Grande (Familiar)</div>
                              <div className="text-sm font-mono mt-0.5">${configuringPizza.price.toFixed(2)} USD</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePizzaSizeChange('Pequeña')}
                              className={`p-3 rounded-2xl border text-left transition-all ${
                                pizzaSize === 'Pequeña'
                                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg font-black'
                                  : 'bg-black/50 text-gray-300 border-white/15 hover:bg-white/5 font-bold'
                              }`}
                            >
                              <div className="text-xs uppercase">🍕 Pizza Pequeña</div>
                              <div className="text-sm font-mono mt-0.5">
                                ${(configuringPizza.priceSmall ?? (configuringPizza.price > 4 ? configuringPizza.price - 4 : configuringPizza.price * 0.7)).toFixed(2)} USD
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* MITAD Y MITAD (1/2 y 1/2) */}
                        <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-2.5">
                          <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isHalfHalf}
                                onChange={(e) => {
                                  setIsHalfHalf(e.target.checked);
                                  if (e.target.checked && !pizzaHalf2) {
                                    setPizzaHalf2(pizzaProducts.find((p) => p.id !== configuringPizza.id) || null);
                                  }
                                }}
                                className="w-5 h-5 rounded text-emerald-500 accent-emerald-500"
                              />
                              <div>
                                <span className="text-xs font-black text-white block">¿Pizza Mitad y Mitad (1/2 + 1/2)?</span>
                                <span className="text-[10px] text-gray-400 font-bold">Combina dos sabores en una misma pizza</span>
                              </div>
                            </div>
                            {isHalfHalf && (
                              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-black text-[10px]">
                                ACTIVO
                              </span>
                            )}
                          </label>

                          {isHalfHalf && (
                            <div className="mt-2 space-y-2 pt-2 border-t border-white/10">
                              <label className="text-[10px] font-black text-emerald-300 block">
                                Seleccionar Sabor de la Segunda Mitad:
                              </label>
                              <select
                                value={pizzaHalf2?.id || ''}
                                onChange={(e) => setPizzaHalf2(pizzaProducts.find((p) => p.id === e.target.value) || null)}
                                className="w-full p-2.5 rounded-xl bg-black/80 border border-emerald-500/50 text-white text-xs font-bold outline-none"
                              >
                                <option value="">Selecciona la 2da mitad...</option>
                                {pizzaProducts.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} — ${p.price.toFixed(2)} USD
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* MODIFICADORES: MITADES INDEPENDIENTES O PIZZA COMPLETA */}
                        {isHalfHalf ? (
                          <div className="space-y-3">
                            {/* Pestañas de Mitades */}
                            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                              <button
                                type="button"
                                onClick={() => setActiveHalfTab('half1')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                  activeHalfTab === 'half1'
                                    ? 'bg-emerald-500 text-black border-emerald-400 shadow-md'
                                    : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
                                }`}
                              >
                                1ra Mitad ({configuringPizza.name})
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveHalfTab('half2')}
                                className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                  activeHalfTab === 'half2'
                                    ? 'bg-emerald-500 text-black border-emerald-400 shadow-md'
                                    : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
                                }`}
                              >
                                2da Mitad ({pizzaHalf2?.name || 'Seleccionar'})
                              </button>
                            </div>

                            {activeHalfTab === 'half1' ? (
                              <div className="space-y-3 p-3 rounded-2xl bg-black/30 border border-white/10">
                                {/* Sin ingredientes en Mitad 1 */}
                                <div>
                                  <label className="text-[10px] font-black uppercase text-red-400 block mb-1">
                                    Retirar Ingredientes Base (1ra Mitad):
                                  </label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(configuringPizza.baseIngredients || ['Salsa', 'Queso Mozzarella']).map((ing) => {
                                      const isRemoved = pizzaHalf1Removed.includes(ing);
                                      return (
                                        <button
                                          key={ing}
                                          type="button"
                                          onClick={() => {
                                            setPizzaHalf1Removed((prev) =>
                                              isRemoved ? prev.filter((i) => i !== ing) : [...prev, ing]
                                            );
                                          }}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                                            isRemoved
                                              ? 'bg-red-500/30 border-red-500 text-red-200 line-through'
                                              : 'bg-black/50 border-white/15 text-gray-300 hover:border-white/30'
                                          }`}
                                        >
                                          {isRemoved ? `✕ Sin ${ing}` : ing}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Adicionales en Mitad 1 */}
                                <div>
                                  <label className="text-[10px] font-black uppercase text-amber-400 block mb-1">
                                    Adicionales / Extras (1ra Mitad):
                                  </label>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                                    {availableExtras.map((extra) => {
                                      const isSelected = pizzaHalf1Extras.some((e) => e.name === extra.name);
                                      const extraPrice = getIngredientExtraPrice(extra, pizzaSize, true);
                                      return (
                                        <button
                                          key={extra.id}
                                          type="button"
                                          onClick={() => {
                                            setPizzaHalf1Extras((prev) =>
                                              isSelected
                                                ? prev.filter((e) => e.name !== extra.name)
                                                : [...prev, { name: extra.name, price: extraPrice }]
                                            );
                                          }}
                                          className={`p-2 rounded-xl text-left border text-[11px] font-bold transition-all flex items-center justify-between ${
                                            isSelected
                                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                              : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
                                          }`}
                                        >
                                          <span className="line-clamp-1">{extra.name}</span>
                                          <span className="text-[10px] font-mono text-emerald-400">+${extraPrice.toFixed(2)}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3 p-3 rounded-2xl bg-black/30 border border-white/10">
                                {/* Sin ingredientes en Mitad 2 */}
                                <div>
                                  <label className="text-[10px] font-black uppercase text-red-400 block mb-1">
                                    Retirar Ingredientes Base (2da Mitad):
                                  </label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(pizzaHalf2?.baseIngredients || ['Salsa', 'Queso Mozzarella']).map((ing) => {
                                      const isRemoved = pizzaHalf2Removed.includes(ing);
                                      return (
                                        <button
                                          key={ing}
                                          type="button"
                                          onClick={() => {
                                            setPizzaHalf2Removed((prev) =>
                                              isRemoved ? prev.filter((i) => i !== ing) : [...prev, ing]
                                            );
                                          }}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                                            isRemoved
                                              ? 'bg-red-500/30 border-red-500 text-red-200 line-through'
                                              : 'bg-black/50 border-white/15 text-gray-300 hover:border-white/30'
                                          }`}
                                        >
                                          {isRemoved ? `✕ Sin ${ing}` : ing}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Adicionales en Mitad 2 */}
                                <div>
                                  <label className="text-[10px] font-black uppercase text-amber-400 block mb-1">
                                    Adicionales / Extras (2da Mitad):
                                  </label>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                                    {availableExtras.map((extra) => {
                                      const isSelected = pizzaHalf2Extras.some((e) => e.name === extra.name);
                                      const extraPrice = getIngredientExtraPrice(extra, pizzaSize, true);
                                      return (
                                        <button
                                          key={extra.id}
                                          type="button"
                                          onClick={() => {
                                            setPizzaHalf2Extras((prev) =>
                                              isSelected
                                                ? prev.filter((e) => e.name !== extra.name)
                                                : [...prev, { name: extra.name, price: extraPrice }]
                                            );
                                          }}
                                          className={`p-2 rounded-xl text-left border text-[11px] font-bold transition-all flex items-center justify-between ${
                                            isSelected
                                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                              : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
                                          }`}
                                        >
                                          <span className="line-clamp-1">{extra.name}</span>
                                          <span className="text-[10px] font-mono text-emerald-400">+${extraPrice.toFixed(2)}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Modificadores de Pizza Entera */
                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] font-black uppercase text-red-400 block mb-1.5">
                                2. Retirar Ingredientes Base (Sin X):
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {(configuringPizza.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella']).map((ing) => {
                                  const isRemoved = pizzaRemoved.includes(ing);
                                  return (
                                    <button
                                      key={ing}
                                      type="button"
                                      onClick={() => {
                                        setPizzaRemoved((prev) =>
                                          isRemoved ? prev.filter((i) => i !== ing) : [...prev, ing]
                                        );
                                      }}
                                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                                        isRemoved
                                          ? 'bg-red-500/30 border-red-500 text-red-200 line-through shadow-md'
                                          : 'bg-black/50 border-white/15 text-gray-300 hover:border-white/30'
                                      }`}
                                    >
                                      {isRemoved ? `✕ Sin ${ing}` : ing}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Extras */}
                            <div>
                              <label className="text-[10px] font-black uppercase text-amber-400 block mb-1.5">
                                3. Agregar Ingredientes Extras / Adicionales:
                              </label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                {availableExtras.map((extra) => {
                                  const isSelected = pizzaExtras.some((e) => e.name === extra.name);
                                  const extraPrice = getIngredientExtraPrice(extra, pizzaSize, false);
                                  return (
                                    <button
                                      key={extra.id}
                                      type="button"
                                      onClick={() => {
                                        setPizzaExtras((prev) =>
                                          isSelected
                                            ? prev.filter((e) => e.name !== extra.name)
                                            : [...prev, { name: extra.name, price: extraPrice }]
                                        );
                                      }}
                                      className={`p-2.5 rounded-xl text-left border text-xs font-bold transition-all flex items-center justify-between ${
                                        isSelected
                                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md'
                                          : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
                                      }`}
                                    >
                                      <span className="line-clamp-1">{extra.name}</span>
                                      <span className="text-xs font-mono text-emerald-400 font-black">+${extraPrice.toFixed(2)}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* NOTAS ESPECIALES */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                        {isMorningShift ? '3. Nota Especial para Cocina:' : '4. Nota Especial para Cocina:'}
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Bien cocido, servir rápido..."
                        value={pizzaNotes}
                        onChange={(e) => setPizzaNotes(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/70 border border-white/20 text-white text-xs outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* EMPACAR PARA LLEVAR */}
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">📦</span>
                        <div>
                          <div className="text-xs font-black text-white">¿Empacar este ítem para llevar?</div>
                          <div className="text-[10px] text-gray-400">Se imprimirá la indicación para cocina</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPizzaIsTakeaway(!pizzaIsTakeaway)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                          pizzaIsTakeaway
                            ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
                            : 'bg-white/10 text-gray-300 border-white/10 hover:bg-white/20'
                        }`}
                      >
                        {pizzaIsTakeaway ? '✓ SÍ, PARA LLEVAR' : 'MESA / COMER AQUÍ'}
                      </button>
                    </div>
                  </div>

                  {/* FOOTER DEL CONFIGURADOR DE PIZZAS / PLATOS */}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-shrink-0">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-bold">Precio Calculado:</span>
                      <span className="text-lg font-black text-emerald-400">${calculatePizzaPrice().toFixed(2)} USD</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmAddPizza}
                      disabled={!isMorningShift && isHalfHalf && !pizzaHalf2}
                      className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-black text-xs shadow-xl transition-all"
                    >
                      {isMorningShift ? '+ AGREGAR ESTE PLATO A LA ADICIÓN' : '+ AGREGAR ESTA PIZZA A LA ADICIÓN'}
                    </button>
                  </div>
                </div>
              ) : configuringDrink ? (
                /* ============================================================ */
                /* 🥤 CONFIGURADOR DE JUGOS Y BEBIDAS NATURALES                 */
                /* ============================================================ */
                <div className="flex-1 flex flex-col space-y-4 bg-[#062215] p-5 rounded-2xl border border-emerald-500/50 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 text-lg font-black">
                        <IoBeer />
                      </span>
                      <div>
                        <h4 className="text-base font-black text-white">Configurar {configuringDrink.name}</h4>
                        <span className="text-[10px] text-gray-400 font-bold">Selecciona preferencia de azúcar y notas</span>
                      </div>
                    </div>
                    <button
                      onClick={resetDrinkConfig}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-gray-300 font-bold flex items-center gap-1 transition-colors"
                    >
                      <IoArrowBack />
                      Volver
                    </button>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="text-[10px] font-black uppercase text-amber-400 block mb-1.5">
                        Preferencia de Azúcar:
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['Con Azúcar', 'Poca Azúcar', 'Sin Azúcar'] as const).map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => setDrinkSugar(sug)}
                            className={`p-3 rounded-2xl font-black text-xs border text-center transition-all ${
                              drinkSugar === sug
                                ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
                                : 'bg-black/50 text-gray-300 border-white/15 hover:bg-white/5'
                            }`}
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 block mb-1.5">
                        Nota Especial para Barra:
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Con hielo aparte, sin pitillo..."
                        value={drinkNotes}
                        onChange={(e) => setDrinkNotes(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/70 border border-white/20 text-white text-xs outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* EMPACAR PARA LLEVAR BEBIDA */}
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">📦</span>
                        <div>
                          <div className="text-xs font-black text-white">¿Empacar esta bebida para llevar?</div>
                          <div className="text-[10px] text-gray-400">Se enviará la indicación para barra / cocina</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrinkIsTakeaway(!drinkIsTakeaway)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                          drinkIsTakeaway
                            ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
                            : 'bg-white/10 text-gray-300 border-white/10 hover:bg-white/20'
                        }`}
                      >
                        {drinkIsTakeaway ? '✓ SÍ, PARA LLEVAR' : 'MESA / CONSUMIR AQUÍ'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10 flex items-center justify-between mt-auto">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-bold">Precio Unitario:</span>
                      <span className="text-lg font-black text-emerald-400">${configuringDrink.price.toFixed(2)} USD</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmAddDrink}
                      className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs shadow-xl transition-all"
                    >
                      + AGREGAR BEBIDA A LA ADICIÓN
                    </button>
                  </div>
                </div>
              ) : (
                /* ============================================================ */
                /* 📋 SELECTOR DEL CATÁLOGO (PIZZAS, BEBIDAS, OTROS)           */
                /* ============================================================ */
                <>
                  {/* Buscador + Pestañas de Categoría */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 border-b border-white/10 pb-3 flex-shrink-0">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {(['Pizzas', 'Bebidas', 'Otros'] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategory(cat)}
                          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl font-black text-xs transition-all border ${
                            activeCategory === cat
                              ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg'
                              : 'bg-white/[0.04] text-gray-400 border-white/10 hover:text-white'
                          }`}
                        >
                          {cat === 'Pizzas' ? (isMorningShift ? '🍽️ Platos' : '🍕 Pizzas') : cat === 'Bebidas' ? '🥤 Bebidas' : '🍽️ Otros'}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:flex-1">
                      <IoSearchOutline className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                      <input
                        type="text"
                        placeholder={isMorningShift ? "Buscar plato o bebida..." : "Buscar producto..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Grid de Productos */}
                  <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 custom-scrollbar pr-1">
                    {filteredProducts.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleSelectProduct(prod)}
                        className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-400/50 transition-all text-left flex flex-col justify-between group shadow-sm"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-black text-white group-hover:text-emerald-300 block line-clamp-1">
                              {prod.name}
                            </span>
                            {prod.category === 'Pizzas' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                Personalizar
                              </span>
                            )}
                          </div>
                          {prod.description && (
                            <span className="text-[10px] text-gray-400 line-clamp-2 mt-1 block">
                              {prod.description}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                          <span className="text-xs font-mono font-black text-emerald-400">
                            ${prod.price.toFixed(2)} USD
                          </span>
                          <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500 group-hover:text-black flex items-center justify-center text-xs font-black transition-colors">
                            +
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* FOOTER FINANCIERO Y CONFIRMACIÓN MULTIMONEDA */}
          <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div>
                <span className="text-[10px] text-gray-400 block font-bold">Actual:</span>
                <strong className="text-gray-200">${currentSubtotalUSD.toFixed(2)} USD</strong>
              </div>
              <div className="text-gray-500 font-black">+</div>
              <div>
                <span className="text-[10px] text-emerald-400 block font-bold">Nuevas Adiciones:</span>
                <strong className="text-emerald-300 font-black">+${addedSubtotalUSD.toFixed(2)} USD</strong>
              </div>
              <div className="text-gray-500 font-black">=</div>
              <div>
                <span className="text-[10px] text-emerald-400 block font-bold">Nuevo Total Comanda:</span>
                <div className="flex items-center gap-2">
                  <strong className="text-xl text-emerald-300 font-black">${projectedTotalUSD.toFixed(2)} USD</strong>
                  <span className="text-[11px] text-gray-400 font-mono">
                    ({Math.round(projectedTotalUSD * (exchangeRates?.COP || 3400)).toLocaleString('es-CO')} COP / {(projectedTotalUSD * (exchangeRates?.Bs || 880)).toFixed(2)} Bs)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleSaveAppend}
                disabled={isSubmitting || (itemsToAdd.length === 0 && removedItemIds.length === 0)}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-xs shadow-xl flex items-center justify-center gap-2 transition-all"
              >
                <IoFlashOutline className="text-base" />
                <span>{isSubmitting ? 'ENVIANDO A COCINA Y CUENTA...' : '🚀 CONFIRMAR ADICIÓN Y ENVIAR A COCINA'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE PIN DE SEGURIDAD */}
      <AdminPinModal
        isOpen={pinModalState.isOpen}
        title={pinModalState.title}
        description={pinModalState.description}
        actionName={pinModalState.actionName}
        onClose={() => setPinModalState((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          setPinModalState((prev) => ({ ...prev, isOpen: false }));
          pinModalState.onSuccess();
        }}
      />
    </>
  );
};
