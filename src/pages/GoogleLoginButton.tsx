import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const GoogleLoginButton = () => {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async (credential: string) => {
    setIsLoading(true);
    try {
      const user = await loginWithGoogle(credential);
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.firstName || "User"}!`,
      });
      console.log(user.isProfileComplete);
      navigate(user.isProfileComplete ? "/dashboard" : "/basic-info");
    } catch (error) {
      toast({
        title: "Login failed",
        description:
          error instanceof Error ? error.message : "Google login failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      disabled={isLoading}
      onClick={() => {
        // Replace this with Google OAuth real token in production
        const fakeCredential = "google-oauth-token-example";
        handleGoogleLogin(fakeCredential);
      }}
      className="btn-google-login"
    >
      {isLoading ? "Logging in..." : "Login with Google"}
    </button>
  );
};

export default GoogleLoginButton;
