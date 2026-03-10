import { useState } from "react";
import { Bot, MessageSquare, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";

const starterMessage = {
  role: "assistant",
  message:
    "Hi — I can help explain dosage timing, side effects, and medicine safety guidance. I can’t diagnose illness, so please confirm critical decisions with your doctor.",
};

export const HealthChat = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([starterMessage]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const nextUserMessage = { role: "user", message: input.trim() };
    setMessages((current) => [...current, nextUserMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await apiRequest({
        method: "post",
        url: "/chat",
        data: { message: nextUserMessage.message },
        token,
      });
      setMessages((current) => [...current, { role: "assistant", message: response.reply }]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Unable to send your message right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        data-testid="floating-chat-toggle-button"
        className="fixed bottom-5 right-5 z-50 h-14 rounded-full bg-sky-600 px-5 shadow-[0_18px_45px_rgba(14,116,244,0.35)] hover:bg-sky-700"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X className="mr-2 h-4 w-4" /> : <MessageSquare className="mr-2 h-4 w-4" />}
        {open ? "Close chat" : "AI guide"}
      </Button>

      {open ? (
        <Card
          data-testid="floating-chat-panel"
          className="fixed bottom-24 right-5 z-50 flex h-[32rem] w-[min(92vw,24rem)] flex-col border-sky-100 bg-white/95 shadow-2xl backdrop-blur-xl"
        >
          <CardHeader className="border-b border-sky-100 pb-4">
            <CardTitle className="flex items-center gap-3 text-lg text-slate-900">
              <span className="rounded-full bg-sky-100 p-2 text-sky-700">
                <Bot className="h-4 w-4" />
              </span>
              Medicine guidance assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            <div data-testid="chat-message-list" className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  data-testid={`chat-message-${index}`}
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                    entry.role === "assistant"
                      ? "mr-8 bg-slate-50 text-slate-700"
                      : "ml-8 bg-sky-600 text-white"
                  }`}
                >
                  {entry.message}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                data-testid="chat-message-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about dosage, timing, or side effects"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                data-testid="chat-send-button"
                className="bg-sky-600 hover:bg-sky-700"
                onClick={sendMessage}
                disabled={loading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
};