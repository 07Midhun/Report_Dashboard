import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../services/api";
import type { User } from "../services/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("schnell_token"));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const initializeAuth = async () => {
      const savedToken = localStorage.getItem("schnell_token");
      if (savedToken) {
        try {
          // Race api.getMe() with a 10-second timeout so app never hangs
          const profilePromise = api.getMe();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Auth timeout")), 10000)
          );
          const profile = (await Promise.race([profilePromise, timeoutPromise])) as User;
          if (isMounted) {
            setUser(profile);
            setToken(savedToken);
          }
        } catch (err) {
          if (isMounted) {
            localStorage.removeItem("schnell_token");
            localStorage.removeItem("schnell_user");
            setUser(null);
            setToken(null);
          }
        }
      }
      if (isMounted) {
        setLoading(false);
      }
    };

    initializeAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("schnell_token", newToken);
    localStorage.setItem("schnell_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("schnell_token");
    localStorage.removeItem("schnell_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAdmin: user?.role === "admin",
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
