import React, { useState } from 'react';
import { MessageSquare, X, Send, Sparkles } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
}

interface ChatbotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatbotDrawer: React.FC<ChatbotDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [modelMode, setModelMode] = useState<'complex' | 'general' | 'fast'>(
    'complex'
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'model',
      text: 'Welcome to VertiNode Studio. Ask me about ComfyUI custom nodes (IPAdapter character sheets, AnimateDiff camera curves, Flux/SDXL LoRA stacking), silent phoneme-to-viseme lip-syncing, or frame-locked subtitle pacing for 2–5 minute DramaBox/NetShorts episodes.',
      modelUsed: 'gemini-4-argon',
    },
  ]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          modelMode,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.text) {
        setMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            text: data.text,
            modelUsed: data.model,
          },
        ]);
      } else {
        const modelLabel =
          modelMode === 'complex'
            ? 'gemini-4-argon (Local Fallback)'
            : modelMode === 'general'
            ? 'gemini-3.8-flash (Local Fallback)'
            : 'gemini-3.1-flash-lite (Local Fallback)';
        setMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            text: `For "${trimmed}": Use [CHAR_*] and [STYLE_*] tags in your Storyboard beat narrative. VertiNode automatically locks your EmptyLatentImage node to 1080×1920 (9:16), binds the matching character sheet via IPAdapterUnifiedLoader, and drives mouth visemes (A, E, I, O, U, M, REST) directly from frame-indexed subtitle phonemes with zero audio dependencies.`,
            modelUsed: modelLabel,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: `Local Technical Director Response: Ensure your character spreadsheets are locked to 1080×1920 and include [CHAR_*] and [STYLE_*] tags in each scene beat for automated ComfyUI batch rendering.`,
          modelUsed: 'Offline Director',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      aria-label="ComfyUI Technical Director Assistant"
      className="fixed right-4 bottom-4 z-50 w-full max-w-md bg-[#111724] border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ maxHeight: '78vh' }}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[#0B0F17] border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Vertical Drama Technical Director</span>
          </h3>
          <p className="text-[11px] font-mono text-slate-400">
            Multi-Turn ComfyUI & Storyboard Assistant
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Assistant Drawer"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Model Tier Selector */}
      <div className="px-4 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-400 font-mono text-[11px]">Engine Tier:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setModelMode('complex')}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              modelMode === 'complex'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            4-Argon (High Think)
          </button>
          <button
            type="button"
            onClick={() => setModelMode('general')}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              modelMode === 'general'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3.8-Flash
          </button>
          <button
            type="button"
            onClick={() => setModelMode('fast')}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              modelMode === 'fast'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3.1-Lite (Fast)
          </button>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-lg text-xs leading-relaxed ${
              m.role === 'user'
                ? 'bg-amber-500/15 border border-amber-500/30 text-slate-100 ml-6'
                : 'bg-[#0B0F17] border border-slate-800 text-slate-200 mr-4'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 mb-1">
              {m.role === 'user' ? 'Producer' : `Director · ${m.modelUsed || ''}`}
            </div>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-[#0B0F17] border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          aria-label="Ask Technical Director"
          placeholder="Ask about [CHAR_*] tags, lip-sync, or Flux LoRAs..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 rounded-lg bg-[#111724] border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={loading}
          aria-label="Send Chat Message"
          className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </aside>
  );
};
