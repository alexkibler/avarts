"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pb } from '@/lib/database';
import { usePocketBase } from '@/components/PocketBaseProvider';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default function NewGamePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = usePocketBase();

  const [seedName, setSeedName] = useState('');
  const [slotName, setSlotName] = useState('');
  const [gameMode, setGameMode] = useState<'archipelago' | 'singleplayer'>('archipelago');
  const [apServerUrl, setApServerUrl] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (authLoading) return null;
  if (!user) {
    if (typeof window !== 'undefined') router.push('/');
    return null;
  }

  const handleNext = async () => {
    setIsGenerating(true);
    setErrorMsg('');

    try {
      if (gameMode === 'archipelago') {
        if (!apServerUrl.trim()) throw new Error('Please enter the Archipelago server address.');
        if (!slotName.trim()) throw new Error('Please enter your slot name.');
      } else {
        if (!seedName.trim()) throw new Error('Please enter a session name.');
      }

      const cleanUrl = apServerUrl.trim();
      const finalUrl =
        cleanUrl && !cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://')
          ? `wss://${cleanUrl}`
          : cleanUrl;

      const randomStr = (Math.random() + 1).toString(36).substring(7);
      const generatedSeed = gameMode === 'singleplayer' ? seedName : `AP_Seed_${randomStr}`;

      const data = {
        user: user.id,
        ap_seed_name: gameMode === 'archipelago' ? `AP Session ${randomStr}` : seedName,
        ap_server_url: gameMode === 'archipelago' ? finalUrl : null,
        ap_slot_name: gameMode === 'archipelago' ? slotName : null,
        status: 'SetupInProgress',
        center_lat: 0,
        center_lon: 0,
        radius: 0
      };

      const record = await pb.collection('game_sessions').create(data, { requestKey: null });

      router.push(`/setup-session/${record.id}`);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Failed to create session.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[100px] md:pb-0 relative">
        <header className="sticky top-0 z-[1000] bg-neutral-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <div className="flex items-center px-4 py-4">
            <button onClick={() => router.push('/')} className="p-2 -ml-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span className="ml-2 font-bold text-white text-lg tracking-tight">New Game</span>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-12">
          <div className="mb-8 md:mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-500 font-bold text-sm mb-4">
              Step 1 of 2
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">Game Details</h1>
            <p className="text-lg text-neutral-400">Configure your session type and connection details.</p>
          </div>

          {errorMsg && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-start gap-3 shadow-lg shadow-red-900/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="font-medium text-sm">{errorMsg}</p>
            </div>
          )}

          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>

            <div className="relative">
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  type="button"
                  onClick={() => setGameMode('archipelago')}
                  className={`relative p-6 rounded-2xl text-left border-2 transition-all ${
                    gameMode === 'archipelago'
                      ? 'border-orange-500 bg-orange-500/5'
                      : 'border-white/5 bg-black/20 hover:bg-black/40 hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className={`p-2.5 rounded-xl ${gameMode === 'archipelago' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${gameMode === 'archipelago' ? 'border-orange-500' : 'border-neutral-600'}`}>
                      {gameMode === 'archipelago' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>}
                    </div>
                  </div>
                  <h3 className={`font-bold text-lg mb-1 ${gameMode === 'archipelago' ? 'text-white' : 'text-neutral-300'}`}>Archipelago</h3>
                  <p className="text-sm text-neutral-500">Connect to a multiworld server</p>
                </button>

                <button
                  type="button"
                  onClick={() => setGameMode('singleplayer')}
                  className={`relative p-6 rounded-2xl text-left border-2 transition-all ${
                    gameMode === 'singleplayer'
                      ? 'border-orange-500 bg-orange-500/5'
                      : 'border-white/5 bg-black/20 hover:bg-black/40 hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className={`p-2.5 rounded-xl ${gameMode === 'singleplayer' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${gameMode === 'singleplayer' ? 'border-orange-500' : 'border-neutral-600'}`}>
                      {gameMode === 'singleplayer' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>}
                    </div>
                  </div>
                  <h3 className={`font-bold text-lg mb-1 ${gameMode === 'singleplayer' ? 'text-white' : 'text-neutral-300'}`}>Single Player</h3>
                  <p className="text-sm text-neutral-500">Play locally without a server</p>
                </button>
              </div>

              <div className="space-y-6">
                {gameMode === 'archipelago' ? (
                  <>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3 text-sm text-blue-300 mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" className="shrink-0 mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <p>Generate your multiworld using the <a href="/yaml-creator" target="_blank" className="font-bold underline hover:text-blue-200">YAML Creator</a> first.</p>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-bold text-neutral-300 mb-2">
                          Archipelago Server Address
                        </label>
                        <input
                          type="text"
                          placeholder="archipelago.gg:38281"
                          value={apServerUrl}
                          onChange={(e) => setApServerUrl(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-neutral-300 mb-2">
                          Slot Name
                        </label>
                        <input
                          type="text"
                          placeholder="Your player name in the multiworld"
                          value={slotName}
                          onChange={(e) => setSlotName(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-bold text-neutral-300 mb-2">
                      Session Name
                    </label>
                    <input
                      type="text"
                      placeholder="My Weekend Ride"
                      value={seedName}
                      onChange={(e) => setSeedName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                    />
                  </div>
                )}

                <div className="pt-6 border-t border-white/5">
                  <button
                    onClick={handleNext}
                    disabled={isGenerating}
                    className="w-full group bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg shadow-orange-900/20 hover:shadow-orange-500/30 disabled:opacity-50 disabled:hover:bg-orange-600 flex items-center justify-center gap-3"
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Preparing Session...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-lg">
                        Continue to Area Setup
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
