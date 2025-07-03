import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { InterviewProvider } from "./contexts/InterviewContext";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import BasicInfo from "./pages/BasicInfo";
import Dashboard from "./pages/Dashboard";
import EditProfile from "./pages/EditProfile";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import LiveInterviewSession from "./pages/LiveInterviewSession";
import ForgotPassword from "@/pages/ForgotPassword";
import InterviewLogs from "./pages/InterviewLogs";

// Optional loading spinner while auth is loading
const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center text-lg font-semibold">
    Loading...
  </div>
);

// This ensures InterviewProvider loads only after auth is done
const AppWithAuthReady = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <InterviewProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/basic-info"
            element={
              <ProtectedRoute>
                <BasicInfo />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <EditProfile />
              </ProtectedRoute>
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/interview-logs"
            element={
              <ProtectedRoute>
                <InterviewLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/interview-session/:roomId"
            element={
              <ProtectedRoute>
                <LiveInterviewSession />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </InterviewProvider>
  );
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppWithAuthReady />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
