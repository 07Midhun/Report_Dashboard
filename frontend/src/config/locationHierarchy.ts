// Single maintainable configuration for Bangalore (BBMP) Location Hierarchy
// Required structure:
// Level 1: Main Location -> Bangalore (BBMP)
// Level 2: Region -> Bommanahalli | East
// Level 3: Zone -> Bommanahalli-Z1 | CVRamanNagar, Hebbal, PulakeshiNagar, SarvagnaNagar, ShanthiNagar, SivajiNagar
// Level 4: Wards -> strictly assigned ranges

export interface ZoneConfig {
  name: string;
  code: string;
  startWard: number;
  endWard: number;
}

export interface RegionConfig {
  name: string;
  zones: ZoneConfig[];
}

export interface LocationConfig {
  mainLocation: string;
  regions: RegionConfig[];
}

export const BANGALORE_BBMP_HIERARCHY: LocationConfig = {
  mainLocation: "Bangalore (BBMP)",
  regions: [
    {
      name: "Bommanahalli",
      zones: [
        {
          name: "Bommanahalli-Z1",
          code: "BOM-Z1",
          startWard: 202,
          endWard: 212,
        },
      ],
    },
    {
      name: "East",
      zones: [
        {
          name: "CVRamanNagar",
          code: "CVRN",
          startWard: 108,
          endWard: 115,
        },
        {
          name: "Hebbal",
          code: "HEB",
          startWard: 61,
          endWard: 68,
        },
        {
          name: "PulakeshiNagar",
          code: "PKN",
          startWard: 69,
          endWard: 74,
        },
        {
          name: "SarvagnaNagar",
          code: "SVN",
          startWard: 76,
          endWard: 85,
        },
        {
          name: "ShanthiNagar",
          code: "STN",
          startWard: 166,
          endWard: 172,
        },
        {
          name: "SivajiNagar",
          code: "SJN",
          startWard: 116,
          endWard: 121,
        },
      ],
    },
  ],
};

// Helper lookup utilities
export const getAvailableMainLocations = (): string[] => [BANGALORE_BBMP_HIERARCHY.mainLocation];

export const getAvailableRegions = (mainLocation: string): string[] => {
  if (mainLocation !== BANGALORE_BBMP_HIERARCHY.mainLocation) return [];
  return BANGALORE_BBMP_HIERARCHY.regions.map((r) => r.name);
};

export const getAvailableZones = (mainLocation: string, regionName: string): ZoneConfig[] => {
  if (mainLocation !== BANGALORE_BBMP_HIERARCHY.mainLocation) return [];
  const region = BANGALORE_BBMP_HIERARCHY.regions.find((r) => r.name === regionName);
  return region ? region.zones : [];
};

export const getAvailableWards = (mainLocation: string, regionName: string, zoneName: string): string[] => {
  const zones = getAvailableZones(mainLocation, regionName);
  const zone = zones.find((z) => z.name === zoneName);
  if (!zone) return [];
  const wards: string[] = [];
  for (let w = zone.startWard; w <= zone.endWard; w++) {
    wards.push(`W${w}`);
  }
  return wards;
};
