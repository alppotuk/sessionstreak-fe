import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/authApi"; 
import type { Account } from "../api/types/auth";

interface AuthContextValue {
  account: Account | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  account: null,
  isLoading: true,
  refresh: async () => {},
  login: () => {},
  logout: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const res = await authApi.me();
        setAccount(res.data);
      } else {
        setAccount(null);
      }
    } catch {
      localStorage.removeItem("token");
      setAccount(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (token: string) => {
    localStorage.setItem("token", token);
    load();
  };

  const logout = () => {
    localStorage.removeItem("token");
    setAccount(null);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AuthContext.Provider value={{ account, isLoading, refresh: load, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);