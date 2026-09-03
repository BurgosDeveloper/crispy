import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Ingredient, Table, RecipeIngredient, DualPrintersConfig } from '../data/mockData';
import { AdminPinModal } from '../components/AdminPinModal';

import {
  IoPizza,
  IoAdd,
  IoTrash,
  IoClose,
  IoSparkles,
  IoBeer,
  IoLockClosed,
  IoShieldCheckmark,
  IoKeypad,
  IoCheckmarkCircle,
  IoPrintOutline,
  IoRestaurantOutline,
  IoCardOutline,
  IoLayersOutline,
} from 'react-icons/io5';

export const MenuManagementPage: React.FC = () => {
  const {
    products,
    ingredients,
    tables,
    addProduct,
    updateProduct,
    deleteProduct,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    addTable,
    updateTable,
    deleteTable,
    getAdminPin,
    updateAdminPin,
    getPrintersConfig,
    updatePrintersConfig,
    testPrinter,
    backendUrl,
    userSession,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'pizzas' | 'bebidas' | 'ingredientes' | 'mesas' | 'seguridad' | 'impresoras'>('pizzas');
  const [isCashierUnlocked, setIsCashierUnlocked] = useState<boolean>(userSession?.role === 'admin');
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinFeedback, setPinFeedback] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isSavingPin, setIsSavingPin] = useState<boolean>(false);

  // Estado de Configuración de Impresoras Duales
  const [printersConfig, setPrintersConfig] = useState<DualPrintersConfig>({
    cocina: { name: 'Impresora Cocina / KDS', enabled: true, host: '192.168.1.200', port: 9100, timeoutMs: 5000, copies: 1 },
    caja: { name: 'Impresora Caja / Mostrador', enabled: true, host: '192.168.1.201', port: 9100, timeoutMs: 5000, copies: 1 },
  });
  const [isSavingPrinters, setIsSavingPrinters] = useState(false);
  const [printersFeedback, setPrintersFeedback] = useState('');
  const [printersError, setPrintersError] = useState('');
  const [testingPrinterKey, setTestingPrinterKey] = useState<string | null>(null);

  useEffect(() => {
    if (userSession?.role === 'admin' || isCashierUnlocked) {
      void getAdminPin().then((pin) => setCurrentPin(pin)).catch(() => {});
      void getPrintersConfig().then((cfg) => {
        if (cfg) setPrintersConfig(cfg);
      }).catch(() => {});
    }
  }, [userSession, isCashierUnlocked, getAdminPin, getPrintersConfig]);

  const isMorningShift = userSession?.shift === 'manana';

  // Modal Pizza / Plato (Crear / Editar)
  const [isAddPizzaOpen, setIsAddPizzaOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pizzaName, setPizzaName] = useState('');
  const [dishCategory, setDishCategory] = useState<string>('Platos');
  const [pizzaPrice, setPizzaPrice] = useState('');
  const [pizzaSmallPrice, setPizzaSmallPrice] = useState('');
  const [pizzaDesc, setPizzaDesc] = useState('');
  const [pizzaImg, setPizzaImg] = useState('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80');
  const [selectedBaseIngredients, setSelectedBaseIngredients] = useState<string[]>([]);

  const handleStartEditPizza = (product: any) => {
    setEditingProductId(product.id);
    setPizzaName(product.name);
    setDishCategory(product.category || (isMorningShift ? 'Platos' : 'Pizzas'));
    setPizzaPrice(product.price.toString());
    setPizzaSmallPrice((product.priceSmall ?? (product.price > 4 ? product.price - 4 : product.price)).toString());
    setPizzaDesc(product.description || '');
    setPizzaImg(product.image || '');
    setSelectedBaseIngredients(product.baseIngredients || []);
    setIsAddPizzaOpen(true);
  };

  // Modal Nueva Bebida / Editar
  const [isAddDrinkOpen, setIsAddDrinkOpen] = useState(false);
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null);
  const [drinkName, setDrinkName] = useState('');
  const [drinkType, setDrinkType] = useState<'refresco' | 'jugo' | 'licor'>('refresco');
  const [drinkPrice, setDrinkPrice] = useState('');
  const [drinkDesc, setDrinkDesc] = useState('');
  const [drinkImg, setDrinkImg] = useState('https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80');

  // Modal Nuevo Ingrediente / Contorno / Editar
  const [isAddIngOpen, setIsAddIngOpen] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [ingName, setIngName] = useState('');
  const [ingPriceGrandeCompleta, setIngPriceGrandeCompleta] = useState('2.00');
  const [ingPriceGrandeMitad, setIngPriceGrandeMitad] = useState('1.00');
  const [ingPricePequenaCompleta, setIngPricePequenaCompleta] = useState('1.00');
  const [ingPricePequenaMitad, setIngPricePequenaMitad] = useState('0.50');
  const [ingIsBase, setIngIsBase] = useState(true);
  const [ingIsExtra, setIngIsExtra] = useState(true);
  const [ingCategory, setIngCategory] = useState(isMorningShift ? 'Contornos' : 'Ingredientes');

  // Modal Nueva Mesa / Editar
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableZone, setTableZone] = useState('Salón Principal');

  // Local Image Upload Handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, setUrl: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        if (res.ok) {
          const data = await res.json();
          setUrl(data.url);
        } else {
          setUrl(base64);
        }
      } catch (err) {
        setUrl(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePizza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pizzaName || !pizzaPrice) return;

    const pPrice = parseFloat(pizzaPrice) || 0;
    const pSmallPrice = isMorningShift
      ? pPrice
      : (parseFloat(pizzaSmallPrice) || (pPrice > 4 ? pPrice - 4 : pPrice));

    const defaultIngredients = isMorningShift
      ? []
      : ['Salsa de Tomate', 'Queso Mozzarella'];

    const productData = {
      name: pizzaName,
      category: isMorningShift ? (dishCategory || 'Platos') : 'Pizzas',
      price: pPrice,
      priceSmall: pSmallPrice,
      description: pizzaDesc || (isMorningShift ? 'Plato recién preparado con ingredientes del día.' : 'Pizza recién horneada con ingredientes artesanales.'),
      image: pizzaImg,
      baseIngredients: selectedBaseIngredients.length > 0 ? selectedBaseIngredients : defaultIngredients,
      recipe: [] as RecipeIngredient[],
      shift: userSession?.shift || (isMorningShift ? 'manana' : 'noche')
    };

    if (editingProductId) {
      await updateProduct(editingProductId, productData);
    } else {
      await addProduct(productData);
    }

    setEditingProductId(null);
    setPizzaName('');
    setDishCategory(isMorningShift ? 'Platos' : 'Pizzas');
    setPizzaPrice('');
    setPizzaSmallPrice('');
    setPizzaDesc('');
    setSelectedBaseIngredients([]);
    setIsAddPizzaOpen(false);
  };

  const handleStartEditDrink = (p: Product) => {
    setEditingDrinkId(p.id);
    setDrinkName(p.name);
    setDrinkType(p.drinkType || 'refresco');
    setDrinkPrice(p.price.toString());
    setDrinkDesc(p.description || '');
    setDrinkImg(p.image || 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80');
    setIsAddDrinkOpen(true);
  };

  const handleCreateDrink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drinkName || !drinkPrice) return;

    const drinkData = {
      name: drinkName,
      category: 'Bebidas' as const,
      drinkType: drinkType,
      price: parseFloat(drinkPrice) || 0,
      description: drinkDesc || 'Bebida fría.',
      image: drinkImg,
      recipe: [] as RecipeIngredient[],
      shift: userSession?.shift || (isMorningShift ? 'manana' : 'noche')
    };

    if (editingDrinkId) {
      await updateProduct(editingDrinkId, drinkData);
    } else {
      await addProduct(drinkData);
    }

    setEditingDrinkId(null);
    setDrinkName('');
    setDrinkPrice('');
    setDrinkDesc('');
    setIsAddDrinkOpen(false);
  };

  const handleStartEditIngredient = (ing: Ingredient) => {
    setEditingIngredientId(ing.id);
    setIngName(ing.name);
    const pComp = (ing.priceGrandeCompleta !== undefined ? ing.priceGrandeCompleta : (ing.priceUSD || 0)).toString();
    const pMit = (ing.priceGrandeMitad !== undefined ? ing.priceGrandeMitad : (parseFloat(pComp) > 0 ? parseFloat(pComp) / 2 : 0)).toString();
    const pPeqComp = (ing.pricePequenaCompleta !== undefined ? ing.pricePequenaCompleta : (parseFloat(pComp) > 0 ? parseFloat(pComp) / 2 : 0)).toString();
    const pPeqMit = (ing.pricePequenaMitad !== undefined ? ing.pricePequenaMitad : (parseFloat(pPeqComp) > 0 ? parseFloat(pPeqComp) / 2 : 0)).toString();
    
    setIngPriceGrandeCompleta(pComp);
    setIngPriceGrandeMitad(pMit);
    setIngPricePequenaCompleta(pPeqComp);
    setIngPricePequenaMitad(pPeqMit);
    setIngIsBase(ing.isBaseForPizza);
    setIngIsExtra(ing.isExtraForPizza);
    setIngCategory(ing.category || (isMorningShift ? 'Contornos' : 'Ingredientes'));
    setIsAddIngOpen(true);
  };

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName) return;

    const pGrandeComp = parseFloat(ingPriceGrandeCompleta) || 0;
    const pGrandeMit = isMorningShift ? pGrandeComp : (parseFloat(ingPriceGrandeMitad) || (pGrandeComp > 0 ? pGrandeComp / 2 : 0));
    const pPequenaComp = isMorningShift ? pGrandeComp : (parseFloat(ingPricePequenaCompleta) || (pGrandeComp > 0 ? pGrandeComp / 2 : 0));
    const pPequenaMit = isMorningShift ? pGrandeComp : (parseFloat(ingPricePequenaMitad) || (pPequenaComp > 0 ? pPequenaComp / 2 : 0));

    const ingData = {
      name: ingName,
      priceUSD: pGrandeComp,
      priceGrandeCompleta: pGrandeComp,
      priceGrandeMitad: pGrandeMit,
      pricePequenaCompleta: pPequenaComp,
      pricePequenaMitad: pPequenaMit,
      isBaseForPizza: ingIsBase,
      isExtraForPizza: ingIsExtra,
      category: ingCategory || (isMorningShift ? 'Contornos' : 'Ingredientes'),
      shift: userSession?.shift || (isMorningShift ? 'manana' : 'noche')
    };

    if (editingIngredientId) {
      await updateIngredient(editingIngredientId, ingData);
    } else {
      await addIngredient(ingData);
    }

    setEditingIngredientId(null);
    setIngName('');
    setIngPriceGrandeCompleta(isMorningShift ? '1.50' : '2.00');
    setIngPriceGrandeMitad('1.00');
    setIngPricePequenaCompleta('1.00');
    setIngPricePequenaMitad('0.50');
    setIngIsBase(true);
    setIngIsExtra(true);
    setIsAddIngOpen(false);
  };

  const handleStartEditTable = (t: Table) => {
    setEditingTableId(t.id);
    setTableNumber(t.number.toString());
    setTableName(t.name || `Mesa #${t.number}`);
    setTableCapacity(t.capacity.toString());
    setTableZone(t.zone || 'Salón Principal');
    setIsAddTableOpen(true);
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) return;

    const num = parseInt(tableNumber, 10);
    const tableData = {
      number: num,
      name: tableName || `Mesa #${num}`,
      capacity: parseInt(tableCapacity, 10) || 4,
      zone: tableZone || 'Salón Principal',
    };

    if (editingTableId) {
      await updateTable(editingTableId, tableData);
    } else {
      await addTable(tableData);
    }

    setEditingTableId(null);
    setTableNumber('');
    setTableName('');
    setTableCapacity('4');
    setTableZone('Salón Principal');
    setIsAddTableOpen(false);
  };

  const toggleBaseIngredientSelection = (name: string) => {
    setSelectedBaseIngredients((prev: string[]) =>
      prev.includes(name) ? prev.filter((n: string) => n !== name) : [...prev, name]
    );
  };

  const shiftProducts = products.filter(p => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const platosOrPizzas = isMorningShift
    ? shiftProducts.filter((p) => p.category !== 'Bebidas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    : shiftProducts.filter((p) => p.category === 'Pizzas' || p.category !== 'Bebidas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const pizzas = platosOrPizzas;
  const bebidas = shiftProducts.filter((p) => p.category === 'Bebidas').sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const shiftIngredients = ingredients.filter(i => !i.shift || i.shift === 'ambos' || i.shift === userSession?.shift).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const baseIngredientsAvailable = shiftIngredients.filter((i) => i.isBaseForPizza).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-slate-900">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-white via-slate-50 to-slate-100 border border-emerald-500/30 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-500/40 flex items-center justify-center shadow-lg">
            {isMorningShift ? (
              <IoRestaurantOutline className="text-3xl text-emerald-600" />
            ) : (
              <IoPizza className="text-3xl text-emerald-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Gestión del Menú & Mesas</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 text-[10px] font-black uppercase">
                ADMINISTRADOR ({isMorningShift ? 'TURNO MAÑANA' : 'TURNO NOCHE'})
              </span>
            </div>
            <p className="text-xs text-gray-500 font-semibold mt-1">
              Agrega y administra hamburguesas, bebidas, ingredientes adicionales y configuración de mesas.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white border border-gray-200 overflow-x-auto custom-scrollbar shadow-xs">
          <button
            onClick={() => setActiveTab('pizzas')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'pizzas' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <span>🍔 HAMBURGUESAS ({pizzas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('bebidas')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'bebidas' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <span>🥤 BEBIDAS ({bebidas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ingredientes')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'ingredientes' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <span>🍟 INGREDIENTES & EXTRAS ({shiftIngredients.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mesas')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'mesas' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <IoLayersOutline />
            <span>MESAS ({tables.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('seguridad')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'seguridad' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <IoLockClosed />
            <span>🔐 PIN DE SEGURIDAD</span>
          </button>

          <button
            onClick={() => setActiveTab('impresoras')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'impresoras' ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            <IoPrintOutline />
            <span>🖨️ IMPRESORAS TÉRMICAS</span>
          </button>
        </div>
      </div>

      {/* TAB 1: HAMBURGUESAS */}
      {activeTab === 'pizzas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-black flex items-center gap-2">
              <span className="text-xl">🍔</span>
              <span>CATÁLOGO DE HAMBURGUESAS & COMBOS</span>
            </h2>

            <button
              onClick={() => {
                setEditingProductId(null);
                setPizzaName('');
                setDishCategory('Hamburguesas');
                setPizzaPrice('');
                setPizzaSmallPrice('');
                setPizzaDesc('');
                setSelectedBaseIngredients([]);
                setIsAddPizzaOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs transition-all flex items-center gap-1.5 border border-yellow-500 shadow-xs"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA HAMBURGUESA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pizzas.map((p) => (
              <div key={p.id} className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-yellow-400 shadow-xs flex flex-col justify-between space-y-3 transition-all">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-black text-black">{p.name}</h3>
                    <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-black border border-yellow-300 text-[10px] font-black uppercase shrink-0">
                      {p.category || 'HAMBURGUESA'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{p.description}</p>
                  
                  {p.baseIngredients && p.baseIngredients.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block mb-1">
                        Ingredientes Base:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {p.baseIngredients.map((ing, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-gray-800 font-bold">
                            ✓ {ing}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-lg font-black text-black bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500">
                    ${p.price.toFixed(2)} USD
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditPizza(p)}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 hover:bg-yellow-400 hover:text-black border border-gray-300 transition-all text-xs font-bold flex items-center gap-1"
                    >
                      ✏️ Editar
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-200 transition-all">
                      <IoTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BEBIDAS */}
      {activeTab === 'bebidas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <IoBeer className="text-emerald-600 text-xl" />
              <span>BEBIDAS & REFRESCOS</span>
            </h2>

            <button
              onClick={() => setIsAddDrinkOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA BEBIDA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bebidas.map((p) => (
              <div key={p.id} className="p-5 rounded-3xl bg-gradient-to-br from-white to-[#070707] border border-slate-200 shadow-2xl flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="relative h-40 rounded-2xl overflow-hidden border border-slate-200">
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-md bg-white/80 border border-slate-300 text-sky-700 text-[10px] font-black uppercase">
                      {p.drinkType?.toUpperCase() || 'BEBIDA'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{p.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">{p.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <span className="text-xl font-black text-emerald-700">${p.price.toFixed(2)} USD</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditDrink(p)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500 hover:text-slate-900 border border-emerald-500/30 transition-all text-xs font-bold flex items-center gap-1"
                    >
                      ✏️ Editar
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-red-500/20 text-red-600 hover:bg-red-500 hover:text-slate-900 border border-red-500/30 transition-all">
                      <IoTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: INGREDIENTES O CONTORNOS */}
      {activeTab === 'ingredientes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <IoSparkles className="text-emerald-600 text-xl" />
              <span>{isMorningShift ? 'CATÁLOGO DE ACOMPAÑANTES Y CONTORNOS' : 'CATÁLOGO DE INGREDIENTES'}</span>
            </h2>

            <button
              onClick={() => {
                setEditingIngredientId(null);
                setIngName('');
                setIngPriceGrandeCompleta(isMorningShift ? '1.50' : '2.00');
                setIngPriceGrandeMitad('1.00');
                setIngPricePequenaCompleta('1.00');
                setIngPricePequenaMitad('0.50');
                setIngIsBase(true);
                setIngIsExtra(true);
                setIsAddIngOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>{isMorningShift ? 'NUEVO CONTORNO / ACOMPAÑANTE' : 'NUEVO INGREDIENTE'}</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-slate-50 backdrop-blur-xl shadow-2xl">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100 text-slate-900 uppercase text-[10px] font-black border-b border-slate-200">
                {isMorningShift ? (
                  <tr>
                    <th className="p-4">Acompañante / Contorno</th>
                    <th className="p-4">Precio Adicional (USD)</th>
                    <th className="p-4">Acompañante Base de Platos</th>
                    <th className="p-4">Contorno Adicional Cobrable</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-4">Nombre del Ingrediente</th>
                    <th className="p-4">🍕 Grande Completa</th>
                    <th className="p-4">🌓 Grande Mitad</th>
                    <th className="p-4">🍕 Pequeña Completa</th>
                    <th className="p-4">🌓 Pequeña Mitad</th>
                    <th className="p-4">Base</th>
                    <th className="p-4">Extra</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-200">
                {shiftIngredients.map((ing) => {
                  const pComp = ing.priceGrandeCompleta !== undefined ? ing.priceGrandeCompleta : (ing.priceUSD || 0);
                  const pMit = ing.priceGrandeMitad !== undefined ? ing.priceGrandeMitad : (pComp > 0 ? pComp / 2 : 0);
                  const pPeqComp = ing.pricePequenaCompleta !== undefined ? ing.pricePequenaCompleta : (pComp > 0 ? pComp / 2 : 0);
                  const pPeqMit = ing.pricePequenaMitad !== undefined ? ing.pricePequenaMitad : (pPeqComp > 0 ? pPeqComp / 2 : 0);

                  if (isMorningShift) {
                    return (
                      <tr key={ing.id} className="hover:bg-slate-100">
                        <td className="p-4 font-bold text-slate-900 flex items-center gap-2">
                          <IoSparkles className="text-emerald-600" />
                          <span>{ing.name}</span>
                        </td>
                        <td className="p-4 font-black text-emerald-700">+${pComp.toFixed(2)} USD</td>
                        <td className="p-4">
                          {ing.isBaseForPizza ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 border border-emerald-200 text-[10px] font-bold">✓ INCLUIDO EN PLATOS</span>
                          ) : (
                            <span className="text-slate-400">NO</span>
                          )}
                        </td>
                        <td className="p-4">
                          {ing.isExtraForPizza ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 border border-amber-200 text-[10px] font-bold">✓ DISPONIBLE ADICIONAL</span>
                          ) : (
                            <span className="text-slate-400">NO</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleStartEditIngredient(ing)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500 hover:text-slate-900 border border-emerald-500/30 transition-all text-xs font-bold flex items-center gap-1"
                            >
                              ✏️ Editar
                            </button>
                            <button onClick={() => deleteIngredient(ing.id)} className="p-2 rounded-xl bg-red-500/20 text-red-600 hover:bg-red-500 hover:text-slate-900 border border-red-500/30 transition-all">
                              <IoTrash size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={ing.id} className="hover:bg-slate-100">
                      <td className="p-4 font-bold text-slate-900 flex items-center gap-2">
                        <IoSparkles className="text-emerald-600" />
                        <span>{ing.name}</span>
                      </td>
                      <td className="p-4 font-black text-emerald-700">+${pComp.toFixed(2)} USD</td>
                      <td className="p-4 font-bold text-emerald-600">+${pMit.toFixed(2)} USD</td>
                      <td className="p-4 font-bold text-teal-700">+${pPeqComp.toFixed(2)} USD</td>
                      <td className="p-4 font-bold text-teal-600">+${pPeqMit.toFixed(2)} USD</td>
                      <td className="p-4">
                        {ing.isBaseForPizza ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 border border-emerald-200 text-[10px] font-bold">✓ SÍ</span>
                        ) : (
                          <span className="text-slate-400">NO</span>
                        )}
                      </td>
                      <td className="p-4">
                        {ing.isExtraForPizza ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 border border-amber-200 text-[10px] font-bold">✓ SÍ</span>
                        ) : (
                          <span className="text-slate-400">NO</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEditIngredient(ing)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500 hover:text-slate-900 border border-emerald-500/30 transition-all text-xs font-bold flex items-center gap-1"
                          >
                            ✏️ Editar
                          </button>
                          <button onClick={() => deleteIngredient(ing.id)} className="p-2 rounded-xl bg-red-500/20 text-red-600 hover:bg-red-500 hover:text-slate-900 border border-red-500/30 transition-all">
                            <IoTrash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MESAS */}
      {activeTab === 'mesas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <IoPizza className="text-emerald-600 text-xl" />
              <span>CONFIGURACIÓN DE MESAS DEL RESTAURANTE</span>
            </h2>

            <button
              onClick={() => { setEditingTableId(null); setTableNumber(''); setTableName(''); setIsAddTableOpen(true); }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA MESA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {tables.map((t) => {
              const sizeTag = t.capacity <= 2 ? 'Pequeña (2p)' : t.capacity <= 4 ? 'Mediana (4p)' : 'Grande (6-8p)';
              return (
                <div key={t.id} className="p-5 rounded-3xl bg-gradient-to-br from-white to-[#070707] border border-slate-200 shadow-2xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-600/30 text-emerald-700 border border-emerald-500/40 text-[10px] font-black uppercase">
                        {sizeTag}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold uppercase">{t.zone || 'Salón'}</span>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 mt-2">{t.name || `Mesa #${t.number}`}</h3>
                    <p className="text-xs text-slate-500 mt-1">Capacidad: <span className="text-slate-900 font-bold">{t.capacity} personas</span></p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-500">N° {t.number}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEditTable(t)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500 hover:text-slate-900 border border-emerald-500/30 transition-all text-xs font-bold flex items-center gap-1"
                      >
                        ✏️ Editar
                      </button>
                      <button onClick={() => deleteTable(t.id)} className="p-2 rounded-xl bg-red-500/20 text-red-600 hover:bg-red-500 hover:text-slate-900 border border-red-500/30 transition-all">
                        <IoTrash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: SEGURIDAD Y PIN */}
      {activeTab === 'seguridad' && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-500/30 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-700">
                <IoShieldCheckmark size={26} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase">PIN de Seguridad y Autorizaciones</h2>
                <p className="text-xs text-slate-600 font-semibold">
                  Configura el PIN de 4 dígitos requerido para autorizar acciones sensibles en el perfil de Caja (Editar comanda, Anular, Unificar, Historial, Reportes y Cierre).
                </p>
              </div>
            </div>

            {/* PIN Actual Informativo */}
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase text-emerald-800 block">PIN de Administrador Configurado:</span>
                <span className="text-2xl font-black text-emerald-700 tracking-widest">
                  {currentPin ? currentPin.split('').map(() => '•').join(' ') + ` (${currentPin})` : '1234'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-600 text-slate-900 font-black text-xs">
                ACTIVO
              </div>
            </div>

            {/* Formulario de Cambio de PIN */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPinFeedback('');
                setPinError('');
                if (!/^\d{4}$/.test(newPinInput)) {
                  setPinError('El nuevo PIN debe contener exactamente 4 dígitos numéricos.');
                  return;
                }
                if (newPinInput !== confirmPinInput) {
                  setPinError('La confirmación del PIN no coincide con el nuevo PIN.');
                  return;
                }
                setIsSavingPin(true);
                try {
                  await updateAdminPin(newPinInput);
                  setCurrentPin(newPinInput);
                  setNewPinInput('');
                  setConfirmPinInput('');
                  setPinFeedback('✅ ¡PIN de seguridad actualizado exitosamente a ' + newPinInput + '!');
                } catch (err: any) {
                  setPinError(err.message || 'Error al actualizar el PIN.');
                } finally {
                  setIsSavingPin(false);
                }
              }}
              className="space-y-4"
            >
              <h3 className="text-sm font-black text-slate-900 uppercase">Modificar PIN de Seguridad:</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nuevo PIN (4 dígitos):</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    value={newPinInput}
                    onChange={(e) => {
                      setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setPinFeedback('');
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-base font-black text-center tracking-widest text-slate-900 outline-none focus:border-emerald-500 shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Confirmar Nuevo PIN:</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    value={confirmPinInput}
                    onChange={(e) => {
                      setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setPinFeedback('');
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-base font-black text-center tracking-widest text-slate-900 outline-none focus:border-emerald-500 shadow-inner"
                  />
                </div>
              </div>

              {pinFeedback && (
                <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black text-center flex items-center justify-center gap-1.5">
                  <IoCheckmarkCircle className="text-base" />
                  <span>{pinFeedback}</span>
                </div>
              )}

              {pinError && (
                <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-black text-center">
                  ⚠️ {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={newPinInput.length !== 4 || confirmPinInput.length !== 4 || isSavingPin}
                className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-900 font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <IoKeypad />
                <span>{isSavingPin ? 'GUARDANDO PIN...' : 'GUARDAR NUEVO PIN'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 6: IMPRESORAS TÉRMICAS DUALES */}
      {activeTab === 'impresoras' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header Info */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-500/30 shadow-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-700 text-2xl">
                <IoPrintOutline />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase">Sistema de Impresoras Térmicas Duales</h2>
                <p className="text-xs text-slate-600 font-semibold">
                  Configura las direcciones IP y puertos de la <strong>Impresora de Cocina</strong> (comandas y adiciones) y la <strong>Impresora de Caja</strong> (pre-cuentas y cierres).
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={testingPrinterKey !== null}
              onClick={async () => {
                setTestingPrinterKey('ambas');
                setPrintersFeedback('');
                setPrintersError('');
                try {
                  await testPrinter('ambas');
                  setPrintersFeedback('✅ ¡Impresión de prueba enviada exitosamente a AMBAS impresoras!');
                } catch (err: any) {
                  setPrintersError(err.message || 'Error en test de impresoras.');
                } finally {
                  setTestingPrinterKey(null);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 text-sky-800 hover:text-black border border-sky-400/50 font-black text-xs flex items-center gap-2 shadow-sm transition-all whitespace-nowrap"
            >
              <IoLayersOutline className="text-base" />
              <span>{testingPrinterKey === 'ambas' ? 'PROBANDO...' : 'PROBAR AMBAS'}</span>
            </button>
          </div>

          {printersFeedback && (
            <div className="p-4 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black text-center flex items-center justify-center gap-2 shadow-sm">
              <IoCheckmarkCircle className="text-lg" />
              <span>{printersFeedback}</span>
            </div>
          )}

          {printersError && (
            <div className="p-4 rounded-2xl bg-red-100 border border-red-300 text-red-800 text-xs font-black text-center shadow-sm">
              ⚠️ {printersError}
            </div>
          )}

          {/* Formulario 2 Columnas para Cocina y Caja */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PANEL 1: IMPRESORA DE COCINA */}
            <div className={`p-6 rounded-3xl border shadow-xl space-y-4 transition-all ${
              printersConfig.cocina.enabled
                ? 'bg-gradient-to-br from-white to-amber-50/50 border-amber-500/40 ring-1 ring-amber-400/30'
                : 'bg-white/60 border-slate-200 opacity-80'
            }`}>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center text-xl">
                    <IoRestaurantOutline />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">🍳 Impresora de Cocina</h3>
                    <span className="text-[10px] text-slate-500 font-bold block">Comandas y Adiciones de Cocina</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printersConfig.cocina.enabled}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      cocina: { ...prev.cocina, enabled: e.target.checked }
                    }))}
                    className="w-5 h-5 rounded accent-amber-500"
                  />
                  <span className={`text-xs font-black ${printersConfig.cocina.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {printersConfig.cocina.enabled ? '🟢 ACTIVA' : '🔴 INACTIVA'}
                  </span>
                </label>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre / Identificador:</label>
                  <input
                    type="text"
                    value={printersConfig.cocina.name}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      cocina: { ...prev.cocina, name: e.target.value }
                    }))}
                    placeholder="Impresora Cocina / KDS"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Dirección IP (Host):</label>
                    <input
                      type="text"
                      value={printersConfig.cocina.host}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, host: e.target.value }
                      }))}
                      placeholder="192.168.1.200"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Puerto (Port):</label>
                    <input
                      type="number"
                      value={printersConfig.cocina.port}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, port: parseInt(e.target.value, 10) || 9100 }
                      }))}
                      placeholder="9100"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Copias por Ticket:</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={printersConfig.cocina.copies}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, copies: parseInt(e.target.value, 10) || 1 }
                      }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Timeout (ms):</label>
                    <input
                      type="number"
                      step={500}
                      value={printersConfig.cocina.timeoutMs}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        cocina: { ...prev.cocina, timeoutMs: parseInt(e.target.value, 10) || 5000 }
                      }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={testingPrinterKey !== null || !printersConfig.cocina.enabled}
                    onClick={async () => {
                      setTestingPrinterKey('cocina');
                      setPrintersFeedback('');
                      setPrintersError('');
                      try {
                        await testPrinter('cocina');
                        setPrintersFeedback('✅ ¡Impresión de prueba enviada exitosamente a la Impresora de Cocina!');
                      } catch (err: any) {
                        setPrintersError(err.message || 'Error al conectar con la impresora de cocina.');
                      } finally {
                        setTestingPrinterKey(null);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <IoPrintOutline />
                    <span>{testingPrinterKey === 'cocina' ? 'PROBANDO...' : '🧪 IMPRESIÓN DE PRUEBA COCINA'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PANEL 2: IMPRESORA DE CAJA */}
            <div className={`p-6 rounded-3xl border shadow-xl space-y-4 transition-all ${
              printersConfig.caja.enabled
                ? 'bg-gradient-to-br from-white to-emerald-50/50 border-emerald-500/40 ring-1 ring-emerald-400/30'
                : 'bg-white/60 border-slate-200 opacity-80'
            }`}>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center text-xl">
                    <IoCardOutline />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">💳 Impresora de Caja</h3>
                    <span className="text-[10px] text-slate-500 font-bold block">Pre-Cuentas, Reportes y Cierres</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printersConfig.caja.enabled}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      caja: { ...prev.caja, enabled: e.target.checked }
                    }))}
                    className="w-5 h-5 rounded accent-emerald-500"
                  />
                  <span className={`text-xs font-black ${printersConfig.caja.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {printersConfig.caja.enabled ? '🟢 ACTIVA' : '🔴 INACTIVA'}
                  </span>
                </label>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre / Identificador:</label>
                  <input
                    type="text"
                    value={printersConfig.caja.name}
                    onChange={(e) => setPrintersConfig(prev => ({
                      ...prev,
                      caja: { ...prev.caja, name: e.target.value }
                    }))}
                    placeholder="Impresora Caja / Mostrador"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Dirección IP (Host):</label>
                    <input
                      type="text"
                      value={printersConfig.caja.host}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, host: e.target.value }
                      }))}
                      placeholder="192.168.1.201"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Puerto (Port):</label>
                    <input
                      type="number"
                      value={printersConfig.caja.port}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, port: parseInt(e.target.value, 10) || 9100 }
                      }))}
                      placeholder="9100"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Copias por Ticket:</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={printersConfig.caja.copies}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, copies: parseInt(e.target.value, 10) || 1 }
                      }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Timeout (ms):</label>
                    <input
                      type="number"
                      step={500}
                      value={printersConfig.caja.timeoutMs}
                      onChange={(e) => setPrintersConfig(prev => ({
                        ...prev,
                        caja: { ...prev.caja, timeoutMs: parseInt(e.target.value, 10) || 5000 }
                      }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={testingPrinterKey !== null || !printersConfig.caja.enabled}
                    onClick={async () => {
                      setTestingPrinterKey('caja');
                      setPrintersFeedback('');
                      setPrintersError('');
                      try {
                        await testPrinter('caja');
                        setPrintersFeedback('✅ ¡Impresión de prueba enviada exitosamente a la Impresora de Caja!');
                      } catch (err: any) {
                        setPrintersError(err.message || 'Error al conectar con la impresora de caja.');
                      } finally {
                        setTestingPrinterKey(null);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-900 font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <IoPrintOutline />
                    <span>{testingPrinterKey === 'caja' ? 'PROBANDO...' : '🧪 IMPRESIÓN DE PRUEBA CAJA'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Botón Guardar Cambios */}
          <div className="pt-4">
            <button
              type="button"
              disabled={isSavingPrinters}
              onClick={async () => {
                setIsSavingPrinters(true);
                setPrintersFeedback('');
                setPrintersError('');
                try {
                  const updated = await updatePrintersConfig(printersConfig);
                  setPrintersConfig(updated);
                  setPrintersFeedback('✅ ¡Configuración de impresoras guardada exitosamente!');
                } catch (err: any) {
                  setPrintersError(err.message || 'Error al guardar la configuración de impresoras.');
                } finally {
                  setIsSavingPrinters(false);
                }
              }}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-900 font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <IoPrintOutline className="text-lg" />
              <span>{isSavingPrinters ? 'GUARDANDO CONFIGURACIÓN...' : '💾 GUARDAR CONFIGURACIÓN DE IMPRESORAS'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Desbloqueo por PIN para Usuario Caja */}
      {userSession?.role === 'caja' && !isCashierUnlocked && (
        <AdminPinModal
          isOpen={true}
          title="🔐 ACCESO ADMINISTRATIVO"
          description="Para ingresar a la gestión del menú y configuración ingrese el PIN de 4 dígitos:"
          actionName="Panel de Administración"
          onSuccess={() => setIsCashierUnlocked(true)}
          onClose={() => window.history.back()}
        />
      )}

      {/* MODAL CREAR PIZZA / PLATO */}
      {isAddPizzaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg p-6 bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-500/40 rounded-3xl shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-lg font-black">
                {editingProductId
                  ? (isMorningShift ? 'EDITAR PLATO' : 'EDITAR PIZZA')
                  : (isMorningShift ? 'NUEVO PLATO / ALMUERZO EN EL MENÚ' : 'NUEVA PIZZA EN EL MENÚ')}
              </h3>
              <button onClick={() => { setIsAddPizzaOpen(false); setEditingProductId(null); }}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreatePizza} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  {isMorningShift ? 'Nombre del Plato / Almuerzo:' : 'Nombre de la Pizza:'}
                </label>
                <input
                  type="text"
                  required
                  value={pizzaName}
                  onChange={(e) => setPizzaName(e.target.value)}
                  placeholder={isMorningShift ? 'Ej: Pabellón Criollo, Pollo a la Plancha...' : 'Ej: Pizza Cuatro Quesos'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              {isMorningShift && (
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Categoría del Plato:</label>
                  <select
                    value={dishCategory}
                    onChange={(e) => setDishCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500 font-bold"
                  >
                    <option value="Platos">Platos Principales</option>
                    <option value="Especialidades">Especialidades</option>
                    <option value="Pastas">Pastas</option>
                    <option value="Entradas">Entradas / Sopas</option>
                  </select>
                </div>
              )}

              {isMorningShift ? (
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Precio del Plato ($ USD):</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={pizzaPrice}
                    onChange={(e) => setPizzaPrice(e.target.value)}
                    placeholder="8.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500 font-black text-emerald-700"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Precio Grande (12") USD ($):</label>
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={pizzaPrice}
                      onChange={(e) => setPizzaPrice(e.target.value)}
                      placeholder="14.50"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-amber-700 block mb-1">Precio Pequeña (8") USD ($):</label>
                    <input
                      type="number"
                      step="0.5"
                      value={pizzaSmallPrice}
                      onChange={(e) => setPizzaSmallPrice(e.target.value)}
                      placeholder="10.50"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-amber-200 text-xs text-amber-200 outline-none focus:border-amber-300 font-bold"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  {isMorningShift
                    ? 'Seleccionar Acompañantes Base del Plato (Arroz, Caraotas, Ensalada, etc.):'
                    : 'Seleccionar Ingredientes Base de la Pizza:'}
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto custom-scrollbar p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  {baseIngredientsAvailable.map((ing) => {
                    const isSelected = selectedBaseIngredients.includes(ing.name);
                    return (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => toggleBaseIngredientSelection(ing.name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isSelected ? 'bg-emerald-600 text-slate-900 border-emerald-400' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{ing.name}
                      </button>
                    );
                  })}
                  {baseIngredientsAvailable.length === 0 && (
                    <span className="text-xs text-slate-400 p-1">
                      {isMorningShift ? 'Sin acompañantes configurados aún.' : 'Sin ingredientes base configurados.'}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Descripción Breve:</label>
                <input
                  type="text"
                  value={pizzaDesc}
                  onChange={(e) => setPizzaDesc(e.target.value)}
                  placeholder={isMorningShift ? 'Ej: Acompañado de arroz blanco, caraotas negras y tajadas' : 'Ej: Salsa pomodoro, queso mozzarella fresco'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Cargar Imagen desde PC:</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setPizzaImg)}
                    className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-emerald-600 file:text-slate-900 hover:file:bg-emerald-500"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs shadow-lg">
                {isMorningShift ? 'GUARDAR PLATO EN EL MENÚ' : 'GUARDAR PIZZA EN EL MENÚ'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR BEBIDA */}
      {isAddDrinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg p-6 bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-500/40 rounded-3xl shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-lg font-black">{editingDrinkId ? 'EDITAR BEBIDA' : 'NUEVA BEBIDA EN EL MENÚ'}</h3>
              <button onClick={() => setIsAddDrinkOpen(false)}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreateDrink} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Nombre de la Bebida:</label>
                <input
                  type="text"
                  required
                  value={drinkName}
                  onChange={(e) => setDrinkName(e.target.value)}
                  placeholder="Ej: Coca-Cola 1.5L"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Tipo de Bebida:</label>
                <select
                  value={drinkType}
                  onChange={(e) => setDrinkType(e.target.value as 'refresco' | 'jugo' | 'licor')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="refresco">Refresco / Gaseosa</option>
                  <option value="jugo">Jugo Natural</option>
                  <option value="licor">Licor / Vino / Cerveza</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Precio en USD ($):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={drinkPrice}
                  onChange={(e) => setDrinkPrice(e.target.value)}
                  placeholder="3.50"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Descripción Breve:</label>
                <input
                  type="text"
                  value={drinkDesc}
                  onChange={(e) => setDrinkDesc(e.target.value)}
                  placeholder="Ej: Botella de 1.5 litros bien fría"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Cargar Imagen desde PC:</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setDrinkImg)}
                    className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-emerald-600 file:text-slate-900 hover:file:bg-emerald-500"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs shadow-lg">
                GUARDAR BEBIDA EN EL MENÚ
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR INGREDIENTE / CONTORNO */}
      {isAddIngOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md">
          <div className="relative w-full max-w-md p-6 bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-500/40 rounded-3xl shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-lg font-black">
                {editingIngredientId
                  ? (isMorningShift ? 'EDITAR ACOMPAÑANTE / CONTORNO' : 'EDITAR INGREDIENTE')
                  : (isMorningShift ? 'NUEVO ACOMPAÑANTE / CONTORNO' : 'NUEVO INGREDIENTE')}
              </h3>
              <button onClick={() => setIsAddIngOpen(false)}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreateIngredient} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  {isMorningShift ? 'Nombre del Acompañante / Contorno:' : 'Nombre del Ingrediente:'}
                </label>
                <input
                  type="text"
                  required
                  value={ingName}
                  onChange={(e) => setIngName(e.target.value)}
                  placeholder={isMorningShift ? 'Ej: Papas Fritas, Tajadas, Arroz Extra...' : 'Ej: Jamón Serrano'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              {isMorningShift ? (
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    Precio Adicional como Contorno ($ USD):
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    value={ingPriceGrandeCompleta}
                    onChange={(e) => setIngPriceGrandeCompleta(e.target.value)}
                    placeholder="1.50"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black text-emerald-700 outline-none focus:border-emerald-500"
                  />
                </div>
              ) : (
                <div className="p-3 bg-white/60 rounded-2xl border border-slate-200 space-y-3">
                  <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider block">
                    Matriz de Precios Adicionales ($ USD):
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">🍕 Grande Completa ($):</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        required
                        value={ingPriceGrandeCompleta}
                        onChange={(e) => setIngPriceGrandeCompleta(e.target.value)}
                        placeholder="2.00"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">🌓 Grande Mitad ($):</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        required
                        value={ingPriceGrandeMitad}
                        onChange={(e) => setIngPriceGrandeMitad(e.target.value)}
                        placeholder="1.00"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">🍕 Pequeña Completa ($):</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        required
                        value={ingPricePequenaCompleta}
                        onChange={(e) => setIngPricePequenaCompleta(e.target.value)}
                        placeholder="1.00"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">🌓 Pequeña Mitad ($):</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        required
                        value={ingPricePequenaMitad}
                        onChange={(e) => setIngPricePequenaMitad(e.target.value)}
                        placeholder="0.50"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Categoría:</label>
                <select
                  value={ingCategory}
                  onChange={(e) => setIngCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                >
                  {isMorningShift ? (
                    <>
                      <option value="Contornos">Contornos / Guarniciones</option>
                      <option value="Acompañantes">Acompañantes Base</option>
                      <option value="Proteínas">Proteínas Extra</option>
                      <option value="Salsas">Salsas / Aderezos</option>
                    </>
                  ) : (
                    <>
                      <option value="Ingredientes">General</option>
                      <option value="Quesos">Quesos</option>
                      <option value="Carnes">Carnes</option>
                      <option value="Vegetales">Vegetales</option>
                      <option value="Salsas">Salsas</option>
                      <option value="Especias">Especias</option>
                      <option value="Orillas">Orillas</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ingIsBase}
                    onChange={(e) => setIngIsBase(e.target.checked)}
                    className="rounded accent-emerald-600"
                  />
                  <span>
                    {isMorningShift
                      ? 'Usar como Acompañante Base de Platos (Viene con el plato)'
                      : 'Usar como Ingrediente Base para Pizzas'}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ingIsExtra}
                    onChange={(e) => setIngIsExtra(e.target.checked)}
                    className="rounded accent-emerald-600"
                  />
                  <span>
                    {isMorningShift
                      ? 'Disponible como Contorno Adicional Cobrable al pedir'
                      : 'Disponible como Adicional / Extra al pedir'}
                  </span>
                </label>
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs shadow-lg">
                {isMorningShift ? 'GUARDAR ACOMPAÑANTE / CONTORNO' : 'GUARDAR INGREDIENTE'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR MESA */}
      {isAddTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md">
          <div className="relative w-full max-w-md p-6 bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-500/40 rounded-3xl shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-lg font-black">NUEVA MESA</h3>
              <button onClick={() => setIsAddTableOpen(false)}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Número de Mesa:</label>
                <input
                  type="number"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ej: 9"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Nombre o Referencia de Mesa:</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Ej: Mesa #9 (Terraza)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Tamaño / Capacidad:</label>
                <select
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="2">Pequeña (2 Personas)</option>
                  <option value="4">Mediana (4 Personas)</option>
                  <option value="6">Grande (6 Personas)</option>
                  <option value="8">Familiar (8 Personas)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Ubicación / Zona:</label>
                <input
                  type="text"
                  value={tableZone}
                  onChange={(e) => setTableZone(e.target.value)}
                  placeholder="Salón Principal, Terraza, VIP..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black text-xs shadow-lg">
                GUARDAR MESA
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
