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

  const validateForm = () => {
    const { currentDesignation, targetRole, targetCompany, interviewType } = formData;
    if (!currentDesignation || !targetRole || !targetCompany || !interviewType) {
      toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !user?.email) {
      if (!user?.email) {
        toast({ title: "Authentication Error", description: "Could not find user email.", variant: "destructive" });
      }
      return;
    }

    setIsLoading(true);

    try {
      const analysisPayload = {
        targetRole: formData.targetRole,
        targetCompany: formData.targetCompany,
        yearsOfExperience: formData.yearsOfExperience,
        currentDesignation: formData.currentDesignation,
        interviewType: formData.interviewType,
        sessionInterval: formData.sessionInterval ? Number(formData.sessionInterval) : undefined,
        user_email: user.email,
      };

      // Call analyzeResume API to get session_id and questionnaire prompt
      const analyzeResult = await analyzeResume(analysisPayload);
      const sessionId = analyzeResult.session_id;

      // Now create the room in your context/state using sessionId and form data
      await createRoom({
        currentDesignation: formData.currentDesignation,
        targetRole: formData.targetRole,
        targetCompany: formData.targetCompany,
        yearsOfExperience: formData.yearsOfExperience,
        sessionInterval: formData.sessionInterval ? Number(formData.sessionInterval) : undefined,
        interviewType: formData.interviewType,
        // Add any other required fields here if needed, excluding id and createdAt which backend handles
        // You could also include the sessionId if your backend expects it here (depends on your API)
      });

      toast({
        title: "Room created successfully!",
        description: "Your new interview room is available on the dashboard.",
      });

      onOpenChange(false);

      // Reset form after success
      setFormData({
        currentDesignation: '',
        targetRole: '',
        targetCompany: '',
        yearsOfExperience: 0,
        sessionInterval: '',
        interviewType: '',
      });
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
          <div className="pt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Creating Room..." : "Create Room"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoomModal;
