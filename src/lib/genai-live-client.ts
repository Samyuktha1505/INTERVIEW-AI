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

import {
  Content,
  GoogleGenAI, // Assuming this is the correct direct import
  LiveCallbacks,
  LiveClientToolResponse,
  LiveConnectConfig,
  LiveServerContent,
  LiveServerMessage,
  LiveServerToolCall,
  LiveServerToolCallCancellation,
  Modality,
  Part,
  Session,
} from "@google/genai";

import { EventEmitter } from "eventemitter3";
import { difference } from "lodash";
import { LiveClientOptions, StreamingLog } from "../types"; // Ensure these types are correctly defined
import { base64ToArrayBuffer } from "./utils";
import { SessionTranscription } from "./session-transcription";
import { useChatStore } from "./store-chat";

interface StoredSessionHandle {
  handle: string;
  timestamp: number;
}

export interface LiveClientEventTypes {
  audio: (data: ArrayBuffer) => void;
  close: (event: CloseEvent) => void;
  content: (data: LiveServerContent) => void;
  error: (error: ErrorEvent) => void;
  interrupted: () => void;
  log: (log: StreamingLog) => void;
  open: () => void;
  setupcomplete: () => void;
  toolcall: (toolCall: LiveServerToolCall) => void;
  toolcallcancellation: (
    toolcallCancellation: LiveServerToolCallCancellation
  ) => void;
  turncomplete: () => void;
}

export class GenAILiveClient extends EventEmitter<LiveClientEventTypes> {
  protected client: GoogleGenAI;

  private _status: "connected" | "disconnected" | "connecting" = "disconnected";
  public get status() {
    return this._status;
  }

  private _session: Session | null = null;
  public get session() {
    return this._session;
  }

  private _model: string | null = null; // To store the model name for reconnections
  public get model() {
    return this._model;
  }

  protected config: LiveConnectConfig | null = null; // To store the config for reconnections

  public getConfig() {
    return { ...this.config };
  }

  private sessionHandleStorageKey = "geminiPreviousSessionHandle";
  private sessionTimeoutMs: number = 10 * 60 * 1000; // Client-side validation for stored handle age

  // Auto-reconnect properties
  private isAutoReconnecting = false;
  private autoReconnectAttempts = 0;
  private maxAutoReconnectAttempts = 100;
  private initialReconnectDelayMs = 2000;
  private autoReconnectTimerId: ReturnType<typeof setTimeout> | null = null;


  constructor(options: LiveClientOptions) {
    super();
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VITE_GEMINI_API_KEY is not set in environment variables."
      );
    }
    this.client = new GoogleGenAI({ ...options, apiKey });
    this.send = this.send.bind(this);
    this.onopen = this.onopen.bind(this);
    this.onerror = this.onerror.bind(this);
    this.onclose = this.onclose.bind(this);
    this.onmessage = this.onmessage.bind(this);
  }

  public setSessionTimeout(milliseconds: number) {
    this.sessionTimeoutMs = milliseconds;
    console.log(`[GenAILiveClient] Client-side session handle validation timeout set to ${milliseconds} ms.`);
  }

  public setAutoReconnectOptions(options: { maxAttempts?: number, initialDelay?: number }) {
    if (options.maxAttempts !== undefined) this.maxAutoReconnectAttempts = options.maxAttempts;
    if (options.initialDelay !== undefined) this.initialReconnectDelayMs = options.initialDelay;
    console.log(`[GenAILiveClient] Auto-reconnect options updated: maxAttempts=${this.maxAutoReconnectAttempts}, initialDelay=${this.initialReconnectDelayMs}ms`);
  }

  private async loadPreviousSessionHandle(): Promise<string | null> {
    try {
      const handleDataString = localStorage.getItem(this.sessionHandleStorageKey);
      if (handleDataString) {
        const handleData: StoredSessionHandle = JSON.parse(handleDataString);
        if (handleData.handle && (Date.now() - handleData.timestamp < this.sessionTimeoutMs)) {
          console.log(`[GenAILiveClient] Found previous session handle for resumption: ${handleData.handle}, stored at ${new Date(handleData.timestamp).toLocaleString()}`);
          return handleData.handle;
        } else if (handleData.handle) {
          console.log(`[GenAILiveClient] Stored session handle ${handleData.handle} is older than client-side timeout (${this.sessionTimeoutMs}ms) or invalid. Removing.`);
          localStorage.removeItem(this.sessionHandleStorageKey);
        } else {
          console.log(`[GenAILiveClient] Found stored session data in localStorage but 'handle' property was missing or invalid.`);
        }
      } else {
        // console.log(`[GenAILiveClient] No previous session handle found in localStorage with key: ${this.sessionHandleStorageKey}`);
      }
    } catch (error) {
      console.error("[GenAILiveClient] Error loading session handle from localStorage:", error);
    }
    return null;
  }

  private async storeNewSessionHandle(handle: string): Promise<void> {
    try {
      const handleData: StoredSessionHandle = { handle, timestamp: Date.now() };
      localStorage.setItem(this.sessionHandleStorageKey, JSON.stringify(handleData));
      console.log(`[GenAILiveClient] Stored new session handle to localStorage: ${handle} at ${new Date(handleData.timestamp).toLocaleString()}`);
    } catch (error) {
      console.error("[GenAILiveClient] Error storing session handle to localStorage:", error);
    }
  }

  protected log(type: string, messagePayload: StreamingLog["message"]) {
    const logEntry: StreamingLog = {
      date: new Date(),
      type,
      message: messagePayload,
    };
    this.emit("log", logEntry);
  }

  async connect(model: string, config: LiveConnectConfig, sessionId: string): Promise<boolean> {
    this.log("client.connect", model);

    if (this._status !== "disconnected") {
      console.warn(`[GenAILiveClient] Connect: Attempt while status is already '${this._status}'. Aborting manual connect.`);
      return false;
    }

    this._model = model;
    this.config = config;

    // The client should not be responsible for initializing the transcription session.
    // This should be handled at a higher level in the application logic.
    // SessionTranscription.initializeSession(sessionId);

    this._status = "connecting";

    const previousSessionHandle = await this.loadPreviousSessionHandle(); // This can be string | null

    // Always create the sessionResumption configuration object.
    const sessionResumptionConfig: { handle?: string } = {
        handle: previousSessionHandle || undefined,
    };

    const effectiveConfig: LiveConnectConfig = {
      ...config, // User-provided base config
      responseModalities: config.responseModalities || [Modality.TEXT],
      // Now, sessionResumption field is always present in the config sent to the server
      sessionResumption: sessionResumptionConfig,
    };

    if (previousSessionHandle) {
      console.log(`[GenAILiveClient] Connect: Attempting to resume session with existing handle: ${previousSessionHandle}`);
    } else {
      console.log("[GenAILiveClient] Connect: Starting a new session, configured for session resumption. Expecting server to send a handle if supported.");
    }

    console.log(`[GenAILiveClient] Connect: Effective config being passed to SDK connect method:`, JSON.parse(JSON.stringify(effectiveConfig)));

    const callbacks: LiveCallbacks = {
      onopen: this.onopen,
      onmessage: this.onmessage,
      onerror: this.onerror,
      onclose: this.onclose,
    };

    try {
      this._session = await this.client.live.connect({
        model: this._model,
        config: effectiveConfig, // Pass the config that now always includes sessionResumption
        callbacks,
      });
      console.log("[GenAILiveClient] Connect: SDK connect method call successfully initiated.");
    } catch (e: any) {
      console.error("[GenAILiveClient] Connect: Error during SDK connect method call:", e.message || e, e);
      this._status = "disconnected";
      if (previousSessionHandle) {
        console.log(`[GenAILiveClient] Connect: Clearing potentially invalid session handle ${previousSessionHandle} from localStorage after connection error.`);
        localStorage.removeItem(this.sessionHandleStorageKey);
      }
      if (this.isAutoReconnecting) {
        console.log("[GenAILiveClient] Connect: Error occurred during an auto-reconnect attempt. Will rely on onclose for next step.");
      }
      return false;
    }
    return true;
  }

  public disconnect() {
    // End transcription session when disconnecting
    SessionTranscription.endSession();

    console.log("[GenAILiveClient] Disconnect: User initiated.");
    if (this.autoReconnectTimerId) {
        clearTimeout(this.autoReconnectTimerId);
        this.autoReconnectTimerId = null;
        console.log("[GenAILiveClient] Disconnect: Cleared pending auto-reconnect timer.");
    }
    this.isAutoReconnecting = false;
    this.autoReconnectAttempts = 0;

    if (!this.session) {
      console.log("[GenAILiveClient] Disconnect: No active session to close.");
      return false;
    }
    console.log("[GenAILiveClient] Disconnect: Closing active session.");
    this.session?.close();
    this._session = null;
    this.log("client.close", `Disconnected (user initiated)`);
    return true;
  }

  protected onopen() {
    const modelNameForLog = this._model || "unknown model";
    console.log(`[GenAILiveClient] OnOpen: Connection established. Model: ${modelNameForLog}. Current status before update: ${this._status}`);
    this.log("client.open", `Connected. Model: ${modelNameForLog}`);
    this._status = "connected";
    this.emit("open");

    if (this.isAutoReconnecting) {
        console.log("[GenAILiveClient] OnOpen: Auto-reconnection attempt was successful.");
    }

    if (this.autoReconnectTimerId) {
        clearTimeout(this.autoReconnectTimerId);
        this.autoReconnectTimerId = null;
    }
    this.isAutoReconnecting = false;
    this.autoReconnectAttempts = 0;
  }

  protected onerror(e: ErrorEvent) {
    console.error("[GenAILiveClient] OnError:", e.type, e.message, e);
    this.log("server.error", e.message || "Unknown error");
    this.emit("error", e);
  }

  protected onclose(e: CloseEvent) {
    console.log(`[GenAILiveClient] OnClose: Connection closed. Code: ${e.code}, Reason: "${e.reason || "No reason provided"}". Status before this close: ${this._status}. Auto-reconnecting cycle active: ${this.isAutoReconnecting}, Attempts made: ${this.autoReconnectAttempts}`);
    this.log(
      `server.close`,
      `Connection closed. Code: ${e.code}, Reason: ${e.reason ? e.reason : "No reason provided"}`
    );
    this.emit("close", e);

    const wasConnectedOrConnecting = (this._status === "connected" || this._status === "connecting");
    this._status = "disconnected";

    const normalClosureCodes = [1000, 1005];

    if (wasConnectedOrConnecting && !normalClosureCodes.includes(e.code)) {
        if (this.autoReconnectAttempts < this.maxAutoReconnectAttempts) {
            if (!this.isAutoReconnecting) {
                console.log(`[GenAILiveClient] OnClose: Unexpected disconnect. Initializing auto-reconnect cycle.`);
                this.isAutoReconnecting = true;
            } else {
                 console.log(`[GenAILiveClient] OnClose: Auto-reconnect attempt failed. Will schedule next if attempts remain.`);
            }
            this.attemptReconnect();
        } else {
            console.error(`[GenAILiveClient] OnClose: Max auto-reconnect attempts (${this.maxAutoReconnectAttempts}) reached for this cycle. Stopping auto-reconnection.`);
            this.isAutoReconnecting = false;
            this.autoReconnectAttempts = 0;
        }
    } else {
        if (normalClosureCodes.includes(e.code)) {
            console.log(`[GenAILiveClient] OnClose: Normal closure (code ${e.code}). Not auto-reconnecting.`);
        } else if (!wasConnectedOrConnecting) {
            console.log(`[GenAILiveClient] OnClose: Not auto-reconnecting as connection was not previously established or was already disconnecting.`);
        }
        if (this.isAutoReconnecting) {
            this.isAutoReconnecting = false;
            this.autoReconnectAttempts = 0;
        }
        if (this.autoReconnectTimerId) {
            clearTimeout(this.autoReconnectTimerId);
            this.autoReconnectTimerId = null;
        }
    }
  }

  private attemptReconnect() {
    if (!this.isAutoReconnecting) {
        console.log("[GenAILiveClient] AttemptReconnect: Called but auto-reconnect cycle is not active. Aborting.");
        return;
    }

    if (this.autoReconnectAttempts >= this.maxAutoReconnectAttempts) {
        console.error(`[GenAILiveClient] AttemptReconnect: Max auto-reconnect attempts (${this.maxAutoReconnectAttempts}) reached. Stopping cycle.`);
        this.isAutoReconnecting = false;
        this.autoReconnectAttempts = 0;
        if (this.autoReconnectTimerId) clearTimeout(this.autoReconnectTimerId);
        this.autoReconnectTimerId = null;
        return;
    }

    this.autoReconnectAttempts++;
    const delay = this.initialReconnectDelayMs * Math.pow(2, this.autoReconnectAttempts - 1);

    console.log(`[GenAILiveClient] AttemptReconnect: Scheduling attempt #${this.autoReconnectAttempts} of ${this.maxAutoReconnectAttempts} in ${delay / 1000}s.`);

    if (this.autoReconnectTimerId) clearTimeout(this.autoReconnectTimerId);

    this.autoReconnectTimerId = setTimeout(async () => {
        if (this._status === "disconnected" && this.isAutoReconnecting) {
            if (!this._model || !this.config) {
                console.error("[GenAILiveClient] AttemptReconnect: Critical error - model or config missing for retry. Stopping cycle.");
                this.isAutoReconnecting = false;
                this.autoReconnectAttempts = 0;
                return;
            }
            console.log(`[GenAILiveClient] AttemptReconnect: Executing auto-reconnect attempt #${this.autoReconnectAttempts} to model ${this._model}...`);
            await this.connect(this._model, this.config, "YOUR_SESSION_ID_HERE"); // TODO: You need to pass the actual sessionId here
        } else if (!this.isAutoReconnecting) {
            console.log(`[GenAILiveClient] AttemptReconnect: Auto-reconnect cycle was cancelled before attempt #${this.autoReconnectAttempts} execution.`);
        } else {
            console.log(`[GenAILiveClient] AttemptReconnect: Auto-reconnect attempt #${this.autoReconnectAttempts} skipped, status is now: ${this._status}.`);
            if(this._status !== "disconnected"){
                this.isAutoReconnecting = false;
                this.autoReconnectAttempts = 0;
            }
        }
    }, delay);
  }

  protected async onmessage(message: LiveServerMessage) {
    console.log("[GenAILiveClient] RAW SERVER MESSAGE:", JSON.parse(JSON.stringify(message)));

    // Handle inputTranscription event (user's speech from ASR)
    if (message.serverContent?.inputTranscription?.text) {
      const transcribedText = message.serverContent.inputTranscription.text;
      SessionTranscription.handleInputTranscription(transcribedText); // CORRECT: Use the new handler
      useChatStore.getState().addMessage("user", transcribedText);
      return;
    }

    // Handle outputTranscription event (assistant's speech from ASR/LLM)
    if (message.serverContent?.outputTranscription?.text) {
      const transcribedText = message.serverContent.outputTranscription.text;
      SessionTranscription.handleOutputTranscription(transcribedText); // CORRECT: Use the new handler
      useChatStore.getState().addMessage("agent", transcribedText);
      return;
    }

    if (message.sessionResumptionUpdate) {
      this.log("server.sessionResumptionUpdate", JSON.stringify(message.sessionResumptionUpdate));
      if (message.sessionResumptionUpdate.newHandle) {
        const newHandle = message.sessionResumptionUpdate.newHandle;
        console.log(`[GenAILiveClient] OnMessage: Received sessionResumptionUpdate with new/updated handle from server: ${newHandle} (Resumable: ${message.sessionResumptionUpdate.resumable})`);
        await this.storeNewSessionHandle(newHandle);
      } else {
        console.log(`[GenAILiveClient] OnMessage: Received sessionResumptionUpdate but it did not contain a 'newHandle':`, JSON.parse(JSON.stringify(message.sessionResumptionUpdate)));
      }
    }

    if (message.setupComplete) {
      this.log("server.send", "setupComplete");
      this.emit("setupcomplete");
      return;
    }
    if (message.toolCall) {
      this.log("server.toolCall", JSON.stringify(message.toolCall));
      this.emit("toolcall", message.toolCall);
      return;
    }
    if (message.toolCallCancellation) {
      this.log("server.toolCallCancellation", JSON.stringify(message.toolCallCancellation));
      this.emit("toolcallcancellation", message.toolCallCancellation);
      return;
    }

    if (message.serverContent) {
      const { serverContent } = message;

      if ("interrupted" in serverContent) {
        this.log("server.content", "interrupted");
        this.emit("interrupted");
        return;
      }
      if ("turnComplete" in serverContent) {
        this.log("server.content", "turnComplete");
      }

      if ("modelTurn" in serverContent && serverContent.modelTurn) {
        const modelTurn: Content = serverContent.modelTurn;

        // Ensure AI's text responses are captured for transcription.
        const textContent = SessionTranscription.parseContentToText(modelTurn);
        if (textContent) {
          SessionTranscription.addTranscription('agent', textContent);
        }

        let currentProcessingParts: Part[] = modelTurn.parts || [];

        const audioParts = currentProcessingParts.filter(
          (p) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/pcm")
        );
        const base64s = audioParts.map((p) => p.inlineData?.data);
        const otherParts = difference(currentProcessingParts, audioParts);

        base64s.forEach((b64) => {
          if (b64) {
            const data = base64ToArrayBuffer(b64);
            this.emit("audio", data);
            this.log(`server.audio`, `buffer (${data.byteLength})`);
          }
        });

        if (!otherParts.length && audioParts.length > 0) {
          return;
        }
        currentProcessingParts = otherParts;

        if (currentProcessingParts.length > 0) {
            const contentToEmit: { modelTurn: Content } = {
                modelTurn: { parts: currentProcessingParts, role: modelTurn.role }
            };
            this.emit("content", contentToEmit);
            this.log(`server.content`, JSON.stringify({ serverContent: contentToEmit }) );
        } else if (!("turnComplete" in serverContent) && !audioParts.length) {
            this.log(`server.content`, `Received modelTurn which resulted in no further parts to emit after processing (original modelTurn: ${JSON.stringify(modelTurn)})`);
        }
      }
      return;
    }

    const wasMessageHandledBySpecificLogic = message.sessionResumptionUpdate || message.setupComplete || message.toolCall || message.toolCallCancellation || message.serverContent;
    if (!wasMessageHandledBySpecificLogic) {
        console.warn("[GenAILiveClient] OnMessage: Received message structure not explicitly handled by specific if-blocks above:", JSON.parse(JSON.stringify(message)));
    }
  }

  sendRealtimeInput(chunks: Array<{ mimeType: string; data: string }>) {
    if (this._status !== "connected" || !this.session) {
      console.warn("[GenAILiveClient] SendRealtimeInput: Cannot send, not connected.");
      return;
    }
    let hasAudio = false;
    let hasVideo = false;
    for (const ch of chunks) {
      this.session?.sendRealtimeInput({ media: ch });
      if (ch.mimeType.includes("audio")) hasAudio = true;
      if (ch.mimeType.includes("image")) hasVideo = true;
      if (hasAudio && hasVideo) break;
    }
    const messageContent = hasAudio && hasVideo ? "audio + video" : hasAudio ? "audio" : hasVideo ? "video" : "unknown";
    this.log(`client.realtimeInput`, messageContent);
  }

  sendToolResponse(toolResponse: LiveClientToolResponse) {
    if (this._status !== "connected" || !this.session) {
      console.warn("[GenAILiveClient] SendToolResponse: Cannot send, not connected.");
      return;
    }
    if (toolResponse.functionResponses && toolResponse.functionResponses.length) {
      this.session?.sendToolResponse({ functionResponses: toolResponse.functionResponses });
      this.log(`client.toolResponse`, JSON.stringify(toolResponse));
    }
  }

  send(parts: Part | Part[], turnComplete: boolean = true) {
    if (this._status !== "connected" || !this.session) {
      console.warn("[GenAILiveClient] Send: Cannot send, not connected.");
      return;
    }
    this.session?.sendClientContent({ turns: parts, turnComplete });
    const clientContentToLog = { turns: Array.isArray(parts) ? parts : [parts], turnComplete };
    this.log(`client.send`, clientContentToLog);

    // Capture user-typed text and add it directly to the transcription.
    const userContent: Content = {
      role: 'user',
      parts: Array.isArray(parts) ? parts : [parts]
    };
    const userText = SessionTranscription.parseContentToText(userContent);
    if (userText) {
      SessionTranscription.addTranscription('user', userText);
    }
  }
}