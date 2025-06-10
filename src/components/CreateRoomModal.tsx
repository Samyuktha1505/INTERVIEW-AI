import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { analyzeResume } from "../services/resumeAnalysis";

interface CreateRoomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ open, onOpenChange }) => {
  const [formData, setFormData] = useState({
    currentDesignation: '',
    targetRole: '',
    targetCompany: '',
    yearsOfExperience: 0,
    sessionInterval: '',
    interviewType: '',
    resumeFile: null as File | null,
  });

  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { createRoom } = useInterview();
  const navigate = useNavigate();

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
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (allowedTypes.includes(file.type)) {
        setFormData((prev) => ({ ...prev, resumeFile: file }));
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or DOC/DOCX file",
          variant: "destructive",
        });
      }
    }
  };

  const validateForm = () => {
    const { currentDesignation, targetRole, targetCompany, interviewType, resumeFile } = formData;

    if (!currentDesignation || !targetRole || !targetCompany || !interviewType) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return false;
    }

    if (!resumeFile && !user?.resumeUrl) {
      toast({
        title: "Validation Error",
        description: "Please upload a resume file or ensure you have a resume uploaded.",
        variant: "destructive",
      });
      return false;
    }

    if (formData.sessionInterval) {
      const val = Number(formData.sessionInterval);
      if (isNaN(val) || val < 5 || val > 180) {
        toast({
          title: "Validation Error",
          description: "Session interval must be a number between 5 and 180 minutes.",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      let resumeUrl = user?.resumeUrl || '';
      let resumeFile = formData.resumeFile;

      if (formData.resumeFile) {
        resumeUrl = URL.createObjectURL(formData.resumeFile);
      } else if (user?.resumeUrl) {
        const response = await fetch(user.resumeUrl);
        const blob = await response.blob();
        resumeFile = new File([blob], 'resume.pdf', { type: 'application/pdf' });
      }

      const roomData = {
        currentDesignation: formData.currentDesignation,
        targetRole: formData.targetRole,
        targetCompany: formData.targetCompany,
        yearsOfExperience: formData.yearsOfExperience,
        sessionInterval: formData.sessionInterval ? Number(formData.sessionInterval) : undefined,
        interviewType: formData.interviewType,
        resumeUrl,
      };

      const roomId = createRoom(roomData);

      if (resumeFile) {
        const requestData = {
          resume: resumeFile,
          targetRole: formData.targetRole,
          targetCompany: formData.targetCompany,
          interviewType: formData.interviewType,
          yearsOfExperience: formData.yearsOfExperience.toString(),
          currentDesignation: formData.currentDesignation,
          sessioninterval: formData.sessionInterval ? Number(formData.sessionInterval) : undefined
        };

        await analyzeResume(requestData);
      }

      toast({
        title: "Room created successfully!",
        description: "Your interview room is ready.",
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create interview room",
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
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="currentDesignation">Current Designation *</Label>
            <Input
              id="currentDesignation"
              placeholder="e.g., Software Engineer"
              value={formData.currentDesignation}
              onChange={(e) => handleInputChange('currentDesignation', e.target.value)}
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
            <Label htmlFor="sessionInterval">Session Interval (in mins)</Label>
            <Input
              id="sessionInterval"
              type="number"
              min={5}
              max={180}
              placeholder="e.g., 45"
              value={formData.sessionInterval}
              onChange={(e) => handleInputChange('sessionInterval', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Interview Type *</Label>
            <Select
              value={formData.interviewType}
              onValueChange={(value) => handleInputChange('interviewType', value)}
              required
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
            <Label htmlFor="resume">Resume *</Label>
            {user?.resumeUrl && !formData.resumeFile && (
              <p className="text-sm text-muted-foreground">Using your previously uploaded resume</p>
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
                    {formData.resumeFile ? formData.resumeFile.name : "Upload resume (PDF/DOC/DOCX)"}
                  </p>
                </div>
              </Label>
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Creating room..." : "Create Room"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoomModal;