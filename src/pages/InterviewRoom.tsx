import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInterview } from "../contexts/InterviewContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
// Import Video icon for the new button
import { ArrowLeft, FileText, Loader2, Video } from "lucide-react"; 
import { analyzeResume } from "../services/resumeAnalysis";

const InterviewRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { getRoom } = useInterview();
  const [room, setRoom] = useState(getRoom(roomId || ''));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // New state to track if analysis has successfully completed at least once
  const [isAnalysisComplete, setIsAnalysisComplete] = useState(false); 

  useEffect(() => {
    if (!room) {
      toast({
        title: "Room not found",
        description: "Redirecting to dashboard...",
        variant: "destructive",
      });
      navigate('/dashboard');
      return;
    }

    if (room && !analysisResult && !isAnalyzing) {
      startAnalysis();
    }
  }, [roomId, room, navigate, analysisResult, isAnalyzing]);

  const startAnalysis = async () => {
    if (!room) return;

    // Reset completion state on every new analysis
    setIsAnalysisComplete(false); 
    setIsAnalyzing(true);
    setError(null);

    try {
      let resumeFile: File;

      if (room.resumeUrl && room.resumeUrl.startsWith('blob:')) {
        const response = await fetch(room.resumeUrl);
        const blob = await response.blob();
        resumeFile = new File([blob], 'resume.pdf', { type: 'application/pdf' });
      } else {
        setError('Resume not available in a format that can be re-analyzed.');
        setIsAnalyzing(false);
        toast({
          title: "Analysis Failed",
          description: "Resume source invalid for analysis.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Analyzing resume",
        description: "Please wait while we analyze your resume...",
      });

      const requestData = {
        resume: resumeFile,
        targetRole: room.targetRole,
        targetCompany: room.targetCompany,
        interviewType: room.interviewType,
        yearsOfExperience: room.yearsOfExperience.toString(),
        currentDesignation: room.currentDesignation || '',
        sessioninterval: room.sessionInterval || undefined
      };

      const result = await analyzeResume(requestData);
      setAnalysisResult(result);
      
      // Set analysis as complete on success
      setIsAnalysisComplete(true); 

      toast({
        title: "Analysis complete",
        description: "Your resume has been analyzed successfully!",
      });
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze resume';
      setError(errorMessage);
      toast({
        title: "Analysis failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!room) {
    return null;
  }

  // Handler for the new "Start Interview" button
  const handleStartInterview = () => {
    // Navigate to the new live interview session page
    navigate(`/interview-session/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b p-4">
        {/* ... header JSX remains the same ... */}
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
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" /> <span>Resume Analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isAnalyzing && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p className="text-lg">Analyzing your resume...</p>
                    <p className="text-sm text-muted-foreground">This may take a few moments</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <h3 className="font-medium text-destructive mb-2">Analysis Error</h3>
                  <p className="text-sm text-destructive/80">{error}</p>
                  <Button onClick={startAnalysis} variant="outline" size="sm" className="mt-3">Try Again</Button>
                </div>
              )}

              {/* --- MODIFIED RESULT DISPLAY LOGIC --- */}
              {analysisResult && !isAnalyzing && (
                <div className="space-y-4 text-center">
                  {/* Message displayed on completion */}
                  <h3 className="text-2xl font-semibold text-green-500">
                    Resume Analysis Complete!
                  </h3>
                  <p className="text-muted-foreground">
                    You can now proceed to the interview or analyze the resume again.
                  </p>
                  
                  {/* "Analyze Again" button remains */}
                  <Button onClick={startAnalysis} variant="outline" className="transition-all duration-300 hover:scale-105">
                    Analyze Again
                  </Button>

                  {/* "Start Interview" button appears only when analysis is complete */}
                  {isAnalysisComplete && (
                    <Button 
                      onClick={handleStartInterview} 
                      className="bg-slate-900 text-white hover:bg-slate-700 w-full md:w-auto ml-4"
                      size="lg"
                    >
                      <Video className="mr-2 h-5 w-5" />
                      Start Interview
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* ... Interview Details Card remains the same ... */}
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