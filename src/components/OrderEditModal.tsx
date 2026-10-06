import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderItem, Product, Ingredient } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { ProductTextCatalog } from '../modules/mesero/ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from '../modules/mesero/BurgerBuilderModal';
import { DrinkSelectorModal, DrinkOrderConfirmationItem } from '../modules/mesero/DrinkSelectorModal';
import { DeliveryConfigPanel } from '../modules/mesero/DeliveryConfigPanel';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName, formatRemovedIngredients } from '../utils/burgerProteins';
import { isCustomizableProduct } from '../utils/productClassifier';
import {
  IoClose,
  IoTrashOutline,
  IoPencilOutline,
  IoAlertCircleOutline,
  IoCheckmarkCircle,
  IoRestaurantOutline,
  IoSaveOutline,
} from 'react-icons/io5';

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  ingredients: Ingredient[];
  onSaveEdit: (orderId: string, payload: {
    items: OrderItem[];
    kitchenNotes?: string;
    totalUSD: number;
    customerName?: string;
    tableNumber?: number | null;
    type?: 'mesa' | 'llevar' | 'delivery' | 'pickup' | 'credito';
    deliveryFeeUSD?: number;
  }) => Promise<void>;
  onDeletePaymentEntry?: (orderId: string, paymentId: string) => Promise<Order>;
  onDeleteOrder?: (orderId: string) => Promise<void>;
}

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  products,
  ingredients,
  onSaveEdit,
  onDeletePaymentEntry,
  onDeleteOrder,
}) => {
  const { exchangeRates, userSession } = useApp();

  // Estados de formulario
  const [customerName, setCustomerName] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<number | ''>('');
  const [type, setType] = useState<'mesa' | 'pickup' | 'delivery'>('mesa');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(0);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<Order['paymentHistory']>([]);

  // Estados de catálogo y personalización
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [showDeliveryConfig, setShowDeliveryConfig] = useState<boolean>(false);
  const [leftTab, setLeftTab] = useState<'catalogo' | 'pagos'>('catalogo');

  // Estados de UI y envío
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');

  // Sincronizar estado al abrir modal o recibir comanda
  useEffect(() => {
    if (order && isOpen) {
      setCustomerName(order.customerName || '');
      setTableNumber(order.tableNumber ?? '');
      const rawType = (order.type as string) === 'llevar' ? 'pickup' : (order.type || 'mesa');
      setType(rawType === 'delivery' ? 'delivery' : rawType === 'pickup' ? 'pickup' : 'mesa');
      setKitchenNotes(order.kitchenNotes || '');
      setDeliveryFeeUSD(Number(order.deliveryFeeUSD || 0));
      setItems(JSON.parse(JSON.stringify(order.items || [])));
      setPaymentHistory(order.paymentHistory ? JSON.parse(JSON.stringify(order.paymentHistory)) : []);
      setSelectedCategory('Todas');
      setSearchQuery('');
      setSelectedBurger(null);
      setSelectedDrink(null);
      setEditingItemIndex(null);
      setShowDeliveryConfig(order.type === 'delivery');
      setLeftTab('catalogo');
      setError('');
      setSuccessToast('');
      setIsSubmitting(false);
    }
  }, [order, isOpen]);

  // Filtrar productos e ingredientes activos por turno
  const activeProducts = useMemo(() => {
    return products
      .filter((p) => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, userSession?.shift]);

  const activeIngredients = useMemo(() => {
    return ingredients
      .filter((i) => !i.shift || i.shift === 'ambos' || i.shift === userSession?.shift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, userSession?.shift]);

  const availableExtras = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.isExtra || i.isExtraForPizza || i.ingredientType === 'adicional' || i.ingredientType === 'gratis' || i.category === 'Adicionales' || i.category === 'Toppings'
    );
  }, [activeIngredients]);

  const availableFreeToppings = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.ingredientType === 'gratis' || i.category === 'Gratis'
    );
  }, [activeIngredients]);

  const availableProteins = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.ingredientType === 'proteina' || i.category === 'Proteínas' || i.category === 'Carnes'
    );
  }, [activeIngredients]);

  const availableSalsas = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.category === 'Salsas' || i.ingredientType === 'salsa'
    );
  }, [activeIngredients]);

  if (!isOpen || !order) return null;

  const hasPaymentHistory = (paymentHistory?.length || 0) > 0;
  const isDeliveryOrder = type === 'delivery';
  const effectiveDeliveryFee = isDeliveryOrder ? (Number(deliveryFeeUSD) || 0) : 0;

  // Cálculo de totales
  const itemsSubtotalUSD = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0
  );
  const totalUSD = itemsSubtotalUSD + effectiveDeliveryFee;
  const totalCOP = roundCOP(totalUSD * (exchangeRates?.COP || 3950));
  const totalBs = (totalUSD * (exchangeRates?.Bs || 36.5)).toFixed(2);

  // Helper para comparar ítems idénticos
  const areItemsIdentical = (a: OrderItem, b: OrderItem): boolean => {
    if (a.productId !== b.productId) return false;
    if (Boolean(a.isTakeaway) !== Boolean(b.isTakeaway)) return false;
    if (Boolean(a.isDelivery) !== Boolean(b.isDelivery)) return false;
    if (Boolean(a.isCut) !== Boolean(b.isCut)) return false;
    if ((a.cutPreference || 'Entera') !== (b.cutPreference || 'Entera')) return false;
    if ((a.sugarPreference || '') !== (b.sugarPreference || '')) return false;
    if ((a.flavor || '') !== (b.flavor || '')) return false;
    if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

    const aProt = [...(a.proteins || [])].map(normalizeProteinName).sort().join('|');
    const bProt = [...(b.proteins || [])].map(normalizeProteinName).sort().join('|');
    if (aProt !== bProt) return false;

    const aRem = [...(a.removedIngredients || [])].sort().join('|');
    const bRem = [...(b.removedIngredients || [])].sort().join('|');
    if (aRem !== bRem) return false;

    const aExtras = (a.extras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    const bExtras = (b.extras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    if (aExtras !== bExtras) return false;

    return Math.abs(a.price - b.price) < 0.01;
  };

  const mergeItem = (list: OrderItem[], item: OrderItem): OrderItem[] => {
    const matchIndex = list.findIndex((existing) => areItemsIdentical(existing, item));
    if (matchIndex !== -1) {
      const updated = [...list];
      updated[matchIndex] = {
        ...updated[matchIndex],
        quantity: (updated[matchIndex].quantity || 1) + (item.quantity || 1),
      };
      return updated;
    }
    return [...list, item];
  };

  // Selección de Producto desde Catálogo
  const handleSelectProduct = (prod: Product) => {
    if (isCustomizableProduct(prod)) {
      setEditingItemIndex(null);
      setSelectedBurger(prod);
    } else if (prod.drinkType === 'jugo' || (prod.flavors && prod.flavors.length > 0)) {
      setEditingItemIndex(null);
      setSelectedDrink(prod);
    } else {
      // Producto directo (acompañante o bebida simple)
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: prod.id,
        productName: prod.name,
        price: prod.price,
        quantity: 1,
        category: prod.category || 'Otros',
        drinkType: prod.drinkType,
        isTakeaway: type === 'pickup',
        isDelivery: type === 'delivery',
        isNewOrModified: true,
      };
      setItems((prev) => mergeItem(prev, newItem));
      setSuccessToast(`¡${prod.name} agregado!`);
      setTimeout(() => setSuccessToast(''), 2500);
    }
  };

  // Manejo de adición directa de salsas
  const handleSelectSalsa = (salsa: Ingredient) => {
    const newItem: OrderItem = {
      id: `item-salsa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: salsa.id,
      productName: `Salsa: ${salsa.name}`,
      price: 0,
      quantity: 1,
      category: 'Salsas',
      isTakeaway: type === 'pickup',
      isDelivery: type === 'delivery',
      isNewOrModified: true,
    };
    setItems((prev) => mergeItem(prev, newItem));
    setSuccessToast(`¡Salsa ${salsa.name} agregada!`);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Confirmar Hamburguesa seleccionada o editada
  const handleConfirmBurgerAdd = (
    configOrList: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => {
      const isProteinChanged = !areProteinsDefault(
        config.burger.name,
        config.proteins,
        config.burger.defaultProteins
      );
      return {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: config.burger.id,
        productName: config.burger.name,
        price: config.finalPrice,
        quantity: config.quantity,
        category: config.burger.category || 'Hamburguesas',
        proteins: isProteinChanged ? config.proteins : [],
        defaultProteins: config.burger.defaultProteins || [],
        removedIngredients: config.removedIngredients,
        extras: config.extras,
        isTakeaway: Boolean(config.isTakeaway),
        isDelivery: Boolean(config.isDelivery),
        isCut: Boolean(config.isCut),
        cutPreference: config.cutPreference,
        notes: getCleanItemNote(config.notes) || undefined,
        isNewOrModified: true,
      };
    });

    if (editingItemIndex !== null) {
      setItems((prev) => {
        const updated = [...prev];
        updated.splice(editingItemIndex, 1, ...generatedItems);
        return updated;
      });
      setEditingItemIndex(null);
      setSuccessToast(`¡Hamburguesa editada y actualizada!`);
    } else {
      setItems((prev) => {
        let current = [...prev];
        for (const it of generatedItems) {
          current = mergeItem(current, it);
        }
        return current;
      });
      setSuccessToast(`¡${list.length} hamburguesa(s) agregada(s)!`);
    }

    setSelectedBurger(null);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Confirmar Bebida seleccionada o editada
  const handleConfirmDrinkAdd = (
    configOrList: DrinkOrderConfirmationItem | DrinkOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => {
      const formattedName = config.flavor
        ? `${config.drink.name} (${config.flavor})`
        : config.drink.name;

      return {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: config.drink.id,
        productName: formattedName,
        price: config.drink.price,
        quantity: config.quantity,
        category: config.drink.category || 'Bebidas',
        drinkType: config.drink.drinkType,
        sugarPreference: config.sugarPreference,
        flavor: config.flavor,
        isTakeaway: Boolean(config.isTakeaway),
        isDelivery: Boolean(config.isDelivery),
        notes: getCleanItemNote(config.notes) || undefined,
        isNewOrModified: true,
      };
    });

    if (editingItemIndex !== null) {
      setItems((prev) => {
        const updated = [...prev];
        updated.splice(editingItemIndex, 1, ...generatedItems);
        return updated;
      });
      setEditingItemIndex(null);
      setSuccessToast(`¡Bebida editada y actualizada!`);
    } else {
      setItems((prev) => {
        let current = [...prev];
        for (const it of generatedItems) {
          current = mergeItem(current, it);
        }
        return current;
      });
      setSuccessToast(`¡${list.length} bebida(s) agregada(s)!`);
    }

    setSelectedDrink(null);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Abrir editor para un ítem existente
  const handleEditItem = (index: number) => {
    const item = items[index];
    if (!item) return;

    // Buscar producto correspondiente en catálogo
    let prod = products.find((p) => p.id === item.productId);
    if (!prod) {
      prod = products.find((p) => p.name.toLowerCase() === item.productName.toLowerCase());
    }
    if (!prod) {
      // Fallback: construir producto básico para el configurador
      prod = {
        id: item.productId || 'custom-item',
        name: item.productName,
        category: item.category || 'Hamburguesas',
        price: item.price,
        description: '',
        image: '',
        baseIngredients: [],
        proteinCount: 1,
        defaultProteins: item.defaultProteins || [],
        recipe: [],
      };
    }

    setEditingItemIndex(index);
    if (isCustomizableProduct(prod)) {
      setSelectedBurger(prod);
    } else if (prod.drinkType === 'jugo' || (prod.flavors && prod.flavors.length > 0)) {
      setSelectedDrink(prod);
    } else {
      // Si no es configurable, permitir ajustar notas
      const newNotes = window.prompt('Notas o indicaciones para este ítem:', item.notes || '');
      if (newNotes !== null) {
        setItems((prev) => {
          const updated = [...prev];
          updated[index] = { ...updated[index], notes: newNotes.trim() };
          return updated;
        });
      }
      setEditingItemIndex(null);
    }
  };

  // Manejo de cantidades
  const handleQuantityChange = (index: number, delta: number) => {
    setItems((prev) => {
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

  const handleRemoveItem = (index: number) => {
    const it = items[index];
    if (it && it.isPaidIndividually) {
      setError(`El producto "${it.productName}" ya fue pagado individualmente. Primero anula ese pago en la sección de pagos para poder eliminarlo.`);
      return;
    }
    setItems((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  // Anulación individual de pagos
  const handleAnularPago = async (paymentId: string, isChange: boolean, amountStr: string) => {
    if (!onDeletePaymentEntry) {
      setError('La función de anulación de pagos no está disponible.');
      return;
    }
    if (!window.confirm(`¿Estás seguro de anular este ${isChange ? 'vuelto' : 'pago'} de ${amountStr}? Se revertirá en el historial financiero y se ajustará el saldo.`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      setError('');
      const updatedOrder = await onDeletePaymentEntry(order.id, paymentId);
      if (updatedOrder) {
        setPaymentHistory(updatedOrder.paymentHistory ? [...updatedOrder.paymentHistory] : []);
        setItems(JSON.parse(JSON.stringify(updatedOrder.items || [])));
      } else {
        setPaymentHistory((prev) => (prev || []).filter((p) => p.id !== paymentId));
      }
      setSuccessToast(`¡${isChange ? 'Vuelto' : 'Pago'} anulado exitosamente!`);
      setTimeout(() => setSuccessToast(''), 3000);
    } catch (err: any) {
      console.error('Error al anular pago:', err);
      setError(err?.message || 'Error al anular el movimiento de pago.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guardar Cambios
  const handleSave = async () => {
    if (hasPaymentHistory) {
      setError('⚠️ Esta comanda tiene pagos registrados. Anula primero los pagos en la pestaña de pagos antes de modificar productos o totales.');
      setLeftTab('pagos');
      return;
    }
    if (items.length === 0) {
      setError('⚠️ La comanda debe contener al menos un producto.');
      return;
    }
    if (type === 'delivery') {
      if (!customerName.trim()) {
        setError('⚠️ Para órdenes DELIVERY es estrictamente OBLIGATORIO ingresar el nombre del cliente.');
        return;
      }
      if (effectiveDeliveryFee <= 0) {
        setError('⚠️ Para órdenes DELIVERY es obligatorio especificar el costo de delivery ($ USD > 0).');
        return;
      }
    }
    if (type === 'pickup' && !customerName.trim()) {
      setError('⚠️ Para órdenes PARA LLEVAR (PICKUP) es obligatorio ingresar el nombre del cliente.');
      return;
    }
    if (type === 'mesa' && (!tableNumber || Number(tableNumber) <= 0)) {
      setError('⚠️ Para órdenes en MESA debe especificar un número de mesa válido mayor a 0.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onSaveEdit(order.id, {
        items,
        kitchenNotes: kitchenNotes.trim() || undefined,
        totalUSD,
        customerName: customerName.trim() || undefined,
        tableNumber: type === 'mesa' && tableNumber ? Number(tableNumber) : null,
        type: type === 'pickup' ? 'pickup' : type,
        deliveryFeeUSD: isDeliveryOrder ? effectiveDeliveryFee : 0,
      });
      onClose();
    } catch (err: any) {
      console.error('Error al guardar edición de comanda:', err);
      setError(err?.message || 'Error al guardar los cambios de la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanOrderNumber = order.orderNumber.toString().replace(/^#+/, '');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 text-gray-900 w-screen h-screen overflow-hidden animate-in fade-in select-none">
      {/* HEADER PRINCIPAL */}
      <header className="bg-white px-4 py-2 border-b-2 border-yellow-400 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-xl bg-yellow-400 text-black text-lg font-black shadow-xs">
            ✏️
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-base sm:text-lg text-gray-900 leading-tight">
                EDITAR COMANDA #{cleanOrderNumber}
              </h3>
              <span className="px-2.5 py-0.5 rounded-lg bg-yellow-400 text-black font-black text-xs border border-yellow-500 shadow-xs">
                {type === 'mesa' ? `Mesa #${tableNumber || order.tableNumber}` : type.toUpperCase()}
              </span>
              <span className="text-xs text-gray-600 font-bold">
                👤 Cliente: <strong className="text-black">{customerName || order.customerName || 'General'}</strong>
              </span>
              {hasPaymentHistory && (
                <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-black text-xs border border-amber-300">
                  💳 {paymentHistory?.length} Pago(s) Registrado(s)
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-500 font-bold uppercase block mt-0.5">
              Modo Caja / Administrador: Modifica datos, productos, notas o anula pagos
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 transition-colors flex items-center gap-1.5 font-black text-xs cursor-pointer border border-gray-200"
          title="Cerrar ventana de edición"
        >
          <IoClose className="text-xl" />
          <span>Cerrar</span>
        </button>
      </header>

      {/* MENSAJES DE ERROR / ÉXITO */}
      {error && (
        <div className="bg-red-50 text-red-700 px-3 py-1.5 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
          <IoAlertCircleOutline className="text-lg text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successToast && (
        <div className="bg-emerald-50 text-emerald-800 px-3 py-1 text-xs font-black border-b border-emerald-200 flex items-center gap-1.5 shrink-0 animate-in fade-in">
          <IoCheckmarkCircle className="text-base text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* CUERPO PRINCIPAL (2 COLUMNAS) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-stone-100">
        
        {/* COLUMNA IZQUIERDA: CATÁLOGO, BUILDER O HISTORIAL DE PAGOS (65%) */}
        <div className={`flex-1 md:w-[65%] ${selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder) ? 'p-1 sm:p-1.5' : 'p-2.5 sm:p-3'} border-r border-gray-200 flex flex-col overflow-hidden min-h-0`}>
          
          {selectedBurger ? (
            /* SECCIÓN INLINE DE PERSONALIZACIÓN DE HAMBURGUESAS */
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <BurgerBuilderModal
                burger={selectedBurger}
                availableExtras={availableExtras}
                availableProteins={availableProteins}
                availableFreeToppings={availableFreeToppings}
                isOpen={true}
                inline={true}
                onClose={() => {
                  setSelectedBurger(null);
                  setEditingItemIndex(null);
                }}
                onConfirm={(config) => {
                  handleConfirmBurgerAdd(config);
                  setSelectedBurger(null);
                }}
                defaultTakeaway={type === 'pickup'}
                defaultDelivery={type === 'delivery'}
                exchangeRates={exchangeRates}
                initialEditItem={editingItemIndex !== null ? items[editingItemIndex] : null}
              />
            </div>
          ) : selectedDrink ? (
            /* SECCIÓN INLINE DE BEBIDAS / SABORES */
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <DrinkSelectorModal
                drink={selectedDrink}
                isOpen={true}
                inline={true}
                initialEditItem={editingItemIndex !== null ? items[editingItemIndex] : null}
                onClose={() => {
                  setSelectedDrink(null);
                  setEditingItemIndex(null);
                }}
                onConfirm={(config) => {
                  handleConfirmDrinkAdd(config);
                  setSelectedDrink(null);
                  setEditingItemIndex(null);
                }}
                defaultTakeaway={type === 'pickup'}
                defaultDelivery={type === 'delivery'}
                exchangeRates={exchangeRates}
              />
            </div>
          ) : showDeliveryConfig && isDeliveryOrder ? (
            /* SECCIÓN INLINE DE DELIVERY CONFIG */
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <DeliveryConfigPanel
                customerName={customerName}
                onCustomerNameChange={setCustomerName}
                kitchenNotes={kitchenNotes}
                onKitchenNotesChange={setKitchenNotes}
                deliveryFeeUSD={deliveryFeeUSD}
                onDeliveryFeeChange={setDeliveryFeeUSD}
                cartItems={items}
                onSetItemPackaging={(id, mode) => {
                  setItems((prev) =>
                    prev.map((it) =>
                      it.id === id
                        ? { ...it, isDelivery: mode === 'delivery', isTakeaway: mode === 'llevar' }
                        : it
                    )
                  );
                }}
                onSetAllDelivery={(isDel) => {
                  setItems((prev) => prev.map((it) => ({ ...it, isDelivery: isDel, isTakeaway: false })));
                }}
                exchangeRates={exchangeRates}
                onClose={() => setShowDeliveryConfig(false)}
                onClearAllDelivery={() => {
                  setItems((prev) => prev.map((it) => ({ ...it, isDelivery: false })));
                }}
              />
            </div>
          ) : (
            /* CATÁLOGO DE PRODUCTOS O HISTORIAL DE PAGOS */
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Selector de Pestaña Superior Izquierda si hay pagos */}
              {hasPaymentHistory && (
                <div className="flex items-center gap-2 mb-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setLeftTab('catalogo')}
                    className={`px-4 py-2 rounded-xl font-black text-xs transition-all border cursor-pointer ${
                      leftTab === 'catalogo'
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    🍔 Menú / Catálogo de Productos
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftTab('pagos')}
                    className={`px-4 py-2 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center gap-1.5 ${
                      leftTab === 'pagos'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                    }`}
                  >
                    <span>💳 Historial de Pagos ({paymentHistory?.length})</span>
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  </button>
                </div>
              )}

              {leftTab === 'pagos' && hasPaymentHistory ? (
                /* TABLA FORENSE DE HISTORIAL DE PAGOS PARA ANULAR */
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white rounded-2xl border-2 border-amber-400 p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <div>
                      <h4 className="font-black text-sm text-gray-900 flex items-center gap-2">
                        <span>💳 MOVIMIENTOS FINANCIEROS REGISTRADOS</span>
                      </h4>
                      <p className="text-xs text-amber-800 font-semibold mt-0.5">
                        Anula los pagos o vueltos para poder modificar los productos y montos de la comanda con total seguridad contable.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLeftTab('catalogo')}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs cursor-pointer border border-gray-200"
                    >
                      ← Volver al Catálogo
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {paymentHistory?.map((pm) => {
                      const isChange = (pm.changeGivenUSD || 0) > 0 || (pm.changeGivenCOP || 0) > 0 || (pm.changeGivenBs || 0) > 0;
                      const amount = isChange
                        ? pm.changeGivenUSD || pm.changeGivenCOP || pm.changeGivenBs || 0
                        : pm.cashTenderedUSD || pm.cashTenderedCOP || pm.cashTenderedBs || pm.amountPaidUSD || 0;
                      const currency = isChange
                        ? pm.changeGivenUSD ? 'USD' : pm.changeGivenCOP ? 'COP' : 'Bs'
                        : pm.cashTenderedUSD ? 'USD' : pm.cashTenderedCOP ? 'COP' : pm.cashTenderedBs ? 'Bs' : 'USD';
                      const amountStr = `${amount.toLocaleString()} ${currency}`;

                      return (
                        <div
                          key={pm.id}
                          className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-3 hover:bg-white transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase ${
                                  isChange
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-green-100 text-green-900 border border-green-300'
                                }`}
                              >
                                {isChange ? 'VUELTO' : 'PAGO'}
                              </span>
                              <span className="font-black text-base text-gray-900">{amountStr}</span>
                              <span className="text-xs font-bold text-gray-600">({pm.paymentMethod})</span>
                            </div>
                            <div className="text-[11px] text-gray-500 font-semibold">
                              Por: <strong className="text-gray-800">{pm.payerName || 'Cliente General'}</strong>
                              {pm.createdAt && ` • ${new Date(pm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleAnularPago(pm.id, isChange, amountStr)}
                            className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-300 hover:border-red-600 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                            title={`Anular y eliminar este ${isChange ? 'vuelto' : 'pago'}`}
                          >
                            <IoTrashOutline className="text-base" />
                            <span>Anular {isChange ? 'Vuelto' : 'Pago'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: METADATOS Y LISTA DE ÍTEMS (35%) */}
        <div className="md:w-[35%] p-2.5 sm:p-3 flex flex-col justify-between bg-gray-50 overflow-hidden min-h-0 border-l border-gray-200">
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-2">
            
            {/* CONFIGURACIÓN RÁPIDA DE METADATOS */}
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-2 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase mb-0.5">Tipo de Pedido</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const newType = e.target.value as 'mesa' | 'pickup' | 'delivery';
                      setType(newType);
                      if (newType === 'delivery' && deliveryFeeUSD <= 0) {
                        setDeliveryFeeUSD(1.0);
                      }
                      if (newType === 'delivery') {
                        setShowDeliveryConfig(true);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-900 outline-none cursor-pointer"
                  >
                    <option value="mesa">🍽️ Mesa</option>
                    <option value="pickup">🛍️ Pickup / Llevar</option>
                    <option value="delivery">🛵 Delivery</option>
                  </select>
                </div>

                {type === 'mesa' ? (
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-0.5">Nº Mesa</label>
                    <input
                      type="number"
                      min={1}
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value ? Number(e.target.value) : '')}
                      placeholder="Mesa #"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-900 outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-blue-600 uppercase mb-0.5">
                      {type === 'delivery' ? 'Costo Delivery ($)' : 'Servicio'}
                    </label>
                    {type === 'delivery' ? (
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        value={deliveryFeeUSD}
                        onChange={(e) => setDeliveryFeeUSD(parseFloat(e.target.value) || 0)}
                        placeholder="1.00"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-blue-300 bg-blue-50 font-bold text-xs text-blue-900 outline-none"
                      />
                    ) : (
                      <div className="px-2.5 py-1.5 rounded-xl bg-gray-100 font-bold text-xs text-gray-600">
                        🛍️ Mostrador
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-0.5">
                  Nombre del Cliente {type !== 'mesa' && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nombre o referencia del cliente..."
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-0.5">Notas de Cocina</label>
                <input
                  type="text"
                  value={kitchenNotes}
                  onChange={(e) => setKitchenNotes(e.target.value)}
                  placeholder="Observaciones generales para cocina..."
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-medium text-xs text-gray-900 outline-none"
                />
              </div>
            </div>

            {/* AVISO SI HAY PAGOS REGISTRADOS */}
            {hasPaymentHistory && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center justify-between gap-2 shrink-0">
                <div className="text-[11px] font-bold leading-tight">
                  ⚠️ <strong>{paymentHistory?.length} pago(s) registrado(s).</strong> Anula los pagos para poder editar productos.
                </div>
                <button
                  type="button"
                  onClick={() => setLeftTab('pagos')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] shrink-0 cursor-pointer shadow-2xs"
                >
                  Ver Pagos
                </button>
              </div>
            )}

            {/* RESUMEN DE PRODUCTOS */}
            <div className="flex items-center justify-between pb-1 border-b border-gray-200 shrink-0">
              <span className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <IoRestaurantOutline className="text-yellow-600 text-base" />
                <span>Productos en Comanda ({items.reduce((s, it) => s + (it.quantity || 1), 0)})</span>
              </span>
              <span className="text-xs font-black text-gray-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200 shadow-xs">
                ${itemsSubtotalUSD.toFixed(2)} USD
              </span>
            </div>

            {/* LISTA SCROLLABLE DE ÍTEMS */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {items.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-xs">
                  No hay productos en la comanda. Agrega productos desde el menú.
                </div>
              ) : (
                items.map((it, idx) => {
                  const unitPrice = Number(it.price) || 0;
                  const itemTotalUSD = unitPrice * (it.quantity || 1);

                  return (
                    <div
                      key={it.id || idx}
                      className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-yellow-400 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-xs text-gray-900 leading-tight">
                            {it.productName}
                          </div>
                          <div className="text-[11px] text-gray-500 font-bold mt-0.5">
                            ${unitPrice.toFixed(2)} c/u • <strong className="text-black">${itemTotalUSD.toFixed(2)} USD</strong>
                          </div>
                        </div>

                        {/* Controles de Cantidad y Acciones */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, -1)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-black font-black text-xs flex items-center justify-center cursor-pointer border border-gray-200 active:scale-95"
                            title="Restar 1"
                          >
                            -
                          </button>
                          <span className="w-5 text-center font-black text-xs text-black">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, 1)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-black font-black text-xs flex items-center justify-center cursor-pointer border border-gray-200 active:scale-95"
                            title="Sumar 1"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditItem(idx)}
                            className="p-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-xs cursor-pointer border border-blue-200 transition-colors ml-1"
                            title="Editar personalización de este producto"
                          >
                            <IoPencilOutline className="text-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-black text-xs cursor-pointer border border-red-200 transition-colors"
                            title="Eliminar este producto"
                          >
                            <IoTrashOutline className="text-sm" />
                          </button>
                        </div>
                      </div>

                      {/* Detalles y Modificaciones */}
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {it.isTakeaway && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-black border border-amber-300">
                            📦 LLEVAR
                          </span>
                        )}
                        {it.isDelivery && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 font-black border border-blue-300">
                            🛵 DELIVERY
                          </span>
                        )}
                        {it.isCut && (
                          <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 font-black border border-purple-300">
                            ✂️ {it.cutPreference || 'Picada'}
                          </span>
                        )}
                        {it.flavor && (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-900 font-black border border-cyan-300">
                            Sabor: {it.flavor}
                          </span>
                        )}
                        {it.sugarPreference && (
                          <span className="px-1.5 py-0.2 rounded bg-pink-100 text-pink-900 font-black border border-pink-300">
                            {it.sugarPreference}
                          </span>
                        )}
                        {it.proteins && it.proteins.length > 0 && !areProteinsDefault(it.productName, it.proteins, it.defaultProteins) && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-900 font-black border border-rose-300">
                            🥩 {it.proteins.join(', ')}
                          </span>
                        )}
                        {it.removedIngredients && it.removedIngredients.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-800 font-bold border border-red-200 line-through">
                            🚫 SIN: {formatRemovedIngredients(it.removedIngredients).join(', ')}
                          </span>
                        )}
                        {it.extras && it.extras.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                            ➕ {it.extras.map((e) => `${(e.quantity || 1) > 1 ? `${e.quantity}x ` : ''}${e.name}`).join(', ')}
                          </span>
                        )}
                        {it.notes && (
                          <span className="text-gray-600 font-medium italic block w-full">
                            📝 {it.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* TOTALES Y ACCIONES INFERIORES */}
          <div className="pt-2 border-t border-gray-200 shrink-0 space-y-2">
            {/* Barra de Totales Multi-Moneda */}
            <div className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-gray-500 font-black uppercase block">Total a Pagar</span>
                <span className="text-lg font-black text-black leading-tight">${totalUSD.toFixed(2)} USD</span>
              </div>
              <div className="text-right text-[11px] font-bold text-gray-600 leading-tight">
                <div>🇨🇴 <strong className="text-sky-700">{totalCOP.toLocaleString('es-CO')} COP</strong></div>
                <div>🇻🇪 <strong className="text-amber-700">{totalBs} Bs</strong></div>
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-3 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-black text-xs cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                {onDeleteOrder && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      if (!window.confirm(`¿Seguro que deseas anular y eliminar completamente la comanda #${cleanOrderNumber}? Se liberará su número correlativo y se borrarán todos sus registros.`)) {
                        return;
                      }
                      try {
                        setIsSubmitting(true);
                        await onDeleteOrder(order.id);
                        onClose();
                      } catch (err: any) {
                        setError(err?.message || 'No se pudo anular la comanda');
                        setIsSubmitting(false);
                      }
                    }}
                    className="px-2.5 py-2 rounded-xl bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-300 font-black text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Anular y eliminar comanda completamente"
                  >
                    <IoTrashOutline />
                    <span>Anular Comanda</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={isSubmitting || hasPaymentHistory}
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-black font-black text-xs border border-yellow-500 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title={hasPaymentHistory ? 'Debes anular los pagos primero para guardar cambios en productos' : 'Guardar todos los cambios en la comanda'}
              >
                <IoSaveOutline className="text-base" />
                <span>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
