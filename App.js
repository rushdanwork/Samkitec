import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Dashboard from './Dashboard.jsx';
import Login from './Login.jsx';
import SplashScreen from './components/SplashScreen.jsx';

export default function App() {
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
