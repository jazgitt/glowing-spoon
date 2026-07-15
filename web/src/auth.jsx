// Auth context: who am I, plus login/register/logout actions.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, needsFirstUser: false });

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/api/auth/me');
      setState({ loading: false, user, needsFirstUser: false });
    } catch {
      try {
        const { needsFirstUser } = await api.get('/api/auth/bootstrap');
        setState({ loading: false, user: null, needsFirstUser });
      } catch {
        setState({ loading: false, user: null, needsFirstUser: false });
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { user } = await api.post('/api/auth/login', { email, password });
    setState({ loading: false, user, needsFirstUser: false });
  }, []);

  const register = useCallback(async (email, password, inviteToken) => {
    const { user } = await api.post('/api/auth/register', { email, password, inviteToken });
    setState({ loading: false, user, needsFirstUser: false });
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setState({ loading: false, user: null, needsFirstUser: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
