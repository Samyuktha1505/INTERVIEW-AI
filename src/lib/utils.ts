import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// --- Styling Utility from INTERVIEW-AI ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// --- Audio Utilities from LIVE-API-WEB-CONSOLE ---

export type GetAudioContextOptions = AudioContextOptions & {
  id?: string;
};

const map: Map<string, AudioContext> = new Map();

/**
 * Gets an AudioContext after a user interaction has occurred.
 * This is necessary because browsers restrict audio until the user interacts with the page.
 */
export const audioContext: (
  options?: GetAudioContextOptions
) => Promise<AudioContext> = (() => {
  const didInteract = new Promise<void>((res) => {
    window.addEventListener("pointerdown", () => res(), { once: true });
    window.addEventListener("keydown", () => res(), { once: true });
  });

  return async (options?: GetAudioContextOptions) => {
    try {
      // Attempt to create an AudioContext immediately.
      // This may work if interaction has already happened.
      const a = new Audio();
      a.src =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      await a.play();

      if (options?.id && map.has(options.id)) {
        const ctx = map.get(options.id);
        if (ctx) {
          return ctx;
        }
      }
      const ctx = new AudioContext(options);
      if (options?.id) {
        map.set(options.id, ctx);
      }
      return ctx;
    } catch (e) {
      // If it fails, wait for a user interaction and then try again.
      await didInteract;
      if (options?.id && map.has(options.id)) {
        const ctx = map.get(options.id);
        if (ctx) {
          return ctx;
        }
      }
      const ctx = new AudioContext(options);
      if (options?.id) {
        map.set(options.id, ctx);
      }
      return ctx;
    }
  };
})();

/**
 * Converts a base64 encoded string to an ArrayBuffer.
 * Useful for handling audio data.
 * @param base64 The base64 encoded string.
 * @returns An ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}