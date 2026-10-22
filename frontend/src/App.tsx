import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { WardProvider } from "./context/WardContext";
import { LoginPage } from "./components/LoginPage";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { WardDashboard } from "./components/WardDashboard";
import { OperatorReportsDashboard } from "./components/OperatorReportsDashboard";
import { Activity } from "lucide-react";

const AppContent: React.FC = () => {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4 text-white">
        <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center animate-pulse shadow-lg text-teal-300">
          <Activity className="w-8 h-8 animate-spin" />
        </div>
        <p className="text-sm font-medium tracking-wide text-teal-200">
          Loading Schnell Dashboard...
        </p>
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 font-sans antialiased text-slate-800">
      {/* Schnell Teal Header */}
      <Header />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar with Home, O&M Dashboard, Energy Saving Report & BBMP Hierarchy */}
        <Sidebar />

        {/* Right Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {user.role === "admin" ? (
            <WardDashboard />
          ) : (
            <OperatorReportsDashboard />
          )}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WardProvider>
        <AppContent />
      </WardProvider>
    </AuthProvider>
  );
}
