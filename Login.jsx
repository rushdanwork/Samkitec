import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (onLogin) {
      await onLogin({ email, password });
    }
    navigate('/splash');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <form
        className="w-full max-w-md rounded-2xl bg-emerald-500 px-8 py-10 text-white shadow-lg"
        onSubmit={handleSubmit}
      >
        <div className="mb-6 flex justify-center">
          <img src="./assets/eye_logo.png" alt="eye logo" className="h-10 w-auto" />
        </div>
        <h2 className="mb-6 text-center text-2xl font-semibold">Login</h2>
        <label className="mb-2 block text-sm font-medium" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className="mb-4 w-full rounded-lg border border-white/40 bg-white/20 px-3 py-2 text-white placeholder-white/70"
          placeholder="Enter your email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="mb-2 block text-sm font-medium" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          className="mb-6 w-full rounded-lg border border-white/40 bg-white/20 px-3 py-2 text-white placeholder-white/70"
          placeholder="Enter your password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          className="w-full rounded-full bg-white py-2 font-semibold text-emerald-600 transition hover:opacity-90"
          type="submit"
        >
          Login
        </button>
      </form>
    </div>
  );
}
