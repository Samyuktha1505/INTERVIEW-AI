import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInterview } from "../contexts/InterviewContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Video } from "lucide-react"; 

const InterviewRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { getRoom } = useInterview();
  const room = getRoom(roomId || '');

  if (!room) {
    toast({
      title: "Room not found",
      description: "Redirecting to dashboard...",
      variant: "destructive",
    });
    navigate('/dashboard');
    return null;
  }

  const handleStartInterview = () => {
    navigate(`/interview-session/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="transition-all duration-300 hover:scale-105">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
            <div>
              <h1 className="text-xl font-bold">{room.targetRole} Interview</h1>
              <p className="text-sm text-muted-foreground">{room.targetCompany}</p>
            </div>
          </div>
          <Badge variant="secondary">{room.interviewType}</Badge>
        </div>
      </header>

      <div className="container mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Interview Ready</span>
                <Button 
                  onClick={handleStartInterview} 
                  className="bg-slate-900 text-white hover:bg-slate-700"
                  size="lg"
                >
                  <Video className="mr-2 h-5 w-5" />
                  Start Interview
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <h3 className="text-2xl font-semibold mb-4">Your resume has been analyzed!</h3>
                <p className="text-muted-foreground mb-6">
                  You're all set to begin your mock interview session.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Interview Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {room.currentDesignation && (
                <div>
                  <p className="text-sm font-medium">Current Designation</p>
                  <p className="text-sm text-muted-foreground">{room.currentDesignation}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">Target Role</p>
                <p className="text-sm text-muted-foreground">{room.targetRole}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Target Company</p>
                <p className="text-sm text-muted-foreground">{room.targetCompany}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Experience</p>
                <p className="text-sm text-muted-foreground">{room.yearsOfExperience} years</p>
              </div>
              <div>
                <p className="text-sm font-medium">Interview Type</p>
                <Badge variant="outline">{room.interviewType}</Badge>
              </div>
              {room.sessionInterval && (
                <div>
                  <p className="text-sm font-medium">Session Interval</p>
                  <p className="text-sm text-muted-foreground">{room.sessionInterval} minutes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default InterviewRoom;