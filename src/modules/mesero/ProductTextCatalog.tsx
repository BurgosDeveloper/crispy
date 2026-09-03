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

  // Filter products by category and search, then sort strictly ALPHABETICALLY (A-Z)
  const sortedProducts = products
    .filter((product) => {
      const matchesCategory =
        selectedCategory === 'Todas' || product.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (product.baseIngredients && product.baseIngredients.some(ing => ing.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

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

      {/* 100% TEXT-BASED ULTRA-COMPACT PRODUCT TILES (ALPHABETICAL ORDER A-Z) */}
      <div className="flex-1 overflow-y-auto pr-1">
        {sortedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-center text-gray-400 text-xs font-bold">
            <p>No se encontraron productos para "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5">
            {sortedProducts.map((product) => {
              const priceUSD = product.price;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelectProduct(product)}
                  className="px-2.5 py-2 rounded-xl bg-white hover:bg-yellow-50 border border-gray-200 hover:border-yellow-500 text-left transition-all shadow-xs hover:shadow-sm flex items-center justify-between gap-1.5 group active:scale-[0.98]"
                  title={`${product.name} - $${priceUSD.toFixed(2)} USD (Toca para personalizar y ver las 3 monedas)`}
                >
                  <span className="font-black text-xs text-gray-900 group-hover:text-black leading-tight truncate">
                    {product.name}
                  </span>
                  <span className="font-black text-xs text-black bg-yellow-400 group-hover:bg-yellow-500 px-2 py-0.5 rounded-lg border border-yellow-500 shrink-0 shadow-xs">
                    ${priceUSD.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
