"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePocketBase } from '@/components/PocketBaseProvider';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default function AthletePage() {
  const router = useRouter();
  const { user, pb, isLoading } = usePocketBase();
  const url = process.env.NEXT_PUBLIC_DB_URL || 'http://127.0.0.1:8090';

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    weight: ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        weight: user.weight ? user.weight.toString() : ''
      });
      if (user.avatar) {
        setPreviewSrc(`${url}/api/files/users/${user.id}/${user.avatar}`);
      }
    } else if (!isLoading) {
      router.push('/');
    }
  }, [user, isLoading, url, router]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setPreviewSrc(URL.createObjectURL(file));
      setEditMode(true);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setPreviewSrc('');
    setEditMode(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsUpdating(true);
    setErrorMsg('');

    try {
      const data = new FormData();
      if (formData.name !== user.name) data.append('name', formData.name);
      if (formData.weight !== user.weight?.toString()) data.append('weight', formData.weight);

      if (avatarFile) {
        data.append('avatar', avatarFile);
      } else if (!previewSrc && user.avatar) {
        data.append('avatar', ''); // Clear avatar
      }

      await pb.collection('users').update(user.id, data);
      setEditMode(false);
      // Wait for authStore listener to update the user context
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = () => {
    pb.authStore.clear();
    router.push('/');
  };

  if (isLoading || !user) return null;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-neutral-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[100px] md:pb-0">
        <header className="sticky top-0 z-[1000] bg-neutral-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <div className="flex items-center px-4 py-4">
            <h1 className="font-bold text-white text-lg tracking-tight">Athlete Profile</h1>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>

            <form onSubmit={handleSubmit} className="relative z-10">
              <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
                <div className="flex flex-col items-center gap-4 w-full md:w-auto">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-32 h-32 rounded-full overflow-hidden bg-neutral-800 border-4 border-neutral-800 group-hover:border-orange-500/50 transition-colors">
                      {previewSrc ? (
                        <img id="avatarImg" src={previewSrc} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-orange-600 text-white font-black text-4xl">
                          {(user.name || user.username || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />

                  {previewSrc && (
                    <button type="button" onClick={handleRemoveAvatar} className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">
                      Remove Avatar
                    </button>
                  )}
                </div>

                <div className="flex-1 w-full space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Display Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setEditMode(true); }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Username</label>
                    <input
                      type="text"
                      value={user.username}
                      disabled
                      className="w-full bg-black/20 border border-transparent rounded-xl px-4 py-3 text-neutral-500 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-8 pt-8 border-t border-white/5">
                <h3 className="text-lg font-bold text-white mb-4">Physiological Data</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Weight (kg)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.weight}
                        onChange={(e) => { setFormData({ ...formData, weight: e.target.value }); setEditMode(true); }}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">kg</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-2">Used for power estimation during ride analysis.</p>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-white/5">
                <button
                  type="submit"
                  disabled={!editMode || isUpdating}
                  className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-orange-900/20 disabled:opacity-50 disabled:hover:bg-orange-600 disabled:shadow-none disabled:cursor-not-allowed text-center"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="bg-neutral-800 hover:bg-red-500/10 hover:text-red-500 text-neutral-300 font-bold py-3 px-6 rounded-xl transition-colors text-center"
                >
                  Sign Out
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
