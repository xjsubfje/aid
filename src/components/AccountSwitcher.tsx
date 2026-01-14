import { useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY_V2 = "recent_accounts_v2";
const STORAGE_KEY_LEGACY = "recent_accounts";

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

interface StoredAccount {
  userId: string;
  email: string;
  username: string;
  lastUsed: string;
  tokens?: StoredTokens;
}

const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const loadAccountsFromStorage = (): StoredAccount[] => {
  // Prefer v2
  const v2 = safeJsonParse<StoredAccount[]>(localStorage.getItem(STORAGE_KEY_V2), []);
  if (Array.isArray(v2) && v2.length > 0) return v2;

  // Migrate legacy if present
  const legacy = safeJsonParse<any[]>(localStorage.getItem(STORAGE_KEY_LEGACY), []);
  if (!Array.isArray(legacy) || legacy.length === 0) return [];

  // Legacy shape: { email, username, lastUsed, hasSession }
  const migrated: StoredAccount[] = legacy
    .filter((a) => a && typeof a.email === "string")
    .map((a) => ({
      userId: a.userId || a.id || a.email, // fallback; won't quick-switch without real userId
      email: a.email,
      username: a.username || a.email.split("@")[0],
      lastUsed: a.lastUsed || new Date().toISOString(),
      tokens: undefined,
    }));

  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated.slice(0, 5)));
  return migrated.slice(0, 5);
};

const saveAccountsToStorage = (accounts: StoredAccount[]) => {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(accounts.slice(0, 5)));
};

export const AccountSwitcher = () => {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentEmail, setCurrentEmail] = useState<string>("");
  const [currentUsername, setCurrentUsername] = useState<string>("");
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);

  const navigate = useNavigate();
  const { toast } = useToast();

  const currentInitial = useMemo(() => {
    const source = currentUsername || currentEmail;
    return source?.[0]?.toUpperCase() || "U";
  }, [currentEmail, currentUsername]);

  const fetchUsername = async (userId: string, email?: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    return profile?.username || (email ? email.split("@")[0] : "User");
  };

  const upsertAccount = (account: StoredAccount) => {
    setAccounts((prev) => {
      const list = prev.length ? [...prev] : loadAccountsFromStorage();
      const filtered = list.filter((a) => a.email !== account.email);
      const next = [account, ...filtered].slice(0, 5);
      saveAccountsToStorage(next);
      return next;
    });
  };

  useEffect(() => {
    // Load stored accounts ASAP
    setAccounts(loadAccountsFromStorage());

    // Track session changes so we can quick switch without re-entering passwords.
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user?.id || !user.email) return;

      const username = await fetchUsername(user.id, user.email);

      setCurrentUserId(user.id);
      setCurrentEmail(user.email);
      setCurrentUsername(username);

      upsertAccount({
        userId: user.id,
        email: user.email,
        username,
        lastUsed: new Date().toISOString(),
        tokens: session
          ? {
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              expiresAt: session.expires_at,
            }
          : undefined,
      });
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        const user = session?.user;
        if (!user?.id || !user.email || !session) return;

        const username = await fetchUsername(user.id, user.email);

        setCurrentUserId(user.id);
        setCurrentEmail(user.email);
        setCurrentUsername(username);

        upsertAccount({
          userId: user.id,
          email: user.email,
          username,
          lastUsed: new Date().toISOString(),
          tokens: {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at,
          },
        });
      }

      if (event === "SIGNED_OUT") {
        setCurrentUserId("");
        setCurrentEmail("");
        setCurrentUsername("");
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchAccount = async (account: StoredAccount) => {
    if (!account?.email) return;
    if (account.email === currentEmail) return;

    if (account.tokens?.accessToken && account.tokens?.refreshToken) {
      toast({
        title: "Switching account",
        description: `Switching to ${account.username || account.email}...`,
      });

      const { error } = await supabase.auth.setSession({
        access_token: account.tokens.accessToken,
        refresh_token: account.tokens.refreshToken,
      });

      if (error) {
        // Fallback to manual login
        localStorage.setItem("switch_to_email", account.email);
        toast({
          variant: "destructive",
          title: "Quick switch failed",
          description: "Please sign in again to continue.",
        });
        navigate(`/auth?mode=switch&email=${encodeURIComponent(account.email)}`);
        return;
      }

      navigate("/");
      return;
    }

    // No tokens stored for this account -> require password
    localStorage.setItem("switch_to_email", account.email);
    toast({
      title: "Sign in required",
      description: `Please sign in as ${account.username || account.email}.`,
    });
    navigate(`/auth?mode=switch&email=${encodeURIComponent(account.email)}`);
  };

  const handleLogout = async () => {
    // Remove tokens for current user so quick switch isn't possible after explicit logout.
    setAccounts((prev) => {
      const next = prev.map((a) =>
        a.email === currentEmail ? { ...a, tokens: undefined, lastUsed: new Date().toISOString() } : a
      );
      saveAccountsToStorage(next);
      return next;
    });

    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/auth");
  };

  const handleAddAccount = () => {
    // Important: don't sign out. We want the existing session to remain valid so we can quick switch back.
    navigate("/auth?mode=add");
  };

  const recentAccounts = useMemo(() => {
    // Prefer showing other accounts first; ensure stable ordering with current account on top.
    return accounts
      .filter((a) => a.email !== currentEmail)
      .sort((a, b) => (b.lastUsed || "").localeCompare(a.lastUsed || ""));
  }, [accounts, currentEmail]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-between gap-2 h-auto p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-primary/50">
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
                {currentInitial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate text-foreground">{currentUsername || "User"}</p>
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
              {currentInitial}
            </AvatarFallback>
          </Avatar>
          <span className="text-foreground">{currentUsername || currentEmail || "User"}</span>
        </DropdownMenuItem>

        {recentAccounts.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-foreground">Other Accounts</DropdownMenuLabel>
            {recentAccounts.map((account) => {
              const initial = (account.username || account.email)?.[0]?.toUpperCase() || "U";
              const canQuickSwitch = Boolean(account.tokens?.refreshToken && account.tokens?.accessToken);

              return (
                <DropdownMenuItem
                  key={`${account.userId}-${account.email}`}
                  onClick={() => handleSwitchAccount(account)}
                  className="cursor-pointer hover:bg-secondary/50"
                >
                  <Avatar className="h-8 w-8 mr-2">
                    <AvatarFallback className="bg-secondary text-foreground text-xs">{initial}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-foreground">{account.username || account.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {canQuickSwitch ? "Quick switch" : "Password required"}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
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
