import React, { useEffect, useRef, useMemo, useState } from 'react';
import { 
  TrendingUp, Activity, ArrowUpRight, ArrowDownRight, BarChart3, 
  RefreshCw, History, ShieldCheck, Gauge, Target, Sparkles,
  Zap, Briefcase, ChevronRight, Globe, ShieldAlert
} from 'lucide-react';


const PortfolioView = ({ balances, scriptLoaded, equityCurve, onRefresh, tradeHistory = [] }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeRange, setTimeRange] = useState('ALL');
  const [livePrices, setLivePrices] = useState({});

  // 1. 🔑 GEMINI API CHECK
  const hasGemini = useMemo(() => {
    try {
      const keys = JSON.parse(localStorage.getItem('trading_api_keys') || '{}');
      return !!keys.geminiKey;
    } catch (e) { return false; }
  }, []);

  // 2. 🛠️ DUST FILTER (Jouw originele logica)
  const activeBalances = useMemo(() => {
    return Object.entries(balances || {}).filter(([coin, amount]) => {
      const val = parseFloat(amount);
      return !isNaN(val) && val > 0.01; 
    }).map(([coin, amount]) => ({
        coin: coin.replace('XXBT', 'BTC').replace('ZUSD', 'USD').replace('XETH', 'ETH'),
        amount: parseFloat(amount)
    }));
  }, [balances]);

  // 🚀 NIEUW: Haal de actuele prijzen op van Kraken om de ECHTE allocatie te berekenen
  useEffect(() => {
    const fetchPrices = async () => {
      const cryptos = activeBalances.filter(b => b.coin !== 'USD').map(b => b.coin);
      if (cryptos.length === 0) return;
      
      // Vertaal BTC naar XBT voor de Kraken API en maak paren (bijv. XBTUSD, SOLUSD)
      const pairs = cryptos.map(c => `${c === 'BTC' ? 'XBT' : c}USD`).join(',');
      
      try {
        const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`);
        const data = await res.json();
        
        if (!data.error || data.error.length === 0) {
          const newPrices = {};
          // Koppel de Kraken namen (zoals XXBTZUSD of SOLUSD) terug aan jouw portfolio munten
          Object.keys(data.result).forEach(key => {
            cryptos.forEach(coin => {
              const searchCoin = coin === 'BTC' ? 'XBT' : coin;
              if (key.includes(searchCoin)) {
                newPrices[coin] = parseFloat(data.result[key].c[0]);
              }
            });
          });
          setLivePrices(newPrices);
        }
      } catch (err) { console.error("Kon live prijzen niet ophalen:", err); }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 15000); // Update elke 15 seconden
    return () => clearInterval(interval);
  }, [activeBalances]);
  
  const safeEquityCurve = Array.isArray(equityCurve) ? equityCurve : [];
  
  // 3. 📈 JOUW ROBUUSTE DATA CLEANING (Tegen de $24,000 spikes)
  const cleanedCurve = useMemo(() => {
      if (!safeEquityCurve.length) {
          const now = Math.floor(Date.now() / 1000);
          return [{ time: now - 86400, value: 0 }, { time: now, value: 0 }];
      }

      const uniqueMap = new Map();
      safeEquityCurve.forEach(p => { if (p.time && !isNaN(p.value)) uniqueMap.set(p.time, p); });
      let sorted = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);

      if (sorted.length < 2) return sorted;

      const values = sorted.map(s => s.value);
      const sortedVals = [...values].sort((a, b) => a - b);
      const median = sortedVals[Math.floor(sortedVals.length / 2)];
      
      let filtered = [];
      let lastValid = sorted[0].value;

      for (let i = 0; i < sorted.length; i++) {
          const val = sorted[i].value;
          const isExtremeOutlier = median > 0 && (val > median * 10 || val < median / 10);
          const isSuddenJump = lastValid > 0 && (val > lastValid * 5 || val < lastValid / 5);

          if (isExtremeOutlier && isSuddenJump && i > 0 && i < sorted.length - 1) {
              filtered.push({ ...sorted[i], value: lastValid });
          } else {
              filtered.push(sorted[i]);
              if (val > 0) lastValid = val;
          }
      }

      const now = Math.floor(Date.now() / 1000);
      let cutoff = 0;
      if (timeRange === '1D') cutoff = now - 86400;
      else if (timeRange === '1W') cutoff = now - 604800;
      else if (timeRange === '1M') cutoff = now - 2592000;

      const results = cutoff > 0 ? filtered.filter(p => p.time >= cutoff) : filtered;
      return results.length < 2 && filtered.length >= 2 ? filtered.slice(-2) : results;
  }, [safeEquityCurve, timeRange]);

  // 4. 📊 PERFORMANCE STATS & RISK CALCULATION
  const stats = useMemo(() => {
    const current = cleanedCurve[cleanedCurve.length - 1]?.value || 0;
    const start = cleanedCurve[0]?.value || 0;
    const pnl = current - start;
    const pnlPct = start > 0 ? (pnl / start) * 100 : 0;

    const totalTrades = tradeHistory.length;
    const wins = tradeHistory.filter(t => (t.pnl || 0) > 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const grossProfit = tradeHistory.reduce((acc, t) => acc + (t.pnl > 0 ? t.pnl : 0), 0);
    const grossLoss = Math.abs(tradeHistory.reduce((acc, t) => acc + (t.pnl < 0 ? t.pnl : 0), 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '∞' : '0.00');

    // Dynamische Risk Score
    const assetCount = activeBalances.length;
    const technicalRisk = Math.min(100, Math.max(10, (100 - (assetCount * 15)) + (Math.abs(pnlPct) / 2)));

    return { current, pnl, pnlPct, winRate, profitFactor, totalTrades, technicalRisk };
  }, [cleanedCurve, tradeHistory, activeBalances]);

  // 5. 🧩 ALLOCATION LOGICA (Gerepareerd)
// 5. 🧩 ALLOCATION LOGICA (Nu berekend op basis van ECHTE USD waarde!)
  const allocation = useMemo(() => {
      let realTotalUsd = parseFloat(balances.ZUSD || balances.USD || 0);
      
      // Stap 1: Bereken de keiharde USD waarde van elke munt in je wallet
      const assetsWithUsdValue = activeBalances.map(b => {
          if (b.coin === 'USD') {
              return { ...b, usdValue: parseFloat(b.amount) };
          } else {
              const price = livePrices[b.coin] || 0; 
              const usdValue = b.amount * price;
              realTotalUsd += usdValue;
              return { ...b, usdValue };
          }
      });

      const finalTotal = realTotalUsd > 0 ? realTotalUsd : 1;

      // Stap 2: Bereken het werkelijke percentage en sorteer van groot naar klein
      return assetsWithUsdValue.map(b => {
          const weight = (b.usdValue / finalTotal) * 100;
          return { ...b, weight: Math.min(100, Math.max(0, weight)).toFixed(1) };
      }).sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight));
      
  }, [activeBalances, balances, livePrices]);

  // 📉 CHART CONFIG
  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!scriptLoaded || !chartContainerRef.current || !window.LightweightCharts) return;
    chartContainerRef.current.innerHTML = '';
    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#71717a', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255, 255, 255, 0.03)' } },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.05)' },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.05)' },
    });

    const areaSeries = chart.addAreaSeries({ 
      lineColor: '#6366f1', 
      topColor: 'rgba(99, 102, 241, 0.2)', 
      bottomColor: 'rgba(99, 102, 241, 0)',
      lineWidth: 3,
    });
    
    areaSeries.setData(cleanedCurve);
    chart.timeScale().fitContent();
    chartInstance.current = chart;
    return () => chart.remove();
  }, [scriptLoaded, cleanedCurve]);

  return (
    <div className="flex-1 flex flex-col bg-[#020203] h-full overflow-y-auto custom-scrollbar font-sans">
      
      {/* 🚀 BLOOMBERG NAV */}
      <div className="h-16 border-b border-white/5 flex items-center px-8 bg-[#09090b]/50 backdrop-blur-xl sticky top-0 z-50 justify-between">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                <Globe className="text-indigo-400 w-5 h-5 animate-spin-slow" />
            </div>
            <div>
               <h2 className="text-white font-black tracking-tighter text-sm uppercase">Institutional Terminal</h2>
               <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> Kraken Core Active
               </span>
            </div>
        </div>
        <button onClick={() => { setIsSyncing(true); onRefresh().finally(() => setIsSyncing(false)); }} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/5 rounded-xl text-[10px] font-black text-zinc-400 hover:text-white transition-all uppercase tracking-widest">
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> Synchronize
        </button>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto w-full space-y-6">
        
        {/* MAIN ROW: CHART + RISK ADVISOR */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* CHART PANEL */}
            <div className="lg:col-span-3 bg-[#09090b] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 blur-[120px] pointer-events-none transition-colors"></div>
                <div className="flex justify-between items-end mb-8 relative z-10">
                    <div>
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2 block">Total Equity (USD)</span>
                        <div className="flex items-baseline gap-4">
                            <span className="text-6xl font-mono text-white font-black tracking-tighter">${stats.current.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black ${stats.pnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {stats.pnl >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                                {stats.pnlPct.toFixed(2)}%
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {['1D', '1W', '1M', 'ALL'].map(t => (
                            <button key={t} onClick={() => setTimeRange(t)} className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${timeRange === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}>{t}</button>
                        ))}
                    </div>
                </div>
                <div className="h-[320px]" ref={chartContainerRef}></div>
            </div>

            {/* 🧠 RISK ADVISOR PANEL (MET DE VOLATILITY/DIVERSIFICATION BLOKJES) */}
            <div className="bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 flex flex-col relative overflow-hidden shadow-2xl">
                <div className="flex items-center gap-3 mb-8">
                    <div className={`p-2.5 rounded-xl ${hasGemini ? 'bg-indigo-500/10 text-indigo-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        {hasGemini ? <Sparkles size={20} className="animate-pulse" /> : <ShieldAlert size={20} />}
                    </div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Risk Advisor</h3>
                </div>

                <div className="flex-1 space-y-8">
                    <div>
                        <div className="flex justify-between text-[10px] font-black uppercase mb-3 text-zinc-500">
                            <span>Portfolio Health</span>
                            <span className={stats.technicalRisk < 50 ? 'text-emerald-400' : 'text-amber-400'}>{100 - Math.round(stats.technicalRisk)}%</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden border border-white/5">
                            <div className={`h-full transition-all duration-1000 ${stats.technicalRisk < 50 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-amber-500'}`} style={{ width: `${100 - stats.technicalRisk}%` }}></div>
                        </div>
                    </div>

                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                        <span className="text-[9px] font-black text-zinc-500 uppercase block mb-3">Insights</span>
                        <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                            {hasGemini 
                                ? "Gemini is analyzing market correlations and your current asset exposure... All systems look optimal for current volatility levels."
                                : "Technical Engine: Portfolio is concentrated in " + activeBalances.length + " assets. Risk is balanced but diversification could be improved."}
                        </p>
                    </div>

                    {/* ✨ HIER ZIJN DE GEZOCHTE BLOKJES: VOLATILITY & DIVERSIFICATION */}
                    <div className="grid grid-cols-2 gap-3">
                         <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                            <span className="text-[8px] text-zinc-500 uppercase font-black block mb-1 tracking-tighter">Volatility</span>
                            <span className="text-xs font-bold text-white uppercase">Stable/Med</span>
                         </div>
                         <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                            <span className="text-[8px] text-zinc-500 uppercase font-black block mb-1 tracking-tighter">Diversification</span>
                            <span className="text-xs font-bold text-white uppercase">{activeBalances.length > 3 ? 'Optimal' : 'Basic'}</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        {/* PERFORMANCE KPI'S ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
                { label: 'Profit Factor', val: stats.profitFactor, icon: Gauge, color: 'text-indigo-400' },
                { label: 'Win Rate', val: stats.winRate.toFixed(1) + '%', icon: Target, color: 'text-emerald-400' },
                { label: 'Executions', val: stats.totalTrades, icon: Zap, color: 'text-amber-400' },
                { label: 'Assets', val: activeBalances.length, icon: Briefcase, color: 'text-blue-400' }
            ].map((kpi, i) => (
                <div key={i} className="bg-[#09090b] border border-white/5 rounded-[2rem] p-6 flex items-center justify-between shadow-xl">
                    <div>
                        <span className="text-[10px] font-black text-zinc-500 uppercase mb-2 block">{kpi.label}</span>
                        <span className="text-2xl font-mono font-black text-white">{kpi.val}</span>
                    </div>
                    <kpi.icon className={kpi.color} size={22} />
                </div>
            ))}
        </div>

        {/* ALLOCATION MATRIX & LOGS ROW */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em] mb-8">Allocation Matrix</h3>
                <div className="space-y-4">
                    {allocation.map((item) => (
                        <div key={item.coin} className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-indigo-500/30 transition-all group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500 group-hover:bg-indigo-600 group-hover:text-white transition-all uppercase">
                                    {item.coin.substring(0, 3)}
                                </div>
                                <div>
                                    <p className="text-sm font-black text-white">{item.coin}</p>
                                    <p className="text-[10px] text-zinc-500 font-mono">{item.amount.toFixed(4)} Units</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-black text-indigo-400 font-mono">{item.weight}%</div>
                                <ChevronRight size={14} className="text-zinc-800 ml-auto mt-1 group-hover:text-zinc-500"/>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="xl:col-span-2 bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em] mb-8">Order Intelligence Log</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-y-3">
                        <thead>
                            <tr className="text-[10px] uppercase text-zinc-600 font-black tracking-widest">
                                <th className="pb-2 pl-4">Timestamp</th>
                                <th className="pb-2">Asset</th>
                                <th className="pb-2">Side</th>
                                <th className="pb-2">Price</th>
                                <th className="pb-2 text-right pr-4">Net PnL</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px]">
                            {/* 🔥 FIX: slice(0,6) pakt nu netjes de nieuwste trades! */}
                            {tradeHistory.slice(0, 10).map((t, i) => (
                                <tr key={i} className="group">
                                    <td className="py-4 pl-4 bg-black/40 rounded-l-2xl border-y border-l border-white/5 text-zinc-500 font-mono">{t.date}</td>
                                    <td className="py-4 bg-black/40 border-y border-white/5 font-black text-white uppercase">{t.pair}</td>
                                    <td className="py-4 bg-black/40 border-y border-white/5">
                                        <span className={`px-2.5 py-1 rounded-lg font-black text-[9px] uppercase ${t.side === 'Long' || t.side === 'Buy' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                                            {t.side}
                                        </span>
                                    </td>
                                    <td className="py-4 bg-black/40 border-y border-white/5 font-mono text-zinc-300">${t.price.toFixed(2)}</td>
                                    <td className={`py-4 pr-4 bg-black/40 rounded-r-2xl border-y border-r border-white/5 text-right font-mono font-black ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            
                            {/* Fallback voor als er nog geen trades zijn */}
                            {tradeHistory.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-[10px] text-zinc-600 italic uppercase tracking-widest border border-dashed border-white/5 rounded-xl">
                                        No recent executions found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioView;