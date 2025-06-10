import { Content, Part } from "@google/genai";

export class SessionTranscription {
  private static currentSessionId: string | null = null;
  private static transcriptionBuffer: string[] = [];
  private static isFirstEntry: boolean = true;
  private static currentUserChunk: string = '';
  private static currentAssistantChunk: string = '';
  private static lastUserTranscriptionTime: number = 0;
  private static lastAssistantTranscriptionTime: number = 0;
  private static readonly CHUNK_TIMEOUT = 1000; // 1 second timeout for combining chunks

  private static hasContent(text: string): boolean {
    return text.trim().length > 0;
  }

  static initializeSession() {
    // Generate new session ID
    this.currentSessionId = `session_${new Date().toISOString().replace(/[:.]/g, '-')}`;
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
    
    // Add session header only for the first entry
    if (this.isFirstEntry) {
      const header = `=== Gemini Session Transcription ===\nSession ID: ${this.currentSessionId}\nStarted: ${timestamp}\n\n`;
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

  static handleInputTranscription(text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;

    const currentTime = Date.now();
    
    // If this is a new chunk (based on time difference)
    if (currentTime - this.lastUserTranscriptionTime > this.CHUNK_TIMEOUT) {
      // If we have accumulated text, add it as a complete entry
      if (this.hasContent(this.currentUserChunk)) {
        const timestamp = new Date(this.lastUserTranscriptionTime).toLocaleString();
        const entry = `[${timestamp}] USER:\n${this.currentUserChunk.trim()}\n\n`;
        this.transcriptionBuffer.push(entry);
      }
      // Start a new chunk
      this.currentUserChunk = text;
    } else {
      // Append to current chunk
      this.currentUserChunk += ' ' + text;
    }
    
    this.lastUserTranscriptionTime = currentTime;
  }

  static handleOutputTranscription(text: string) {
    if (!this.currentSessionId || !this.hasContent(text)) return;

    const currentTime = Date.now();
    
    // If this is a new chunk (based on time difference)
    if (currentTime - this.lastAssistantTranscriptionTime > this.CHUNK_TIMEOUT) {
      // If we have accumulated text, add it as a complete entry
      if (this.hasContent(this.currentAssistantChunk)) {
        const timestamp = new Date(this.lastAssistantTranscriptionTime).toLocaleString();
        const entry = `[${timestamp}] ASSISTANT:\n${this.currentAssistantChunk.trim()}\n\n`;
        this.transcriptionBuffer.push(entry);
      }
      // Start a new chunk
      this.currentAssistantChunk = text;
    } else {
      // Append to current chunk
      this.currentAssistantChunk += ' ' + text;
    }
    
    this.lastAssistantTranscriptionTime = currentTime;
  }

  static endSession() {
    if (!this.currentSessionId) return;

    // Add any remaining user transcription chunk
    if (this.hasContent(this.currentUserChunk)) {
      const timestamp = new Date(this.lastUserTranscriptionTime).toLocaleString();
      const entry = `[${timestamp}] USER:\n${this.currentUserChunk.trim()}\n\n`;
      this.transcriptionBuffer.push(entry);
    }

    // Add any remaining assistant transcription chunk
    if (this.hasContent(this.currentAssistantChunk)) {
      const timestamp = new Date(this.lastAssistantTranscriptionTime).toLocaleString();
      const entry = `[${timestamp}] ASSISTANT:\n${this.currentAssistantChunk.trim()}\n\n`;
      this.transcriptionBuffer.push(entry);
    }

    const footer = `\n=== Session Ended: ${new Date().toLocaleString()} ===\n`;
    this.transcriptionBuffer.push(footer);

    // Write the complete transcription to file only when session ends
    try {
      const content = this.transcriptionBuffer.join('');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentSessionId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error writing transcription to file:', error);
    }
    
    // Reset session
    this.currentSessionId = null;
    this.transcriptionBuffer = [];
    this.isFirstEntry = true;
    this.currentUserChunk = '';
    this.currentAssistantChunk = '';
    this.lastUserTranscriptionTime = 0;
    this.lastAssistantTranscriptionTime = 0;
  }

  // Method to get the current transcription content
  static getCurrentTranscription(): string {
    return this.transcriptionBuffer.join('');
  }
} 