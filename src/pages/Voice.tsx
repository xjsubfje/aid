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
            <Button variant="ghost" onClick={() => navigate("/")} className="gap-2 hover:bg-secondary/50">
              <ArrowLeft className="h-4 w-4 text-foreground" />
              <span className="text-foreground">Back to Dashboard</span>
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Voice Commands</h1>
          <p className="text-muted-foreground mb-8">Use your voice to interact with the assistant</p>

          <Card className="mb-8 bg-gradient-card backdrop-blur-sm border-primary/20 shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Voice Input</CardTitle>
              <CardDescription className="text-muted-foreground">
                Click the microphone and speak your command clearly
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 py-12">
              <div className="relative">
                <div className={`absolute inset-0 rounded-full ${isListening ? 'animate-ping bg-accent/20' : ''}`} />
                <Button
                  onClick={toggleListening}
                  size="lg"
                  disabled={!recognition}
                  className={`relative w-40 h-40 rounded-full transition-all shadow-elevated hover:scale-105 ${
                    isListening
                      ? "bg-gradient-accent animate-pulse"
                      : "bg-gradient-primary hover:opacity-90"
                  }`}
                >
                  {isListening ? (
                    <MicOff className="h-16 w-16" />
                  ) : (
                    <Mic className="h-16 w-16" />
                  )}
                </Button>
              </div>
              <div className="text-center space-y-2">
                <p className={`text-lg font-medium ${isListening ? 'text-accent animate-pulse' : 'text-foreground'}`}>
                  {isListening ? "🎤 Listening... Speak now" : "Click to start voice input"}
                </p>
                {!recognition && (
                  <p className="text-sm text-destructive">
                    Voice recognition is not supported in your browser
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card backdrop-blur-sm border-primary/20 shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Recent Commands</CardTitle>
              <CardDescription className="text-muted-foreground">
                Your voice command history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {commands.length === 0 ? (
                  <div className="text-center py-12">
                    <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      No commands yet. Try speaking a command!
                    </p>
                  </div>
                ) : (
                  commands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="p-4 rounded-xl bg-gradient-secondary border border-primary/10 hover:border-primary/20 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                          <Mic className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{cmd.command}</p>
                          {cmd.response && (
                            <p className="text-sm text-muted-foreground mt-1">{cmd.response}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(cmd.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
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
