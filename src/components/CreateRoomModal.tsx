import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "../contexts/AuthContext";
import { useInterview } from "../contexts/InterviewContext";
import { toast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface CreateRoomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ open, onOpenChange }) => {
  const [formData, setFormData] = useState({
    currentRole: '',
    targetRole: '',
    targetCompany: '',
    yearsOfExperience: 0,
    interviewType: '',
    resumeFile: null as File | null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { createRoom } = useInterview();

  const interviewTypes = [
    'Technical Interview',
    'Behavioral Interview',
    'System Design',
    'Case Study',
    'HR Round',
    'Management Round',
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf' || file.type.includes('document')) {
        setFormData((prev) => ({ ...prev, resumeFile: file }));
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or DOC file",
          variant: "destructive",
        });
      }
    }
  };

  const validateForm = () => {
    if (!formData.currentRole || !formData.targetRole || !formData.targetCompany || !formData.interviewType) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
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
      let resumeUrl = user?.resumeUrl || '';
      if (formData.resumeFile) {
        resumeUrl = URL.createObjectURL(formData.resumeFile);
      }

      const roomData = {
        currentRole: formData.currentRole,
        targetRole: formData.targetRole,
        targetCompany: formData.targetCompany,
        yearsOfExperience: formData.yearsOfExperience,
        interviewType: formData.interviewType,
        resumeUrl,
      };

      createRoom(roomData);

      toast({
        title: "Interview room created",
        description: "Your interview room is ready!",
      });

      onOpenChange(false);
      setFormData({
        currentRole: '',
        targetRole: '',
        targetCompany: '',
        yearsOfExperience: 0,
        interviewType: '',
        resumeFile: null,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create interview room",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Interview Room</DialogTitle>
          <DialogDescription>
            Set up your mock interview session
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentRole">Current Role *</Label>
            <Input
              id="currentRole"
              placeholder="e.g., Software Engineer"
              value={formData.currentRole}
              onChange={(e) => handleInputChange('currentRole', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetRole">Target Role *</Label>
            <Input
              id="targetRole"
              placeholder="e.g., Senior Software Engineer"
              value={formData.targetRole}
              onChange={(e) => handleInputChange('targetRole', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetCompany">Target Company *</Label>
            <Input
              id="targetCompany"
              placeholder="e.g., Google, Microsoft, Amazon"
              value={formData.targetCompany}
              onChange={(e) => handleInputChange('targetCompany', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Years of Experience: {formData.yearsOfExperience} years</Label>
            <Slider
              value={[formData.yearsOfExperience]}
              onValueChange={(value) => handleInputChange('yearsOfExperience', value[0])}
              max={20}
              min={0}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label>Interview Type *</Label>
            <Select
              value={formData.interviewType}
              onValueChange={(value) => handleInputChange('interviewType', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select interview type" />
              </SelectTrigger>
              <SelectContent>
                {interviewTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume">Resume (Required for Start Interview) *</Label>
            {user?.resumeUrl && !formData.resumeFile && (
              <p className="text-sm text-muted-foreground">Upload a new resume file for analysis</p>
            )}
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
                className="flex items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
              >
                <div className="text-center">
                  <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {formData.resumeFile ? formData.resumeFile.name : "Upload resume for analysis"}
                  </p>
                </div>
              </Label>
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="button"
              onClick={handleSubmit}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : "Save Room"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoomModal;