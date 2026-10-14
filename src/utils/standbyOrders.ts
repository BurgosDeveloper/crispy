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
  shift?: string;
  createdBy?: string;
}

const STANDBY_STORAGE_KEY = 'crispy_standby_orders';
const STANDBY_EVENT = 'crispy_standby_updated';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem('crispy_user_session') ||
      localStorage.getItem('crispy_user_session') ||
      localStorage.getItem('basilico_user_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.sessionToken || null;
    }
  } catch {}
  return null;
}

function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-crispy-token'] = token;
    headers['x-basilico-session'] = token;
  }
  return headers;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  try {
    const lanConfig = require('../config/lanConfig.json');
    if (lanConfig && lanConfig.backendUrl) return lanConfig.backendUrl;
  } catch {}
  return '';
}

/**
 * Obtener todos los pedidos en espera guardados en cache local
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
 * Actualizar el estado local (usado por WebSocket y sync del servidor)
 */
export function setLocalStandbyOrders(orders: StandbyOrder[]): void {
  try {
    localStorage.setItem(STANDBY_STORAGE_KEY, JSON.stringify(orders || []));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(STANDBY_EVENT));
    }
  } catch (err) {
    console.error('Error al guardar pedidos en standby en localStorage:', err);
  }
}

/**
 * Consultar los pedidos en standby del servidor PostgreSQL
 */
export async function fetchServerStandbyOrders(): Promise<StandbyOrder[]> {
  try {
    const url = `${getBaseUrl()}/api/standby`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getApiHeaders(),
    });
    if (res.ok) {
      const data: StandbyOrder[] = await res.json();
      setLocalStandbyOrders(data);
      return data;
    }
  } catch (err) {
    // Si falla la red, conserva el estado local
    console.warn('No se pudo sincronizar standby con el servidor central:', err);
  }
  return getStandbyOrders();
}

/**
 * Guardar o actualizar un pedido en Standby en tiempo real (PostgreSQL + WebSockets)
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

  // Actualización optimista local
  setLocalStandbyOrders(updated);

  // Sincronización en red con el servidor central
  fetch(`${getBaseUrl()}/api/standby`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(standbyOrder),
  }).catch((err) => {
    console.warn('Error enviando standby al servidor:', err);
  });

  return standbyOrder;
}

/**
 * Eliminar un pedido individual de Standby en tiempo real
 */
export function removeStandbyOrder(id: string): void {
  const current = getStandbyOrders();
  const updated = current.filter((o) => o.id !== id);
  setLocalStandbyOrders(updated);

  // Notificar al servidor central para broadcast por WebSocket
  fetch(`${getBaseUrl()}/api/standby/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getApiHeaders(),
  }).catch((err) => {
    console.warn('Error eliminando standby en el servidor:', err);
  });
}

/**
 * Vaciar todos los pedidos en Standby en tiempo real
 */
export function clearAllStandbyOrders(): void {
  setLocalStandbyOrders([]);

  fetch(`${getBaseUrl()}/api/standby`, {
    method: 'DELETE',
    headers: getApiHeaders(),
  }).catch((err) => {
    console.warn('Error vaciando standby en el servidor:', err);
  });
}

/**
 * Hook de React para escuchar y gestionar los pedidos en Standby en tiempo real
 */
export function useStandbyOrders() {
  const [standbyOrders, setStandbyOrders] = useState<StandbyOrder[]>(() => getStandbyOrders());

  useEffect(() => {
    // Sincronizar con el servidor al montar
    fetchServerStandbyOrders().catch(() => {});

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
    refreshStandbyOrders: fetchServerStandbyOrders,
  };
}
