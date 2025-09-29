import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Mic, CheckSquare, Settings as SettingsIcon, MessageSquare, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  username?: string;
}

const ChatInterface = ({ username }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const streamChat = async (userMessage: string) => {
    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            variant: "destructive",
            title: "Rate limit exceeded",
            description: "Please try again in a moment.",
          });
          return;
        }
        if (response.status === 402) {
          toast({
            variant: "destructive",
            title: "Payment required",
            description: "Please add credits to continue.",
          });
          return;
        }
        throw new Error("Failed to get response");
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to get response from assistant.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    streamChat(input);
    setInput("");
  };

  const handleQuickAction = (action: string) => {
    streamChat(action);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-card/50 border-r border-border/50 backdrop-blur-sm flex flex-col">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-gradient-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-sm">Virtual Assistant</h2>
              <p className="text-xs text-muted-foreground">{username}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Quick Access
            </h3>
            <div className="space-y-1">
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => navigate("/tasks")}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Tasks
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => navigate("/voice")}
              >
                <Mic className="mr-2 h-4 w-4" />
                Voice Commands
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => navigate("/settings")}
              >
                <SettingsIcon className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Suggestions
            </h3>
            <div className="space-y-1">
              {["Set a reminder", "Check weather", "Latest news", "Help me plan"].map((query) => (
                <Button
                  key={query}
                  variant="ghost"
                  className="w-full justify-start text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => handleQuickAction(query)}
                >
                  <MessageSquare className="mr-2 h-3 w-3" />
                  {query}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md">
                <div className="p-4 rounded-full bg-gradient-primary w-fit mx-auto">
                  <Sparkles className="h-12 w-12 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold">How can I assist you today?</h2>
                <p className="text-muted-foreground">
                  Ask me anything - from setting reminders to answering questions!
                </p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={`max-w-[80%] p-4 ${
                    message.role === "user"
                      ? "bg-gradient-primary text-primary-foreground"
                      : "bg-card/80 backdrop-blur-sm border-primary/20"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </Card>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <Card className="max-w-[80%] p-4 bg-card/80 backdrop-blur-sm border-primary/20">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        <div className="px-6 py-3 border-t border-border/50 bg-card/30 backdrop-blur-sm">
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction("Set a reminder")}
              className="border-primary/20"
            >
              Set a reminder
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction("Check weather")}
              className="border-primary/20"
            >
              Check weather
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction("Latest news")}
              className="border-primary/20"
            >
              Latest news
            </Button>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-border/50 bg-card/30 backdrop-blur-sm">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
              className="flex-1 bg-secondary/50 border-primary/20"
              disabled={isLoading}
            />
            <Button
              onClick={() => navigate("/voice")}
              size="icon"
              variant="outline"
              className="border-primary/20"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSend}
              size="icon"
              className="bg-gradient-primary"
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
