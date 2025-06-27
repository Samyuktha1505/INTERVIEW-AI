import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Upload, CalendarIcon, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

const EditProfile: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();

  // Form data state
  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
    gender: string;
    dateOfBirth?: Date;
    collegeName: string;
    yearsOfExperience: number;
    resumeFile: File | null;
    countryCode: string;
    phoneNumber: string;
  }>({
    firstName: "",
    lastName: "",
    gender: "",
    dateOfBirth: undefined,
    collegeName: "",
    yearsOfExperience: 0,
    resumeFile: null,
    countryCode: "+91",
    phoneNumber: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [currentResumeUrl, setCurrentResumeUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) {
        toast({
          title: "Authentication Required",
          description: "Please log in to edit your profile.",
          variant: "destructive",
        });
        navigate("/login");
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch("http://localhost:8000/api/v1/auth/user-profile", {
          method: "GET",
          credentials: "include",
        });
        const data = await response.json();

        if (response.ok && data.success) {
          const userData = data.user;

          let dob: Date | undefined = undefined;
          if (userData.date_of_birth) {
            const parsedDate = new Date(userData.date_of_birth);
            if (!isNaN(parsedDate.getTime())) {
              dob = parsedDate;
            } else {
              toast({
                title: "Date Format Warning",
                description:
                  "Received an invalid date of birth from the server. Please re-enter.",
                variant: "warning",
              });
            }
          }

          setFormData({
            firstName: userData.first_name || "",
            lastName: userData.last_name || "",
            gender: userData.gender || "",
            dateOfBirth: dob,
            collegeName: userData.college_name || "",
            yearsOfExperience: userData.years_of_experience ?? 0,
            resumeFile: null,
            countryCode: userData.country_code || "+91",
            phoneNumber: userData.mobile || "",
          });

          setCurrentResumeUrl(userData.resume_url || null);
        } else {
          toast({
            title: "Fetch Failed",
            description: data.message || "Failed to fetch user profile data.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
        toast({
          title: "Error",
          description: "Failed to load user profile. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [user?.email, navigate]);

  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedMimes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedMimes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOC, or DOCX file.",
          variant: "destructive",
        });
        e.target.value = ""; // reset input
        return;
      }
      setFormData((prev) => ({ ...prev, resumeFile: file }));
    }
  };

  const validateForm = () => {
    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.gender ||
      !formData.dateOfBirth ||
      !formData.collegeName.trim() ||
      !formData.countryCode ||
      !formData.phoneNumber.trim() ||
      !formData.resumeFile // enforce resume re-upload
    ) {
      toast({
        title: "Validation Error",
        description:
          "Please fill in all required fields and upload your resume.",
        variant: "destructive",
      });
      return false;
    }

    if (formData.dateOfBirth > new Date()) {
      toast({
        title: "Validation Error",
        description: "Date of birth cannot be in the future.",
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

      const form = new FormData();
      // Note: backend expects these exact keys:
      form.append("firstName", formData.firstName);
      form.append("lastName", formData.lastName);
      form.append("mobile", formData.phoneNumber);
      form.append("gender", formData.gender);
      form.append(
        "dateOfBirth",
        formData.dateOfBirth ? format(formData.dateOfBirth, "yyyy-MM-dd") : ""
      );
      form.append("collegeName", formData.collegeName);
      form.append("yearsOfExperience", formData.yearsOfExperience.toString());
      form.append("countryCode", formData.countryCode);

      if (formData.resumeFile) {
        form.append("resumeFile", formData.resumeFile);
      }

      const response = await fetch(
        "http://localhost:8000/api/v1/auth/basic-info",
        {
          method: "POST",
          body: form,
          credentials: "include",
        }
      );

      const result = await response.json();

      if (response.ok) {
        updateProfile({
          ...user,
          firstName: formData.firstName,
          lastName: formData.lastName,
          gender: formData.gender,
          dateOfBirth: formData.dateOfBirth
            ? format(formData.dateOfBirth, "yyyy-MM-dd")
            : "",
          collegeName: formData.collegeName,
          yearsOfExperience: formData.yearsOfExperience,
          countryCode: formData.countryCode,
          mobile: formData.phoneNumber,
        });

        toast({
          title: "Profile updated successfully",
          description: "Your changes have been saved.",
        });

        navigate("/dashboard");
      } else {
        const errorMessage =
          result.error || result.message || "Failed to update profile.";
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Error",
        description: `Something went wrong: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
        <Card className="w-full max-w-2xl text-center p-8">
          <p className="text-lg">UPDATING THE DETAILS...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <CardTitle className="text-2xl font-bold text-center flex-grow">
              Edit Your Profile
            </CardTitle>
            <div />
          </div>
          <CardDescription className="text-center">
            Update your personal and academic information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* First & Last Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="Enter your first name"
                  value={formData.firstName}
                  onChange={(e) =>
                    handleInputChange("firstName", e.target.value)
                  }
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
                  onChange={(e) =>
                    handleInputChange("lastName", e.target.value)
                  }
                  required
                  className="transition-all duration-300 focus:scale-105"
                />
              </div>
            </div>

            {/* Country Code & Phone Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="countryCode">Country Code *</Label>
                <Select
                  value={formData.countryCode}
                  onValueChange={(value) =>
                    handleInputChange("countryCode", value)
                  }
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
                    <SelectItem value="+86">🇨🇳 +86 (China)</SelectItem>
                    <SelectItem value="+61">🇦🇺 +61 (Australia)</SelectItem>
                    <SelectItem value="+52">🇲🇽 +52 (Mexico)</SelectItem>
                    <SelectItem value="+55">🇧🇷 +55 (Brazil)</SelectItem>
                    <SelectItem value="+7">🇷🇺 +7 (Russia)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number *</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={formData.phoneNumber}
                  onChange={(e) =>
                    handleInputChange("phoneNumber", e.target.value)
                  }
                  required
                  className="transition-all duration-300 focus:scale-105"
                />
              </div>
            </div>

            {/* Gender Radio Group */}
            <div className="space-y-2">
              <Label>Gender *</Label>
              <RadioGroup
                value={formData.gender}
                onValueChange={(value) => handleInputChange("gender", value)}
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

            {/* Date of Birth Picker */}
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
                    {formData.dateOfBirth
                      ? format(formData.dateOfBirth, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <DayPicker
                    mode="single"
                    selected={formData.dateOfBirth}
                    onSelect={(date) => handleInputChange("dateOfBirth", date)}
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
                onChange={(e) => handleInputChange("collegeName", e.target.value)}
                required
                className="transition-all duration-300 focus:scale-105"
              />
            </div>

            {/* Years of Experience Select */}
            <div className="space-y-2">
              <Label>Years of Experience</Label>
              <Select
                value={formData.yearsOfExperience.toString()}
                onValueChange={(value) =>
                  handleInputChange("yearsOfExperience", parseInt(value))
                }
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
                />
                <Label
                  htmlFor="resume"
                  className="flex items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-all duration-300 hover:scale-105"
                >
                  <div className="text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {formData.resumeFile
                        ? formData.resumeFile.name
                        : "Click to upload/update resume (PDF/DOC/DOCX)"}
                    </p>
                  </div>
                </Label>
              </div>
              {currentResumeUrl && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current resume:{" "}
                  <a
                    href={currentResumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    View Current Resume
                  </a>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Uploading a new resume will replace the old one.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full transition-all duration-300 hover:scale-105"
              disabled={isLoading}
            >
              {isLoading ? "Saving Changes..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditProfile;
