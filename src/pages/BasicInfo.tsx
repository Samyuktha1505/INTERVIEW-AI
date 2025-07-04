import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Upload, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

interface BasicInfoForm {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth?: Date;
  collegeName: string;
  yearsOfExperience: number | null;
  resumeFile: File | null;
  countryCode: string;
  mobile: string;
}

const BasicInfo = () => {
  const { updateProfile, user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<BasicInfoForm>({
    firstName: '',
    lastName: '',
    gender: '',
    dateOfBirth: undefined,
    collegeName: '',
    yearsOfExperience: null,
    resumeFile: null,
    countryCode: '',
    mobile: user?.mobile || '',
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (user.isProfileComplete) {
      // Check if required fields are empty (user refreshed without entering details)
      const requiredFields = [user.firstName, user.lastName, user.gender, user.dateOfBirth, user.collegeName, user.yearsOfExperience, user.mobile, user.countryCode];
      const missingFields = requiredFields.some(field => !field || field === '' || field === null || field === undefined);
      if (missingFields) {
        toast({
          title: "Profile Incomplete",
          description: "Just one step away! Complete your basic info details to unlock your personalized Interview experience!.",
          variant: "success",
        });
        // Stay on basic info page
        return;
      }
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Optional: update mobile if user changes (e.g. from async fetch)
  useEffect(() => {
    if (user?.mobile) {
      setFormData(prev => ({ ...prev, mobile: user.mobile }));
    }
  }, [user]);

  const handleInputChange = (field: keyof BasicInfoForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      if (allowedMimes.includes(file.type)) {
        setFormData(prev => ({ ...prev, resumeFile: file }));
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOC, or DOCX file.",
          variant: "destructive",
        });
        e.target.value = '';
      }
    }
  };

  const validateForm = () => {
    const {
      firstName,
      lastName,
      gender,
      dateOfBirth,
      collegeName,
      yearsOfExperience,
      resumeFile,
      countryCode,
      mobile,
    } = formData;

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !gender ||
      !dateOfBirth ||
      !collegeName.trim() ||
      yearsOfExperience === null ||
      isNaN(yearsOfExperience) ||
      yearsOfExperience < 0 ||
      resumeFile === null ||
      !countryCode.trim() ||
      !mobile.trim()
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields correctly.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
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

      const formDataToSend = new FormData();
      formDataToSend.append("firstName", formData.firstName);
      formDataToSend.append("lastName", formData.lastName);
      formDataToSend.append("gender", formData.gender);
      formDataToSend.append("dateOfBirth", formData.dateOfBirth ? format(formData.dateOfBirth, 'yyyy-MM-dd') : "");
      formDataToSend.append("collegeName", formData.collegeName);
      formDataToSend.append("yearsOfExperience", formData.yearsOfExperience!.toString());
      formDataToSend.append("countryCode", formData.countryCode);
      formDataToSend.append("mobile", formData.mobile);
      formDataToSend.append("resumeFile", formData.resumeFile!);

      const response = await fetch("http://localhost:8000/api/v1/auth/basic-info", {
        method: "POST",
        body: formDataToSend,
        credentials: "include",
      });

      const result = await response.json();

      if (response.ok) {
        updateProfile({
          ...formData,
          dateOfBirth: format(formData.dateOfBirth!, 'yyyy-MM-dd'),
          isProfileComplete: true,
        });

        toast({
          title: "Profile completed successfully",
          description: "Welcome to InterviewAI!"
        });

        navigate('/dashboard');
      } else {
        throw new Error(result.error || result.message || "Profile update failed.");
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Error",
        description: `Something went wrong: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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

            {/* Name Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="Enter your first name"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  required
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
                />
              </div>
            </div>

            {/* Gender */}
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

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.dateOfBirth && "text-muted-foreground"
                    )}
                    type="button"
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

            {/* College Name */}
            <div className="space-y-2">
              <Label htmlFor="collegeName">College Name *</Label>
              <Input
                id="collegeName"
                placeholder="Enter your college/university name"
                value={formData.collegeName}
                onChange={(e) => handleInputChange('collegeName', e.target.value)}
                required
              />
            </div>

            {/* Country Code */}
            <div className="space-y-2">
              <Label>Country Code *</Label>
              <Select
                value={formData.countryCode}
                onValueChange={(value) => handleInputChange('countryCode', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="+1">🇺🇸 +1 (USA/Canada)</SelectItem>
                  <SelectItem value="+44">🇬🇧 +44 (UK)</SelectItem>
                  <SelectItem value="+91">🇮🇳 +91 (India)</SelectItem>
                  <SelectItem value="+49">🇩🇪 +49 (Germany)</SelectItem>
                  <SelectItem value="+33">🇫🇷 +33 (France)</SelectItem>
                  <SelectItem value="+81">🇯🇵 +81 (Japan)</SelectItem>
                  <SelectItem value="+86">🇨🇳 +86 (China)</SelectItem>
                  <SelectItem value="+61">🇦🇺 +61 (Australia)</SelectItem>
                  <SelectItem value="+52">🇲🇽 +52 (Mexico)</SelectItem>
                  <SelectItem value="+55">🇧🇷 +55 (Brazil)</SelectItem>
                  <SelectItem value="+7">🇷🇺 +7 (Russia)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mobile Number */}
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number *</Label>
              <Input
                id="mobile"
                type="tel"
                placeholder="Enter your mobile number"
                value={formData.mobile}
                onChange={(e) => handleInputChange('mobile', e.target.value)}
                required
              />
            </div>

            {/* Years of Experience */}
            <div className="space-y-2">
              <Label>Years of Experience *</Label>
              <Select
                value={formData.yearsOfExperience !== null ? formData.yearsOfExperience.toString() : ""}
                onValueChange={(value) => handleInputChange('yearsOfExperience', parseInt(value))}
              >
                <SelectTrigger>
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

            {/* Resume Upload */}
            <div className="space-y-2">
              <Label htmlFor="resume">Resume Upload *</Label>
              <div className="relative">
                <Input
                  id="resume"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                  required
                />
                <Label
                  htmlFor="resume"
                  className="flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50"
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

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Completing Profile..." : "Complete Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default BasicInfo;
