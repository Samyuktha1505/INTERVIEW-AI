import { Content } from "@google/genai";
import { summarizeAndSaveTranscript } from '../services/interviewService';

export class SessionTranscription {
  private static currentSessionId: string | null = null;
  private static transcriptionBuffer: string[] = [];

  /**
   * Initializes a new transcription session with the correct, externally provided session ID.
   */
  static initializeSession(sessionId: string) {
    if (!sessionId) {
      console.error("Cannot initialize session transcription without a valid session ID.");
      return;
    }
    this.currentSessionId = sessionId;
    this.transcriptionBuffer = [];
    
    const header = `=== Session Transcription ===\nSession ID: ${this.currentSessionId}\nStarted: ${new Date().toLocaleString()}\n\n`;
    this.transcriptionBuffer.push(header);
  }

  /**
   * Handles continuously transcribed text from the user's microphone.
   */
  static handleInputTranscription(text: string) {
    if (!this.currentSessionId) return;
    if (text.trim()) {
      this.addTranscription('user', text);
    }
  }

  /**
   * Handles continuously transcribed text from the assistant's speech.
   */
  static handleOutputTranscription(text: string) {
    if (!this.currentSessionId) return;
    if (text.trim()) {
      this.addTranscription('assistant', text);
    }
  }

  /**
   * Directly adds a finalized text entry to the buffer, for non-ASR sources like typed input.
   */
  static addTranscription(role: 'user' | 'assistant', content: string) {
    if (!this.currentSessionId) {
      console.warn("addTranscription called before session was initialized. Ignoring.");
      return;
    }
    const entry = `[${new Date().toLocaleString()}] ${role.toUpperCase()}:\n${content.trim()}\n\n`;
    this.transcriptionBuffer.push(entry);
  }

  /**
   * Finalizes the session, flushes any remaining chunks, and saves the final transcript.
   */
  static async endSession() {
    if (!this.currentSessionId) {
      console.log("No active session to end.");
      return;
    }

    const footer = `\n=== Session Ended: ${new Date().toLocaleString()} ===\n`;
    this.transcriptionBuffer.push(footer);

    const fullTranscript = this.transcriptionBuffer.join('');
    const sessionId = this.currentSessionId;

    // Reset state immediately.
    this.currentSessionId = null;
    this.transcriptionBuffer = [];

    // Await the save operation.
    if (sessionId) {
      try {
        await summarizeAndSaveTranscript(sessionId, fullTranscript);
        console.log(`Final transcript for session ${sessionId} saved successfully.`);
      } catch (error) {
        console.error(`Failed to save final transcript for session ${sessionId}:`, error);
      }
    }
  }

  static parseContentToText(content: Content): string {
    if (!content.parts || content.parts.length === 0) return '';
    
    return content.parts
      .map(part => {
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        if (part.inlineData) {
          if (part.inlineData.mimeType?.startsWith('audio/')) {
            // For audio content, we'll wait for the transcription events
            return '';
          }
          if (part.inlineData.mimeType?.startsWith('image/')) return '[Image Content]';
          return '[Binary Content]';
        }
        return '';
      })
      .filter(text => text)
      .join(' ');
  }

  // Method to get the current transcription content
  static getCurrentTranscription(): string {
    return this.transcriptionBuffer.join('');
  }
} 