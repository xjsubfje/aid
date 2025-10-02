import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { ChevronDown, Plus, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StoredAccount {
  email: string;
  lastUsed: string;
}

export const AccountSwitcher = () => {
  const [currentEmail, setCurrentEmail] = useState("");
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    getCurrentUser();
    loadStoredAccounts();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setCurrentEmail(user.email);
      updateAccountsList(user.email);
    }
  };

  const loadStoredAccounts = () => {
    const stored = localStorage.getItem("recent_accounts");
    if (stored) {
      setAccounts(JSON.parse(stored));
    }
  };

  const updateAccountsList = (email: string) => {
    const stored = localStorage.getItem("recent_accounts");
    let accountsList: StoredAccount[] = stored ? JSON.parse(stored) : [];
    
    // Remove if already exists
    accountsList = accountsList.filter(acc => acc.email !== email);
    
    // Add to front
    accountsList.unshift({ email, lastUsed: new Date().toISOString() });
    
    // Keep only last 5 accounts
    accountsList = accountsList.slice(0, 5);
    
    localStorage.setItem("recent_accounts", JSON.stringify(accountsList));
    setAccounts(accountsList);
  };

  const handleSwitchAccount = async (email: string) => {
    if (email === currentEmail) return;

    await supabase.auth.signOut();
    toast({
      title: "Switched account",
      description: `Please sign in as ${email}`,
    });
    navigate("/auth");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You have been signed out successfully.",
    });
    navigate("/auth");
  };

  const handleAddAccount = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-between gap-2 h-auto p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-primary/50">
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
                {currentEmail ? currentEmail[0].toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate text-foreground">{currentEmail || "User"}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 bg-card/95 backdrop-blur-xl border-primary/20" align="start">
        <DropdownMenuLabel className="text-foreground">Current Account</DropdownMenuLabel>
        <DropdownMenuItem disabled className="bg-gradient-secondary border border-primary/20">
          <Avatar className="h-8 w-8 mr-2">
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs">
              {currentEmail ? currentEmail[0].toUpperCase() : "U"}
            </AvatarFallback>
          </Avatar>
          <span className="text-foreground">{currentEmail}</span>
        </DropdownMenuItem>
        
        {accounts.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-foreground">Recent Accounts</DropdownMenuLabel>
            {accounts.slice(1).map((account) => (
              <DropdownMenuItem
                key={account.email}
                onClick={() => handleSwitchAccount(account.email)}
                className="cursor-pointer hover:bg-secondary/50"
              >
                <Avatar className="h-8 w-8 mr-2">
                  <AvatarFallback className="bg-secondary text-foreground text-xs">
                    {account.email[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-foreground">{account.email}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleAddAccount} className="cursor-pointer hover:bg-secondary/50">
          <Plus className="h-4 w-4 mr-2 text-primary" />
          <span className="text-foreground">Add another account</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer hover:bg-destructive/10">
          <LogOut className="h-4 w-4 mr-2 text-destructive" />
          <span className="text-destructive">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
