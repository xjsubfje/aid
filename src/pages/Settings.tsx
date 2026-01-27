import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Volume2, Moon, Sun, Monitor, Trash2, Download } from "lucide-react";
import { useSettings, voiceOptions, languageOptions } from "@/contexts/SettingsContext";
import { downloadMyData } from "@/lib/exportUserData";

const Settings = () => {
  const { t } = useTranslation();
  const { settings, updateSettings, isLoading } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

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
        title: t("settings.settingsSaved"),
        description: t("settings.settingsSavedDescription"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("common.error"),
      });
    }
    setSaving(false);
  };

  const getThemeIcon = (theme: string) => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "dark":
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const handleDownloadMyData = async () => {
    setExporting(true);
    try {
      const filename = await downloadMyData();
      toast({
        title: t("settings.data.downloadStarted"),
        description: t("settings.data.downloadingAs", { filename }),
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: e?.message || t("common.error"),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("You must be signed in to delete your account.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        let msg = "Failed to delete account.";
        try {
          const data = await response.json();
          msg = data?.error || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      // Clean up local cached account list on this device
      localStorage.removeItem("recent_accounts_v2");
      localStorage.removeItem("recent_accounts");
      localStorage.removeItem("switch_to_email");

      await supabase.auth.signOut();

      toast({
        title: t("settings.danger.accountDeleted"),
        description: t("settings.danger.accountDeletedDescription"),
      });

      navigate("/auth");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: e?.message || t("common.error"),
      });
    } finally {
      setDeleting(false);
      setDeleteConfirmText("");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
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
              {t("nav.backToDashboard")}
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-8 text-foreground">{t("settings.title")}</h1>

          <div className="max-w-2xl space-y-6">
            {/* Appearance */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getThemeIcon(localSettings.theme)}
                  {t("settings.appearance.title")}
                </CardTitle>
                <CardDescription>{t("settings.appearance.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("settings.appearance.theme")}</Label>
                  <div className="flex gap-2">
                    {(["light", "dark", "auto"] as const).map((theme) => (
                      <Button
                        key={theme}
                        variant={localSettings.theme === theme ? "default" : "outline"}
                        className={`flex-1 capitalize ${
                          localSettings.theme === theme
                            ? "bg-gradient-primary"
                            : "border-primary/20 hover:bg-primary/10"
                        }`}
                        onClick={() =>
                          setLocalSettings({
                            ...localSettings,
                            theme,
                          })
                        }
                      >
                        {theme === "light" && <Sun className="h-4 w-4 mr-2" />}
                        {theme === "dark" && <Moon className="h-4 w-4 mr-2" />}
                        {theme === "auto" && <Monitor className="h-4 w-4 mr-2" />}
                        {t(`settings.appearance.${theme}`)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {localSettings.theme === "auto"
                      ? t("settings.appearance.autoDescription")
                      : t("settings.appearance.usingMode", { mode: t(`settings.appearance.${localSettings.theme}`) })}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Voice Settings */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  {t("settings.voice.title")}
                </CardTitle>
                <CardDescription>{t("settings.voice.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="voiceType">{t("settings.voice.voice")}</Label>
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
                    {t("settings.voice.voiceHint")}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Language & Region */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle>{t("settings.language.title")}</CardTitle>
                <CardDescription>{t("settings.language.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">{t("settings.language.label")}</Label>
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
                  <p className="text-xs text-muted-foreground">{t("settings.language.hint")}</p>
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle>{t("settings.notifications.title")}</CardTitle>
                <CardDescription>{t("settings.notifications.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifications">{t("settings.notifications.taskReminders")}</Label>
                    <p className="text-sm text-muted-foreground">{t("settings.notifications.taskRemindersHint")}</p>
                  </div>
                  <Switch
                    id="notifications"
                    checked={localSettings.notificationsEnabled}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, notificationsEnabled: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Your Data */}
            <Card className="bg-gradient-card backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  {t("settings.data.title")}
                </CardTitle>
                <CardDescription>{t("settings.data.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => void handleDownloadMyData()}
                  disabled={exporting}
                  className="w-full border-primary/20 hover:bg-primary/10"
                >
                  {exporting ? t("settings.data.preparing") : t("settings.data.download")}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("settings.data.hint")}
                </p>
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="bg-card/50 backdrop-blur-sm border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  {t("settings.danger.title")}
                </CardTitle>
                <CardDescription>{t("settings.danger.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={deleting}>
                      {deleting ? t("settings.danger.deleting") : t("settings.danger.deleteAccount")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("settings.danger.deleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("settings.danger.deleteDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-2">
                      <Label htmlFor="delete-confirm">{t("settings.danger.typeDelete")}</Label>
                      <Input
                        id="delete-confirm"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                      />
                    </div>

                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          void handleDeleteAccount();
                        }}
                        disabled={deleting || deleteConfirmText !== "DELETE"}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("settings.danger.deletePermanently")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-gradient-primary hover:opacity-90"
              size="lg"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? t("settings.saving") : t("settings.saveSettings")}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Settings;
