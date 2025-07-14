import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";

const Signup = () => {
  const [formData, setFormData] = useState({
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
    countryCode: '+91'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signup, user, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/basic-info');
    }
  }, [user, navigate]);

  const validateForm = () => {
    if (!formData.email || !formData.mobile || !formData.password || !formData.confirmPassword || !formData.countryCode) {
      toast({ title: "Validation Error", description: "Please fill in all fields", variant: "destructive" });
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({ title: "Validation Error", description: "Please enter a valid email address", variant: "destructive" });
      return false;
    }

    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(formData.mobile)) {
      toast({ title: "Validation Error", description: "Please enter a valid 10-digit mobile number", variant: "destructive" });
      return false;
    }

    if (formData.password.length < 8) {
      toast({ title: "Weak Password", description: "Password must be at least 8 characters.", variant: "destructive" });
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive" });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
      await signup(formData.email, formData.password, formData.mobile, formData.countryCode);
      toast({
        title: "Account created",
        description: "Please complete your profile",
      });
    } catch (error) {
      console.error("Signup submission error:", error);
      toast({
        title: "Signup failed",
        description: "Email already exists or server error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async (response: CredentialResponse) => {
    if (!response?.credential) {
      toast({
        title: "Google Login Failed",
        description: "No credential received.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const user = await loginWithGoogle(response.credential);
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.firstName || "User"}!`,
      });
      navigate(user.isProfileComplete ? "/dashboard" : "/basic-info");
    } catch (err: any) {
      toast({
        title: "Google Login Failed",
        description: err.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
          <CardDescription className="text-muted-foreground">
            Join InterviewAI and start practicing
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={() => {
                toast({
                  title: "Google Login Failed",
                  description: "Something went wrong while signing in with Google.",
                  variant: "destructive",
                });
              }}
              useOneTap
              shape="rectangular"
              size="large"
              text="continue_with"
              width="100%"
              theme="outline"
              logo_alignment="left"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-muted-foreground/30" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
                className="focus-visible:ring-primary"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="countryCode">Country Code</Label>
                <Select
                  value={formData.countryCode}
                  onValueChange={(value) => handleInputChange('countryCode', value)}
                >
                  <SelectTrigger className="focus:ring-primary">
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+1">🇺🇸 +1</SelectItem>
                    <SelectItem value="+44">🇬🇧 +44</SelectItem>
                    <SelectItem value="+91">🇮🇳 +91</SelectItem>
                    <SelectItem value="+49">🇩🇪 +49</SelectItem>
                    <SelectItem value="+33">🇫🇷 +33</SelectItem>
                    <SelectItem value="+81">🇯🇵 +81</SelectItem>
                    <SelectItem value="+86">🇨🇳 +86</SelectItem>
                    <SelectItem value="+61">🇦🇺 +61</SelectItem>
                    <SelectItem value="+52">🇲🇽 +52</SelectItem>
                    <SelectItem value="+55">🇧🇷 +55</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="Enter your mobile number"
                  value={formData.mobile}
                  onChange={(e) => handleInputChange('mobile', e.target.value)}
                  required
                  className="focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                  className="pr-10 focus-visible:ring-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  required
                  className="pr-10 focus-visible:ring-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90"
              disabled={isLoading}
            >
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;