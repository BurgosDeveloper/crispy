import React from 'react';
import { Product } from '../../data/mockData';
import { IoSearch, IoClose, IoAdd } from 'react-icons/io5';
import { isDrinkProduct, isPotatoProduct, isCustomizableProduct } from '../../utils/productClassifier';

interface ProductTextCatalogProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  exchangeRates?: { COP: number; Bs: number };
}

export const ProductTextCatalog: React.FC<ProductTextCatalogProps> = ({
  products,
  onSelectProduct,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  exchangeRates = { COP: 3950, Bs: 36.5 },
}) => {
  // Categorías fijas y claras: 'Todas', 'Comidas', 'Bebidas'
  const filterCategories = ['Todas', 'Comidas', 'Bebidas'];

  // Función de coincidencia de búsqueda
  const matchesSearch = (product: Product): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      product.name.toLowerCase().includes(q) ||
      (product.description && product.description.toLowerCase().includes(q)) ||
      (product.baseIngredients && product.baseIngredients.some((ing) => ing.toLowerCase().includes(q)))
    );
  };

  // Separar productos en Comidas y Bebidas, filtrando por búsqueda y ordenando alfabéticamente (A-Z)
  const foodProducts = products
    .filter((p) => !isDrinkProduct(p))
    .filter(matchesSearch)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const drinkProducts = products
    .filter((p) => isDrinkProduct(p))
    .filter(matchesSearch)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const showFoods = selectedCategory === 'Todas' || selectedCategory === 'Comidas';
  const showDrinks = selectedCategory === 'Todas' || selectedCategory === 'Bebidas';

  const totalVisible = (showFoods ? foodProducts.length : 0) + (showDrinks ? drinkProducts.length : 0);

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Barra Superior: Buscador y Chips de Filtrado */}
      <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-gray-200 shrink-0">
        {/* Input de Búsqueda */}
        <div className="relative flex-1 min-w-[150px]">
          <IoSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar hamburguesa, papas, bebida o ingrediente..."
            className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-gray-50 border border-gray-300 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 font-semibold"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-2 text-gray-400 hover:text-black cursor-pointer"
            >
              <IoClose className="text-xs" />
            </button>
          )}
        </div>

        {/* Chips de Categorías */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
          {filterCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA CON AMBAS SECCIONES SEPARADAS A SIMPLE VISTA */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 scrollbar-thin">
        {totalVisible === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-center text-gray-400 text-xs font-bold">
            <p>No se encontraron productos para "{searchQuery}"</p>
          </div>
        ) : (
          <>
            {/* SECCIÓN 1: COMIDAS (Hamburguesas, Platos, Acompañantes/Papas) - Color Rojo Crema Suave */}
            {showFoods && foodProducts.length > 0 && (
              <div>
                {/* Encabezado de Sección Comidas */}
                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-red-100/70 border border-red-200 text-red-950 mb-1.5 select-none">
                  <div className="flex items-center gap-1.5 font-black text-xs tracking-wide">
                    <span>🍔</span>
                    <span className="uppercase">Comidas y Platos</span>
                    <span className="text-[10px] font-bold text-red-800/80 normal-case hidden sm:inline">
                      (Hamburguesas personalizables y raciones)
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-200/80 text-red-900">
                    {foodProducts.length} {foodProducts.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                {/* Grilla de Tarjetas de Comidas (Rojo Crema no fuerte) */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5">
                  {foodProducts.map((product) => {
                    const priceUSD = product.price;
                    const isCustom = isCustomizableProduct(product);
                    const isPotato = isPotatoProduct(product);

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="px-2.5 py-2 rounded-xl bg-[#fff8f8] hover:bg-red-50 border border-red-200/90 hover:border-red-400 text-left transition-all shadow-xs hover:shadow-sm flex items-center justify-between gap-1.5 group active:scale-[0.98] cursor-pointer"
                        title={
                          isPotato
                            ? `${product.name} - $${priceUSD.toFixed(2)} USD (Clic para agregar directo. Clics adicionales suman cantidad)`
                            : `${product.name} - $${priceUSD.toFixed(2)} USD (Clic para personalizar ingredientes y adicionales)`
                        }
                      >
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="font-black text-xs text-red-950 group-hover:text-red-900 leading-tight truncate">
                            {product.name}
                          </span>
                          <span className="text-[9px] font-bold text-red-700/80 leading-none mt-0.5 truncate">
                            {isPotato ? 'Directo (+1)' : isCustom ? 'Personalizable' : 'Comida'}
                          </span>
                        </div>
                        <span className="font-black text-xs text-red-900 bg-red-100/90 group-hover:bg-red-200/90 px-2 py-0.5 rounded-lg border border-red-300/80 shrink-0 shadow-2xs">
                          ${priceUSD.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN 2: BEBIDAS (Refrescos, Aguas, Cervezas, Jugos) - Color Azul Crema Suave */}
            {showDrinks && drinkProducts.length > 0 && (
              <div>
                {/* Encabezado de Sección Bebidas */}
                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-sky-100/70 border border-sky-200 text-sky-950 mb-1.5 select-none">
                  <div className="flex items-center gap-1.5 font-black text-xs tracking-wide">
                    <span>🥤</span>
                    <span className="uppercase">Bebidas</span>
                    <span className="text-[10px] font-bold text-sky-800/80 normal-case hidden sm:inline">
                      (Refrescos, aguas, tés y cervezas)
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-200/80 text-sky-900">
                    {drinkProducts.length} {drinkProducts.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                {/* Grilla de Tarjetas de Bebidas (Azul Crema no fuerte) */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5">
                  {drinkProducts.map((product) => {
                    const priceUSD = product.price;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="px-2.5 py-2 rounded-xl bg-[#f0f7ff] hover:bg-sky-50 border border-sky-200/90 hover:border-sky-400 text-left transition-all shadow-xs hover:shadow-sm flex items-center justify-between gap-1.5 group active:scale-[0.98] cursor-pointer"
                        title={`${product.name} - $${priceUSD.toFixed(2)} USD (Clic para agregar directo. Clics adicionales suman cantidad)`}
                      >
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="font-black text-xs text-sky-950 group-hover:text-sky-900 leading-tight truncate">
                            {product.name}
                          </span>
                          <span className="text-[9px] font-bold text-sky-700/80 leading-none mt-0.5 flex items-center gap-0.5">
                            <IoAdd className="text-[10px]" />
                            <span>Directo (+1)</span>
                          </span>
                        </div>
                        <span className="font-black text-xs text-sky-900 bg-sky-100/90 group-hover:bg-sky-200/90 px-2 py-0.5 rounded-lg border border-sky-300/80 shrink-0 shadow-2xs">
                          ${priceUSD.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
