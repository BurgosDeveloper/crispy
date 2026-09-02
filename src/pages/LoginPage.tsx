import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  IoFastFood,
  IoPersonOutline,
  IoKeyOutline,
  IoArrowForward,
  IoWarningOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const res = await login(username, password);
    if (!res.success) {
      setErrorMessage(res.error || 'Credenciales inválidas');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 text-gray-900 relative overflow-hidden">
      {/* Background Yellow Glow Accent */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Flat White Card */}
      <div className="relative w-full max-w-md p-8 rounded-2xl bg-white border border-gray-200 shadow-xl space-y-6">
        
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-400 border border-yellow-500 flex items-center justify-center shadow-md transform hover:scale-105 transition-all">
            <IoFastFood className="text-3xl text-black" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 border border-yellow-300 text-black text-[10px] font-black uppercase tracking-widest mb-2">
              <IoShieldCheckmarkOutline />
              <span>SISTEMA DE CONTROL CRISPY</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">CRISPY BURGER POS</h1>
            <p className="text-xs text-gray-500 mt-1">Ingresa tus credenciales para acceder al sistema.</p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold space-y-1">
            <div className="flex items-center gap-2">
              <IoWarningOutline className="text-base shrink-0" />
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 block">Usuario:</label>
            <div className="relative">
              <IoPersonOutline className="absolute left-3.5 top-3 text-yellow-600 text-base" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-xs outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-all font-bold"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 block">Contraseña:</label>
            <div className="relative">
              <IoKeyOutline className="absolute left-3.5 top-3 text-yellow-600 text-base" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 placeholder-gray-400 text-xs outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-all font-bold"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-sm border border-yellow-500 transition-all shadow-sm flex items-center justify-center gap-2 transform active:scale-[0.99]"
          >
            <span>INGRESAR AL SISTEMA</span>
            <IoArrowForward className="text-base" />
          </button>
        </form>

        {/* Access Quick Roles Info */}
        <div className="pt-2 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-500 font-semibold">
            Roles disponibles: <span className="text-black font-bold">admin</span>, <span className="text-black font-bold">caja</span>, <span className="text-black font-bold">mesero</span>, <span className="text-black font-bold">cocina</span>
          </p>
        </div>

      </div>
    </div>
  );
};
