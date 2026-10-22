import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { Region, Ward } from "../services/api";
import { BANGALORE_BBMP_HIERARCHY } from "../config/locationHierarchy";

interface WardContextType {
  regions: Region[];
  selectedRegion: Region | null; // Currently selected Zone Region object
  selectedWard: Ward | null;     // Currently selected Ward object
  selectedMainLocation: string;  // "Bangalore (BBMP)"
  selectedDivision: string;      // "Bommanahalli" | "East"
  selectedZone: string;          // "Hebbal", "Bommanahalli-Z1", etc.
  loadingRegions: boolean;
  selectWard: (ward: Ward, region: Region) => void;
  setMainLocation: (mainLoc: string) => void;
  setDivision: (division: string) => void;
  setZone: (zoneName: string) => void;
  setWardNumber: (wardNumber: string) => void;
  clearSelection: () => void;
  refreshHierarchy: () => Promise<void>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const WardContext = createContext<WardContextType | undefined>(undefined);

export const WardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  
  // 4-tier dropdown states
  const [selectedMainLocation, setSelectedMainLocation] = useState<string>("Bangalore (BBMP)");
  const [selectedDivision, setSelectedDivision] = useState<string>("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  
  const [loadingRegions, setLoadingRegions] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const refreshHierarchy = useCallback(async () => {
    try {
      setLoadingRegions(true);
      const data = await api.getRegions();
      setRegions(data);

      // Keep selection synced if already selected
      if (selectedWard) {
        for (const reg of data) {
          const matchingWard = reg.wards.find((w) => w.id === selectedWard.id);
          if (matchingWard) {
            setSelectedRegion(reg);
            setSelectedWard(matchingWard);
            setSelectedDivision(reg.division || "");
            setSelectedZone(reg.region_name || "");
            break;
          }
        }
      }
    } catch (err) {
      console.error("Failed to load regions hierarchy", err);
    } finally {
      setLoadingRegions(false);
    }
  }, [selectedWard]);

  useEffect(() => {
    refreshHierarchy();
  }, []);

  // When a ward is selected from anywhere (sidebar tree or dropdown)
  const selectWard = (ward: Ward, region: Region) => {
    setSelectedRegion(region);
    setSelectedWard(ward);
    setSelectedMainLocation(region.corporation || BANGALORE_BBMP_HIERARCHY.mainLocation);
    setSelectedDivision(region.division || "");
    setSelectedZone(region.region_name);
  };

  // Changing Main Location
  const setMainLocation = (mainLoc: string) => {
    setSelectedMainLocation(mainLoc);
    // Clear downstream selections when parent selection changes
    setSelectedDivision("");
    setSelectedZone("");
    setSelectedWard(null);
    setSelectedRegion(null);
  };

  // Changing Division / Region (Bommanahalli or East)
  const setDivision = (division: string) => {
    setSelectedDivision(division);
    // Clear downstream selections
    setSelectedZone("");
    setSelectedWard(null);
    setSelectedRegion(null);
  };

  // Changing Zone
  const setZone = (zoneName: string) => {
    setSelectedZone(zoneName);
    // Clear downstream ward selection
    setSelectedWard(null);

    // Find corresponding Region entity in backend data
    const matchedRegion = regions.find(
      (r) => r.region_name.toLowerCase() === zoneName.toLowerCase() ||
             r.region_code.toLowerCase() === zoneName.toLowerCase()
    );
    setSelectedRegion(matchedRegion || null);
  };

  // Changing Ward Number (e.g. "W64")
  const setWardNumber = (wardNumber: string) => {
    if (!selectedZone) return;

    // Find the zone region
    const matchedRegion = selectedRegion || regions.find(
      (r) => r.region_name.toLowerCase() === selectedZone.toLowerCase() ||
             r.region_code.toLowerCase() === selectedZone.toLowerCase()
    );

    if (matchedRegion) {
      const matchedWard = matchedRegion.wards.find(
        (w) => w.ward_number.toUpperCase() === wardNumber.toUpperCase()
      );
      if (matchedWard) {
        setSelectedRegion(matchedRegion);
        setSelectedWard(matchedWard);
        return;
      }
    }
  };

  const clearSelection = () => {
    setSelectedMainLocation(BANGALORE_BBMP_HIERARCHY.mainLocation);
    setSelectedDivision("");
    setSelectedZone("");
    setSelectedRegion(null);
    setSelectedWard(null);
  };

  return (
    <WardContext.Provider
      value={{
        regions,
        selectedRegion,
        selectedWard,
        selectedMainLocation,
        selectedDivision,
        selectedZone,
        loadingRegions,
        selectWard,
        setMainLocation,
        setDivision,
        setZone,
        setWardNumber,
        clearSelection,
        refreshHierarchy,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </WardContext.Provider>
  );
};

export const useWard = () => {
  const context = useContext(WardContext);
  if (!context) {
    throw new Error("useWard must be used within a WardProvider");
  }
  return context;
};
