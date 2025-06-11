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
import { ResumeAnalysisResponse } from "../services/resumeAnalysis";
import { useChatStore } from "../lib/store-chat"; // <-- NEW: Import the chat store

async function fetchAnalysis(sessionId: string) {
  const API_BASE_URL = 'http://localhost:8000';
  const response = await fetch(`${API_BASE_URL}/v1/analysis/${sessionId}`);
  return response;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY!;
const apiOptions: LiveClientOptions = { apiKey: API_KEY };

const LiveInterviewSession = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  const { roomId } = useParams<{ roomId: string }>();
  const [initialPrompt, setInitialPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // NEW: useEffect to clear chat history for the new session
  useEffect(() => {
    console.log("New interview session loaded. Clearing previous chat history.");
    // Directly call the clearChat action from your Zustand store
    useChatStore.getState().clearChat();
  }, [roomId]); // This runs every time you navigate to a new room (i.e., when roomId changes)

  // This useEffect for fetching the analysis is unchanged and correct
  useEffect(() => {
    if (!roomId) {
      setError("No Room ID provided in URL.");
      setIsLoading(false);
      return;
    }

    const getAnalysisWithRetries = async () => {
      // The retry logic remains the same...
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

  // The JSX for the layout is unchanged
  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
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
            />
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
};

export default LiveInterviewSession;