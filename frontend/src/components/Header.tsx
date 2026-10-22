import React from "react";
import { useAuth } from "../context/AuthContext";
import { useWard } from "../context/WardContext";
import { ShieldCheck, User as UserIcon, LogOut, MapPin } from "lucide-react";

export const Header: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const { selectedWard, selectedRegion } = useWard();

  return (
    <header className="bg-gradient-to-r from-teal-800 via-teal-700 to-teal-900 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-md flex-shrink-0">
              <img src="/schnell-logo.png" alt="Schnell Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-wider text-white">SCHNELL</span>
                <span className="text-xs uppercase px-2 py-0.5 rounded bg-teal-900/60 text-teal-200 border border-teal-500/30 font-medium">
                  Pole Manager
                </span>
              </div>
              <p className="text-xs text-teal-100/70 hidden sm:block">
                Ward-Wise Pole Management &amp; Connectivity Dashboard
              </p>
            </div>
          </div>

          {/* Current Ward Quick Pill (if selected) */}
          {selectedWard && (
            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-teal-900/40 border border-teal-400/30 text-teal-100 text-xs">
              <MapPin className="w-3.5 h-3.5 text-teal-300" />
              <span>
                <strong className="text-white">{selectedRegion?.region_name}</strong> / {selectedWard.ward_number}
              </span>
            </div>
          )}

          {/* User profile & actions */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-right">
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-white">{user?.username}</p>
                <div className="flex items-center justify-end space-x-1">
                  {isAdmin ? (
                    <span className="inline-flex items-center text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">
                      <ShieldCheck className="w-3 h-3 mr-0.5" /> Administrator
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] font-medium text-teal-200 uppercase tracking-wider">
                      <UserIcon className="w-3 h-3 mr-0.5" /> Operator
                    </span>
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-teal-600 border border-teal-400/50 flex items-center justify-center text-white font-bold text-sm shadow">
                {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
              </div>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="p-2 rounded-lg bg-teal-900/40 hover:bg-teal-900 text-teal-200 hover:text-white border border-teal-600/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
