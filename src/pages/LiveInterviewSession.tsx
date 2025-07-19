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
import { ResumeAnalysisResponse } from "../services/resumeAnalysis";
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
  const [initialPrompt, setInitialPrompt] = useState<string>('');
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

  // ✅ ADDED: A ref to safely track the interview state in cleanup effects.
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


  // ✅ CHANGED: The dependency array for this cleanup hook is fixed.
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
      // Use the ref to get the latest value in the cleanup function.
      if (!sessionEndedRef.current && interviewStartedRef.current) {
        SessionTranscription.endSession().catch(console.error);
      }
    };
    // The dependency array is now correct and will only run cleanup on unmount.
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
            if (analysisData.Questionnaire_prompt) {
              setInitialPrompt(JSON.stringify(analysisData.Questionnaire_prompt));
              setIsLoading(false);
              return;
            } else {
              throw new Error("Analysis data missing Questionnaire_prompt.");
            }
          }
          if (response.status !== 404) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Server error: ${response.status}`);
          }
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        } catch (err: any) {
          setError(err.message);
          setIsLoading(false);
          return;
        }
      }
      setError("Analysis not found after several attempts. Please try creating a new room.");
      setIsLoading(false);
    };
    getAnalysisWithRetries();
  }, [roomId]);

  const handleStartInterview = async () => {
    if (interviewStarted || !roomId) return;

    try {
      const sid = await createInterviewSession(roomId);
      setSessionId(sid);
      SessionTranscription.initializeSession(sid);
      await connect(sid, false);
      setInterviewStarted(true);

      if (initialPrompt) {
        console.log("Connection successful. Sending initial prompt...");
        const systemPrompt = `You are a highly experienced and friendly interviewer. Your role is to conduct a professional and conversational interview that feels deeply personalized to the user's resume.
You must adhere to the following rules:
1.  **Start with a Personalized Opening:** Introduce yourself briefly. Then, look at the key themes in the interview questions provided below to understand the candidate's core skills (e.g., backend development, cloud infrastructure, project management). Use this insight to formulate a personalized, open-ended introductory question. For example: "I was looking over your background, and it seems you have a lot of experience in [theme from resume, e.g., 'building scalable APIs']. To start, could you walk me through your journey and what interests you most in that area?" This makes the opening feel directly connected to the candidate's history. Do NOT start with a generic "tell me about yourself."
2.  **Be Conversational:** After the user's introduction, you can ask a relevant follow-up question. For example, if they mention a specific project, you can ask them to elaborate on it.
3.  **Use the Provided Questions:** After the initial personalized introduction, proceed with the tailored interview questions provided below. Ask only one question at a time.
4.  **Stay in Character:** If the user asks a question, politely deflect it and reiterate that your role is to learn more about them. For example, say "I'm happy to answer questions about the role later, but for now, I'd like to focus on your experience. Let's continue."
5.  **Listen and Transition:** Wait for the user's full response before moving to the next question. Transition smoothly between topics.

Here is the list of interview questions to use after the introduction:
${initialPrompt}

Please begin the interview now with your introduction and a warm, personalized, open-ended introductory question based on the themes from the user's resume.`;

        client.send([{ text: systemPrompt }]);
      }

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

    if (interviewStartedRef.current) { // Use ref here
      try {
        await SessionTranscription.endSession();
        // No need to set interviewStarted to false here, it's already done.
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
          <SidePanel initialPrompt={initialPrompt} />
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