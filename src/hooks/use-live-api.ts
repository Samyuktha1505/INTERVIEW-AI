/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types"; // Assuming LiveClientOptions is defined here
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import { LiveConnectConfig, Modality } from "@google/genai"; // Added Modality

export type UseLiveAPIResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: (sessionId?: string, resumePreviousSession?: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
  setSessionTimeout: (milliseconds: number) => void; // Exposed function
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]); // options passed to GenAILiveClient
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>("gemini-2.0-flash-live-001"); // Updated model
  const [config, setConfig] = useState<LiveConnectConfig>({
    responseModalities: [Modality.TEXT], // Example: default config
    // Add other default LiveConnectConfig settings here if needed
  });
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      setConnected(false);
    };

    const onError = (error: ErrorEvent) => {
      console.error("[useLiveAPI] GenAI Client Error:", error);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .disconnect(); // Ensure disconnect on unmount
    };
  }, [client]);

  const connect = useCallback(
    async (sessionId?: string, resumePreviousSession: boolean = true) => {
      if (!config) {
        throw new Error("[useLiveAPI] LiveConnectConfig has not been set.");
      }
      if (!client) {
        console.error("[useLiveAPI] GenAI Live Client not initialized.");
        return;
      }
      if (client.status !== "disconnected") {
        client.disconnect();
      }

      await client.connect(model, config, sessionId ?? "", resumePreviousSession);
    },
    [client, config, model]
  );

  // MODIFIED: The disconnect function now also stops the audio streamer.
  const disconnect = useCallback(async () => {
    if (client) {
        client.disconnect();
    }
    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
    }
    setConnected(false); // Explicitly set connected to false
  }, [client, audioStreamerRef]);

  const setSessionTimeout = useCallback(
    (milliseconds: number) => {
      client?.setSessionTimeout(milliseconds);
    },
    [client]
  );

  return {
    client,
    config,
    setConfig,
    model,
    setModel,
    connected,
    connect,
    disconnect,
    volume,
    setSessionTimeout, // Expose the function
  };
}