import React, { useState, useEffect } from 'react';
import { 
  Waves, Wind, TrendingUp, MessageSquare, AlertCircle, 
  Eye, Zap, ShieldCheck, Activity, Search, Sparkles
} from 'lucide-react';




const WhaleHubView = ({ activePair }) => {
    const [whaleTrades, setWhaleTrades] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchWhales = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/whales', {
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            setWhaleTrades(data);
        } catch (e) {
            console.error("Whale fetch error", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchWhales();
        const interval = setInterval(fetchWhales, 30000); // Update elke 30 seconden
        return () => clearInterval(interval);
    }, []);


  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto font-sans text-zinc-300">
      {/* 🌊 Header met Glassmorphism effect */}
      <div className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#09090b]/50 backdrop-blur-xl sticky top-0 z-[60]">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                <Waves className="text-blue-400 w-6 h-6 animate-pulse" />
            </div>
            <div>
               <h2 className="text-xl font-black text-white tracking-tighter uppercase">Intelligence Hub</h2>
               <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div> Monitoring Whale Flow & Sentiment
               </div>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <div className="bg-black/40 border border-white/5 px-4 py-2 rounded-xl flex items-center gap-3">
                <span className="text-[10px] font-black text-zinc-500 uppercase">Global Sentiment</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">74/100 (Greed)</span>
            </div>
        </div>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- LINKER KOLOM: WHALE WATCHER --- */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Eye size={16} className="text-blue-500" /> Institutional Orderflow
            </h3>
            <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Auto-refresh: 30s</span>
          </div>

          <div className="space-y-4">
            {whaleTrades.map((trade) => (
              <div key={trade.id} className="bg-[#09090b] border border-white/5 p-6 rounded-[2rem] hover:border-blue-500/30 transition-all flex items-center justify-between group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex items-center gap-6 relative z-10">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xs ${
                    trade.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    trade.type === 'SELL' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-zinc-800/50 text-zinc-400 border border-white/5'
                  }`}>
                    {trade.type}
                  </div>
                  <div>
                    <p className="text-lg font-black text-white tracking-tight">{trade.amount} {trade.asset}</p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-1">
                        <Search size={10}/> {trade.source}
                    </p>
                  </div>
                </div>
                <div className="text-right relative z-10">
                  <p className="text-xl font-mono font-black text-white">{trade.value}</p>
                  <p className="text-[10px] text-zinc-600 uppercase font-black">{trade.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --- RECHTER KOLOM: SENTIMENT & AI --- */}
        <div className="space-y-8">
            <div className="bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-600/10 blur-[80px] pointer-events-none"></div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-10 flex items-center gap-2">
                    <Wind size={16} className="text-blue-400" /> Market Atmosphere
                </h3>

                <div className="flex flex-col items-center mb-10">
                    <div className="relative">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-900" />
                            <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                strokeDasharray={364.4}
                                strokeDashoffset={364.4 - (364.4 * 74) / 100}
                                className="text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-1000" 
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-black text-white">74</span>
                            <span className="text-[8px] text-zinc-500 uppercase font-black tracking-tighter">Index</span>
                        </div>
                    </div>
                    <p className="text-emerald-400 font-black uppercase text-[10px] tracking-[0.3em] mt-6">Institutional Greed</p>
                </div>

                <div className="space-y-6">
                    {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-30">
                        <Activity className="animate-spin mb-4" />
                        <span className="text-[10px] uppercase font-bold tracking-widest">Scanning Blockchain...</span>
                    </div>
                    ) : (
                    whaleTrades.map((trade, index) => (
                        <div key={`${trade.id}-${index}`} className="..."> 
                        {/* (Vergeet de index niet in de key om die andere error te voorkomen!) */}
                        </div>
                    ))
                    )}
                    <div className="space-y-2">
                        <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                            <span>Social Volume (X)</span>
                            <span className="text-blue-400">Extreme High</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-blue-500 w-[85%] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-[9px] font-black uppercase text-zinc-500">
                            <span>Exchange Reserves</span>
                            <span className="text-rose-400">Dropping (Bullish)</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-rose-500 w-[30%] shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                        </div>
                    </div>
                </div>

                <div className="mt-10 p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl relative overflow-hidden">
                    <Sparkles size={14} className="text-blue-400 absolute top-4 right-4 opacity-50" />
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-3">AI Contextual Insight</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-medium italic">
                        "Gemini-2.0 analysis: Current confluence between low exchange reserves and high whale accumulation suggests a supply shock. Potential volatility spike expected within 12-24h."
                    </p>
                </div>
            </div>

            {/* Smart Alerts Dashboard */}
            <div className="bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Zap size={16} className="text-amber-500" /> Smart Alerts
                    </h3>
                </div>
                
                <div className="space-y-4">
                    <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-4">
                        <AlertCircle size={20} className="text-amber-500 shrink-0 mt-1" />
                        <div>
                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Large USDT Mint</p>
                            <p className="text-[11px] text-zinc-400 leading-snug font-medium">150M USDT minted at Tether Treasury. Often correlates with immediate market buy pressure.</p>
                        </div>
                    </div>
                    <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-4">
                        <ShieldCheck size={20} className="text-blue-500 shrink-0 mt-1" />
                        <div>
                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Whale Accumulation</p>
                            <p className="text-[11px] text-zinc-400 leading-snug font-medium">3 wallets moved 5,000+ BTC from exchanges to cold storage in the last hour.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default WhaleHubView;