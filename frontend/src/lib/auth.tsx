"use client";

import { createContext, useCallback, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { useRouter } from "next/navigation";
import { AUTH_EXPIRED_EVENT, buildApiUrl } from "@/lib/api";
import { useAppDialog } from "@/components/app-dialog-provider";
import { useLocale } from "@/lib/locale";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, invitationCode: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_TOKEN_KEY = "auth_token";
const AUTH_USER_KEY = "auth_user";
const AUTH_FREE_PATH_PREFIXES = ["/login", "/register", "/verify-email", "/reset-password"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isZh } = useLocale();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const handlingAuthExpiredRef = useRef(false);

  const clearAuthState = useCallback(() => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  }, []);

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
    const storedUser = window.localStorage.getItem(AUTH_USER_KEY);

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        clearAuthState();
      }
    }
    setIsLoading(false);
  }, [clearAuthState]);

  useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      if (handlingAuthExpiredRef.current) return;
      handlingAuthExpiredRef.current = true;

      void (async () => {
        try {
          clearAuthState();
          const pathname = window.location.pathname;
          const onAuthFreePage = AUTH_FREE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
          if (onAuthFreePage) {
            return;
          }

          const detail =
            event instanceof CustomEvent && event.detail && typeof event.detail === "object"
              ? (event.detail as { message?: string })
              : null;
          await alert({
            title: isZh ? "登录已失效" : "Session expired",
            description:
              detail?.message ||
              (isZh
                ? "当前登录状态已过期，请重新登录后继续操作。"
                : "Your login session has expired. Please sign in again to continue."),
            confirmText: isZh ? "去登录" : "Go to login",
          });

          const nextPath = `${pathname}${window.location.search || ""}`;
          const loginPath = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
          router.replace(loginPath);
        } finally {
          handlingAuthExpiredRef.current = false;
        }
      })();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [alert, clearAuthState, isZh, router]);

  const login = async (email: string, password: string) => {
    const response = await fetch(buildApiUrl("/api/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Login failed");
    }

    const data = await response.json();
    setToken(data.access_token);
    setUser(data.user);
    window.localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
  };

  const register = async (email: string, username: string, password: string, invitationCode: string) => {
    const response = await fetch(buildApiUrl("/api/auth/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, username, password, invitation_code: invitationCode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Registration failed");
    }
  };

  const logout = () => {
    clearAuthState();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
