import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationSidebar = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationSidebarProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setConversations(data);
    }
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const deleteConversation = async () => {
    if (!conversationToDelete) return;

    // First delete all messages in the conversation
    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationToDelete);

    if (messagesError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete conversation messages",
      });
      return;
    }

    // Then delete the conversation
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationToDelete);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete conversation",
      });
    } else {
      toast({
        title: "Conversation deleted",
        description: "Your conversation has been removed.",
      });
      fetchConversations();
      if (currentConversationId === conversationToDelete) {
        onNewConversation();
      }
    }

    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/50">
        <Button
          onClick={onNewConversation}
          className="w-full bg-gradient-primary hover:opacity-90"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all hover:bg-secondary/50 ${
                currentConversationId === conv.id
                  ? "bg-gradient-secondary border border-primary/20"
                  : ""
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="text-sm truncate text-foreground">{conv.title}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => confirmDelete(conv.id, e)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteConversation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
