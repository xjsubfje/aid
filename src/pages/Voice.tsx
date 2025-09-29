import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mic, MicOff } from "lucide-react";

interface VoiceCommand {
  id: string;
  command: string;
  response: string | null;
  created_at: string;
}

const Voice = () => {
  const [isListening, setIsListening] = useState(false);
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const [recognition, setRecognition] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchCommands();
    
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;

      recognitionInstance.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        await handleVoiceCommand(transcript);
      };

      recognitionInstance.onerror = (event: any) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to recognize speech",
        });
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    } else {
      toast({
        variant: "destructive",
        title: "Not supported",
        description: "Speech recognition is not supported in your browser",
      });
    }
  }, []);

  const fetchCommands = async () => {
    const { data, error } = await supabase
      .from("voice_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!error && data) {
      setCommands(data);
    }
  };

  const handleVoiceCommand = async (command: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const response = `Received command: "${command}"`;

    const { error } = await supabase.from("voice_commands").insert({
      user_id: user.id,
      command,
      response,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save command",
      });
    } else {
      toast({
        title: "Command processed",
        description: response,
      });
      fetchCommands();
    }
  };

  const toggleListening = () => {
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
      toast({
        title: "Listening...",
        description: "Speak your command now",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 opacity-50" />
      
      <div className="relative">
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-8">Voice Commands</h1>

          <Card className="mb-8 bg-gradient-card backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle>Voice Input</CardTitle>
              <CardDescription>Click the button and speak your command</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Button
                onClick={toggleListening}
                size="lg"
                className={`w-32 h-32 rounded-full transition-all ${
                  isListening
                    ? "bg-gradient-accent animate-pulse shadow-glow"
                    : "bg-gradient-primary"
                }`}
              >
                {isListening ? (
                  <MicOff className="h-12 w-12" />
                ) : (
                  <Mic className="h-12 w-12" />
                )}
              </Button>
              <p className="text-center text-muted-foreground">
                {isListening ? "Listening... Speak now" : "Click to start listening"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle>Recent Commands</CardTitle>
              <CardDescription>Your voice command history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {commands.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No commands yet. Try speaking a command!
                  </p>
                ) : (
                  commands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="p-4 rounded-lg bg-secondary/50 border border-primary/10"
                    >
                      <p className="font-medium">{cmd.command}</p>
                      {cmd.response && (
                        <p className="text-sm text-muted-foreground mt-1">{cmd.response}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(cmd.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Voice;
