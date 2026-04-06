"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default function YamlCreatorPage() {
  const router = useRouter();

  const [slotName, setSlotName] = useState('');
  const [checkCount, setCheckCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const generateYaml = () => {
    return [
      `game: Bikeapelago`,
      `name: ${slotName || 'BikePlayer'}`,
      ``,
      `Bikeapelago:`,
      `  check_count: ${checkCount}`,
      `  goal_type: all_intersections`
    ].join('\n');
  };

  const downloadYaml = () => {
    setIsGenerating(true);
    setErrorMsg('');

    try {
      if (!slotName.trim()) {
        throw new Error('Please enter a slot name.');
      }

      const yamlContent = generateYaml();
      const blob = new Blob([yamlContent], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${slotName}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to generate YAML.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-neutral-950">
      <Sidebar />
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[100px] md:pb-0">
        <header className="sticky top-0 z-[1000] bg-neutral-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <div className="flex items-center px-4 py-4">
            <button onClick={() => router.back()} className="p-2 -ml-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span className="ml-2 font-bold text-white text-lg tracking-tight">YAML Creator</span>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">YAML Creator</h1>
            <p className="text-lg text-neutral-400">Generate a configuration file for your Archipelago multiworld.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 shadow-xl h-fit">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-neutral-300 mb-2">Slot Name</label>
                  <input
                    type="text"
                    value={slotName}
                    onChange={(e) => setSlotName(e.target.value)}
                    placeholder="e.g. Alice"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                  <p className="text-[10px] text-neutral-500 mt-2">The name you will use to connect to the server.</p>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-2">
                    <label className="block text-sm font-bold text-neutral-300">Total Checks</label>
                    <span className="text-orange-400 font-mono font-bold">{checkCount}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={checkCount}
                    onChange={(e) => setCheckCount(Number(e.target.value))}
                    className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
                    {errorMsg}
                  </div>
                )}

                <button
                  onClick={downloadYaml}
                  disabled={isGenerating || !slotName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  Download YAML
                </button>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col">
              <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
                Preview
              </h3>
              <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 overflow-x-auto no-scrollbar">
                <pre className="text-sm text-neutral-300 font-mono whitespace-pre">{generateYaml()}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
