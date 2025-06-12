import { Content, Part } from "@google/genai";
import { saveTranscription } from '../services/transcriptionService'; // Import the new service

export class SessionTranscription {
  private static currentSessionId: string | null = null;
  private static transcriptionBuffer: string[] = [];
  private static isFirstEntry: boolean = true;
  private static currentUserChunk: string = '';
  private static currentAssistantChunk: string = '';
  private static lastUserTranscriptionTime: number = 0;
  private static lastAssistantTranscriptionTime: number = 0;
  private static readonly CHUNK_TIMEOUT = 1000;

  private static hasContent(text: string): boolean {
    return text.trim().length > 0;
  }

  static initializeSession(sessionId: string) {
    if (!sessionId) {
      console.error("Cannot initialize session transcription without a valid session ID.");
      return;
    }
    console.log(`Initializing transcription session for ID: ${sessionId}`);
    this.currentSessionId = sessionId;
    this.transcriptionBuffer = [];
    this.isFirstEntry = true;
    this.currentUserChunk = '';
    this.currentAssistantChunk = '';
    this.lastUserTranscriptionTime = 0;
    this.lastAssistantTranscriptionTime = 0;
  }

  static addTranscription(role: 'user' | 'assistant', content: string) {
    if (!this.currentSessionId || !this.hasContent(content)) return;
    const timestamp = new Date().toLocaleString();
    if (this.isFirstEntry) {
      const header = `=== Session Transcription ===\nSession ID: ${this.currentSessionId}\nStarted: ${timestamp}\n\n`;
      this.transcriptionBuffer.push(header);
      this.isFirstEntry = false;
    }
    const entry = `[${timestamp}] ${role.toUpperCase()}:\n${content.trim()}\n\n`;
    this.transcriptionBuffer.push(entry);
  }

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

  static handleInputTranscription(text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;
    const currentTime = Date.now();
    if (currentTime - this.lastUserTranscriptionTime > this.CHUNK_TIMEOUT) {
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

  static handleOutputTranscription(text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;
    const currentTime = Date.now();
    if (currentTime - this.lastAssistantTranscriptionTime > this.CHUNK_TIMEOUT) {
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

  static async endSession() {
    if (!this.currentSessionId) return;

    if (this.hasContent(this.currentUserChunk)) {
      const timestamp = new Date(this.lastUserTranscriptionTime).toLocaleString();
      const entry = `[${timestamp}] USER:\n${this.currentUserChunk.trim()}\n\n`;
      this.transcriptionBuffer.push(entry);
    }
    if (this.hasContent(this.currentAssistantChunk)) {
      const timestamp = new Date(this.lastAssistantTranscriptionTime).toLocaleString();
      const entry = `[${timestamp}] ASSISTANT:\n${this.currentAssistantChunk.trim()}\n\n`;
      this.transcriptionBuffer.push(entry);
    }

    const footer = `\n=== Session Ended: ${new Date().toLocaleString()} ===\n`;
    this.transcriptionBuffer.push(footer);

    const finalTranscription = this.transcriptionBuffer.join('');
    if (!this.hasContent(finalTranscription)) {
        console.log("No transcription content to save.");
        this.currentSessionId = null; // Still reset session
        return;
    }

    try {
      console.log(`Saving transcription to database for session ${this.currentSessionId}...`);
      await saveTranscription(this.currentSessionId, finalTranscription);
      console.log("Transcription successfully saved to database.");
    } catch (error) {
      console.error('Failed to save transcription to the database:', error);
    }
    
    // Reset session state for the next run
    this.currentSessionId = null;
  }

  static getCurrentTranscription(): string {
    return this.transcriptionBuffer.join('');
  }
}