import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSettings, getVoiceId } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  const { settings } = useSettings();

  const speak = useCallback(async (text: string, messageId: string) => {
    // If already speaking this message, stop it
    if (isSpeaking === messageId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsSpeaking(null);
      return;
    }

    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsSpeaking(messageId);

    try {
      // Get the current user's session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const voiceId = getVoiceId(settings.voiceType);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ text, voiceId }),
        }
      );

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsSpeaking(null);
        URL.revokeObjectURL(audioUrl);
        toast({
          variant: "destructive",
          title: "Playback Error",
          description: "Failed to play audio.",
        });
      };

      await audio.play();
    } catch (error) {
      console.error("TTS error:", error);
      setIsSpeaking(null);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to convert text to speech.",
      });
    }
  }, [isSpeaking, toast, settings.voiceType]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(null);
  }, []);

  return { speak, stop, isSpeaking };
};
