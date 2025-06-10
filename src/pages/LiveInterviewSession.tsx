import { useRef, useState } from "react";
import { LiveAPIProvider } from "../contexts/LiveAPIContext"; // Assuming path is correct
import SidePanel from "../components/side-panel/SidePanel"; // Assuming path is correct
import { Altair } from "../components/altair/Altair"; // Assuming path is correct
import ControlTray from "../components/control-tray/ControlTray"; // Assuming path is correct
import cn from "classnames";
import { LiveClientOptions } from "../types"; // Assuming path is correct
import "../LiveInterviewSession.scss"; // You may need to create or move this SCSS file

// **IMPORTANT**: Vite exposes environment variables differently than Create React App.
// Use `import.meta.env.VITE_GEMINI_API_KEY` instead of `process.env.REACT_APP_GEMINI_API_KEY`.
// Make sure this variable is set in your .env file at the root of INTERVIEW-AI.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (typeof API_KEY !== "string") {
  throw new Error("You must set VITE_GEMINI_API_KEY in your .env file");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

const LiveInterviewSession = () => {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  return (
    <div className="App">
      {" "}
      {/* You might want to use a more specific className here */}
      <LiveAPIProvider options={apiOptions}>
        <div className="streaming-console flex h-screen bg-gray-100">
          <aside
            className="w-72 lg:w-96 flex-shrink-0 h-full"
          >
            <SidePanel />
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
            >
              {/* You can put your own custom buttons here */}
            </ControlTray>
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
};

export default LiveInterviewSession;
