import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => navigate('/dashboard'), 2000);
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <img src="./assets/logo_eye.png" alt="eye logo" className="h-12 w-auto" />
    </div>
  );
}
