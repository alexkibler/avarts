"use client";

import { useState, useEffect } from 'react';
import { usePocketBase } from '@/components/PocketBaseProvider';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import Sidebar from '@/components/Sidebar';

export default function Page() {
  const { pb, user, isLoading } = usePocketBase();
  const router = useRouter();

  const [gameSessions, setGameSessions] = useState<any[]>([]);
  const [registerMode, setRegisterMode] = useState(false);

  // Form states
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  async function loadSessions() {
    try {
      const sessions = await pb.collection('game_sessions').getFullList({
        filter: `user = "${user?.id}" && status = "Active"`,
        sort: '-created'
      });
      setGameSessions(sessions);
    } catch (err) {
      console.error('Error fetching game sessions:', err);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');
    try {
      await pb.collection('users').authWithPassword(username, password);
      // user state will automatically update via the layout provider listener
    } catch (err: any) {
      setFormError(err.response?.message || 'Invalid username or password');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    if (password !== confirm || password.length < 8) {
      setFormError("Passwords do not match or are too short");
      setIsSubmitting(false);
      return;
    }

    try {
      const randomString = (Math.random() + 1).toString(36).substring(2);
      await pb.collection('users').create({
        username,
        name,
        email: `${randomString}@bikeapelago.com`,
        password,
        passwordConfirm: confirm
      });
      await pb.collection('users').authWithPassword(username, password);
    } catch (err: any) {
      setFormError(err.response?.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function convertToSinglePlayer(sessionId: string) {
    if (
      window.confirm(
        'Are you sure you want to convert this Archipelago save to a Single Player save? This action is permanent and cannot be reversed.'
      )
    ) {
      try {
        await pb.collection('game_sessions').update(sessionId, {
          ap_server_url: null,
          ap_slot_name: null,
          ap_seed_name: null
        });
        await loadSessions();
      } catch (e) {
        console.error('Failed to convert to single player', e);
        alert('Failed to convert. Check console for details.');
      }
    }
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[100px] md:pb-0 relative">
        <header className="sticky top-0 z-[1000] bg-neutral-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <img className="h-6 w-auto" src="/bikeapelago.svg" alt="Bikeapelago" />
            </div>
            {user && (
              <a href="/athlete" className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-neutral-800 overflow-hidden ring-2 ring-transparent active:ring-orange-500/50 transition-all">
                  <div className="h-full w-full flex items-center justify-center bg-orange-600 text-white font-bold text-sm">
                    {(user.name || user.username || '?').charAt(0).toUpperCase()}
                  </div>
                </div>
              </a>
            )}
          </div>
        </header>

        {user ? (
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 md:mb-12 gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
                  Welcome back
                </h1>
                <p className="text-lg text-neutral-400">Ready for your next ride?</p>
              </div>
              <a href="/new-game" className="transition-transform active:scale-95 w-full md:w-auto">
                <button className="w-full bg-orange-600 text-white font-bold py-4 md:py-3 px-8 rounded-xl hover:bg-orange-500 transition-all shadow-lg shadow-orange-900/20 hover:shadow-orange-500/30 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                  Start New Session
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              </a>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-orange-500 rounded-full"></div>
                Active Sessions
              </h2>

              {gameSessions.length > 0 ? (
                <div className="grid gap-4">
                  {gameSessions.map(session => (
                    <div key={session.id} className="group bg-neutral-900/50 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-500/0 group-hover:bg-orange-500 transition-colors"></div>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-xl text-white font-bold tracking-tight truncate">
                              {session.ap_seed_name || 'Untitled Seed'}
                            </h3>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-500 text-white uppercase tracking-tighter">
                              {session.ap_server_url ? 'AP Mode' : 'Single Player'}
                            </span>
                          </div>
                          {session.ap_server_url && (
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
                              <span className="font-medium">URL: {session.ap_server_url}</span>
                              <span className="font-medium">Slot: {session.ap_slot_name}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 w-full md:w-auto shrink-0">
                          <button
                            onClick={() => router.push(`/game/${session.id}`)}
                            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-xl transition-all flex items-center justify-center"
                          >
                            Resume Session
                          </button>
                          {session.ap_server_url && (
                            <button
                              className="w-full text-xs text-neutral-400 hover:text-white transition-colors py-2"
                              onClick={() => convertToSinglePlayer(session.id)}
                            >
                              Convert to Single Player
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-neutral-800/30 p-12 rounded-3xl text-center border border-white/5">
                  <h2 className="text-white text-2xl font-black mb-4">No Active Sessions</h2>
                  <p className="text-neutral-400 mb-8 max-w-sm mx-auto">
                    You haven't started any games yet. Connect to a multiworld server to track your progress and plan routes.
                  </p>
                  <button onClick={() => router.push('/new-game')} className="px-8 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-500">
                    Start Your First Game
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
            <div className="w-full max-w-sm p-6 bg-neutral-900 border border-white/10 rounded-2xl">
              <div className="flex justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">{registerMode ? 'Register' : 'Login'}</h2>
                <button
                  onClick={() => setRegisterMode(!registerMode)}
                  className="text-sm text-orange-500 hover:text-orange-400"
                >
                  {registerMode ? 'Switch to Login' : 'Switch to Register'}
                </button>
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">
                  {formError}
                </div>
              )}

              {!registerMode ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Username</label>
                    <input
                      type="text"
                      required
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-white focus:border-orange-500 focus:outline-none"
                      value={username} onChange={e => setUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-white focus:border-orange-500 focus:outline-none"
                      value={password} onChange={e => setPassword(e.target.value)}
                    />
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                    {isSubmitting ? 'Logging in...' : 'Login'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Username</label>
                    <input type="text" required className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-white focus:border-orange-500 focus:outline-none" value={username} onChange={e => setUsername(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Name</label>
                    <input type="text" required className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-white focus:border-orange-500 focus:outline-none" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Password (min 8 chars)</label>
                    <input type="password" required minLength={8} className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-white focus:border-orange-500 focus:outline-none" value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Verify Password</label>
                    <input type="password" required className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-white focus:border-orange-500 focus:outline-none" value={confirm} onChange={e => setConfirm(e.target.value)} />
                  </div>
                  <button type="submit" disabled={isSubmitting || password.length < 8 || password !== confirm} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                    {isSubmitting ? 'Registering...' : 'Register'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
