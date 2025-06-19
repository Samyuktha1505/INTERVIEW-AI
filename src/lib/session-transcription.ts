import { Content, Part } from "@google/genai";
import { saveTranscription } from '../services/transcriptionService'; // Import the new service

export class SessionTranscription {
  private static currentSessionId: string | null = null;
  private static transcriptionBuffer: string[] = []; // Stores the full, formatted transcription as an array of lines/chunks
  private static currentUserChunk: string = ''; // Accumulates user's current speech chunk
  private static currentAssistantChunk: string = ''; // Accumulates assistant's current speech chunk
  private static lastUserTranscriptionTime: number = 0;
  private static lastAssistantTranscriptionTime: number = 0;
  private static readonly CHUNK_DEBOUNCE_TIME_MS = 1000; // Time in milliseconds before a chunk is considered "complete"
  private static readonly AUTO_FLUSH_INTERVAL_MS = 5000; // How often to auto-save to backend (e.g., every 5 seconds)

  private static _flushIntervalId: ReturnType<typeof setInterval> | null = null; // To manage the periodic save interval

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

    // Start periodic auto-flushing to the database
    this.startAutoFlush();
  }

  /**
   * Starts the periodic saving of transcription data to the database.
   */
  private static startAutoFlush() {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId); // Clear any existing interval
    }
    this._flushIntervalId = setInterval(async () => {
      if (this.currentSessionId) {
        console.log(`[Auto-Flush] Flushing transcription for session ${this.currentSessionId}...`);
        await this.flushCurrentChunksToBuffer(); // Ensure latest chunks are in main buffer
        await this.saveToDatabase();
      }
    }, this.AUTO_FLUSH_INTERVAL_MS);
  }

  /**
   * Stops the periodic saving interval. Call this when the session truly ends.
   */
  private static stopAutoFlush() {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId);
      this._flushIntervalId = null;
      console.log(`Stopped auto-flushing for session ${this.currentSessionId}.`);
    }
  }

  /**
   * Appends the currently accumulated user and assistant chunks to the main transcription buffer.
   * This is called before saving or at the end of the session to ensure all text is consolidated.
   */
  private static async flushCurrentChunksToBuffer() {
    if (this.hasContent(this.currentUserChunk)) {
      // Use a consistent timestamp logic (e.g., when the chunk started or when it was flushed)
      // For simplicity, using current time for flushing remaining chunk.
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
    // If a new chunk starts or enough time has passed for the previous chunk
    if (currentTime - this.lastUserTranscriptionTime > this.CHUNK_DEBOUNCE_TIME_MS) {
      if (this.hasContent(this.currentUserChunk)) {
        // Flush the completed previous chunk to the main buffer
        const timestamp = new Date(this.lastUserTranscriptionTime).toLocaleString(); // Timestamp of when the chunk was last updated
        const entry = `[${timestamp}] USER:\n${this.currentUserChunk.trim()}\n\n`;
        this.transcriptionBuffer.push(entry);
      }
      // Start a new chunk
      this.currentUserChunk = text;
    } else {
      // Continue accumulating the current chunk
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
    // If a new chunk starts or enough time has passed for the previous chunk
    if (currentTime - this.lastAssistantTranscriptionTime > this.CHUNK_DEBOUNCE_TIME_MS) {
      if (this.hasContent(this.currentAssistantChunk)) {
        // Flush the completed previous chunk to the main buffer
        const timestamp = new Date(this.lastAssistantTranscriptionTime).toLocaleString(); // Timestamp of when the chunk was last updated
        const entry = `[${timestamp}] ASSISTANT:\n${this.currentAssistantChunk.trim()}\n\n`;
        this.transcriptionBuffer.push(entry);
      }
      // Start a new chunk
      this.currentAssistantChunk = text;
    } else {
      // Continue accumulating the current chunk
      this.currentAssistantChunk += ' ' + text;
    }
    this.lastAssistantTranscriptionTime = currentTime;
  }

  /**
   * Saves the current accumulated transcription to the database.
   * This method is called by the auto-flush and at the end of the session.
   */
  private static async saveToDatabase() {
    if (!this.currentSessionId) {
      console.warn("Attempted to save transcription without an active session ID.");
      return;
    }

    const currentFullTranscription = this.transcriptionBuffer.join('');
    if (!this.hasContent(currentFullTranscription)) {
        console.log("No meaningful transcription content to save yet.");
        return;
    }

    try {
      console.log(`Saving transcription to database for session ${this.currentSessionId}...`);
      await saveTranscription(this.currentSessionId, currentFullTranscription);
      console.log("Transcription successfully saved to database.");
    } catch (error) {
      console.error('Failed to save transcription to the database:', error);
      // Depending on severity, you might want to retry or alert the user.
    }
  }

  /**
   * Finalizes the session, flushes any remaining chunks, saves to database, and resets state.
   * Call this when the meeting officially ends.
   */
  static async endSession() {
    if (!this.currentSessionId) {
        console.log("No active session to end.");
        return;
    }

    this.stopAutoFlush(); // Stop periodic saving

    await this.flushCurrentChunksToBuffer(); // Ensure any last pending chunks are added to the buffer

    const footer = `\n=== Session Ended: ${new Date().toLocaleString()} ===\n`;
    this.transcriptionBuffer.push(footer);

    await this.saveToDatabase(); // Perform one final save

    console.log(`Session ${this.currentSessionId} ended and transcription finalized.`);

    // Reset session state for the next run
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
    // Optionally, you might want to also include currentUserChunk/currentAssistantChunk here
    // if you want the *absolute latest* text that hasn't even been debounced yet.
    // For now, this just returns what's in the main buffer.
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