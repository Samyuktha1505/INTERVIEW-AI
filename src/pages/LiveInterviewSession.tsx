// LiveInterviewSession.tsx

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
// IMPORT CHANGE: No longer expecting ExtractedFields at this level for the response
// Remove the ExtractedFields part from the interface if it's still there
// Ensure ResumeAnalysisResponse is defined as:
// export interface ResumeAnalysisResponse {
//   Questionnaire_prompt: Question[];
// }
import { ResumeAnalysisResponse, Question } from "../services/resumeAnalysis"; // Ensure Question is also imported if used directly
import { useChatStore } from "../lib/store-chat";
import { SessionTranscription } from "../lib/session-transcription";
import { useWebcam } from "../hooks/use-webcam";
import { useScreenCapture } from "../hooks/use-screen-capture";
import { AudioRecorder } from "../lib/audio-recorder";

async function fetchAnalysis(sessionId: string) {
  const API_BASE_URL = 'http://localhost:8000';
  const response = await fetch(`${API_BASE_URL}/v1/analysis/${sessionId}`);
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

  const webcam = useWebcam();
  const screenCapture = useScreenCapture();
  const [audioRecorder] = useState(() => new AudioRecorder());
  const { disconnect } = useLiveAPIContext();

  useEffect(() => {
    sessionEndedRef.current = false;
    useChatStore.getState().clearChat();

    if (roomId) {
      SessionTranscription.initializeSession(roomId);
    }

    return () => {
      console.log("Cleanup effect: Ensuring all media resources are released.");
      webcam.stop();
      screenCapture.stop();
      audioRecorder.stop();
      disconnect();

      if (!sessionEndedRef.current) {
        console.log("Component unmounted unexpectedly. Saving transcription as a fallback.");
        SessionTranscription.endSession();
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
            // CRUCIAL CHANGE: Cast to the correct interface from services/resumeAnalysis
            // The ResumeAnalysisResponse should now only contain Questionnaire_prompt
            const analysisData: ResumeAnalysisResponse = await response.json(); 
            
            // Now, analysisData.Questionnaire_prompt is directly available
            if (analysisData.Questionnaire_prompt) {
              setInitialPrompt(JSON.stringify(analysisData.Questionnaire_prompt));
            } else {
              // This error means the backend returned something unexpected even if 200 OK
              throw new Error("Analysis data is in an invalid format (missing Questionnaire_prompt).");
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

  const handleEndAndSave = async () => {
    sessionEndedRef.current = true;
    console.log("End & Save clicked. Stopping media, saving transcription, and navigating.");

    webcam.stop();
    screenCapture.stop();
    audioRecorder.stop();
    disconnect();

    await SessionTranscription.endSession();
    navigate('/dashboard');
  };

  const handleEndWithoutSaving = () => {
    console.log("Navigating away without saving. Stopping media.");
    
    webcam.stop();
    screenCapture.stop();
    audioRecorder.stop();
    disconnect();

    navigate('/dashboard');
  };

  if (isLoading) {
    return <div className="flex flex-col items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin mb-2" /><span>Loading interview setup...</span></div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">Error: {error}</div>;
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
              className={cn("stream", { hidden: !videoRef.current || !videoStream })}
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