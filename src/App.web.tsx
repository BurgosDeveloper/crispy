import React, { useState } from 'react';
import './index.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ExchangeRateModal } from './components/ExchangeRateModal';

// Pages
import { LoginPage } from './pages/LoginPage';
import { MeseroPage } from './pages/MeseroPage';
import { CocinaPage } from './pages/CocinaPage';
import { CajaPage } from './pages/CajaPage';
import { MenuManagementPage } from './pages/MenuManagementPage';

const ProtectedRoute: React.FC<{
  allowedRoles: ('mesero' | 'caja' | 'cocina' | 'admin')[];
  children: React.ReactElement;
}> = ({ allowedRoles, children }) => {
  const { userSession } = useApp();

  if (!userSession) {
    return <LoginPage />;
  }

  if (!allowedRoles.includes(userSession.role)) {
    const defaultPath =
      userSession.role === 'mesero'
        ? '/mesonero'
        : userSession.role === 'caja'
        ? '/caja'
        : userSession.role === 'cocina'
        ? '/cocina'
        : '/menu-admin';
    return <Navigate to={defaultPath} replace />;
  }

  return children;
};

const MainAppLayout: React.FC = () => {
  const { userSession } = useApp();
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // If user is not authenticated, show LoginPage
  if (!userSession) {
    return <LoginPage />;
  }

  // Redirect role on root path "/"
  const getDefaultRedirect = () => {
    if (userSession.role === 'mesero') return '/mesonero';
    if (userSession.role === 'caja') return '/caja';
    if (userSession.role === 'cocina') return '/cocina';
    if (userSession.role === 'admin') return '/menu-admin';
    return '/mesonero';
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 font-sans antialiased text-gray-900 selection:bg-yellow-400 selection:text-black">
      {/* Global Navbar */}
      <Navbar
        onOpenExchangeModal={() => setIsExchangeModalOpen(true)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* Main Layout Area */}
      <div className="flex flex-1 w-full">
        {/* Sidebar */}
        <Sidebar
          onOpenExchangeModal={() => setIsExchangeModalOpen(true)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Routes with strict Role Protection */}
        <main className="flex-1 w-full overflow-x-hidden">
          <Routes>
            <Route path="/" element={<Navigate to={getDefaultRedirect()} replace />} />
            <Route
              path="/mesonero"
              element={
                <ProtectedRoute allowedRoles={['mesero', 'caja', 'admin']}>
                  <MeseroPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/caja"
              element={
                <ProtectedRoute allowedRoles={['caja', 'admin']}>
                  <CajaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cocina"
              element={
                <ProtectedRoute allowedRoles={['cocina', 'admin']}>
                  <CocinaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/menu-admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <MenuManagementPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={getDefaultRedirect()} replace />} />
          </Routes>
        </main>
      </div>

      {/* Dynamic Exchange Rate Modal */}
      {isExchangeModalOpen && (
        <ExchangeRateModal onClose={() => setIsExchangeModalOpen(false)} />
      )}
    </div>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('⚠️ Error capturado por ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-3xl text-red-600">
            ⚠️
          </div>
          <h2 className="text-xl font-black">Estado del sistema recuperado</h2>
          <p className="text-xs text-slate-500 max-w-md">{this.state.error?.message || 'Los datos de la pantalla han sido actualizados.'}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="px-6 py-3 rounded-xl bg-emerald-500 text-black font-black text-xs hover:bg-emerald-400 shadow-lg"
          >
            RECARGAR SISTEMA
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProvider>
          <MainAppLayout />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
