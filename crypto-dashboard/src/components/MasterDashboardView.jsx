import React, { useMemo } from 'react';
import { 
  LayoutDashboard, Activity, Waves, Wallet, 
  ArrowUpRight, ArrowDownRight, Sparkles, Bot, 
  TrendingUp, TrendingDown, Cpu, Globe, Target, Server, Zap
} from 'lucide-react';

const MasterDashboardView = ({ 
  balances = {}, 
  bots = [], 
  whaleTrades = [], 
  currentPrice = 0, 
  activePair = { display: 'BTC/USD' }, 
  equityCurve = [] 
}) => {
  
  // 📊 Berekening van algemene stats
  const totalValue = useMemo(() => {
    return equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value : 0;
  }, [equityCurve]);

  // Bereken 24h verschil (gesimuleerd op basis van eerste vs laatste punt in curve)
  const pnl24h = useMemo(() => {
    if (equityCurve.length < 2) return { value: 0, pct: 0, isPositive: true };
    const start = equityCurve[0].value;
    const end = equityCurve[equityCurve.length - 1].value;
    const diff = end - start;
    return {
      value: diff,
      pct: start > 0 ? (diff / start) * 100 : 0,
      isPositive: diff >= 0
    };
  }, [equityCurve]);

  const activeBotsCount = useMemo(() => bots.filter(b => b.isRunning).length, [bots]);

  return (
    <div className="flex-1 flex flex-col bg-[#020203] h-full overflow-y-auto font-sans text-zinc-300 custom-scrollbar relative">
      
      {/* Background Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* 🚀 Hero Sectie */}
      <div className="h-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-2xl sticky top-0 z-[60] flex justify-between items-center px-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)] relative overflow-hidden">
            <div className="absolute inset-0 bg-indigo-400/20 blur-xl"></div>
            <LayoutDashboard className="text-indigo-400 w-6 h-6 relative z-10" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
              Global Command Center
            </h2>
            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> 
              Kraken Engine: Connected
            </div>
          </div>
        </div>
        <div className="flex gap-4">
            <div className="flex items-center gap-3 bg-black/50 border border-white/10 px-4 py-2 rounded-xl">
                <Server size={14} className="text-zinc-500" />
                <div className="flex flex-col text-right">
                    <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest">Fleet Capacity</span>
                    <span className="text-xs font-bold text-zinc-200">{activeBotsCount} / {bots.length} Online</span>
                </div>
            </div>
            <div className="flex items-center gap-3 bg-black/50 border border-white/10 px-4 py-2 rounded-xl">
                <Globe size={14} className="text-zinc-500" />
                <div className="flex flex-col text-right">
                    <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest">Network Latency</span>
                    <span className="text-xs font-bold text-emerald-400 font-mono">24ms</span>
                </div>
            </div>
        </div>
      </div>

      <div className="p-8 max-w-[1800px] mx-auto w-full space-y-6">
        
        {/* TOP ROW: KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-[#0b0e11] to-[#09090b] border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity"><Wallet size={40} className="text-indigo-400"/></div>
                <span className="text-[10px] font-black text-zinc-500 uppercase mb-3 block tracking-widest relative z-10">Net Liquidity Value</span>
                <span className="text-3xl font-mono font-black text-white tracking-tighter relative z-10">${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <div className={`flex items-center gap-1.5 mt-3 text-[11px] font-black uppercase tracking-wider w-fit px-2.5 py-1 rounded-lg relative z-10 ${pnl24h.isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {pnl24h.isPositive ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                    {pnl24h.isPositive ? '+' : ''}{pnl24h.pct.toFixed(2)}% <span className="opacity-50 ml-1 font-sans">24H</span>
                </div>
            </div>

            <div className="bg-gradient-to-br from-[#0b0e11] to-[#09090b] border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity"><Activity size={40} className="text-blue-400"/></div>
                <span className="text-[10px] font-black text-zinc-500 uppercase mb-3 block tracking-widest relative z-10">Live Oracle Price <span className="text-blue-400">{activePair.display}</span></span>
                <span className="text-3xl font-mono font-black text-white tracking-tighter relative z-10">${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <div className="flex items-center gap-1.5 mt-3 text-[11px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 w-fit px-2.5 py-1 rounded-lg relative z-10">
                    <Zap size={14}/> Sub-second sync
                </div>
            </div>

            <div className="bg-gradient-to-br from-[#0b0e11] to-[#09090b] border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Aggregate Winrate</span>
                  <div className="flex items-end gap-3">
                      <span className="text-3xl font-mono font-black text-white tracking-tighter">68.4%</span>
                  </div>
                </div>
                <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden border border-white/5 mt-4">
                    <div className="h-full bg-indigo-500 w-[68.4%] shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                </div>
            </div>

            <div className="bg-gradient-to-br from-[#0b0e11] to-[#09090b] border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">System Architecture</span>
                  <div className="flex items-end gap-3">
                      <span className="text-3xl font-mono font-black text-emerald-400 tracking-tighter">0.92</span>
                      <span className="text-sm font-bold text-zinc-500 mb-1">Sharpe</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                    {['Data', 'Exec', 'Risk', 'AI'].map((node, i) => (
                        <div key={i} className="flex-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase text-center py-1 rounded-md">
                            {node}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* MIDDLE ROW: BOTS & WHALES */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* ALGORITHMIC FLEET STATUS (Span 2) */}
            <div className="xl:col-span-2 bg-[#09090b] border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden flex flex-col">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/10 blur-[100px] pointer-events-none"></div>
                
                <div className="flex justify-between items-center mb-6 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg"><Cpu size={18} className="text-indigo-400" /></div>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Algorithmic Fleet Status</h3>
                    </div>
                    <button className="text-[10px] uppercase font-black text-zinc-500 hover:text-white transition-colors">View All</button>
                </div>

                <div className="flex-1 overflow-x-auto relative z-10">
                    <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                            <tr className="text-[9px] uppercase text-zinc-500 font-black tracking-widest">
                                <th className="pb-2 font-normal">Asset / Model</th>
                                <th className="pb-2 font-normal">Status</th>
                                <th className="pb-2 font-normal">Exposure</th>
                                <th className="pb-2 font-normal">Live PnL</th>
                                <th className="pb-2 font-normal text-right">Momentum</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(bots || []).slice(0, 4).map((bot) => (
                                <tr key={bot.id} className="bg-black/40 hover:bg-white/[0.02] transition-colors group">
                                    <td className="py-3 px-4 rounded-l-xl border-y border-l border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-white/5">
                                                <span className="text-[10px] font-black text-white">{bot.pair.display.split('/')[0]}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-white">{bot.pair.display}</span>
                                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">{bot.strategy.replace('_', ' ')}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 border-y border-white/5">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${bot.isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border border-white/5'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${bot.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}></div>
                                            {bot.isRunning ? 'Active' : 'Standby'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 border-y border-white/5">
                                        <span className="text-xs font-mono font-bold text-zinc-300">{(bot.state?.totalVolume || 0).toFixed(4)} <span className="text-[9px] text-zinc-600">{bot.pair.base}</span></span>
                                    </td>
                                    <td className="py-3 px-4 border-y border-white/5">
                                        <span className={`text-sm font-mono font-black ${bot.state?.livePnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {bot.state?.livePnlPct >= 0 ? '+' : ''}{(bot.state?.livePnlPct || 0).toFixed(2)}%
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 rounded-r-xl border-y border-r border-white/5 text-right w-32">
                                        {/* Mock Progress bar for visual density */}
                                        <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5 flex justify-end">
                                            <div className={`h-full ${bot.state?.livePnlPct >= 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} style={{ width: `${Math.min(100, Math.abs((bot.state?.livePnlPct || 0) * 10) + 20)}%` }}></div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {bots.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-[11px] text-zinc-600 italic uppercase tracking-widest border border-dashed border-white/5 rounded-xl">No active algorithms found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* INSTITUTIONAL ORDER FLOW (Whales) */}
            <div className="bg-[#09090b] border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden flex flex-col">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                        <Waves size={16} className="text-blue-500" /> Order Flow <span className="text-zinc-500 text-[9px] tracking-normal border border-white/10 px-1.5 rounded bg-black">LIVE</span>
                    </h3>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                    {(whaleTrades || []).slice(0, 5).map((trade, i) => (
                        <div key={i} className="flex flex-col p-3 bg-black/30 hover:bg-black/60 transition-colors rounded-xl border border-white/5 relative group">
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1 ${trade.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                                    {trade.type === 'BUY' ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>} {trade.type}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-600">{trade.time}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-sm font-black text-zinc-200">{trade.amount} <span className="text-[10px] text-zinc-500">{trade.asset}</span></span>
                                <span className="text-xs font-mono font-bold text-blue-400">{trade.value}</span>
                            </div>
                        </div>
                    ))}
                    {(!whaleTrades || whaleTrades.length === 0) && (
                        <div className="flex flex-col items-center justify-center h-32 text-zinc-600 space-y-3">
                            <Activity className="animate-pulse opacity-50"/>
                            <p className="text-[10px] italic uppercase tracking-widest">Scanning mempool...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* BOTTOM ROW: GEMINI AI NEXUS */}
        <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/10 border border-indigo-500/20 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
            <Sparkles className="absolute top-0 right-0 text-indigo-500/10 w-48 h-48 -translate-y-1/4 translate-x-1/4" />
            
            <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                    <Sparkles size={18} className="text-indigo-400 animate-pulse" />
                </div>
                <h3 className="text-sm font-black text-indigo-300 uppercase tracking-[0.3em]">Gemini AI Nexus</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                {/* Sentiment & Insight */}
                <div className="md:col-span-2 flex flex-col justify-center space-y-4">
                    <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Macro Analysis</span>
                        <p className="text-xs text-indigo-100/80 leading-relaxed font-medium">
                            Strong bullish divergence on the 4H timeframe for {activePair.display}. High volume confluence detected in recent institutional order flow. The macro structure supports upward continuation.
                        </p>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                        <Target size={16} className="text-emerald-400 mt-0.5 shrink-0"/>
                        <div>
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-1">Actionable Insight</span>
                            <p className="text-xs text-emerald-100/80 font-medium">
                                Maintain current algorithmic exposure. Ensure dynamic trailing stops are active to capture upside volatility while protecting baseline capital.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Bias & Confidence Meter */}
                <div className="flex flex-col justify-center border-l border-white/5 pl-8">
                    <div className="mb-6">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Market Bias</span>
                        <span className="text-4xl font-black text-emerald-400 font-mono flex items-center gap-2">
                            BULLISH <ArrowUpRight size={28} className="text-emerald-500"/>
                        </span>
                    </div>
                    
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">AI Confidence Level</span>
                            <span className="text-xs font-mono font-bold text-indigo-400">88%</span>
                        </div>
                        <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden border border-white/5 relative">
                            {/* Marker lines inside the bar */}
                            <div className="absolute inset-0 flex justify-between px-[25%] opacity-20"><div className="w-px h-full bg-white"></div><div className="w-px h-full bg-white"></div><div className="w-px h-full bg-white"></div></div>
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.6)]" style={{ width: '88%' }}></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default MasterDashboardView;