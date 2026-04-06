"use client";

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface Props {
  sessionName?: string;
  checkedCount?: number;
  onReturnHome?: () => void;
}

export default function VictoryScreen({ sessionName = '', checkedCount = 0, onReturnHome }: Props) {
  useEffect(() => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#e67e22', '#f39c12', '#d35400']
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#2ecc71', '#27ae60', '#1abc9c']
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-md">
      <div className="max-w-md w-full bg-neutral-900 border border-white/10 rounded-3xl p-8 md:p-12 text-center shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent pointer-events-none"></div>

        <div className="relative z-10">
          <div className="mx-auto w-24 h-24 bg-orange-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-[0_0_50px_rgba(230,126,34,0.4)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#e67e22"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>

          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Victory!</h1>
          <p className="text-xl text-orange-400 font-medium mb-6">
            {sessionName || 'Session Completed'}
          </p>

          <div className="bg-black/50 border border-white/5 rounded-2xl p-6 mb-8 inline-block">
            <p className="text-sm text-neutral-400 uppercase tracking-widest font-semibold mb-1">
              Final Score
            </p>
            <p className="text-5xl font-black text-white">
              {checkedCount}
              <span className="text-2xl text-neutral-500 font-bold ml-1">/ {checkedCount}</span>
            </p>
            <p className="text-sm text-neutral-500 mt-2">Locations Checked</p>
          </div>

          <p className="text-neutral-400 leading-relaxed mb-8">
            Congratulations! You've successfully completed this Archipelago session by visiting all
            required locations.
          </p>

          <button
            onClick={onReturnHome}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg shadow-orange-900/20 uppercase tracking-widest text-sm flex items-center justify-center gap-2 group"
          >
            Return to Dashboard
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="group-hover:translate-x-1 transition-transform"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
