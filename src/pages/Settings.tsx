import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Volume2, Moon, Sun, Monitor } from "lucide-react";
import { useSettings, voiceOptions, languageOptions } from "@/contexts/SettingsContext";

const Settings = () => {
  const { settings, updateSettings, isLoading } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(localSettings);
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings",
      });
    }
    setSaving(false);
  };

  const getThemeIcon = (theme: string) => {
    switch (theme) {
      case "light": return <Sun className="h-4 w-4" />;
      case "dark": return <Moon className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold mb-8 text-foreground">Settings</h1>

          <div className="max-w-2xl space-y-6">
            {/* Appearance */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getThemeIcon(localSettings.theme)}
                  Appearance
                </CardTitle>
                <CardDescription>Customize how the app looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex gap-2">
                    {["light", "dark", "auto"].map((theme) => (
                      <Button
                        key={theme}
                        variant={localSettings.theme === theme ? "default" : "outline"}
                        className={`flex-1 capitalize ${
                          localSettings.theme === theme 
                            ? "bg-gradient-primary" 
                            : "border-primary/20 hover:bg-primary/10"
                        }`}
                        onClick={() => setLocalSettings({ ...localSettings, theme: theme as "light" | "dark" | "auto" })}
                      >
                        {theme === "light" && <Sun className="h-4 w-4 mr-2" />}
                        {theme === "dark" && <Moon className="h-4 w-4 mr-2" />}
                        {theme === "auto" && <Monitor className="h-4 w-4 mr-2" />}
                        {theme}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {localSettings.theme === "auto" 
                      ? "Theme will match your system preference" 
                      : `Using ${localSettings.theme} mode`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Voice Settings */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  Voice Settings
                </CardTitle>
                <CardDescription>Customize the text-to-speech voice</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="voiceType">Voice</Label>
                  <Select 
                    value={localSettings.voiceType} 
                    onValueChange={(value) => setLocalSettings({ ...localSettings, voiceType: value })}
                  >
                    <SelectTrigger className="bg-secondary/50 border-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((voice) => (
                        <SelectItem key={voice.value} value={voice.value}>
                          {voice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This voice will be used when you click "Listen" on AI messages
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Language & Region */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle>Language & Region</CardTitle>
                <CardDescription>Set your preferred language for the assistant</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Assistant Language</Label>
                  <Select 
                    value={localSettings.language} 
                    onValueChange={(value) => setLocalSettings({ ...localSettings, language: value })}
                  >
                    <SelectTrigger className="bg-secondary/50 border-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The AI assistant will respond in this language
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Manage notification preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifications">Task Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive browser notifications for task reminders
                    </p>
                  </div>
                  <Switch
                    id="notifications"
                    checked={localSettings.notificationsEnabled}
                    onCheckedChange={(checked) => 
                      setLocalSettings({ ...localSettings, notificationsEnabled: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-gradient-primary hover:opacity-90"
              size="lg"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Settings;
