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
import { toast } from "@/hooks/use-toast";

export type ControlTrayProps = {
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
  const videoStreams = [webcam, screenCapture];
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const { client } = useLiveAPIContext();
  
  // ✅ ADDED: Ref to prevent the connection effect from running on initial mount.
  const isInitialMount = useRef(true);


  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        { mimeType: "audio/pcm;rate=16000", data: base64 },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData);
    } else {
      if(audioRecorder.recording) {
        audioRecorder.stop();
      }
    }
    return () => {
      audioRecorder.off("data", onData);
    };
  }, [connected, client, muted, audioRecorder]);

  function showPermissionToast(type: "microphone" | "camera" | "screen") {
    let desc = "";
    if (type === "microphone")
      desc = "Please enable microphone permission in your browser settings.";
    else if (type === "camera")
      desc = "Please enable camera permission in your browser settings.";
    else desc = "Please enable screen share permission in your browser settings.";
    toast({
      title: "Permission Required",
      description: desc,
      variant: "destructive",
    });
  }

  const toggleStream = (streamSource: UseMediaStreamResult) => async () => {
    // Handle screen capture separately
    if (streamSource.type === 'screen') {
        if (streamSource.isStreaming) {
            streamSource.stop();
        } else {
            videoStreams
                .filter((s) => s !== streamSource && s.isStreaming)
                .forEach((s) => s.stop());
            try {
                await streamSource.start();
            } catch (err) {
                showPermissionToast('screen');
            }
        }
        return;
    }

    // Handle webcam logic
    if (streamSource.type === 'webcam') {
        if (connected) {
            // MID-INTERVIEW: Only allow soft-muting the track
            if (webcam.isStreaming && webcam.stream) {
                const videoTrack = webcam.stream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !videoTrack.enabled;
                    setCameraEnabled(videoTrack.enabled);
                }
            } else {
                toast({
                    title: "Action Not Available",
                    description: "To add video, please end and restart the interview with the camera on.",
                    variant: "destructive",
                });
            }
        } else {
            // BEFORE INTERVIEW: Start or stop the actual stream
            if (webcam.isStreaming) {
                webcam.stop();
                onVideoStreamChange(null);
                setCameraEnabled(false);
            } else {
                try {
                    if(screenCapture.isStreaming) screenCapture.stop();
                    const mediaStream = await webcam.start();
                    onVideoStreamChange(mediaStream);
                    setCameraEnabled(true);
                } catch (err) {
                    showPermissionToast("camera");
                }
            }
        }
    }
  };

  // ✅ CHANGED: This hook now skips the first render to avoid resetting the stream.
  useEffect(() => {
    // If it's the first render, do nothing.
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Now, this logic will only run when `connected` actually changes value.
    if (connected) {
      if (webcam.isStreaming && webcam.stream) {
        const videoTrack = webcam.stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = cameraEnabled;
        }
        onVideoStreamChange(webcam.stream);
      }
    } else {
      // This cleanup now only runs on a true disconnect.
      if (webcam.isStreaming) {
        webcam.stop();
      }
      onVideoStreamChange(null);
      setCameraEnabled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);


  const handleStartInterviewWithMic = async () => {
    try {
      await audioRecorder.start();
      setMuted(false);
      await onStartInterview();
    } catch (err) {
      showPermissionToast("microphone");
    }
  };

  const handleMicButton = async () => {
    if (muted) {
      try {
        await audioRecorder.start();
        setMuted(false);
      } catch (err) {
        showPermissionToast("microphone");
      }
    } else {
      setMuted(true);
    }
  };

  const isVideoShowing = webcam.isStreaming && cameraEnabled;

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      <div className="flex items-center gap-2 p-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-full shadow-2xl">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleMicButton}
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
              className={cn(
                "h-12 w-12 rounded-full text-slate-300 hover:bg-slate-700 hover:text-white",
                { "bg-red-600 text-white hover:bg-red-500": isVideoShowing }
              )}
            >
              {isVideoShowing ? (
                <VideoOff className="h-6 w-6" />
              ) : (
                <Video className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isVideoShowing ? "Disable Camera" : "Enable Camera"}</p>
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
              onClick={connected ? onEndAndSave : handleStartInterviewWithMic}
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
              <SettingsDialog onEndWithoutSaving={onEndWithoutSaving}/>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

export default memo(ControlTray);