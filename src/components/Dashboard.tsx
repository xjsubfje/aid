import ChatInterface from "./ChatInterface";

interface DashboardProps {
  username?: string;
}

const Dashboard = ({ username }: DashboardProps) => {
  return <ChatInterface username={username} />;
};

export default Dashboard;
