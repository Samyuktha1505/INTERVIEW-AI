import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { LiveAPIProvider } from "../contexts/LiveAPIContext";
import SidePanel from "../components/side-panel/SidePanel";
import { Altair } from "../components/altair/Altair";
import ControlTray from "../components/control-tray/ControlTray";
import cn from "classnames";
import { LiveClientOptions } from "../types";
import "../LiveInterviewSession.scss";
import { Loader2 } from "lucide-react";
import { ResumeAnalysisResponse } from "../services/resumeAnalysis"; // <-- IMPORTED TYPE

// This function now returns the raw response for status checking
async function fetchAnalysis(sessionId: string) {
  const API_BASE_URL = 'http://localhost:8000';
  const response = await fetch(`${API_BASE_URL}/v1/analysis/${sessionId}`);
  return response;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (typeof API_KEY !== "string") {
  throw new Error("You must set VITE_GEMINI_API_KEY in your .env file");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

const LiveInterviewSession = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  const { roomId } = useParams<{ roomId: string }>();
  const [initialPrompt, setInitialPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      setError("No Room ID provided.");
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
            const analysisData = await response.json() as ResumeAnalysisResponse;
            if (analysisData && analysisData.Questionnaire_prompt) {
              const masterPrompt = JSON.stringify(analysisData.Questionnaire_prompt);
              setInitialPrompt(masterPrompt);
            } else {
              throw new Error("Analysis data is in an invalid format.");
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

  if (isLoading) {
    return <div className="flex flex-col items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin mb-2" /><span>Loading interview setup...</span></div>;
  }
  
  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">Error: {error}</div>;
  }

  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <div className="streaming-console flex h-screen bg-gray-100">
          <aside className="w-72 lg:w-96 flex-shrink-0 h-full">
            {/* You can pass the fetched initialPrompt to the component that starts the conversation */}
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
            />
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
};

export default LiveInterviewSession;