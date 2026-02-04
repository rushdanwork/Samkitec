import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import logoEye from '../assets/logo_eye.png';

export default function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => navigate('/dashboard'), 2000);
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <img src={logoEye} alt="eye logo" className="h-12 w-auto" />
    </div>
  );
}
