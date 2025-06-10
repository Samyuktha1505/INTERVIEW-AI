import { create } from "zustand";

export type ChatMessage = {
  id: string; // Use a unique ID like a timestamp
  author: "user" | "agent";
  content: string;
};

type ChatStore = {
  messages: ChatMessage[];
  addMessage: (author: "user" | "agent", content: string) => void;
};

// This logic helps combine rapid-fire messages from the same author
const shouldCombine = (lastMessage: ChatMessage, author: "user" | "agent") => {
  if (!lastMessage || lastMessage.author !== author) return false;
  const now = Date.now();
  const lastMessageTime = parseInt(lastMessage.id, 10);
  // Combine if the new message is from the same author and within 2 seconds
  return now - lastMessageTime < 2000;
};

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (author, content) => {
    set((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      // If the new message should be combined with the last one
      if (shouldCombine(lastMessage, author)) {
        lastMessage.content += ` ${content}`;
        return { messages: [...state.messages] };
      }
      // Otherwise, add a new message entry
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        author,
        content,
      };
      return { messages: [...state.messages, newMessage] };
    });
  },
}));