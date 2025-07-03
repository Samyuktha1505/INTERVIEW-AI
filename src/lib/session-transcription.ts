import { Content, Part } from "@google/genai";
import { summarizeAndSaveTranscript } from '../services/interviewService';

export class SessionTranscription {
  private static currentSessionId: string | null = null;
  private static transcriptionBuffer: string[] = []; // Stores the full, formatted transcription as an array of lines/chunks
  private static currentUserChunk: string = ''; // Accumulates user's current speech chunk
  private static currentAssistantChunk: string = ''; // Accumulates assistant's current speech chunk
  private static lastUserTranscriptionTime: number = 0;
  private static lastAssistantTranscriptionTime: number = 0;
  private static readonly CHUNK_DEBOUNCE_TIME_MS = 1000; // Time in milliseconds before a chunk is considered "complete"

  /**
   * Helper to check if text content is meaningful.
   */
  private static hasContent(text: string): boolean {
    return text.trim().length > 0;
  }

  /**
   * Initializes a new transcription session. Call this at the start of a new meeting.
   * @param sessionId The unique ID for the current session.
   */
  static initializeSession(sessionId: string) {
    if (!sessionId) {
      console.error("Cannot initialize session transcription without a valid session ID.");
      return;
    }
    console.log(`Initializing transcription session for ID: ${sessionId}`);
    this.currentSessionId = sessionId;
    this.transcriptionBuffer = [];
    this.currentUserChunk = '';
    this.currentAssistantChunk = '';
    this.lastUserTranscriptionTime = 0;
    this.lastAssistantTranscriptionTime = 0;

    // Add initial header to the buffer
    const timestamp = new Date().toLocaleString();
    this.transcriptionBuffer.push(`=== Session Transcription ===\nSession ID: ${this.currentSessionId}\nStarted: ${timestamp}\n\n`);
  }

  /**
   * Appends the currently accumulated user and assistant chunks to the main transcription buffer.
   * This is called before saving or at the end of the session to ensure all text is consolidated.
   */
  private static async flushCurrentChunksToBuffer() {
    if (this.hasContent(this.currentUserChunk)) {
      const timestamp = new Date().toLocaleString();
      const entry = `[${timestamp}] USER:\n${this.currentUserChunk.trim()}\n\n`;
      this.transcriptionBuffer.push(entry);
      this.currentUserChunk = ''; // Clear the chunk after flushing
    }
    if (this.hasContent(this.currentAssistantChunk)) {
      const timestamp = new Date().toLocaleString();
      const entry = `[${timestamp}] ASSISTANT:\n${this.currentAssistantChunk.trim()}\n\n`;
      this.transcriptionBuffer.push(entry);
      this.currentAssistantChunk = ''; // Clear the chunk after flushing
    }
  }

  /**
   * Handles incoming transcription from the user (e.g., from ASR).
   * Chunks are accumulated and pushed to the main buffer after a debounce time.
   */
  static handleInputTranscription(text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;

    const currentTime = Date.now();
    if (currentTime - this.lastUserTranscriptionTime > this.CHUNK_DEBOUNCE_TIME_MS) {
      if (this.hasContent(this.currentUserChunk)) {
        const timestamp = new Date(this.lastUserTranscriptionTime).toLocaleString();
        const entry = `[${timestamp}] USER:\n${this.currentUserChunk.trim()}\n\n`;
        this.transcriptionBuffer.push(entry);
      }
      this.currentUserChunk = text;
    } else {
      this.currentUserChunk += ' ' + text;
    }
    this.lastUserTranscriptionTime = currentTime;
  }

  /**
   * Handles incoming transcription from the assistant (e.g., from LLM response).
   * Chunks are accumulated and pushed to the main buffer after a debounce time.
   */
  static handleOutputTranscription(text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;

    const currentTime = Date.now();
    if (currentTime - this.lastAssistantTranscriptionTime > this.CHUNK_DEBOUNCE_TIME_MS) {
      if (this.hasContent(this.currentAssistantChunk)) {
        const timestamp = new Date(this.lastAssistantTranscriptionTime).toLocaleString();
        const entry = `[${timestamp}] ASSISTANT:\n${this.currentAssistantChunk.trim()}\n\n`;
        this.transcriptionBuffer.push(entry);
      }
      this.currentAssistantChunk = text;
    } else {
      this.currentAssistantChunk += ' ' + text;
    }
    this.lastAssistantTranscriptionTime = currentTime;
  }

  /**
   * Directly adds a finalized text entry to the buffer, for non-ASR sources like typed input.
   * @param author 'user' or 'agent'
   * @param text The text content to add.
   */
  static addFinalizedText(author: 'user' | 'agent', text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;

    const timestamp = new Date().toLocaleString();
    const entry = `[${timestamp}] ${author.toUpperCase()}:\n${text.trim()}\n\n`;
    this.transcriptionBuffer.push(entry);
    console.log(`[SessionTranscription] Added finalized text from ${author}: "${text}"`);
  }

  /**
   * Finalizes the session, flushes any remaining chunks, and saves the final transcript.
   */
  static async endSession() {
    if (!this.currentSessionId) {
        console.log("No active session to end.");
        return;
    }

    const sessionId = this.currentSessionId;

    // DIAGNOSTIC LOGGING: Check the state of the chunks *before* flushing.
    console.log(`[SessionTranscription] endSession called. State before flush:`);
    console.log(`  - currentUserChunk: "${this.currentUserChunk}"`);
    console.log(`  - currentAssistantChunk: "${this.currentAssistantChunk}"`);

    // Flush any final, un-debounced speech chunks.
    await this.flushCurrentChunksToBuffer(); 
    
    // DIAGNOSTIC LOGGING: Check the buffer *after* flushing.
    console.log(`[SessionTranscription] State after flush. Buffer length: ${this.transcriptionBuffer.length}`);
    
    const footer = `\n=== Session Ended: ${new Date().toLocaleString()} ===\n`;
    this.transcriptionBuffer.push(footer);

    // Get the full transcript BEFORE clearing the buffer.
    const fullTranscript = this.getCurrentTranscription();
    
    // Send the final, complete transcript to the backend.
    try {
      console.log(`Saving final transcript for session ${sessionId}...`);
      await summarizeAndSaveTranscript(sessionId, fullTranscript);
      console.log(`Final transcript for session ${sessionId} saved successfully.`);
    } catch (error) {
      console.error(`Failed to save final transcript for session ${sessionId}:`, error);
    }

    console.log(`Session ${sessionId} ended and transcription finalized.`);

    // Reset all session state for the next run.
    this.currentSessionId = null;
    this.transcriptionBuffer = [];
    this.currentUserChunk = '';
    this.currentAssistantChunk = '';
    this.lastUserTranscriptionTime = 0;
    this.lastAssistantTranscriptionTime = 0;
  }

  /**
   * Returns the current full transcription assembled from the buffer.
   */
  static getCurrentTranscription(): string {
    return this.transcriptionBuffer.join('');
  }

  // You can keep parseContentToText if it's used elsewhere, but it's not directly used here for saving
  static parseContentToText(content: Content): string {
    if (!content.parts || content.parts.length === 0) return '';
    return content.parts
      .map(part => {
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        if (part.inlineData) {
          if (part.inlineData.mimeType?.startsWith('audio/')) return '';
          if (part.inlineData.mimeType?.startsWith('image/')) return '[Image Content]';
          return '[Binary Content]';
        }
        return '';
      })
      .filter(text => text)
      .join(' ');
  }
}