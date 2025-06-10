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
import { ChatMessage, useChatStore } from "../../lib/store-chat"; // <-- IMPORT THE NEW STORE

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

export default function SidePanel() {
  const { client, connected } = useLiveAPIContext();
  // --- Read messages directly from our new, clean chat store ---
  const chatMessages = useChatStore((state) => state.messages);

  const [showSubtitles, setShowSubtitles] = useState(true);
  const [textInput, setTextInput] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSubtitles) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, showSubtitles]);

  const handleSubmit = () => {
    if (!textInput.trim() || !connected) return;
    
    // When the user sends a text message, we add it to our store
    // NOTE: If you also get user's spoken words transcribed, you'll need to call addMessage there too.
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

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 p-3">
        <h3 className="text-lg font-semibold text-slate-800">
          Agent Transcript
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
            <p>{showSubtitles ? "Hide Transcript" : "Show Transcript"}</p>
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
                Waiting for the conversation to start...
              </p>
            )}
            <div ref={transcriptEndRef} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p>Transcript is hidden.</p>
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