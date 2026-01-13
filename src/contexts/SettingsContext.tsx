import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UserSettings {
  language: string;
  voiceType: string;
  notificationsEnabled: boolean;
  theme: "light" | "dark" | "auto";
}

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: UserSettings = {
  language: "en",
  voiceType: "george",
  notificationsEnabled: true,
  theme: "dark",
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Map voice types to ElevenLabs voice IDs
export const voiceOptions = [
  { value: "george", label: "George (Male, Clear)", voiceId: "JBFqnCBsd6RMkjVDRZzb" },
  { value: "sarah", label: "Sarah (Female, Warm)", voiceId: "EXAVITQu4vr4xnSDxMaL" },
  { value: "charlie", label: "Charlie (Male, Casual)", voiceId: "IKne3meq5aSn9XLyUdCD" },
  { value: "alice", label: "Alice (Female, British)", voiceId: "Xb7hH8MSUJpSbSDYk0k2" },
  { value: "brian", label: "Brian (Male, Deep)", voiceId: "nPczCjzI2devNBz1zQrb" },
  { value: "lily", label: "Lily (Female, Soft)", voiceId: "pFZP5JQG7iQjIQuC4Bku" },
];

export const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh", label: "中文" },
];

export const getVoiceId = (voiceType: string): string => {
  const voice = voiceOptions.find(v => v.value === voiceType);
  return voice?.voiceId || "JBFqnCBsd6RMkjVDRZzb";
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Apply theme to document
  useEffect(() => {
    const applyTheme = (theme: "light" | "dark" | "auto") => {
      const root = document.documentElement;
      
      if (theme === "auto") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.toggle("dark", prefersDark);
        root.classList.toggle("light", !prefersDark);
      } else {
        root.classList.toggle("dark", theme === "dark");
        root.classList.toggle("light", theme === "light");
      }
    };

    applyTheme(settings.theme);

    // Listen for system theme changes if auto
    if (settings.theme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("auto");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [settings.theme]);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data && !error) {
        setSettings({
          language: data.language || "en",
          voiceType: data.voice_type || "george",
          notificationsEnabled: data.notifications_enabled ?? true,
          theme: (data.theme as "light" | "dark" | "auto") || "dark",
        });
      }
      setIsLoading(false);
    };

    fetchSettings();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchSettings();
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("settings")
      .update({
        language: updatedSettings.language,
        voice_type: updatedSettings.voiceType,
        notifications_enabled: updatedSettings.notificationsEnabled,
        theme: updatedSettings.theme,
      })
      .eq("user_id", user.id);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
