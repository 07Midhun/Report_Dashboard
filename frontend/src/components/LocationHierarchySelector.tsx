import React from "react";
import { useWard } from "../context/WardContext";
import { 
  getAvailableMainLocations, 
  getAvailableRegions, 
  getAvailableZones, 
  getAvailableWards 
} from "../config/locationHierarchy";
import { MapPin, Building, Compass, Layers, CheckCircle } from "lucide-react";

interface Props {
  className?: string;
  variant?: "horizontal" | "stacked";
}

export const LocationHierarchySelector: React.FC<Props> = ({ 
  className = "",
  variant = "horizontal" 
}) => {
  const {
    selectedMainLocation,
    selectedDivision,
    selectedZone,
    selectedWard,
    setMainLocation,
    setDivision,
    setZone,
    setWardNumber,
  } = useWard();

  // Dynamic lists from single maintainable configuration
  const mainLocations = getAvailableMainLocations();
  const availableRegions = getAvailableRegions(selectedMainLocation);
  const availableZones = getAvailableZones(selectedMainLocation, selectedDivision);
  const availableWards = getAvailableWards(selectedMainLocation, selectedDivision, selectedZone);

  const containerLayout = variant === "stacked" 
    ? "flex flex-col space-y-3" 
    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3";

  return (
    <div className={`bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs ${className}`}>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <div className="flex items-center space-x-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">
          <Compass className="w-4 h-4 text-teal-600" />
          <span>Location Hierarchy Selection — Bangalore (BBMP)</span>
        </div>
        {selectedWard && (
          <div className="flex items-center space-x-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Active: {selectedWard.ward_number}</span>
          </div>
        )}
      </div>

      <div className={containerLayout}>
        {/* Tier 1: Main Location */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <Building className="w-3 h-3 text-slate-400" />
            <span>1. Main Location</span>
          </label>
          <select
            value={selectedMainLocation}
            onChange={(e) => setMainLocation(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
          >
            {mainLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Tier 2: Region */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <Layers className="w-3 h-3 text-slate-400" />
            <span>2. Region</span>
          </label>
          <select
            value={selectedDivision}
            disabled={!selectedMainLocation}
            onChange={(e) => setDivision(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition disabled:opacity-50 disabled:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
          >
            <option value="">-- Select Region --</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </select>
        </div>

        {/* Tier 3: Zone */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <Compass className="w-3 h-3 text-slate-400" />
            <span>3. Zone</span>
          </label>
          <select
            value={selectedZone}
            disabled={!selectedDivision || availableZones.length === 0}
            onChange={(e) => setZone(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition disabled:opacity-50 disabled:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
          >
            <option value="">-- Select Zone --</option>
            {availableZones.map((z) => (
              <option key={z.name} value={z.name}>
                {z.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tier 4: Ward */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center space-x-1">
            <MapPin className="w-3 h-3 text-slate-400" />
            <span>4. Ward</span>
          </label>
          <select
            value={selectedWard?.ward_number || ""}
            disabled={!selectedZone || availableWards.length === 0}
            onChange={(e) => setWardNumber(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition disabled:opacity-50 disabled:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
          >
            <option value="">-- Select Ward --</option>
            {availableWards.map((wNum) => (
              <option key={wNum} value={wNum}>
                {wNum}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
