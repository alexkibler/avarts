"use client";

import { usePathname } from 'next/navigation';
import { useAppStore, useMapStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import RouteStatsBar from './game/RouteStatsBar'; // We will create this

export default function BottomNav() {
  const pathname = usePathname() || '';
  const isGamePage = pathname.startsWith('/game/');

  const activeGameTab = useAppStore((state) => state.activeGameTab);
  const setActiveGameTab = useAppStore((state) => state.setActiveGameTab);
  const currentRoute = useMapStore((state) => state.currentRoute);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isGamePage) {
      setActiveGameTab(null);
    }
  }, [isGamePage, setActiveGameTab]);

  if (!mounted) return null;

  const handleTab = (tab: 'chat' | 'upload' | 'route' | null) => {
    setActiveGameTab(activeGameTab === tab ? null : tab);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[2000] border-t border-white/10 bg-neutral-900/80 backdrop-blur-md px-0 pb-safe pt-0 md:hidden">
      {isGamePage && currentRoute && (
        <RouteStatsBar isSmall={true} />
      )}

      <div className="mx-auto flex max-w-lg items-center justify-around px-4 pt-2 pb-2">
        {isGamePage ? (
          <>
            <button
              onPointerDown={() => handleTab('chat')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${
                activeGameTab === 'chat' ? 'text-orange-500' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
              <span className="text-[10px] mt-1 font-medium">Chat</span>
            </button>
            <button
              onPointerDown={() => handleTab('route')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${
                activeGameTab === 'route' ? 'text-orange-500' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span className="text-[10px] mt-1 font-medium">Route</span>
            </button>
            <button
              onPointerDown={() => handleTab('upload')}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${
                activeGameTab === 'upload' ? 'text-orange-500' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span className="text-[10px] mt-1 font-medium">Upload</span>
            </button>
          </>
        ) : (
          <>
            <a
              href="/"
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${
                pathname === '/' ? 'text-orange-500' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
              <span className="text-[10px] mt-1 font-medium">Sessions</span>
            </a>
            <a
              href="/athlete"
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${
                pathname === '/athlete' ? 'text-orange-500' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span className="text-[10px] mt-1 font-medium">Profile</span>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
