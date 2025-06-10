import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import cn from "classnames";

// Using correct icons from lucide-react.
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Play,
  Pause,
  Settings,
} from "lucide-react";

// Using your project's standard UI components
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";
import SettingsDialog from "../settings-dialog/SettingsDialog";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
};

function ControlTray({
  videoRef,
  onVideoStreamChange = () => {},
  supportsVideo,
  enableEditingSettings,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const { client, connected, connect, disconnect } = useLiveAPIContext();
  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        { mimeType: "audio/pcm;rate=16000", data: base64 },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off("data", onData);
    };
  }, [connected, client, muted, audioRecorder]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }
  }, [activeVideoStream, videoRef]);
  /**
   * MODIFIED: This function now correctly toggles a stream on and off.
   */

  const toggleStream = (streamSource: UseMediaStreamResult) => async () => {
    // If the clicked stream is already running, turn it off.
    if (streamSource.isStreaming) {
      streamSource.stop();
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    } else {
      // If the clicked stream is not running, turn it on.
      // First, stop any *other* video stream that might be active.
      videoStreams
        .filter((s) => s !== streamSource && s.isStreaming)
        .forEach((s) => s.stop()); // Start the new stream

      const mediaStream = await streamSource.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    }
  };

  return (
    // Main container to center the controls at the bottom of the screen
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      <div className="flex items-center gap-2 p-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-full shadow-2xl">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setMuted(!muted)}
              variant="ghost"
              size="icon"
              className={cn(
                "h-12 w-12 rounded-full text-slate-300 hover:bg-slate-700 hover:text-white",
                { "bg-red-600 text-white hover:bg-red-500": muted }
              )}
            >
              {muted ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{muted ? "Unmute" : "Mute"}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={toggleStream(webcam)}
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              {webcam.isStreaming ? (
                <VideoOff className="h-6 w-6" />
              ) : (
                <Video className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{webcam.isStreaming ? "Stop Camera" : "Start Camera"}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={toggleStream(screenCapture)}
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              {screenCapture.isStreaming ? (
                <ScreenShareOff className="h-6 w-6" />
              ) : (
                <ScreenShare className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{screenCapture.isStreaming ? "Stop Sharing" : "Share Screen"}</p>
          </TooltipContent>
        </Tooltip>
      <div className="h-8 w-px bg-slate-700 mx-2"></div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={connected ? disconnect : connect}
              className={cn(
                "h-12 w-12 rounded-full text-white",
                connected
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              )}
            >
              {connected ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{connected ? "End Session" : "Start Session"}</p>
          </TooltipContent>
        </Tooltip>
        {enableEditingSettings && (
          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-full text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                   <Settings className="h-6 w-6" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent>
              <SettingsDialog />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

export default memo(ControlTray);
