"use client";

import { useState } from 'react';
import type { IGameEngine } from '@/lib/engine/IGameEngine';
import ChatClient from '@/components/ChatClient';
import ApDropzone from '@/components/apDropzone';
import { useAppStore } from '@/lib/store';

// Stubs for remaining components
function RoutePanel({ onRouteToAvailable, onClearRoute, onExportGPX }: any) {
  return (
    <div className="bg-neutral-800 p-4 rounded-lg shadow-lg">
      <h2 className="text-lg font-bold mb-3 text-orange-500">Route Controls</h2>
      <div className="space-y-2">
        <button onClick={onRouteToAvailable} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded-lg transition">Route to Available</button>
        <button onClick={onClearRoute} className="w-full bg-neutral-600 hover:bg-neutral-500 text-white font-bold py-2 rounded-lg transition">Clear Route</button>
        <button onClick={onExportGPX} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition">Export GPX</button>
      </div>
    </div>
  );
}

function TopNav({ stats, totalNodes, sessionName, apServerUrl }: any) {
  return (
    <div className="absolute top-4 left-4 right-4 md:left-[272px] z-[1000] flex items-start justify-between pointer-events-auto">
      <div className="bg-neutral-900/90 backdrop-blur border border-white/10 p-3 rounded-xl shadow-lg">
        <div className="text-sm font-bold text-white mb-1">{sessionName}</div>
        <div className="flex space-x-3 text-xs">
          <span className="text-green-400">{stats.available} Available</span>
          <span className="text-blue-400">{stats.checked} Checked</span>
          <span className="text-neutral-500">{stats.hidden} Hidden</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  sessionId: string;
  sessionName: string;
  apServerUrl: string;
  gameEngine: IGameEngine;
  stats: any;
  totalNodes: number;
  swapsFound: number;
  onRouteToAvailable: () => void;
  onClearRoute: () => void;
  onExportGPX: () => void;
  onValidated: () => void;
}

export default function GameHUD({
  sessionId,
  sessionName,
  apServerUrl,
  gameEngine,
  stats,
  totalNodes,
  swapsFound,
  onRouteToAvailable,
  onClearRoute,
  onExportGPX,
  onValidated
}: Props) {
  const activeGameTab = useAppStore(state => state.activeGameTab);

  return (
    <div className="w-full h-full pointer-events-none relative">
      <TopNav stats={stats} totalNodes={totalNodes} sessionName={sessionName} apServerUrl={apServerUrl} />

      {activeGameTab === 'chat' && (
        <div className="absolute right-4 bottom-[80px] md:bottom-4 w-[380px] h-[400px] max-h-[50vh] pointer-events-auto z-[1000]">
          <ChatClient engine={gameEngine} />
        </div>
      )}

      {activeGameTab === 'upload' && (
        <div className="absolute right-4 bottom-[80px] md:bottom-4 w-[380px] h-[400px] pointer-events-auto z-[1000]">
          <ApDropzone
            sessionId={sessionId}
            gameEngine={gameEngine}
            onValidated={onValidated}
          />
        </div>
      )}

      {activeGameTab === 'route' && (
        <div className="absolute right-4 bottom-[80px] md:bottom-4 w-[380px] pointer-events-auto z-[1000]">
          <RoutePanel
            onRouteToAvailable={onRouteToAvailable}
            onClearRoute={onClearRoute}
            onExportGPX={onExportGPX}
          />
        </div>
      )}
    </div>
  );
}
