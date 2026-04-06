"use client";

import { useEffect, useRef, useState } from 'react';
import type { IGameEngine } from '@/lib/engine/IGameEngine';
import type { ChatMessage } from '@/lib/types';

export default function ChatClient({ engine }: { engine: IGameEngine }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(engine.chatMessages);
  const msgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sync initial state
    setMessages([...engine.chatMessages]);

    // Subscribe to engine state changes
    const unsubscribe = engine.subscribe(() => {
      setMessages([...engine.chatMessages]);
    });
    return () => unsubscribe();
  }, [engine]);

  useEffect(() => {
    if (msgContainerRef.current) {
      msgContainerRef.current.scrollTop = msgContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    engine.say(text);
  };

  const onKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const msgClass = (type: ChatMessage['type']): string => {
    switch (type) {
      case 'chat':
        return 'text-white bg-white/5 border border-white/10';
      case 'item':
        return 'text-green-400 bg-green-500/5 border border-green-500/10 font-medium';
      case 'system':
        return 'text-orange-400 bg-orange-500/5 border border-orange-500/10 font-medium text-center text-xs tracking-wider uppercase';
      default:
        return 'text-neutral-400';
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-neutral-950/80 pointer-events-none z-0"></div>

      <div className="bg-neutral-800/80 backdrop-blur-sm border-b border-white/5 p-4 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-orange-500/10 rounded-lg text-orange-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
          </div>
          <h2 className="text-white font-bold tracking-tight">Chat & Logs</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Connected</span>
        </div>
      </div>

      <div
        ref={msgContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 relative z-10 no-scrollbar scroll-smooth"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`px-4 py-3 rounded-xl text-sm leading-relaxed shadow-sm break-words ${msgClass(msg.type)}`}
            dangerouslySetInnerHTML={{ __html: msg.text }}
          />
        ))}
      </div>

      <div className="p-4 bg-neutral-900 border-t border-white/5 z-10">
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all text-sm"
            placeholder="Send a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeydown}
          />
          <button
            onClick={send}
            className="absolute right-2 p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            disabled={!input.trim()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
