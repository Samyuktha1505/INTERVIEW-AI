import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { signup, user } = useAuth();
  const navigate = useNavigate();

  // Google login mobile prompt
  const [askPhone, setAskPhone] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');

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

    if (formData.password.length < 6) {
      toast({ title: "Validation Error", description: "Password must be at least 6 characters long", variant: "destructive" });
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Validation Error", description: "Passwords do not match", variant: "destructive" });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
      const success = await signup(formData.email, formData.password, formData.mobile, formData.countryCode);
      if (success) {
        toast({ title: "Account created", description: "Please complete your profile" });
      } else {
        toast({ title: "Signup failed", description: "Email already exists or server error", variant: "destructive" });
      }
    } catch (error) {
      console.error("Signup submission error:", error);
      toast({ title: "Error", description: "Something went wrong during signup. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) return;
    const decoded: any = jwtDecode(credentialResponse.credential);
    setGoogleEmail(decoded.email);
    setAskPhone(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <CardTitle className="text-2xl font-bold text-center">Create Account</CardTitle>
          <CardDescription className="text-center">Join InterviewAI and start practicing</CardDescription>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() =>
                toast({ title: "Google Signup Failed", variant: "destructive" })
              }
            />
          </div>
        </CardHeader>
        <CardContent>
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
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-2 col-span-1">
                <Label htmlFor="countryCode">Code</Label>
                <Select
                  value={formData.countryCode}
                  onValueChange={(value) => handleInputChange('countryCode', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="+1">🇺🇸 +1 </SelectItem>
                  <SelectItem value="+44">🇬🇧 +44 </SelectItem>
                  <SelectItem value="+91">🇮🇳 +91 </SelectItem>
                  <SelectItem value="+49">🇩🇪 +49 </SelectItem>
                  <SelectItem value="+33">🇫🇷 +33 </SelectItem>
                  <SelectItem value="+81">🇯🇵 +81 </SelectItem>
                  {/* Add more country codes here as needed */}
                  <SelectItem value="+86">🇨🇳 +86 </SelectItem>
                  <SelectItem value="+61">🇦🇺 +61 </SelectItem>
                  <SelectItem value="+52">🇲🇽 +52 </SelectItem>
                  <SelectItem value="+55">🇧🇷 +55 </SelectItem>
                  {/* <SelectItem value="+7">🇷🇺 +7 </SelectItem> */}
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
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Prompt for phone number after Google login */}
      {askPhone && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-center">Enter Mobile Number</h2>
            <Label>Country Code</Label>
            <Select
              value={formData.countryCode}
              onValueChange={(value) => handleInputChange('countryCode', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Code" />
              </SelectTrigger>
              <SelectContent>
              <SelectItem value="+1">🇺🇸 +1 (USA/Canada)</SelectItem>
                  <SelectItem value="+44">🇬🇧 +44 (UK)</SelectItem>
                  <SelectItem value="+91">🇮🇳 +91 (India)</SelectItem>
                  <SelectItem value="+49">🇩🇪 +49 (Germany)</SelectItem>
                  <SelectItem value="+33">🇫🇷 +33 (France)</SelectItem>
                  <SelectItem value="+81">🇯🇵 +81 (Japan)</SelectItem>
                  {/* Add more country codes here as needed */}
                  <SelectItem value="+86">🇨🇳 +86 (China)</SelectItem>
                  <SelectItem value="+61">🇦🇺 +61 (Australia)</SelectItem>
                  <SelectItem value="+52">🇲🇽 +52 (Mexico)</SelectItem>
                  <SelectItem value="+55">🇧🇷 +55 (Brazil)</SelectItem>
                  <SelectItem value="+7">🇷🇺 +7 (Russia)</SelectItem>
              </SelectContent>
            </Select>

            <Label>Mobile Number</Label>
            <Input
              type="tel"
              placeholder="10-digit mobile number"
              value={formData.mobile}
              onChange={(e) => handleInputChange("mobile", e.target.value)}
            />

            <Button
              className="w-full"
              onClick={async () => {
                const mobileRegex = /^\d{10}$/;
                if (!mobileRegex.test(formData.mobile)) {
                  toast({ title: "Invalid Mobile", description: "Enter valid 10-digit number", variant: "destructive" });
                  return;
                }

                try {
                  const success = await signup(googleEmail, "google-auth", formData.mobile, formData.countryCode);
                  if (success) {
                    toast({ title: "Signup Successful", description: "Please complete your profile" });
                    setAskPhone(false);
                    navigate("/basic-info");
                  } else {
                    toast({ title: "Signup Failed", description: "Email already exists", variant: "destructive" });
                  }
                } catch (err) {
                  console.error("Google signup error:", err);
                  toast({ title: "Error", description: "Google signup failed", variant: "destructive" });
                }
              }}
            >
              Continue
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setAskPhone(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Signup;