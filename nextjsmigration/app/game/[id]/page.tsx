"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePocketBase } from '@/components/PocketBaseProvider';
import { createGameEngine } from '@/lib/engine/GameEngineFactory';
import type { IGameEngine } from '@/lib/engine/IGameEngine';
import ApMap from '@/components/apMap';
import Sidebar from '@/components/Sidebar';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { pb, user, isLoading: authLoading } = usePocketBase();

  const [session, setSession] = useState<any>(null);
  const [engine, setEngine] = useState<IGameEngine | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (authLoading || !user) return;

    async function load() {
      try {
        const data = await pb.collection('game_sessions').getOne(sessionId);
        if (!data) throw new Error('Session not found');

        if (data.status === 'SetupInProgress' && data.ap_seed_name) {
          router.push(`/setup-session/${data.id}`);
          return;
        }

        setSession(data);

        // Initialize Engine
        const newEngine = createGameEngine(data);
        const success = await newEngine.connect({
          url: data.ap_server_url || '',
          name: data.ap_slot_name || '',
          game: 'Bikeapelago',
          sessionId: data.id
        });

        if (!success) {
          console.warn("Engine connection failed or bypassed.");
        }

        setEngine(newEngine);

      } catch (err: any) {
        setLoadError(err.message || 'Failed to load session.');
      }
    }

    load();

    return () => {
      // Disconnect engine on unmount if it exists
      if (engine) engine.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authLoading, user, router]); // deliberately excluding engine from deps

  if (loadError) {
    return <div className="text-white p-8 text-center">{loadError}</div>;
  }

  if (!session || !engine) {
    return (
      <div className="flex flex-col h-screen bg-neutral-950 items-center justify-center">
        <div className="w-16 h-16 border-4 border-neutral-800 border-t-orange-500 rounded-full animate-spin mb-6"></div>
        <div className="text-xl font-bold text-white mb-2">Connecting to game...</div>
        <div className="text-neutral-500 text-sm max-w-sm text-center">
          Initializing state and connecting to Archipelago multiworld server if applicable.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-neutral-950">
      <Sidebar />
      <div className="flex-1 relative h-full">
        <ApMap
          sessionId={sessionId}
          sessionName={session.ap_seed_name}
          apServerUrl={session.ap_server_url}
          apSlot={session.ap_slot_name}
          centerLat={session.center_lat}
          centerLon={session.center_lon}
          radius={session.radius}
          gameEngine={engine}
        />
      </div>
    </div>
  );
}
