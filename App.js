import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Dashboard from './Dashboard.jsx';
import { listenToAuthState } from './firebaseService.js';
import Login from './Login.jsx';
import SplashScreen from './components/SplashScreen.jsx';

export default function App() {
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = listenToAuthState(({ userId }) => {
        window.currentUserId = userId || null;
      });
    } catch (error) {
      console.warn('[Auth] Firebase auth listener unavailable:', error);
    }
    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/splash" element={<SplashScreen />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
