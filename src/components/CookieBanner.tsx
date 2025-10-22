'use client';

import { useState, useEffect } from 'react';

interface CookieConsent {
  analytics: boolean;
  timestamp: number;
}

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Verificar si ya hay consentimiento guardado
    const checkConsent = () => {
      const cookieConsent = getCookieConsent();
      const localStorageConsent = getLocalStorageConsent();
      
      // Si no hay consentimiento en ninguno de los dos, mostrar banner
      if (!cookieConsent && !localStorageConsent) {
        setShowBanner(true);
      } else if (cookieConsent?.analytics || localStorageConsent?.analytics) {
        // Si hay consentimiento para analíticas, cargar script
        loadAnalytics();
      }
    };

    checkConsent();
  }, []);

  const getCookieConsent = (): CookieConsent | null => {
    if (typeof document === 'undefined') return null;
    
    const cookies = document.cookie.split(';');
    const consentCookie = cookies.find(cookie => 
      cookie.trim().startsWith('cookie-consent=')
    );
    
    if (consentCookie) {
      try {
        const value = consentCookie.split('=')[1];
        return JSON.parse(decodeURIComponent(value));
      } catch {
        return null;
      }
    }
    return null;
  };

  const getLocalStorageConsent = (): CookieConsent | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      const stored = localStorage.getItem('cookie-consent');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const setConsent = (analytics: boolean) => {
    const consent: CookieConsent = {
      analytics,
      timestamp: Date.now()
    };

    // Guardar en cookie (expira en 1 año)
    const cookieValue = encodeURIComponent(JSON.stringify(consent));
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `cookie-consent=${cookieValue}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;

    // Guardar en localStorage como backup
    try {
      localStorage.setItem('cookie-consent', JSON.stringify(consent));
    } catch (error) {
      console.warn('No se pudo guardar en localStorage:', error);
    }

    // Si aceptó analíticas, cargar script
    if (analytics) {
      loadAnalytics();
    }

    setShowBanner(false);
  };

  const loadAnalytics = () => {
    // Aquí puedes cargar tu script de analítica preferido
    // Ejemplo con Google Analytics 4:
    /*
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID';
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(...args: any[]) {
      window.dataLayer.push(args);
    }
    gtag('js', new Date());
    gtag('config', 'GA_MEASUREMENT_ID');
    */

    // Ejemplo con Plausible (recomendado para privacidad):
    /*
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.domain = 'tudominio.com';
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);
    */

    console.log('Analytics cargado (reemplaza con tu script real)');
  };

  const handleAccept = () => {
    setIsLoading(true);
    setTimeout(() => {
      setConsent(true);
      setIsLoading(false);
    }, 300);
  };

  const handleReject = () => {
    setIsLoading(true);
    setTimeout(() => {
      setConsent(false);
      setIsLoading(false);
    }, 300);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              🍪 Cookies
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Usamos cookies esenciales para el funcionamiento del sitio. 
              Las cookies de analítica son opcionales y nos ayudan a mejorar tu experiencia.
            </p>
          </div>
          
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleReject}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              {isLoading ? '...' : 'Solo esenciales'}
            </button>
            
            <button
              onClick={handleAccept}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-white bg-[#66ff99] hover:bg-[#5ce68a] rounded transition-colors disabled:opacity-50"
            >
              {isLoading ? '...' : 'Aceptar todas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
