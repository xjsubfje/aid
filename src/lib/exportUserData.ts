import { supabase } from "@/integrations/supabase/client";

type PageSize = 1000;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[] | null>
): Promise<T[]> {
  const pageSize: PageSize = 1000;
  const out: T[] = [];

  let from = 0;
  // Safety cap to avoid infinite loops if the backend behaves unexpectedly
  for (let i = 0; i < 1000; i++) {
    const to = from + pageSize - 1;
    const rows = (await fetchPage(from, to)) ?? [];
    out.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return out;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadMyData(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    throw new Error("You must be signed in to download your data.");
  }

  const userId = session.user.id;

  const [{ data: profile, error: profileError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (settingsError) throw settingsError;

  const tasks = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data;
  });

  const conversations = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data;
  });

  const voiceCommands = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("voice_commands")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data;
  });

  const messagesByConversation: Record<string, unknown[]> = {};
  for (const conv of conversations) {
    const conversationId = (conv as any).id as string | undefined;
    if (!conversationId) continue;

    const messages = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data;
    });

    messagesByConversation[conversationId] = messages as unknown[];
  }

  const exportedAt = new Date().toISOString();
  const filename = `my-data-${exportedAt.replace(/[:.]/g, "-")}.json`;

  const exportPayload = {
    exported_at: exportedAt,
    user: {
      id: userId,
      email: session.user.email ?? null,
    },
    profile: profile ?? null,
    settings: settings ?? null,
    tasks,
    conversations,
    messages_by_conversation: messagesByConversation,
    voice_commands: voiceCommands,
  };

  downloadJson(filename, exportPayload);
  return filename;
}
