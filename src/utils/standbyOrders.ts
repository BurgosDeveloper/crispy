import { useState, useEffect } from 'react';
import { OrderItem } from '../data/mockData';

export interface StandbyOrderTarget {
  type: 'mesa' | 'delivery' | 'pickup';
  tableNumber?: number;
  title: string;
}

export interface StandbyOrder {
  id: string;
  target: StandbyOrderTarget;
  cartItems: OrderItem[];
  customerName: string;
  kitchenNotes: string;
  deliveryFeeUSD: number;
  targetPrinter: 'cocina' | 'caja' | 'ambas' | 'ninguna';
  totalUSD: number;
  createdAt: string;
  itemCount: number;
}

const STANDBY_STORAGE_KEY = 'crispy_standby_orders';
const STANDBY_EVENT = 'crispy_standby_updated';

/**
 * Obtener todos los pedidos en espera guardados en localStorage
 */
export function getStandbyOrders(): StandbyOrder[] {
  try {
    const raw = localStorage.getItem(STANDBY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error al leer pedidos en standby de localStorage:', err);
    return [];
  }
}

/**
 * Guardar o actualizar un pedido en Standby
 */
export function saveStandbyOrder(data: {
  id?: string;
  target: StandbyOrderTarget;
  cartItems: OrderItem[];
  customerName?: string;
  kitchenNotes?: string;
  deliveryFeeUSD?: number;
  targetPrinter?: 'cocina' | 'caja' | 'ambas' | 'ninguna';
  totalUSD?: number;
}): StandbyOrder {
  const current = getStandbyOrders();
  const id = data.id || `standby_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const items = data.cartItems || [];
  const itemCount = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const itemsSubtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0
  );
  const deliveryFee = Number(data.deliveryFeeUSD) || 0;
  const total = data.totalUSD !== undefined ? data.totalUSD : itemsSubtotal + deliveryFee;

  const standbyOrder: StandbyOrder = {
    id,
    target: data.target,
    cartItems: items,
    customerName: data.customerName || '',
    kitchenNotes: data.kitchenNotes || '',
    deliveryFeeUSD: deliveryFee,
    targetPrinter: data.targetPrinter || 'cocina',
    totalUSD: total,
    createdAt: new Date().toISOString(),
    itemCount,
  };

  const existingIdx = current.findIndex((o) => o.id === id);
  let updated: StandbyOrder[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = standbyOrder;
  } else {
    updated = [standbyOrder, ...current];
  }

  localStorage.setItem(STANDBY_STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event(STANDBY_EVENT));
  return standbyOrder;
}

/**
 * Eliminar un pedido individual de Standby
 */
export function removeStandbyOrder(id: string): void {
  const current = getStandbyOrders();
  const updated = current.filter((o) => o.id !== id);
  localStorage.setItem(STANDBY_STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event(STANDBY_EVENT));
}

/**
 * Vaciar todos los pedidos en Standby
 */
export function clearAllStandbyOrders(): void {
  localStorage.removeItem(STANDBY_STORAGE_KEY);
  window.dispatchEvent(new Event(STANDBY_EVENT));
}

/**
 * Hook de React para escuchar y gestionar los pedidos en Standby en tiempo real
 */
export function useStandbyOrders() {
  const [standbyOrders, setStandbyOrders] = useState<StandbyOrder[]>(() => getStandbyOrders());

  useEffect(() => {
    const handleUpdate = () => {
      setStandbyOrders(getStandbyOrders());
    };
    window.addEventListener(STANDBY_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(STANDBY_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return {
    standbyOrders,
    saveStandbyOrder,
    removeStandbyOrder,
    clearAllStandbyOrders,
  };
}
