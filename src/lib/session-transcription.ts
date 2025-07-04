import { Content } from "@google/genai";
import { summarizeAndSaveTranscript } from '../services/interviewService';

export class SessionTranscription {
  private static currentSessionId: string | null = null;
  private static transcriptionBuffer: string[] = [];
  // Chunk buffering state
  private static currentUserChunk: string = "";
  private static currentAssistantChunk: string = "";
  private static lastUserTime = 0;
  private static lastAssistantTime = 0;
  private static readonly CHUNK_TIMEOUT = 2000; // ms

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
    if (!text.trim()) return;

    const now = Date.now();
    if (now - this.lastUserTime > this.CHUNK_TIMEOUT && this.currentUserChunk) {
      // flush previous chunk
      this.addTranscription('user', this.currentUserChunk.trim());
      this.currentUserChunk = '';
    }
    this.currentUserChunk += (this.currentUserChunk ? ' ' : '') + text.trim();
    this.lastUserTime = now;
  }

  /**
   * Handles continuously transcribed text from the assistant's speech.
   */
  static handleOutputTranscription(text: string) {
    if (!this.currentSessionId) return;
    if (!text.trim()) return;

    const now = Date.now();
    if (now - this.lastAssistantTime > this.CHUNK_TIMEOUT && this.currentAssistantChunk) {
      this.addTranscription('assistant', this.currentAssistantChunk.trim());
      this.currentAssistantChunk = '';
    }
    this.currentAssistantChunk += (this.currentAssistantChunk ? ' ' : '') + text.trim();
    this.lastAssistantTime = now;
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

    // flush remaining chunks
    if (this.currentUserChunk) {
      this.addTranscription('user', this.currentUserChunk.trim());
    }
    if (this.currentAssistantChunk) {
      this.addTranscription('assistant', this.currentAssistantChunk.trim());
    }

    const footer = `\n=== Session Ended: ${new Date().toLocaleString()} ===\n`;
    this.transcriptionBuffer.push(footer);

    const fullTranscript = this.transcriptionBuffer.join('');
    const sessionId = this.currentSessionId;

    // Reset state immediately.
    this.currentSessionId = null;
    this.transcriptionBuffer = [];
    this.currentUserChunk = '';
    this.currentAssistantChunk = '';
    this.lastUserTime = 0;
    this.lastAssistantTime = 0;

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

        // Standard Gemini TEXT output
        if (part.text) return part.text;

        // Some SDK versions wrap text inside textRun
        // { textRun: { text: "Hello" } }
        // or { textRun: { content: "Hello" } }
        const p: any = part as any;
        if (p.textRun) {
          if (typeof p.textRun === 'string') return p.textRun;
          if (p.textRun.text) return p.textRun.text;
          if (p.textRun.content) return p.textRun.content;
        }

        // Occasionally text may arrive as { paragraph: { text: "..." } }
        // or { paragraph: { elements: [ { textRun: { content: "..." } } ] } }
        if (p.paragraph) {
          if (p.paragraph.text) return p.paragraph.text;
          if (Array.isArray(p.paragraph.elements)) {
            const inner = p.paragraph.elements
              .map((el: any) => el?.textRun?.content || el?.textRun?.text || '')
              .filter(Boolean)
              .join(' ');
            if (inner) return inner;
          }
        }

        if (part.inlineData) {
          if (part.inlineData.mimeType?.startsWith('audio/')) {
            // For audio content, transcription handled elsewhere
            return '';
          }
          if (part.inlineData.mimeType?.startsWith('image/')) return '[Image Content]';
          return '[Binary Content]';
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  // Method to get the current transcription content
  static getCurrentTranscription(): string {
    return this.transcriptionBuffer.join('');
  }
} 