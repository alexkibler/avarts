import { create } from 'zustand';
import type { Route, UserData } from './types';

// Map State Store
interface MapState {
  mapNodes: any[];
  activeWaypointIds: Set<string>;
  currentRoute: Route | null;
  routeDistance: number;
  elevationGain: number;
  userLocation: { lat: number; lon: number } | null;
  sessionName: string;
  apSlot: string;

  // Actions
  setMapNodes: (nodes: any[]) => void;
  updateMapNode: (node: any) => void;
  addMapNode: (node: any) => void;
  removeMapNode: (id: string) => void;
  setActiveWaypointIds: (ids: Set<string>) => void;
  setCurrentRoute: (route: Route | null) => void;
  setRouteDistance: (dist: number) => void;
  setElevationGain: (gain: number) => void;
  setUserLocation: (loc: { lat: number; lon: number } | null) => void;
  setSessionName: (name: string) => void;
  setApSlot: (slot: string) => void;
}

export const useMapStore = create<MapState>((set) => ({
  mapNodes: [],
  activeWaypointIds: new Set(),
  currentRoute: null,
  routeDistance: 0,
  elevationGain: 0,
  userLocation: null,
  sessionName: '',
  apSlot: '',

  setMapNodes: (nodes) => set({ mapNodes: nodes }),
  updateMapNode: (node) => set((state) => ({
    mapNodes: state.mapNodes.map((n) => (n.id === node.id ? node : n))
  })),
  addMapNode: (node) => set((state) => ({ mapNodes: [...state.mapNodes, node] })),
  removeMapNode: (id) => set((state) => ({ mapNodes: state.mapNodes.filter((n) => n.id !== id) })),
  setActiveWaypointIds: (ids) => set({ activeWaypointIds: ids }),
  setCurrentRoute: (route) => set({ currentRoute: route }),
  setRouteDistance: (dist) => set({ routeDistance: dist }),
  setElevationGain: (gain) => set({ elevationGain: gain }),
  setUserLocation: (loc) => set({ userLocation: loc }),
  setSessionName: (name) => set({ sessionName: name }),
  setApSlot: (slot) => set({ apSlot: slot }),
}));

export const getNodeStats = (nodes: any[]) => ({
  hidden: nodes.filter((n) => n.state === 'Hidden').length,
  available: nodes.filter((n) => n.state === 'Available').length,
  checked: nodes.filter((n) => n.state === 'Checked').length
});

// App State Store
interface AppState {
  activeGameTab: 'chat' | 'upload' | 'route' | null;
  setActiveGameTab: (tab: 'chat' | 'upload' | 'route' | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeGameTab: null,
  setActiveGameTab: (tab) => set({ activeGameTab: tab }),
}));
