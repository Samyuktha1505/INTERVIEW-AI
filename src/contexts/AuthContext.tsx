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
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        const userFromDB: User = {
          id: data.user_id.toString(),
          email: email,
          mobile: data.mobile,
          isProfileComplete: false,
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
      const response = await fetch('http://localhost:3001/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mobile, countryCode }),
      });

      const data = await response.json();

      if (data.success) {
        const newUser: User = {
          id: Date.now().toString(),
          email,
          mobile,
          isProfileComplete: false,
        };

        // Store user with password for login (if needed)
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        users.push({ ...newUser, password });
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
  };

  const updateProfile = (profileData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...profileData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const userIndex = users.findIndex((u: any) => u.id === user.id);
      if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...profileData };
        localStorage.setItem('users', JSON.stringify(users));
      }
    }
  };

  const loginWithGoogle = async (credential: string): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:3001/api/google-auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credential }),
      });

      const data = await response.json();

      if (data.success) {
        const googleUser: User = {
          id: data.user.user_id.toString(),
          email: data.user.email,
          firstName: data.user.first_name,
          lastName: data.user.last_name,
          mobile: data.user.phone,
          gender: data.user.gender,
          dateOfBirth: data.user.date_of_birth,
          collegeName: data.user.college_name,
          isProfileComplete: true,
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