import React, { createContext, useContext, useState, useEffect } from 'react';

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
  login: (email: string, password: string) => Promise<boolean>;
  signup: (
    email: string,
    password: string,
    mobile: string,
    countryCode: string
  ) => Promise<boolean>;
  logout: () => void;
  updateProfile: (profileData: Partial<User>) => void;
  isLoading: boolean;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Changed from 3001 to 8000
      const response = await fetch('http://localhost:8000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        const userFromDB: User = {
          id: data.user_id.toString(), // user_id is directly in data
          email: email,
          // mobile and isProfileComplete are not directly returned by /api/login in current main.py
          // You might need to fetch full user details from another endpoint after login if needed immediately
          isProfileComplete: false, // Assume not complete until basic-info is confirmed
        };

        setUser(userFromDB);
        localStorage.setItem('user', JSON.stringify(userFromDB));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const signup = async (
    email: string,
    password: string,
    mobile: string,
    countryCode: string
  ): Promise<boolean> => {
    try {
      // Changed from 3001 to 8000
      const response = await fetch('http://localhost:8000/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mobile, countryCode }),
      });

      const data = await response.json();

      if (data.success) {
        const newUser: User = {
          id: data.user_id.toString(), // user_id is directly in data
          email,
          mobile,
          isProfileComplete: false, // Profile not complete yet
        };

        // You might not need to store password in localStorage for security reasons.
        // It's generally better to rely on successful authentication token/session.
        // If 'users' localStorage is just for local dev state, then keep it, otherwise remove.
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        users.push({ ...newUser, password }); // Consider removing password here
        localStorage.setItem('users', JSON.stringify(users));

        setUser(newUser);
        localStorage.setItem('user', JSON.stringify(newUser));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Signup error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('users'); // Clear if 'users' is used for local state
  };

  const updateProfile = (profileData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...profileData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const userIndex = users.findIndex((u: any) => u.id === user.id);
      if (userIndex !== -1) {
        // Only update fields that are present in profileData, preserving others
        users[userIndex] = { ...users[userIndex], ...profileData };
        localStorage.setItem('users', JSON.stringify(users));
      }
    }
  };

  const loginWithGoogle = async (credential: string): Promise<boolean> => {
    try {
      // Changed from 3001 to 8000
      const response = await fetch('http://localhost:8000/api/google-auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credential }),
      });

      const data = await response.json();

      if (data.success) {
        const googleUser: User = {
          id: data.user_id.toString(), // Direct from data, not data.user
          email: data.email,       // Direct from data, not data.user
          isProfileComplete: true, // Assuming Google users are treated as profile complete initially or checked elsewhere
          // The following fields are NOT returned by current /api/google-auth-login,
          // so remove them or handle them as optional/fetch separately if needed
          // firstName: data.user.first_name,
          // lastName: data.user.last_name,
          // mobile: data.user.phone,
          // gender: data.user.gender,
          // dateOfBirth: data.user.date_of_birth,
          // collegeName: data.user.college_name,
        };

        setUser(googleUser);
        localStorage.setItem('user', JSON.stringify(googleUser));
        return true;
      } else {
        console.error('Google login failed:', data.message);
        return false;
      }
    } catch (error) {
      console.error('Google login error:', error);
      return false;
    }
  };

  const value = {
    user,
    login,
    signup,
    logout,
    updateProfile,
    isLoading,
    loginWithGoogle,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};