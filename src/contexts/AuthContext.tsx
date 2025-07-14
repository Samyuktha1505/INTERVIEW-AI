import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  gender?: string;
  dateOfBirth?: string;
  collegeName?: string;
  resumeUrl?: string;
  yearsOfExperience?: number;
  countryCode?: string;
  isProfileComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<any>;
  signup: (
    email: string,
    password: string,
    mobile: string,
    countryCode: string
  ) => Promise<void>;
  logout: () => void;
  updateProfile: (profileData: Partial<User>) => void;
  isLoading: boolean;
  error: string | null;
  loginWithGoogle: (credential: string) => Promise<User>;
  accessToken: string | null;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

const BASE_AUTH_URL = "http://localhost:8000/api/v1/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initializeAuth = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_AUTH_URL}/me`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser({
          id: data.user?.id?.toString() || data.user_id?.toString(),
          email: data.user?.email || "",
          firstName: data.user?.firstName,
          lastName: data.user?.lastName,
          mobile: data.user?.mobile,
          gender: data.user?.gender,
          dateOfBirth: data.user?.dateOfBirth,
          collegeName: data.user?.collegeName,
          resumeUrl: data.user?.resume_url || data.resume_url,
          yearsOfExperience: data.user?.yearsOfExperience,
          countryCode: data.user?.countryCode,
          isProfileComplete: data.isProfileComplete ?? true,
        });
      }
    } catch (err) {
      console.warn("⚠️ Failed to restore session:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const handleResponseError = async (response: Response) => {
    if (!response.ok) {
      const contentType = response.headers.get("Content-Type");
      if (contentType?.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.message || response.statusText);
      } else {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
    }
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_AUTH_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      await handleResponseError(response);
      const data = await response.json();

      setUser({
        id: data.user?.id?.toString() || data.user_id?.toString(),
        email: data.user?.email || email,
        firstName: data.user?.firstName,
        lastName: data.user?.lastName,
        mobile: data.user?.mobile,
        gender: data.user?.gender,
        dateOfBirth: data.user?.dateOfBirth,
        collegeName: data.user?.collegeName,
        resumeUrl: data.user?.resume_url || data.resume_url,
        yearsOfExperience: data.user?.yearsOfExperience,
        countryCode: data.user?.countryCode,
        isProfileComplete: data.isProfileComplete ?? false,
      });

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    mobile: string,
    countryCode: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_AUTH_URL}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, mobile, countryCode }),
      });

      await handleResponseError(response);
      const data = await response.json();

      setUser({
        id: data.user?.id?.toString() || data.user_id?.toString(),
        email: data.user?.email || email,
        mobile,
        countryCode,
        resumeUrl: data.user?.resume_url || data.resume_url,
        isProfileComplete: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch(`http://localhost:8000/api/v1/logging/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("⚠️ Logout request failed:", err);
    } finally {
      setUser(null);
      setError(null);
    }
  };

  const updateProfile = (profileData: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...profileData } : null));
  };

  const loginWithGoogle = async (credential: string): Promise<User> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_AUTH_URL}/google-auth-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credential }),
        credentials: "include",
      });

      await handleResponseError(response);
      const data = await response.json();

      const user: User = {
        id: data.user_id?.toString() || "",
        email: data.email || "",
        firstName: data.firstName,
        lastName: data.lastName,
        mobile: data.mobile,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        collegeName: data.collegeName,
        resumeUrl: data.resume_url,
        yearsOfExperience: data.yearsOfExperience,
        countryCode: data.countryCode,
        isProfileComplete: data.isProfileComplete ?? true,
      };

      setUser(user);
      setAccessToken(data.token || null);
      return user;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshToken = async () => {
    try {
      const response = await fetch(`${BASE_AUTH_URL}/refresh-token`, {
        method: "POST",
        credentials: "include",
      });

      await handleResponseError(response);
      const data = await response.json();
      setAccessToken(data.access_token);
    } catch (err) {
      logout();
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        updateProfile,
        isLoading,
        error,
        loginWithGoogle,
        accessToken,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
