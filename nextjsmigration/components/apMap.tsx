"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMapStore, getNodeStats } from '@/lib/store';
import { fetchNodes, subscribeToNodes } from '@/lib/sync';
import { findOptimalRoute, getDistance, generateGPX } from '@/lib/routing';
import type { IGameEngine } from '@/lib/engine/IGameEngine';

// Dynamically import MapCore since it uses leaflet which needs the window object
const MapCore = dynamic(() => import('./game/MapCore'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-neutral-900 animate-pulse"></div>
});

import GameHUD from './game/GameHUD';
import VictoryScreen from './VictoryScreen';

interface Props {
  sessionId: string;
  sessionName?: string;
  apServerUrl?: string;
  apSlot?: string;
  centerLat: number;
  centerLon: number;
  radius: number;
  gameEngine: IGameEngine;
  onValidated?: () => void;
}

export default function ApMap({
  sessionId,
  sessionName = '',
  apServerUrl = '',
  apSlot = '',
  centerLat,
  centerLon,
  radius,
  gameEngine,
  onValidated
}: Props) {
  const mapNodes = useMapStore((state) => state.mapNodes);
  const activeWaypointIds = useMapStore((state) => state.activeWaypointIds);
  const currentRoute = useMapStore((state) => state.currentRoute);

  const setActiveWaypointIds = useMapStore((state) => state.setActiveWaypointIds);
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute);
  const setSessionName = useMapStore((state) => state.setSessionName);
  const setApSlot = useMapStore((state) => state.setApSlot);
  const setRouteDistance = useMapStore((state) => state.setRouteDistance);
  const setElevationGain = useMapStore((state) => state.setElevationGain);

  const [isLoading, setIsLoading] = useState(true);
  const [unsubscribeFn, setUnsubscribeFn] = useState<(() => void) | null>(null);

  const [goalReached, setGoalReached] = useState(false);
  const [swapsFound, setSwapsFound] = useState(0);

  useEffect(() => {
    setSessionName(sessionName);
    setApSlot(apSlot);

    async function init() {
      try {
        await fetchNodes(sessionId);
        const unsub = await subscribeToNodes(sessionId);
        if (typeof unsub === 'function') {
          setUnsubscribeFn(() => unsub);
        }
      } catch (e) {
        console.error("Failed to load map data:", e);
      } finally {
        setIsLoading(false);
      }
    }
    init();

    return () => {
      if (unsubscribeFn) unsubscribeFn();
    };
  }, [sessionId]);

  useEffect(() => {
    const unsub = gameEngine.subscribe(() => {
      setGoalReached(gameEngine.isGoalReached);
      setSwapsFound(gameEngine.locationSwaps);
    });
    return () => unsub();
  }, [gameEngine]);

  const handleRouteToAvailable = async () => {
    const availableNodes = mapNodes.filter((n) => n.state === 'Available');
    if (availableNodes.length === 0) {
      alert('No available checks to route to.');
      return;
    }

    try {
      if (typeof window !== 'undefined' && (window as any).L) {
        let currentLocation = { lat: centerLat, lon: centerLon };

        const routeResult = await findOptimalRoute(currentLocation, availableNodes);

        setActiveWaypointIds(new Set(routeResult.waypointIds));
        setCurrentRoute(routeResult);
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to generate route. Ensure the graph-cache is built if hosting locally.');
    }
  };

  const handleClearRoute = () => {
    setActiveWaypointIds(new Set());
    setCurrentRoute(null);
    setRouteDistance(0);
    setElevationGain(0);
  };

  const handleExportGPX = () => {
    generateGPX();
  };

  const handleNodeTap = (node: any) => {
    const isTargeted = activeWaypointIds.has(node.id);

    if (isTargeted) {
      const newIds = new Set(activeWaypointIds);
      newIds.delete(node.id);
      setActiveWaypointIds(newIds);
      // Route regeneration will be handled within MapCore based on state
    } else {
      if (node.state === 'Checked') return;
      const newIds = new Set(activeWaypointIds);
      newIds.add(node.id);
      setActiveWaypointIds(newIds);
    }
  };

  const handleReturnHome = () => {
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-900">
        <div className="w-16 h-16 border-4 border-neutral-700 border-t-orange-500 rounded-full animate-spin mb-6"></div>
        <div className="text-xl font-bold text-white mb-2">Syncing Map Data...</div>
      </div>
    );
  }

  const stats = getNodeStats(mapNodes);
  const total = stats.hidden + stats.available + stats.checked;

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-neutral-950">
      {goalReached && (
        <VictoryScreen
          sessionName={sessionName}
          checkedCount={stats.checked}
          onReturnHome={handleReturnHome}
        />
      )}

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <MapCore
          centerLat={centerLat}
          centerLon={centerLon}
          radius={radius}
          sessionId={sessionId}
        />
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <GameHUD
          sessionId={sessionId}
          sessionName={sessionName}
          apServerUrl={apServerUrl}
          gameEngine={gameEngine}
          stats={stats}
          totalNodes={total}
          swapsFound={swapsFound}
          onRouteToAvailable={handleRouteToAvailable}
          onClearRoute={handleClearRoute}
          onExportGPX={handleExportGPX}
          onValidated={() => {
            if (onValidated) onValidated();
          }}
        />
      </div>
    </div>
  );
}
