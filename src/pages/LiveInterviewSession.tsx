import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LiveAPIProvider, useLiveAPIContext } from "../contexts/LiveAPIContext";
import SidePanel from "../components/side-panel/SidePanel";
import { Altair } from "../components/altair/Altair";
import ControlTray from "../components/control-tray/ControlTray";
import cn from "classnames";
import { LiveClientOptions } from "../types";
import "../LiveInterviewSession.scss";
import { Loader2 } from "lucide-react";
import { ResumeAnalysisResponse, Question } from "../services/resumeAnalysis"; // Make sure Question is imported
import { useChatStore } from "../lib/store-chat";
import { SessionTranscription } from "../lib/session-transcription";
import { useWebcam } from "../hooks/use-webcam";
import { useScreenCapture } from "../hooks/use-screen-capture";
import { AudioRecorder } from "../lib/audio-recorder";
import { createInterviewSession } from "../services/interviewService";
import { useInterview } from "../contexts/InterviewContext";
import FeedbackModal from '../components/FeedbackModal';


async function fetchAnalysis(sessionId: string) {
  const API_BASE_URL = 'http://localhost:8000/api';
  const response = await fetch(`${API_BASE_URL}/v1/sessions/analysis/${sessionId}`, {
    credentials: 'include',
  });
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized. Redirecting to login.');
  }
  return response;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY!;
const apiOptions: LiveClientOptions = { apiKey: API_KEY };

const LiveInterviewSessionContent = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  // Store the formatted prompt string for SidePanel
  const [initialPromptDisplay, setInitialPromptDisplay] = useState<string>('');
  // Store the full analysis response for building the system prompt
  const [analysisResult, setAnalysisResult] = useState<ResumeAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionEndedRef = useRef(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const { disconnect, connected, connect, client } = useLiveAPIContext();
  const { refetchRooms } = useInterview();
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingEnd, setPendingEnd] = useState(false);

  const webcam = useWebcam();
  const screenCapture = useScreenCapture();
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [sessionId, setSessionId] = useState<string | null>(null);

  const interviewStartedRef = useRef(interviewStarted);
  useEffect(() => {
    interviewStartedRef.current = interviewStarted;
  }, [interviewStarted]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.srcObject !== videoStream) {
      videoElement.srcObject = videoStream;
    }

    if (videoStream && videoElement.paused) {
      videoElement.play().catch(err => {
        if (err.name !== 'AbortError') {
          console.error("Video play failed:", err);
        }
      });
    }
  }, [videoStream]);

  useEffect(() => {
    const handleClientClose = () => {
      webcam.stop();
      setVideoStream(null);
      audioRecorder.stop();
      setInterviewStarted(false);
      setSessionId(null);
    };
    client.on("close", handleClientClose);
    return () => {
      client.off("close", handleClientClose);
    };
  }, [client, webcam, audioRecorder]);

  useEffect(() => {
    sessionEndedRef.current = false;
    useChatStore.getState().clearChat();
    return () => {
      webcam.stop();
      screenCapture.stop();
      audioRecorder.stop();
      disconnect();
      setVideoStream(null);
      setInterviewStarted(false);
      setSessionId(null);
      if (!sessionEndedRef.current && interviewStartedRef.current) {
        SessionTranscription.endSession().catch(console.error);
      }
    };
  }, [roomId, disconnect, webcam, screenCapture, audioRecorder]);

  useEffect(() => {
    if (!roomId) {
      setError("No Room ID provided in URL.");
      setIsLoading(false);
      return;
    }
    const getAnalysisWithRetries = async () => {
      const MAX_RETRIES = 5;
      const RETRY_DELAY_MS = 2000;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetchAnalysis(roomId);
          if (response.ok) {
            const analysisData: ResumeAnalysisResponse = await response.json();

            // Store the entire analysis result
            setAnalysisResult(analysisData);

            // Format Questionnaire_prompt for display (e.g., in SidePanel)
            if (analysisData.Questionnaire_prompt && analysisData.Questionnaire_prompt.length > 0) {
              const formattedPrompt = analysisData.Questionnaire_prompt
                .map((q: Question, i: number) => `Q${i + 1}: ${q.question}`)
                .join('\n');
              setInitialPromptDisplay(formattedPrompt);
            } else {
              setInitialPromptDisplay("No specific interview questions generated.");
            }
            setIsLoading(false);
            return;
          }
          if (response.status !== 404) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Server error: ${response.status}`);
          }
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        } catch (err: any) {
          console.error("Error fetching analysis:", err); // Log the actual error
          setError(err.message || "Failed to load interview setup.");
          setIsLoading(false);
          return;
        }
      }
      setError("Analysis not found after several attempts. Please try creating a new room.");
      setIsLoading(false);
    };
    getAnalysisWithRetries();
  }, [roomId]); // Depend on roomId to refetch if it changes

  const handleStartInterview = async () => {
    if (interviewStarted || !roomId || !analysisResult) return; // Ensure analysisResult is available

    try {
      const sid = await createInterviewSession(roomId);
      setSessionId(sid);
      SessionTranscription.initializeSession(sid);
      await connect(sid, false);
      setInterviewStarted(true);
      const { user_details } = analysisResult || {};
const candidateName = user_details?.full_name || "Candidate";
const candidateSkills = analysisResult.resume_summary?.skills || ["Skills"];
const candidateCertifications = analysisResult.resume_summary?.certifications || ["Certifications"];
const candidateProjects = analysisResult.resume_summary?.projects || ["Projects"];
const candidatePreviousCompanies = analysisResult.resume_summary?.previous_companies || ["Previous Companies"];
const candidateGraduationCollege = analysisResult.resume_summary?.graduation_college || "Graduation College";
const candidateCurrentRole = analysisResult.resume_summary?.current_role || "Current Role";
const candidateCurrentCompany = analysisResult.resume_summary?.current_company || "Current Company";
const candidateCurrentLocation = analysisResult.resume_summary?.current_location || "Current Location";

const candidateTargetRole = analysisResult.input_metadata?.target_role || "Target Role";
const candidateTargetCompany = analysisResult.input_metadata?.target_company || "Target Company";
const candidateYearsOfExperience = analysisResult.input_metadata?.years_of_experience ?? 0;
const candidateInterviewType = analysisResult.input_metadata?.interview_type || "Interview Type";
const intialPrompt = analysisResult.Questionnaire_prompt || "questions";
const projectSummary = candidateProjects?.length ? candidateProjects : "a recent project";

      // Construct the system prompt using the stored analysisResult
      const systemPrompt = `
You are an AI interviewer conducting a ${candidateInterviewType} interview for ${candidateName}, who is applying for the ${candidateTargetRole} position at ${candidateTargetCompany}.

Candidate Background:
- Full Name: ${candidateName}
- Current Role: ${candidateCurrentRole} at ${candidateCurrentCompany}
- Experience: ${candidateYearsOfExperience} years
- Skills: ${candidateSkills}
- Education: ${candidateGraduationCollege}
- Certifications: ${candidateCertifications}
- Key Projects: ${candidateProjects}
- Previous Companies: ${candidatePreviousCompanies}
- Location: ${candidateCurrentLocation}

Interview Guidelines:
1. OPENING:
   - Start with exact greeting: "Welcome, ${candidateName}."
   - Immediately follow with a personalized, role-specific opening question
   - Never use generic prompts like "Tell me about yourself"

2. QUESTION FLOW:
   - First question should directly relate to ${candidateTargetRole} requirements
   - Subsequent questions should build naturally on responses
   - Use smooth transitions like:
     * "Building on that..."
     * "Let's explore that further..."
     * "That's interesting - how did you approach..."

3. INTERVIEW STYLE:
   - Professional yet conversational tone
   - Show engagement through:
     * Brief acknowledgments ("I see", "Interesting approach")
     * Follow-up probes ("Can you elaborate on...?")
     * Empathetic responses ("That sounds challenging")

4. CONTENT GUIDELINES:
   - Keep questions clear and concise
   - Focus on assessing ${candidateTargetRole} competencies
   - Reference provided questions (${intialPrompt}) only as inspiration
   - Adapt questions based on conversation flow

5. BOUNDARIES:
   - Remain in interviewer character at all times
   - If asked about role/company:
     > "The ${candidateTargetRole} position involves [brief summary]. Would you like me to clarify any aspects?"
   - Never offer personal opinions or career advice

Example Interaction:
Interviewer: "Welcome, ${candidateName}. I see you recently led a ${projectSummary} at ${candidateCurrentCompany} - what was your technical approach to the most complex challenge there?"
Candidate: [Responds about architecture decision]
Interviewer: "Interesting choice. How did you validate that solution with stakeholders?"
Candidate: [Explains collaboration process]
Interviewer: "Let's explore your technical depth further. How would you optimize [related system] for scale?"

Begin now with the exact greeting and your first tailored question.
`;
      client.send([{ text: systemPrompt }]);

    } catch (err: any) {
      setError(err.message || "Failed to start interview session.");
      setSessionId(null);
      setInterviewStarted(false);
    }
  };

  const handleEndAndSave = async () => {
    sessionEndedRef.current = true;
    webcam.stop();
    screenCapture.stop();
    audioRecorder.stop();
    disconnect();
    setVideoStream(null);
    setInterviewStarted(false);
    setSessionId(null);

    if (interviewStartedRef.current) {
      try {
        await SessionTranscription.endSession();
      } catch (err) {
        console.error("Error ending session:", err);
      }
    }

    try {
      await refetchRooms();
    } catch (err) {
      console.error("Failed to refresh rooms:", err);
    }

    setShowFeedback(true);
    setPendingEnd(true);
  };

  const submitFeedback = async ({ sessionId, feedback_text, rating }: { sessionId: string, feedback_text: string, rating: number }) => {
    const API_BASE_URL = 'http://localhost:8000/api';
    await fetch(`${API_BASE_URL}/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: sessionId, feedback_text, rating }),
    });
  };

  const handleEndWithoutSaving = () => {
    webcam.stop();
    screenCapture.stop();
    audioRecorder.stop();
    disconnect();
    navigate('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <span>Loading interview setup...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error: {error}
      </div>
    );
  }

  return (
    <>
      <div className="streaming-console flex h-screen bg-gray-100">
        <aside className="w-72 lg:w-96 flex-shrink-0 h-full">
          {/* Pass the formatted string to SidePanel */}
          <SidePanel initialPrompt={initialPromptDisplay} />
        </aside>
        <main className="flex-grow h-full overflow-y-auto">
          <div className="main-app-area">
            <div className={cn({ 'hidden': !!videoStream })}>
              <Altair />
            </div>
            <video
              className={cn("stream", { hidden: !videoStream })}
              ref={videoRef}
              autoPlay
              playsInline
              muted
            />
          </div>
          <ControlTray
            supportsVideo={true}
            onVideoStreamChange={setVideoStream}
            enableEditingSettings={true}
            onEndAndSave={handleEndAndSave}
            onEndWithoutSaving={handleEndWithoutSaving}
            audioRecorder={audioRecorder}
            webcam={webcam}
            screenCapture={screenCapture}
            onStartInterview={handleStartInterview}
            connected={connected}
          />
        </main>
      </div>
      <FeedbackModal
        open={showFeedback}
        onClose={() => {
          setShowFeedback(false);
          if (pendingEnd) {
            setPendingEnd(false);
            navigate('/dashboard');
          }
        }}
        onSubmit={submitFeedback}
        sessionId={sessionId || ''}
      />
    </>
  );
};

const LiveInterviewSession = () => {
  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <LiveInterviewSessionContent />
      </LiveAPIProvider>
    </div>
  );
};

export default LiveInterviewSession;