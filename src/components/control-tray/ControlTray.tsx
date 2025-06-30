import { memo, ReactNode, RefObject, useEffect, useState, useRef } from "react";
import cn from "classnames";

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

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { AudioRecorder } from "../../lib/audio-recorder";
import SettingsDialog from "../settings-dialog/SettingsDialog";

// MODIFIED: Props are updated to receive state and handlers from the parent.
export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
  onEndAndSave: () => Promise<void>;
  onEndWithoutSaving: () => void;
  audioRecorder: AudioRecorder;
  webcam: UseMediaStreamResult;
  screenCapture: UseMediaStreamResult;
  onStartInterview: () => Promise<void>;
  connected: boolean;
};

function ControlTray({
  videoRef,
  onVideoStreamChange = () => {},
  supportsVideo,
  enableEditingSettings,
  onEndAndSave,
  onEndWithoutSaving,
  audioRecorder,
  webcam,
  screenCapture,
  onStartInterview,
  connected,
}: ControlTrayProps) {
  // MODIFIED: This component no longer creates its own media hooks. It receives them as props.
  const videoStreams = [webcam, screenCapture];
  const [activeVideoStream, setActiveVideoStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);

  // MODIFIED: The disconnect function is no longer called directly from here.
  const { client, connect } = useLiveAPIContext();

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

  const toggleStream = (streamSource: UseMediaStreamResult) => async () => {
    if (streamSource.isStreaming) {
      streamSource.stop();
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    } else {
      videoStreams
        .filter((s) => s !== streamSource && s.isStreaming)
        .forEach((s) => s.stop());

      const mediaStream = await streamSource.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    }
  };

  return (
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
            {/* MODIFIED: This button now starts or ends the interview session. */}
            <Button
              onClick={connected ? onEndAndSave : onStartInterview}
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
            <p>{connected ? "End Interview & Save" : "Start Interview"}</p>
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
              {/* MODIFIED: Pass the handler to the settings dialog. */}
              <SettingsDialog onEndWithoutSaving={onEndWithoutSaving}/>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

export default memo(ControlTray);