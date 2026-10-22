import React, { useState, useEffect, useCallback } from "react";
import { useWard } from "../context/WardContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { 
  Home, ChevronDown, ChevronRight, MapPin, Search, 
  CheckCircle2, RefreshCw,
  Lightbulb, Zap,
  Layers, FolderPlus, Link2, X, Pencil
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const { 
    regions, 
    selectedWard, 
    selectWard, 
    clearSelection, 
    loadingRegions, 
    refreshHierarchy 
  } = useWard();
  const { isAdmin } = useAuth();

  // Track expanded divisions and zones
  const [expandedDivisions, setExpandedDivisions] = useState<Record<string, boolean>>({
    "Bommanahalli": true,
    "East": true,
  });

  const [expandedZones, setExpandedZones] = useState<Record<number, boolean>>({
    1: true, // Default expand Hebbal (id=1)
  });

  // Track expanded menu sections
  const [isHierarchyExpanded, setIsHierarchyExpanded] = useState(true);

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Hyperlinks state (synced with backend and cached in localStorage)
  const [omUrl, setOmUrl] = useState<string>(() => localStorage.getItem("schnell_om_url") || "");
  const [energyUrl, setEnergyUrl] = useState<string>(() => localStorage.getItem("schnell_energy_url") || "");
  
  // Link configuration modal state (Strictly Admin only)
  const [configModalItem, setConfigModalItem] = useState<{ title: string; key: string; currentUrl: string } | null>(null);
  const [inputUrl, setInputUrl] = useState("");

  // Admin add region state
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [newRegCode, setNewRegCode] = useState("");
  const [newRegName, setNewRegName] = useState("");
  const [formError, setFormError] = useState("");

  // Auto-expand zone when ward is selected
  useEffect(() => {
    if (selectedWard) {
      const reg = regions.find((r) => r.wards.some((w) => w.id === selectedWard.id));
      if (reg) {
        setExpandedZones((prev) => ({ ...prev, [reg.id]: true }));
        if (reg.division) {
          setExpandedDivisions((prev) => ({ ...prev, [reg.division]: true }));
        }
      }
    }
  }, [selectedWard, regions]);

  const toggleDivision = (division: string) => {
    setExpandedDivisions((prev) => ({
      ...prev,
      [division]: !prev[division],
    }));
  };

  const toggleZone = (zoneId: number) => {
    setExpandedZones((prev) => ({
      ...prev,
      [zoneId]: !prev[zoneId],
    }));
  };

  // Sync hyperlinks from backend API (keeps Admin & Operator synchronized in real time)
  const syncHyperlinks = useCallback(async () => {
    try {
      const data = await api.getHyperlinks();
      const backendOm = data.om_dashboard_url || "";
      const backendEnergy = data.energy_saving_report_url || "";

      // If backend has links, update state and local cache
      if (backendOm || backendEnergy) {
        setOmUrl(backendOm);
        setEnergyUrl(backendEnergy);
        if (backendOm) localStorage.setItem("schnell_om_url", backendOm);
        if (backendEnergy) localStorage.setItem("schnell_energy_url", backendEnergy);
      } else if (isAdmin) {
        // If backend is empty but admin previously configured in localStorage, auto-migrate to backend
        const localOm = localStorage.getItem("schnell_om_url") || "";
        const localEnergy = localStorage.getItem("schnell_energy_url") || "";
        if (localOm || localEnergy) {
          await api.updateHyperlinks({
            om_dashboard_url: localOm,
            energy_saving_report_url: localEnergy,
          });
          setOmUrl(localOm);
          setEnergyUrl(localEnergy);
        }
      }
    } catch (err) {
      console.warn("Could not sync backend hyperlinks", err);
    }
  }, [isAdmin]);

  // Initial fetch and automatic sync polling every 10s + window focus
  useEffect(() => {
    syncHyperlinks();
    const interval = setInterval(syncHyperlinks, 10000);
    const handleFocus = () => syncHyperlinks();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncHyperlinks]);

  const handleOpenHyperlink = (title: string, storageKey: string, currentUrl: string) => {
    if (currentUrl && currentUrl.trim() !== "" && currentUrl !== "#") {
      let target = currentUrl.trim();
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        target = `https://${target}`;
      }
      window.open(target, "_blank", "noopener,noreferrer");
    } else {
      if (isAdmin) {
        // Admin can configure URL
        setConfigModalItem({ title, key: storageKey, currentUrl });
        setInputUrl(currentUrl);
      } else {
        // Operator can only view and use, not edit
        alert(`The ${title} link has not been configured by the administrator yet.`);
      }
    }
  };

  const handleSaveHyperlink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configModalItem || !isAdmin) return;
    const trimmed = inputUrl.trim();
    const newOm = configModalItem.key === "om" ? trimmed : omUrl;
    const newEnergy = configModalItem.key === "energy" ? trimmed : energyUrl;

    try {
      await api.updateHyperlinks({
        om_dashboard_url: newOm,
        energy_saving_report_url: newEnergy,
      });

      if (configModalItem.key === "om") {
        setOmUrl(trimmed);
        localStorage.setItem("schnell_om_url", trimmed);
      } else if (configModalItem.key === "energy") {
        setEnergyUrl(trimmed);
        localStorage.setItem("schnell_energy_url", trimmed);
      }
      setConfigModalItem(null);
    } catch (err) {
      console.error("Failed to update backend hyperlinks", err);
      alert("Failed to save hyperlink to backend. Please check server connection.");
    }
  };

  const handleCreateRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      await api.createRegion(newRegCode.trim(), newRegName.trim());
      setNewRegCode("");
      setNewRegName("");
      setShowAddRegion(false);
      await refreshHierarchy();
    } catch (err: any) {
      setFormError(err.response?.data?.detail || "Failed to create region");
    }
  };

  // Group filtered regions by Division (Bommanahalli, East)
  const searchLower = searchTerm.toLowerCase();

  const processedRegions = regions.map((region) => {
    const matchesRegion =
      region.region_name.toLowerCase().includes(searchLower) ||
      region.region_code.toLowerCase().includes(searchLower) ||
      (region.division && region.division.toLowerCase().includes(searchLower));

    const filteredWards = region.wards.filter(
      (ward) =>
        matchesRegion ||
        ward.ward_code.toLowerCase().includes(searchLower) ||
        ward.ward_number.toLowerCase().includes(searchLower)
    );

    return {
      ...region,
      filteredWards,
      hasMatch: matchesRegion || filteredWards.length > 0,
    };
  }).filter((r) => r.hasMatch);

  const divisionGroups: { division: string; zones: typeof processedRegions }[] = [];
  const knownDivisions = ["Bommanahalli", "East"];

  knownDivisions.forEach((divName) => {
    const zonesInDiv = processedRegions.filter(
      (r) => (r.division || "").toLowerCase() === divName.toLowerCase()
    );
    if (zonesInDiv.length > 0 || !searchTerm) {
      divisionGroups.push({ division: divName, zones: zonesInDiv });
    }
  });

  const otherZones = processedRegions.filter(
    (r) => !knownDivisions.some((d) => d.toLowerCase() === (r.division || "").toLowerCase())
  );
  if (otherZones.length > 0) {
    divisionGroups.push({ division: "Other Regions", zones: otherZones });
  }

  // Render report status badge (e.g. 3/3, 2/3, 0/3)
  const renderReportBadge = (count: number, isSelected: boolean) => {
    if (count === 3) {
      return (
        <span
          title="All 3 reports uploaded (Lamp, Pole, Commission)"
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center tracking-tight ${
            isSelected
              ? "bg-emerald-600 text-white font-extrabold shadow-xs"
              : "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40"
          }`}
        >
          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
          3/3
        </span>
      );
    }
    if (count > 0) {
      return (
        <span
          title={`${count} of 3 reports uploaded`}
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center ${
            isSelected
              ? "bg-amber-600 text-white"
              : "bg-amber-500/25 text-amber-300 border border-amber-400/40"
          }`}
        >
          {count}/3
        </span>
      );
    }
    return (
      <span
        title="0 of 3 reports uploaded"
        className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-teal-950/70 text-teal-300/60 border border-teal-800/40"
      >
        0/3
      </span>
    );
  };

  return (
    <aside className="w-72 sm:w-80 bg-[#004e5a] text-white flex flex-col h-full shadow-lg flex-shrink-0 select-none border-r border-teal-900/60">
      {/* Scrollable Navigation Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-teal-800/50">
        
        {/* ================================================================= */}
        {/* TOP SYSTEM NAVIGATION MENU (Matching Reference Design)           */}
        {/* ================================================================= */}
        <div className="py-2 space-y-0.5">
          {/* 1. Home Navigation */}
          <button
            onClick={() => clearSelection()}
            className={`w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium transition text-left ${
              !selectedWard
                ? "bg-[#006373] text-white font-semibold border-l-4 border-teal-300 shadow-inner"
                : "text-teal-100 hover:bg-[#003e47] hover:text-white"
            }`}
          >
            <Home className="w-4 h-4 flex-shrink-0 text-teal-200" />
            <span>Home</span>
          </button>

          {/* 2. O&M Dashboard (Hyperlink) */}
          <div className="flex items-center group hover:bg-[#003e47] transition">
            <button
              onClick={() => handleOpenHyperlink("O&M Dashboard", "om", omUrl)}
              className="flex-1 flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-teal-100 group-hover:text-white text-left truncate"
            >
              <Lightbulb className="w-4 h-4 flex-shrink-0 text-amber-300" />
              <span className="truncate">O&amp;M Dashboard</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setConfigModalItem({ title: "O&M Dashboard", key: "om", currentUrl: omUrl });
                  setInputUrl(omUrl);
                }}
                title="Configure / Edit O&M Dashboard Link (Admin Only)"
                className="px-3 py-2 text-teal-300/60 hover:text-white hover:bg-teal-800/60 transition rounded"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 3. Energy Saving Report (Hyperlink) */}
          <div className="flex items-center group hover:bg-[#003e47] transition">
            <button
              onClick={() => handleOpenHyperlink("Energy Saving Report", "energy", energyUrl)}
              className="flex-1 flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-teal-100 group-hover:text-white text-left truncate"
            >
              <Zap className="w-4 h-4 flex-shrink-0 text-emerald-300" />
              <span className="truncate">Energy Saving Report</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setConfigModalItem({ title: "Energy Saving Report", key: "energy", currentUrl: energyUrl });
                  setInputUrl(energyUrl);
                }}
                title="Configure / Edit Energy Saving Report Link (Admin Only)"
                className="px-3 py-2 text-teal-300/60 hover:text-white hover:bg-teal-800/60 transition rounded"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* BANGALORE (BBMP) HIERARCHY: BOMMANAHALLI & EAST DROPDOWNS          */}
        {/* ================================================================= */}
        <div className="p-3 bg-[#00444f]/80">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setIsHierarchyExpanded(!isHierarchyExpanded)}
              className="flex items-center space-x-2 text-white font-bold text-xs uppercase tracking-wider text-left flex-1"
            >
              {isHierarchyExpanded ? (
                <ChevronDown className="w-4 h-4 text-teal-300" />
              ) : (
                <ChevronRight className="w-4 h-4 text-teal-300" />
              )}
              <span>Bangalore (BBMP)</span>
            </button>
            <button
              onClick={() => refreshHierarchy()}
              title="Refresh Wards"
              className="p-1 rounded text-teal-300 hover:text-white hover:bg-teal-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Bar for Wards */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-teal-300/70" />
            <input
              type="text"
              placeholder="Search wards or zones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#003942] border border-teal-700/60 rounded text-white placeholder-teal-300/50 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>

          {/* Admin Action: Add New Region */}
          {isAdmin && (
            <div className="mb-2">
              <button
                onClick={() => setShowAddRegion(!showAddRegion)}
                className="w-full flex items-center justify-center space-x-1 py-1 px-2 rounded text-[11px] font-medium text-teal-100 bg-[#003842] hover:bg-[#002f37] border border-teal-700/50 transition"
              >
                <FolderPlus className="w-3 h-3 text-teal-300" />
                <span>Add Region / Zone</span>
              </button>

              {showAddRegion && (
                <form onSubmit={handleCreateRegion} className="mt-2 p-2 bg-[#00313a] rounded border border-teal-700 text-xs space-y-2">
                  <input
                    type="text"
                    placeholder="Code (e.g. BLR)"
                    value={newRegCode}
                    onChange={(e) => setNewRegCode(e.target.value)}
                    required
                    className="w-full px-2 py-1 bg-[#00232a] border border-teal-800 rounded text-white"
                  />
                  <input
                    type="text"
                    placeholder="Zone / Region Name"
                    value={newRegName}
                    onChange={(e) => setNewRegName(e.target.value)}
                    required
                    className="w-full px-2 py-1 bg-[#00232a] border border-teal-800 rounded text-white"
                  />
                  {formError && <p className="text-[10px] text-rose-300">{formError}</p>}
                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddRegion(false)}
                      className="px-2 py-1 text-teal-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2 py-1 bg-teal-500 text-slate-900 rounded font-bold"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Wards Hierarchy Tree */}
          {isHierarchyExpanded && (
            <div className="space-y-1.5">
              {loadingRegions ? (
                <div className="py-4 text-center text-xs text-teal-300/70">Loading BBMP Wards...</div>
              ) : divisionGroups.length === 0 ? (
                <div className="py-4 text-center text-xs text-teal-300/70">No matching wards found</div>
              ) : (
                divisionGroups.map((group) => {
                  const isDivExpanded = searchTerm ? true : (expandedDivisions[group.division] ?? true);

                  return (
                    <div key={group.division} className="rounded border border-teal-800/80 bg-[#003d47] overflow-hidden">
                      {/* Level 2: Division Header (Bommanahalli / East) */}
                      <div
                        onClick={() => toggleDivision(group.division)}
                        className="flex items-center justify-between px-3 py-2 bg-[#003842] hover:bg-[#002f37] cursor-pointer transition select-none"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          {isDivExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-teal-300 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-teal-300/70 flex-shrink-0" />
                          )}
                          <Layers className="w-3.5 h-3.5 text-teal-300 flex-shrink-0" />
                          <span className="font-bold text-xs uppercase tracking-wide truncate text-teal-100">
                            {group.division}
                          </span>
                        </div>
                        <span className="text-[10px] text-teal-300/70 font-mono px-1.5 py-0.5 rounded bg-teal-950/60">
                          {group.zones.length} zones
                        </span>
                      </div>

                      {/* Level 3: Zones inside Division */}
                      {isDivExpanded && (
                        <div className="p-1 space-y-1 bg-[#00333d]">
                          {group.zones.map((zone) => {
                            const isZoneExpanded = searchTerm ? true : (expandedZones[zone.id] ?? false);

                            return (
                              <div key={zone.id} className="rounded bg-[#002b33] border border-teal-900/60 overflow-hidden">
                                {/* Zone Header */}
                                <div
                                  onClick={() => toggleZone(zone.id)}
                                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-[#00242b] cursor-pointer transition select-none"
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    {isZoneExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-teal-400 flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-teal-400/60 flex-shrink-0" />
                                    )}
                                    <span className="font-semibold text-xs text-teal-100 truncate">
                                      {zone.region_name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-teal-400/60 font-mono">
                                    {zone.filteredWards.length}w
                                  </span>
                                </div>

                                {/* Level 4: Wards List */}
                                {isZoneExpanded && (
                                  <div className="pl-2 pr-1 py-1 space-y-0.5 bg-[#002229] border-t border-teal-950 max-h-56 overflow-y-auto">
                                    {zone.filteredWards.length === 0 ? (
                                      <p className="py-1 text-[11px] text-teal-400/60 italic pl-3">No matching wards</p>
                                    ) : (
                                      zone.filteredWards.map((ward) => {
                                        const isSelected = selectedWard?.id === ward.id;

                                        return (
                                          <div
                                            key={ward.id}
                                            onClick={() => selectWard(ward, zone)}
                                            className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs transition ${
                                              isSelected
                                                ? "bg-teal-600 text-white font-bold shadow-sm"
                                                : "text-teal-200 hover:bg-[#002f37] hover:text-white"
                                            }`}
                                          >
                                            <div className="flex items-center space-x-1.5 truncate">
                                              <MapPin
                                                className={`w-3 h-3 flex-shrink-0 ${
                                                  isSelected ? "text-teal-100" : "text-teal-400/70"
                                                }`}
                                              />
                                              <span className="truncate font-semibold">{ward.ward_number}</span>
                                            </div>

                                            {/* Report upload status badge (e.g. 3/3, 2/3, 0/3) */}
                                            <div className="flex items-center space-x-1 flex-shrink-0">
                                              {renderReportBadge(ward.active_reports_count, isSelected)}
                                              {ward.total_poles_count > 0 && (
                                                <span
                                                  title={`${ward.total_poles_count} poles mapped`}
                                                  className={`text-[9px] px-1 rounded font-mono ${
                                                    isSelected
                                                      ? "bg-teal-800 text-teal-200"
                                                      : "bg-teal-950 text-teal-400/80"
                                                  }`}
                                                >
                                                  {ward.total_poles_count}p
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* HYPERLINK CONFIGURATION MODAL (Strictly Admin Only)              */}
      {/* ================================================================= */}
      {isAdmin && configModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-teal-800 font-bold text-sm">
                <Link2 className="w-4 h-4 text-teal-600" />
                <span>Configure {configModalItem.title} Link</span>
              </div>
              <button
                onClick={() => setConfigModalItem(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              You can provide the hyperlink for <strong>{configModalItem.title}</strong> below. Whenever clicked, it will seamlessly open this dashboard in a new tab.
            </p>

            <form onSubmit={handleSaveHyperlink} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hyperlink URL:
                </label>
                <input
                  type="text"
                  placeholder="https://your-om-dashboard-url.com"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfigModalItem(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition shadow-xs"
                >
                  Save Hyperlink
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
