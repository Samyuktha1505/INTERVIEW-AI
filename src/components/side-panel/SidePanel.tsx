import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Captions, CaptionsOff, Send } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ChatMessage, useChatStore } from "../../lib/store-chat";

// NEW: Define the props interface for the SidePanel component
interface SidePanelProps {
  initialPrompt: string;
}

// --- Helper component for a single chat bubble (no changes) ---
const ChatBubble = ({ message }: { message: ChatMessage }) => {
  const isUser = message.author === "user";
  return (
    <div
      className={`mb-4 flex max-w-lg flex-col ${
        isUser ? "self-end" : "self-start"
      }`}
    >
      <div
        className={`rounded-lg px-4 py-2 ${
          isUser
            ? "rounded-br-none bg-blue-500 text-white"
            : "rounded-bl-none bg-slate-200 text-slate-800"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
};

// NEW: Update the function to accept the 'initialPrompt' prop
export default function SidePanel({ initialPrompt }: SidePanelProps) {
  const { client, connected } = useLiveAPIContext();
  const chatMessages = useChatStore((state) => state.messages);

  const [showSubtitles, setShowSubtitles] = useState(true);
  const [textInput, setTextInput] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // NEW: Add state to ensure we only send the initial prompt once
  const [isPromptSent, setIsPromptSent] = useState(false);

  // This existing useEffect for scrolling the view is unchanged
  useEffect(() => {
    if (showSubtitles) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, showSubtitles]);

  // NEW: Add a useEffect to send the initial prompt when the connection is ready
  useEffect(() => {
    // Check if we have a prompt, are connected, and haven't sent it yet
    if (initialPrompt && connected && !isPromptSent) {
      console.log("Sending initial prompt to AI Agent...");
      
      const systemPrompt = `You are a highly experienced and friendly interviewer. Your role is to conduct a professional and conversational interview that feels deeply personalized to the user's resume.
You must adhere to the following rules:
1.  **Start with a Personalized Opening:** Introduce yourself briefly. Then, look at the key themes in the interview questions provided below to understand the candidate's core skills (e.g., backend development, cloud infrastructure, project management). Use this insight to formulate a personalized, open-ended introductory question. For example: "I was looking over your background, and it seems you have a lot of experience in [theme from resume, e.g., 'building scalable APIs']. To start, could you walk me through your journey and what interests you most in that area?" This makes the opening feel directly connected to the candidate's history. Do NOT start with a generic "tell me about yourself."
2.  **Be Conversational:** After the user's introduction, you can ask a relevant follow-up question. For example, if they mention a specific project, you can ask them to elaborate on it.
3.  **Use the Provided Questions:** After the initial personalized introduction, proceed with the tailored interview questions provided below. Ask only one question at a time.
4.  **Stay in Character:** If the user asks a question, politely deflect it and reiterate that your role is to learn more about them. For example, say "I'm happy to answer questions about the role later, but for now, I'd like to focus on your experience. Let's continue."
5.  **Listen and Transition:** Wait for the user's full response before moving to the next question. Transition smoothly between topics.

Here is the list of interview questions to use after the introduction:
${initialPrompt}

Please begin the interview now with your introduction and a warm, personalized, open-ended introductory question based on the themes from the user's resume.`;

      // Send the prompt to the backend to configure the AI agent for the interview
      client.send([{ text: systemPrompt }]);
      // Mark the prompt as sent to prevent re-sending on re-renders
      setIsPromptSent(true);
    }
  }, [initialPrompt, connected, isPromptSent, client]);

  const handleSubmit = () => {
    if (!textInput.trim() || !connected) return;
    
    useChatStore.getState().addMessage("user", textInput);
    client.send([{ text: textInput }]);
    setTextInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // The JSX and UI below are completely unchanged
  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 p-3">
        <h3 className="text-lg font-semibold text-slate-800">
          Interview Room
        </h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSubtitles(!showSubtitles)}
              className="h-8 w-8"
            >
              {showSubtitles ? (
                <CaptionsOff className="h-5 w-5 text-slate-600" />
              ) : (
                <Captions className="h-5 w-5 text-slate-600" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{showSubtitles ? "Hide Subtitles" : "Show Subtitles"}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Transcript Area */}
      <div className="flex-grow overflow-y-auto p-4">
        {showSubtitles ? (
          <div className="flex flex-col">
            {chatMessages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {chatMessages.length === 0 && (
              <p className="text-center text-sm text-slate-400">
                Connecting to interview agent...
              </p>
            )}
            <div ref={transcriptEndRef} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p>Subtitles are hidden.</p>
          </div>
        )}
      </div>

      {/* Text Input Area */}
      <div className="flex-shrink-0 border-t border-slate-200 p-3">
        <div className="relative">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connected ? "Type a message..." : "Connect to start typing"
            }
            className="resize-none pr-12"
            rows={1}
            disabled={!connected}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2"
            onClick={handleSubmit}
            disabled={!connected || !textInput.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}