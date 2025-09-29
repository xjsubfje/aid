import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckSquare, Settings, Mic, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DashboardProps {
  username?: string;
}

const Dashboard = ({ username }: DashboardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You've been successfully signed out.",
    });
    navigate("/auth");
  };

  const menuItems = [
    {
      title: "Manage Tasks",
      description: "Create, edit, and organize your tasks",
      icon: CheckSquare,
      path: "/tasks",
      gradient: "from-blue-500 to-purple-600",
    },
    {
      title: "Voice Commands",
      description: "Use voice to interact with your assistant",
      icon: Mic,
      path: "/voice",
      gradient: "from-cyan-500 to-blue-600",
    },
    {
      title: "Settings",
      description: "Customize your assistant preferences",
      icon: Settings,
      path: "/settings",
      gradient: "from-purple-500 to-pink-600",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 opacity-50" />
      
      <div className="relative">
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-primary">
                <User className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Virtual Assistant</h1>
                <p className="text-sm text-muted-foreground">Welcome, {username || "User"}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="border-primary/20">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-12">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Main Menu</h2>
            <p className="text-muted-foreground">Choose an action to get started</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item) => (
              <Card
                key={item.path}
                className="group cursor-pointer transition-all duration-300 hover:shadow-glow hover:-translate-y-1 bg-gradient-card backdrop-blur-sm border-primary/20"
                onClick={() => navigate(item.path)}
              >
                <CardHeader>
                  <div className={`mb-4 p-3 rounded-xl bg-gradient-to-br ${item.gradient} w-fit group-hover:scale-110 transition-transform`}>
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {item.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="ghost" className="w-full group-hover:bg-primary/10 transition-colors">
                    Open →
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
