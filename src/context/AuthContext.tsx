import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/authApi";
import type { Account } from "../api/types/auth";

interface AuthContextValue {
  account: Account | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    account: null,
    refresh: async () => {},
  });
  
  export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [account, setAccount] = useState<Account | null>(null);
  
    const load = async () => {
      try {
        const res = await authApi.me();
        setAccount(res.data);
      } catch {
        setAccount(null);
      } 
    };
  
    useEffect(() => { load(); }, []);
  
    return (
      <AuthContext.Provider value={{ account, refresh: load }}>
        {children}
      </AuthContext.Provider>
    );
  };
  
  export const useAuth = () => useContext(AuthContext);