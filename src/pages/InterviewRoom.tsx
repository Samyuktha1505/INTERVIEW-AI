import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInterview } from "../contexts/InterviewContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { analyzeResume } from "../services/resumeAnalysis";

const InterviewRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { getRoom } = useInterview();
  const { user } = useAuth(); // Consider if 'user' is truly needed here, or just for resumeUrl backup logic
  const [room, setRoom] = useState(getRoom(roomId || '')); // Initialize room state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null); // Use a more specific type if possible
  const [error, setError] = useState<string | null>(null);

  // --- DEBUGGING: Refined useEffect for Analysis Trigger ---
  useEffect(() => {
    console.log('--- InterviewRoom useEffect Triggered ---');
    console.log('Current roomId from params:', roomId);
    console.log('Current room state:', room);
    console.log('Current analysisResult state:', analysisResult);
    console.log('Current isAnalyzing state:', isAnalyzing);

    // 1. Handle Room Not Found / Invalid RoomId
    if (!room) {
      console.warn('Room not found or invalid roomId. Redirecting to dashboard.');
      toast({
        title: "Room not found",
        description: "Redirecting to dashboard...",
        variant: "destructive",
      });
      navigate('/dashboard');
      return; // Stop execution if room is not found
    }

    // 2. Trigger Analysis ONLY if:
    //    a. We have a valid room.
    //    b. We haven't successfully analyzed it yet (`analysisResult` is null).
    //    c. We're not already in the process of analyzing (`isAnalyzing` is false).
    if (room && !analysisResult && !isAnalyzing) {
      console.log('Conditions met: room exists, no prior analysis result, not currently analyzing. Calling startAnalysis().');
      startAnalysis();
    } else {
      console.log('Analysis not started: either room is missing, analysisResult exists, or already analyzing.');
    }
    console.log('--- InterviewRoom useEffect End ---');
  }, [roomId, room, navigate, analysisResult, isAnalyzing]); // Added analysisResult and isAnalyzing to dependencies

  const startAnalysis = async () => {
    console.log('--- startAnalysis Function Called ---');
    // Defensive check, though useEffect's logic should prevent this
    if (!room) {
      console.error('startAnalysis called but room object is null. Exiting.');
      return;
    }

    setIsAnalyzing(true);
    setError(null); // Clear previous errors

    try {
      let resumeFile: File;

      // --- DEBUGGING: Resume URL source ---
      console.log('Resume URL from room:', room.resumeUrl);

      if (room.resumeUrl && room.resumeUrl.startsWith('blob:')) {
        // This is the correct path for resumes uploaded in the current session (from CreateRoomModal)
        console.log('Fetching resume from blob URL...');
        const response = await fetch(room.resumeUrl);
        const blob = await response.blob();
        // Use a more specific filename if possible, otherwise 'resume.pdf' is fine
        resumeFile = new File([blob], 'resume.pdf', { type: 'application/pdf' });
        console.log('Successfully created File object from blob:', resumeFile.name, resumeFile.type, resumeFile.size);
      } else {
        // --- IMPORTANT: This 'else' block needs careful consideration ---
        // If room.resumeUrl is NOT a blob: URL, it means it's either:
        // 1. An empty string (no resume was provided or stored).
        // 2. A permanent URL (e.g., from cloud storage), which your *backend* should fetch.
        // The current `analyzeResume` service expects a `File` object from the frontend.
        // Sending 'Mock resume content' is a fallback for development/testing,
        // but in production, it's usually an error state if a real resume isn't available.

        if (!room.resumeUrl) {
          // Case 1: No resume URL at all.
          console.error('No resumeUrl found in room object. Cannot perform analysis.');
          setError('No resume found for analysis. Please upload one when creating the room.');
          setIsAnalyzing(false);
          toast({
            title: "Analysis Failed",
            description: "No resume provided for analysis.",
            variant: "destructive",
          });
          return;
        } else {
            // Case 2: room.resumeUrl exists but is not a blob: URL.
            // This suggests it *should* be a remote URL for a persistent resume.
            // Your current analyzeResume service expects a File.
            // If your backend is supposed to fetch this remote URL, then the frontend
            // should NOT be trying to make a File object out of it here.
            // For now, let's treat this as an error if we can't get a File from a blob.
            console.error(`room.resumeUrl is not a blob: URL and cannot be directly converted to a File object for analysis: ${room.resumeUrl}`);
            setError('Resume not available in a format that can be re-analyzed from the frontend. Please ensure you upload a new resume if you want to analyze it.');
            setIsAnalyzing(false);
            toast({
                title: "Analysis Failed",
                description: "Resume source invalid for analysis.",
                variant: "destructive",
            });
            return;
        }

        // The original 'else' block with mock content (usually comment this out for production)
        // const mockContent = new Blob(['Mock resume content for testing purposes. Real resume not found or not blob URL.'], { type: 'application/pdf' });
        // resumeFile = new File([mockContent], 'mock_resume.pdf', { type: 'application/pdf' });
        // console.warn('Using mock resume content because room.resumeUrl is not a blob URL or is missing.');
      }

      toast({
        title: "Analyzing resume",
        description: "Please wait while we analyze your resume...",
      });

      // --- DEBUGGING: Data sent to analyzeResume service ---
      const requestData = {
        resume: resumeFile,
        targetRole: room.targetRole,
        targetCompany: room.targetCompany,
        interviewType: room.interviewType, // This is the 'culprit' field
        yearsOfExperience: room.yearsOfExperience.toString(), // Ensure it's a string
        currentDesignation: room.currentDesignation || '', // Handle potential null/undefined
        sessioninterval: room.sessionInterval || undefined // Handle optional
      };
      console.log('Data prepared for analyzeResume service call:', requestData);


      const result = await analyzeResume(requestData);

      setAnalysisResult(result);
      console.log('Resume analysis completed successfully. Result:', result);

      toast({
        title: "Analysis complete",
        description: "Your resume has been analyzed successfully!",
      });
    } catch (err: any) {
      // --- DEBUGGING: Catch block for analysis errors ---
      console.error('Error during resume analysis:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze resume';
      setError(errorMessage);
      toast({
        title: "Analysis failed",
        description: errorMessage, // Display the more specific error message from analyzeResume
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      console.log('--- startAnalysis Function Finished ---');
    }
  };

  if (!room) {
    // This case is primarily handled by useEffect redirection, but good for initial render safety
    return null;
  }

  // --- Render Section ---
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

              {analysisResult && !isAnalyzing && (
                <div className="space-y-4">
                  <Button onClick={startAnalysis} variant="outline" className="transition-all duration-300 hover:scale-105">
                    Analyze Again
                  </Button>
                </div>
              )}
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