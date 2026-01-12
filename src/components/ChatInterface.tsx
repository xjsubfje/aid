import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Settings, ListTodo, MessageSquare, Bell, History } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { requestNotificationPermission } from "@/lib/notifications";
import { ConversationSidebar } from "./ConversationSidebar";
import { AccountSwitcher } from "./AccountSwitcher";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const getUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
      }
    };
    getUserEmail();
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
    conversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  const loadConversation = async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data.map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content })));
    }
  };

  const generateConversationTitle = async (firstMessage: string, conversationId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const TITLE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-title`;
      await fetch(TITLE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ firstMessage, conversationId }),
      });
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  };

  const saveMessage = async (
    role: "user" | "assistant",
    content: string,
    conversationIdOverride?: string | null
  ) => {
    let targetConversationId = conversationIdOverride ?? currentConversationId ?? conversationIdRef.current;
    let isNewConversation = false;

    if (!targetConversationId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const title = "New conversation";
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title })
        .select()
        .single();

      if (error || !conversation) return null;
      setCurrentConversationId(conversation.id);
      conversationIdRef.current = conversation.id;
      targetConversationId = conversation.id;
      isNewConversation = true;
    }

    await supabase.from("messages").insert({
      conversation_id: targetConversationId,
      role,
      content,
    });

    // Generate AI title for new conversations after first user message
    if (isNewConversation && role === "user") {
      generateConversationTitle(content, targetConversationId);
    }

    return targetConversationId;
  };

  const streamChat = async (userMessage: string) => {
    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    const convId = await saveMessage("user", userMessage);

    try {
      // Get the user's session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          variant: "destructive",
          title: "Not authenticated",
          description: "Please sign in to use the chat.",
        });
        setIsLoading(false);
        return;
      }

      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            variant: "destructive",
            title: "Rate limit exceeded",
            description: "Please try again later.",
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

      if (assistantContent && (convId || currentConversationId || conversationIdRef.current)) {
        await saveMessage("assistant", assistantContent, convId ?? currentConversationId ?? conversationIdRef.current);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setShowHistory(false);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
    setShowHistory(false);
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
  };

  const suggestions = [
    "What's the weather like?",
    "Set a reminder for tomorrow at 9am",
    "Create a task to buy groceries",
    "What's on my task list?",
  ];

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      toast({
        title: "Notifications Enabled",
        description: "You'll receive reminders for your tasks!",
      });
    } else {
      toast({
        title: "Notifications Blocked",
        description: "Please enable notifications in your browser settings.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-screen bg-background relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] animate-float" style={{ animationDelay: "1s" }}></div>
      </div>

      {/* Sidebar */}
      <div className="relative w-72 border-r border-border/50 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur-2xl flex flex-col">
        {/* User Profile Section */}
        <div className="p-4 border-b border-border/50">
          <AccountSwitcher />
        </div>

        <div className="p-6 pb-4">
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent animate-gradient">
            Virtual Assistant
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Your AI-powered companion</p>
        </div>

        <nav className="space-y-1 flex-1 px-3">
          <Button
            variant="ghost"
            className="w-full justify-start group hover:bg-primary/10 transition-all"
            onClick={handleNewConversation}
          >
            <MessageSquare className="mr-2 h-4 w-4 group-hover:text-primary transition-colors" />
            <span className="text-foreground">New Chat</span>
          </Button>
          <Sheet open={showHistory} onOpenChange={setShowHistory}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start group hover:bg-primary/10 transition-all"
              >
                <History className="mr-2 h-4 w-4 group-hover:text-primary transition-colors" />
                <span className="text-foreground">Chat History</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 bg-card border-primary/20">
              <ConversationSidebar
                currentConversationId={currentConversationId}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
              />
            </SheetContent>
          </Sheet>
          <Button
            variant="ghost"
            className="w-full justify-start group hover:bg-primary/10 transition-all"
            onClick={() => navigate("/tasks")}
          >
            <ListTodo className="mr-2 h-4 w-4 group-hover:text-primary transition-colors" />
            <span className="text-foreground">Tasks</span>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start group hover:bg-primary/10 transition-all"
            onClick={() => navigate("/voice")}
          >
            <MessageSquare className="mr-2 h-4 w-4 group-hover:text-primary transition-colors" />
            <span className="text-foreground">Voice Commands</span>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start group hover:bg-primary/10 transition-all"
            onClick={() => navigate("/settings")}
          >
            <Settings className="mr-2 h-4 w-4 group-hover:text-primary transition-colors" />
            <span className="text-foreground">Settings</span>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start group hover:bg-accent/10 transition-all"
            onClick={handleEnableNotifications}
          >
            <Bell className="mr-2 h-4 w-4 group-hover:text-accent transition-colors" />
            <span className="text-foreground">Notifications</span>
          </Button>
        </nav>

        <div className="mt-auto space-y-2 p-4 mx-3 mb-4 bg-gradient-secondary rounded-2xl border border-primary/10">
          <p className="text-sm font-semibold mb-3 text-primary">Quick Actions</p>
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => setInput(suggestion)}
              className="text-xs text-left w-full p-3 rounded-xl bg-background/30 hover:bg-background/60 border border-border/50 hover:border-primary/30 transition-all duration-200 hover:scale-[1.02] text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="relative flex-1 flex flex-col">
        <ScrollArea className="flex-1 p-8" ref={scrollRef}>
          <div className="max-w-4xl mx-auto space-y-8">
            {messages.length === 0 && (
              <div className="text-center py-32">
                <div className="inline-block p-4 rounded-3xl bg-gradient-primary mb-6 shadow-glow">
                  <MessageSquare className="w-16 h-16 text-primary-foreground" />
                </div>
                <h2 className="text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent animate-gradient">
                  How can I assist you today?
                </h2>
                <p className="text-muted-foreground text-lg">
                  I'm your AI-powered companion, ready to help with tasks, reminders, and more.
                </p>
              </div>
            )}

            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex gap-4 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-in fade-in slide-in-from-bottom-4 duration-500`}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                      <MessageSquare className="w-5 h-5 text-primary-foreground" />
                    </div>
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-3xl p-5 ${
                    message.role === "user"
                      ? "bg-gradient-primary text-primary-foreground shadow-elevated"
                      : "bg-gradient-secondary border border-primary/20 backdrop-blur-xl"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                </div>
                {message.role === "user" && (
                  <div className="flex-shrink-0">
                    <Avatar className="w-10 h-10 ring-2 ring-primary/50">
                      <AvatarFallback className="bg-gradient-accent text-primary-foreground">
                        {userEmail ? userEmail[0].toUpperCase() : "U"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border/50 bg-card/50 backdrop-blur-2xl p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 mb-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleQuickAction("Set a reminder for tomorrow")}
                className="border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all"
              >
                Set a reminder
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleQuickAction("What's the weather today?")}
                className="border-accent/30 hover:bg-accent/10 hover:border-accent/50 transition-all"
              >
                Check weather
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleQuickAction("Show my tasks")}
                className="border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all"
              >
                My tasks
              </Button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask me anything..."
                  className="min-h-[70px] resize-none rounded-2xl border-primary/20 bg-background/50 backdrop-blur-sm focus:border-primary/50 transition-all pr-4"
                  disabled={isLoading}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="h-[70px] px-6 bg-gradient-primary hover:opacity-90 shadow-glow transition-all hover:scale-105 rounded-2xl"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
