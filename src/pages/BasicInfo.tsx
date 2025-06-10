import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext"; // Adjust path as needed
import { toast } from "@/hooks/use-toast"; // Adjust path as needed
import { Upload, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils"; // Adjust path as needed
import { format } from "date-fns";
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css'; // Make sure this CSS is accessible

const BasicInfo = () => {
  // State to hold all form data, including the resume file and country code
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    dateOfBirth: undefined as Date | undefined, // Date object for DayPicker
    collegeName: '',
    yearsOfExperience: 0,
    resumeFile: null as File | null, // To store the selected File object
    countryCode: '+91' // Added countryCode with a default value (e.g., India)
  });

  const [isLoading, setIsLoading] = useState(false); // Loading state for button
  const { updateProfile, user } = useAuth(); // Auth context for user info and profile updates
  const navigate = useNavigate(); // For navigation after profile completion

  // Redirect if profile is already complete
  useEffect(() => {
    if (user?.isProfileComplete) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Generic handler for text, select, and radio inputs
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handler for file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; // Get the first selected file
    if (file) {
      // Basic client-side file type validation
      const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (allowedMimes.includes(file.type)) {
        setFormData(prev => ({ ...prev, resumeFile: file }));
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOC, or DOCX file.",
          variant: "destructive",
        });
        e.target.value = ''; // Clear the file input if invalid
      }
    }
  };

  // Client-side form validation
  const validateForm = () => {
    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.gender ||
      !formData.dateOfBirth ||
      !formData.collegeName.trim() ||
      !formData.countryCode // Added countryCode to validation
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return false;
    }
    // You can add validation for resumeFile here if it's mandatory
    // e.g., if (!formData.resumeFile) { /* show toast */ return false; }
    return true;
  };

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default browser form submission
    if (!validateForm()) return; // Run client-side validation

    setIsLoading(true); // Set loading state

    try {
      // Get user email and phone from context. Provide fallbacks if they might be null/undefined.
      // Make sure 'user' object is reliably populated from your AuthContext upon login/signup.
      const email = user?.email;
      if (!email) {
        toast({
          title: "Authentication Error",
          description: "User email not found. Please log in again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      const phone = user?.mobile || ""; // Phone might not be directly used for update, but passed for consistency

      // Create FormData object to send multipart/form-data (required for file uploads)
      const form = new FormData();
      form.append("email", email);
      form.append("phone", phone); // Not strictly needed for update, but included
      form.append("first_name", formData.firstName); // Match server's expected field name
      form.append("last_name", formData.lastName);   // Match server's expected field name
      form.append("gender", formData.gender);
      // Format date to 'YYYY-MM-DD' string as expected by MySQL DATE type
      form.append("date_of_birth", formData.dateOfBirth ? format(formData.dateOfBirth, 'yyyy-MM-dd') : "");
      form.append("college_name", formData.collegeName);
      form.append("years_of_experience", formData.yearsOfExperience.toString()); // Convert number to string
      form.append("country_code", formData.countryCode); // Append country code to FormData
      if (formData.resumeFile) {
        form.append("resume", formData.resumeFile); // Append the actual File object
      }

      // Send POST request to your backend API
      const response = await fetch("http://localhost:3001/api/basic-info", {
        method: "POST",
        body: form, // FormData object is passed directly. Browser sets Content-Type automatically.
      });

      const result = await response.json(); // Parse the JSON response from the server

      if (response.ok && result.success) { // Check both HTTP status and custom success flag
        // Update user profile in AuthContext
        updateProfile({
          ...formData, // Spread existing form data
          dateOfBirth: formData.dateOfBirth ? format(formData.dateOfBirth, 'yyyy-MM-dd') : "", // Store as string in context
          isProfileComplete: true // Mark profile as complete
        });

        toast({
          title: "Profile completed successfully",
          description: "Welcome to InterviewAI!"
        });

        navigate('/dashboard'); // Navigate to dashboard
      } else {
        // Handle API errors (e.g., validation errors from server, user not found, file upload errors)
        const errorMessage = result.error || result.message || "Failed to update profile. Please try again.";
        throw new Error(errorMessage);
      }

    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Error",
        description: `Something went wrong: ${error instanceof Error ? error.message : "An unknown error occurred."}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false); // Reset loading state
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Complete Your Profile</CardTitle>
          <CardDescription className="text-center">
            Help us personalize your interview experience
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="Enter your first name"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  required
                  className="transition-all duration-300 focus:scale-105"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  placeholder="Enter your last name"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  required
                  className="transition-all duration-300 focus:scale-105"
                />
              </div>
            </div>

            {/* NEW: Country Code Select */}
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country Code *</Label>
              <Select
                value={formData.countryCode}
                onValueChange={(value) => handleInputChange('countryCode', value)}
              >
                <SelectTrigger className="transition-all duration-300 hover:scale-105">
                  <SelectValue placeholder="Select country code" />
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
            </div>

            <div className="space-y-2">
              <Label>Gender *</Label>
              <RadioGroup
                value={formData.gender}
                onValueChange={(value) => handleInputChange('gender', value)}
                className="flex flex-row space-x-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id="male" />
                  <Label htmlFor="male">Male</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id="female" />
                  <Label htmlFor="female">Female</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="other" id="other" />
                  <Label htmlFor="other">Other</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className={cn(
                      "w-full justify-start text-left font-normal transition-all duration-300 hover:scale-105",
                      !formData.dateOfBirth && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dateOfBirth ? format(formData.dateOfBirth, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <DayPicker
                    mode="single"
                    selected={formData.dateOfBirth}
                    onSelect={(date) => handleInputChange('dateOfBirth', date)}
                    captionLayout="dropdown"
                    fromYear={1970}
                    toYear={new Date().getFullYear()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="collegeName">College Name *</Label>
              <Input
                id="collegeName"
                placeholder="Enter your college/university name"
                value={formData.collegeName}
                onChange={(e) => handleInputChange('collegeName', e.target.value)}
                required
                className="transition-all duration-300 focus:scale-105"
              />
            </div>

            <div className="space-y-2">
              <Label>Years of Experience</Label>
              <Select
                value={formData.yearsOfExperience.toString()}
                onValueChange={(value) => handleInputChange('yearsOfExperience', parseInt(value))}
              >
                <SelectTrigger className="transition-all duration-300 hover:scale-105">
                  <SelectValue placeholder="Select years of experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Fresher (0 years)</SelectItem>
                  <SelectItem value="1">1 year</SelectItem>
                  <SelectItem value="2">2 years</SelectItem>
                  <SelectItem value="3">3 years</SelectItem>
                  <SelectItem value="4">4 years</SelectItem>
                  <SelectItem value="5">5+ years</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resume">Resume Upload</Label>
              <div className="relative">
                <Input
                  id="resume"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Label
                  htmlFor="resume"
                  className="flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-all duration-300 hover:scale-105"
                >
                  <div className="text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {formData.resumeFile ? formData.resumeFile.name : "Click to upload resume (PDF/DOC/DOCX)"}
                    </p>
                  </div>
                </Label>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full transition-all duration-300 hover:scale-105"
              disabled={isLoading}
            >
              {isLoading ? "Completing Profile..." : "Complete Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default BasicInfo;