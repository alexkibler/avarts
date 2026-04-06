"use client";

import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { usePocketBase } from './PocketBaseProvider';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname() || '';
  const isGamePage = pathname.startsWith('/game/');
  const { user, pb } = usePocketBase();
  const url = process.env.NEXT_PUBLIC_DB_URL || 'http://127.0.0.1:8090';

  const activeGameTab = useAppStore((state) => state.activeGameTab);
  const setActiveGameTab = useAppStore((state) => state.setActiveGameTab);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const handleTab = (tab: 'chat' | 'upload' | 'route' | null) => {
    setActiveGameTab(activeGameTab === tab ? null : tab);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-neutral-900 border-r border-white/5 sticky top-0 shrink-0 z-[1001]">
      <div className="p-6">
        <a href="/" className="flex items-center">
          <img className="h-6 w-auto" src="/bikeapelago.svg" alt="Bikeapelago" />
        </a>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {isGamePage ? (
          <>
            <button
              onClick={() => handleTab('chat')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeGameTab === 'chat'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
              <span className="font-medium">Chat & Logs</span>
            </button>
            <button
              onClick={() => handleTab('route')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeGameTab === 'route'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span className="font-medium">Active Route</span>
            </button>
            <button
              onClick={() => handleTab('upload')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeGameTab === 'upload'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span className="font-medium">Upload Ride</span>
            </button>
          </>
        ) : (
          <>
            <a
              href="/"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                pathname === '/'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
              <span className="font-medium">Sessions</span>
            </a>
            <a
              href="/athlete"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                pathname === '/athlete'
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span className="font-medium">Athlete Profile</span>
            </a>
          </>
        )}
      </nav>

      {user && (
        <div className="p-4 mt-auto border-t border-white/5">
          <a
            href="/athlete"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
          >
            <div className="h-10 w-10 rounded-full bg-neutral-800 overflow-hidden ring-2 ring-transparent group-hover:ring-orange-500/50 transition-all">
              {user.avatar ? (
                <img
                  src={`${url}/api/files/users/${user.id}/${user.avatar}`}
                  alt={user.name || user.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-orange-600 text-white font-bold text-lg">
                  {(user.name || user.username || '?').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.name || user.username}
              </p>
              <p className="text-xs text-neutral-500 truncate">Athlete View</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600 group-hover:text-white transition-colors"><path d="m9 18 6-6-6-6"/></svg>
          </a>
        </div>
      )}
    </aside>
  );
}
