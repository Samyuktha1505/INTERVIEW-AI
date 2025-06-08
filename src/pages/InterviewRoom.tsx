
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
  const { user } = useAuth();
  const [room, setRoom] = useState(getRoom(roomId || ''));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

    // Automatically start analysis when room loads
    startAnalysis();
  }, [room, navigate]);

  const startAnalysis = async () => {
    if (!room) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // For demo purposes, we'll create a mock file if no resume is available
      let resumeFile: File;
      
      if (room.resumeUrl && room.resumeUrl.startsWith('blob:')) {
        // If we have a blob URL, we need to fetch it and convert to File
        const response = await fetch(room.resumeUrl);
        const blob = await response.blob();
        resumeFile = new File([blob], 'resume.pdf', { type: 'application/pdf' });
      } else {
        // Create a mock resume file for demo
        const mockContent = new Blob(['Mock resume content'], { type: 'application/pdf' });
        resumeFile = new File([mockContent], 'resume.pdf', { type: 'application/pdf' });
      }

      toast({
        title: "Analyzing resume",
        description: "Please wait while we analyze your resume...",
      });

      const result = await analyzeResume({
        resume: resumeFile,
        targetRole: room.targetRole,
        targetCompany: room.targetCompany,
        yearsOfExperience: room.yearsOfExperience.toString()
      });

      setAnalysisResult(result);
      
      toast({
        title: "Analysis complete",
        description: "Your resume has been analyzed successfully!",
      });

    } catch (error) {
      console.error('Error during resume analysis:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze resume');
      
      toast({
        title: "Analysis failed",
        description: "Failed to analyze resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!room) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/dashboard')}
              className="transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
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
        {/* Main Analysis Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Resume Analysis</span>
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
                  <Button 
                    onClick={startAnalysis} 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {analysisResult && !isAnalyzing && (
                <div className="space-y-4">
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <h3 className="font-medium mb-2">Analysis Results</h3>
                    <div className="space-y-3">
                      {/* Display the raw response */}
                      <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded overflow-auto max-h-96">
                        {JSON.stringify(analysisResult, null, 2)}
                      </pre>
                      
                      {/* If there's an analysis field, display it nicely */}
                      {analysisResult.analysis && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Analysis Summary:</h4>
                          <p className="text-sm">{analysisResult.analysis}</p>
                        </div>
                      )}
                      
                      {/* If there are suggestions, display them */}
                      {analysisResult.suggestions && Array.isArray(analysisResult.suggestions) && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Suggestions:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {analysisResult.suggestions.map((suggestion: string, index: number) => (
                              <li key={index} className="text-sm">{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* If there's a score, display it */}
                      {analysisResult.score && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Score:</h4>
                          <div className="flex items-center space-x-2">
                            <div className="bg-primary text-primary-foreground px-2 py-1 rounded">
                              {analysisResult.score}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    onClick={startAnalysis} 
                    variant="outline"
                    className="transition-all duration-300 hover:scale-105"
                  >
                    Analyze Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Interview Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Interview Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium">Current Role</p>
                <p className="text-sm text-muted-foreground">{room.currentRole}</p>
              </div>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default InterviewRoom;
