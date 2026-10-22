import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck, Shield } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const data = await api.login(username, password);
      login(data.access_token, data.user);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo Card */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white p-2.5 border border-teal-400/30 backdrop-blur-md shadow-xl mx-auto">
            <img src="/schnell-logo.png" alt="Schnell Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-wider text-white">
            SCHNELL DASHBOARD
          </h1>
          <p className="text-xs text-teal-200/70">
            Ward-Wise Pole Management &amp; Connectivity Portal
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-800">Sign In to Dashboard</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your credentials to access reports and pole connectivity
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 text-white font-semibold text-sm shadow-md transition transform active:scale-[0.99] flex items-center justify-center space-x-2"
            >
              <span>{loading ? "Signing In..." : "Sign In"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Local Evaluation Quick Login Shortcuts */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Demo Access Credentials:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin", "Admin@12345")}
                className="p-2 rounded-lg border border-teal-200 bg-teal-50/60 hover:bg-teal-100 text-teal-800 text-left transition"
              >
                <div className="flex items-center space-x-1 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                  <span>Admin</span>
                </div>
                <span className="text-[10px] text-teal-600 font-mono">admin / Admin@12345</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("operator", "User@12345")}
                className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-left transition"
              >
                <div className="flex items-center space-x-1 font-bold">
                  <Shield className="w-3.5 h-3.5 text-slate-600" />
                  <span>Operator</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">operator / User@12345</span>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-teal-200/50 mt-6">
          Standalone Full-Stack Dashboard &bull; PostgreSQL 18 Local Storage
        </p>
      </div>
    </div>
  );
};
