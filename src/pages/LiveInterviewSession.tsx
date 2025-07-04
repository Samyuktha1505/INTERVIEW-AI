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
import { useInterview } from "../contexts/InterviewContext"; // ✅ NEW

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
  const { disconnect, connected, connect } = useLiveAPIContext();
  const { refetchRooms } = useInterview(); // ✅

  const webcam = useWebcam();
  const screenCapture = useScreenCapture();
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    sessionEndedRef.current = false;
    useChatStore.getState().clearChat();
    return () => {
      webcam.stop();
      screenCapture.stop();
      audioRecorder.stop();
      disconnect();
      if (!sessionEndedRef.current && interviewStarted) {
        SessionTranscription.endSession().catch(console.error);
      }
    };
  }, [roomId, disconnect, webcam, screenCapture, audioRecorder, interviewStarted]);

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
    if (!interviewStarted && roomId) {
      try {
        const sid = await createInterviewSession(roomId);
        setSessionId(sid);
        SessionTranscription.initializeSession(sid);
        setInterviewStarted(true);
        await connect(sid);
      } catch (err: any) {
        setError(err.message || "Failed to start interview session.");
      }
    }
  };

  const handleEndAndSave = async () => {
    sessionEndedRef.current = true;
    webcam.stop();
    screenCapture.stop();
    audioRecorder.stop();
    disconnect();

    if (interviewStarted) {
      try {
        await SessionTranscription.endSession();
        setInterviewStarted(false);
      } catch (err) {
        console.error("Error ending session:", err);
      }
    }

    try {
      await refetchRooms(); // ✅ Refresh room list after session ends
    } catch (err) {
      console.error("Failed to refresh rooms:", err);
    }

    navigate('/dashboard');
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
    <div className="streaming-console flex h-screen bg-gray-100">
      <aside className="w-72 lg:w-96 flex-shrink-0 h-full">
        <SidePanel initialPrompt={initialPrompt} />
      </aside>
      <main className="flex-grow h-full overflow-y-auto">
        <div className="main-app-area">
          <Altair />
          <video
            className={cn("stream", {
              hidden: !videoRef.current || !videoStream,
            })}
            ref={videoRef}
            autoPlay
            playsInline
          />
        </div>
        <ControlTray
          videoRef={videoRef}
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
