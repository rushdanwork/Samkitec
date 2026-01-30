import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Logo from './Logo.jsx';

export default function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => navigate('/dashboard'), 2000);
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <Logo size="32" className="animate-fadeZoom" />
    </div>
  );
}
