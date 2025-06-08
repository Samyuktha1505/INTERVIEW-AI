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
  isProfileComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, mobile: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (profileData: Partial<User>) => void;
  isLoading: boolean;
  loginWithGoogle: (credential: string) => Promise<boolean>;
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
    // Check for existing user session
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if user exists in localStorage
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const existingUser = users.find((u: any) => u.email === email && u.password === password);
      
      if (existingUser) {
        const { password: _, ...userWithoutPassword } = existingUser;
        setUser(userWithoutPassword);
        localStorage.setItem('user', JSON.stringify(userWithoutPassword));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const signup = async (email: string, password: string, mobile: string): Promise<boolean> => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if user already exists
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      if (users.find((u: any) => u.email === email)) {
        return false;
      }
      
      const newUser: User = {
        id: Date.now().toString(),
        email,
        mobile,
        isProfileComplete: false
      };
      
      // Store user with password for login
      const userWithPassword = { ...newUser, password };
      users.push(userWithPassword);
      localStorage.setItem('users', JSON.stringify(users));
      
      setUser(newUser);
      localStorage.setItem('user', JSON.stringify(newUser));
      return true;
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
      
      // Update in users array too
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
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo, just create a user with the email from credential
      const decoded = JSON.parse(atob(credential.split('.')[1]));
      const email = decoded.email;
      
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      let user = users.find((u: any) => u.email === email);
      
      if (!user) {
        // Create new user if doesn't exist
        user = {
          id: Date.now().toString(),
          email,
          isProfileComplete: false
        };
        users.push(user);
        localStorage.setItem('users', JSON.stringify(users));
      }
      
      setUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      return true;
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
    loginWithGoogle
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
