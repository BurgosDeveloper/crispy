import React from 'react';
import { Product } from '../../data/mockData';
import { IoSearch, IoClose } from 'react-icons/io5';

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
  // Extract unique categories cleanly
  const allCategories = [
    'Todas',
    ...Array.from(new Set(products.map((p) => p.category))).filter(Boolean).sort(),
  ];

  // Filter products by category and search
  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === 'Todas' || product.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (product.baseIngredients && product.baseIngredients.some(ing => ing.toLowerCase().includes(searchQuery.toLowerCase())));
    return matchesCategory && matchesSearch;
  });

  const copRate = exchangeRates.COP || 3950;
  const bsRate = exchangeRates.Bs || 36.5;

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Search & Categories Bar */}
      <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-gray-200 shrink-0">
        {/* Search input */}
        <div className="relative flex-1 min-w-[150px]">
          <IoSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar hamburguesa, bebida o ingrediente..."
            className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-gray-50 border border-gray-300 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 font-semibold"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-2 text-gray-400 hover:text-black"
            >
              <IoClose className="text-xs" />
            </button>
          )}
        </div>

        {/* Categories Chips */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap transition-all ${
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

      {/* 100% TEXT-BASED PRODUCT TILES (ZERO IMAGES) */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-center text-gray-400 text-xs">
            <p>No se encontraron productos para "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredProducts.map((product) => {
              const isBurger = product.category === 'Hamburguesas';
              const isDrink = product.category === 'Bebidas';
              const priceUSD = product.price;
              const priceCOP = Math.round(priceUSD * copRate);
              const priceBs = (priceUSD * bsRate).toFixed(2);

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  className="p-2.5 rounded-xl bg-white hover:bg-yellow-50/90 border border-gray-200 hover:border-yellow-500 text-left transition-all shadow-xs hover:shadow-sm flex flex-col justify-between group active:scale-[0.98]"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-black text-xs text-gray-900 group-hover:text-black leading-tight">
                        {product.name}
                      </h4>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-yellow-100 text-black border border-yellow-300 uppercase shrink-0">
                        {isBurger ? '🍔 BURGER' : isDrink ? '🥤 BEBIDA' : '🍟 EXTRA'}
                      </span>
                    </div>

                    {/* Ingredientes base del producto en texto */}
                    {product.baseIngredients && product.baseIngredients.length > 0 ? (
                      <p className="text-[11px] text-gray-600 line-clamp-2 leading-snug font-medium">
                        <span className="text-[10px] text-gray-400 font-bold uppercase mr-1">Trae:</span>
                        {product.baseIngredients.join(', ')}
                      </p>
                    ) : product.description ? (
                      <p className="text-[11px] text-gray-500 line-clamp-1 font-normal">
                        {product.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Precios en las 3 monedas según la tasa vigente */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-gray-100 text-[10px]">
                    <span className="font-black text-black bg-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500">
                      ${priceUSD.toFixed(2)} USD
                    </span>
                    <span className="font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                      ${priceCOP.toLocaleString()} COP
                    </span>
                    <span className="font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                      {priceBs} Bs
                    </span>
                    <span className="ml-auto font-black text-yellow-600 group-hover:text-yellow-700 text-xs">
                      + Pedir
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
