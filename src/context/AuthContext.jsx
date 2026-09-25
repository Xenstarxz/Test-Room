import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const data = await api.login(credentials);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = (data) => api.register(data);

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const updateUser = (nextUserData) => {
    setUser((prev) => ({ ...prev, ...nextUserData }));
  };

  const refreshUser = async () => {
    try {
      const data = await api.me();
      setUser(data);
      return data;
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser, refreshUser, isAdmin: user?.role === 'admin' || Boolean(user?.isAdmin) }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
