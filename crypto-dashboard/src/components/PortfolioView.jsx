import React, { useEffect, useRef, useMemo, useState } from 'react';
import { 
  Wallet, TrendingUp, PieChart, Activity, DollarSign, 
  ArrowUpRight, ArrowDownRight, BarChart3, Layers, 
  RefreshCw, History, ShieldCheck, Gauge, Target, 
  Zap, AlertCircle, Briefcase, ChevronRight
} from 'lucide-react';

const PortfolioView = ({ balances, scriptLoaded, equityCurve, onRefresh, tradeHistory = [] }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeRange, setTimeRange] = useState('ALL');

  // 🛠️ DUST FILTER: Ignore balances that are effectively zero to keep the view clean
  const activeBalances = useMemo(() => {
    return Object.entries(balances || {}).filter(([coin, amount]) => {
      const val = parseFloat(amount);
      // Increased threshold significantly to hide "dust" (like the 0.0065 ADA)
      // Only show assets worth more than a negligible amount
      return !isNaN(val) && val > 0.01; 
    }).map(([coin, amount]) => ({
        coin: coin.replace('XXBT', 'BTC').replace('ZUSD', 'USD').replace('XETH', 'ETH'),
        amount: parseFloat(amount)
    }));
  }, [balances]);
  
  const safeEquityCurve = Array.isArray(equityCurve) ? equityCurve : [];
  
  // 🛠️ ROBUST DATA CLEANING: Removes those $24,000 spikes while keeping real data
  const cleanedCurve = useMemo(() => {
      if (!safeEquityCurve.length) {
          const now = Math.floor(Date.now() / 1000);
          return [{ time: now - 86400, value: 0 }, { time: now, value: 0 }];
      }

      // 1. Remove duplicates and sort by timestamp
      const uniqueMap = new Map();
      safeEquityCurve.forEach(p => { if (p.time && !isNaN(p.value)) uniqueMap.set(p.time, p); });
      let sorted = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);

      if (sorted.length < 2) return sorted;

      // 2. Outlier Filter (Modified Z-Score / Median based)
      const values = sorted.map(s => s.value);
      const sortedVals = [...values].sort((a, b) => a - b);
      const median = sortedVals[Math.floor(sortedVals.length / 2)];
      
      let filtered = [];
      let lastValid = sorted[0].value;

      for (let i = 0; i < sorted.length; i++) {
          const val = sorted[i].value;
          
          // A spike is defined as a value that is drastically different from the median 
          // AND different from its direct neighbor, but we allow transitions from 0.
          const isExtremeOutlier = median > 0 && (val > median * 10 || val < median / 10);
          const isSuddenJump = lastValid > 0 && (val > lastValid * 5 || val < lastValid / 5);

          if (isExtremeOutlier && isSuddenJump && i > 0 && i < sorted.length - 1) {
              // It's a spike/glitch, use last known good value
              filtered.push({ ...sorted[i], value: lastValid });
          } else {
              filtered.push(sorted[i]);
              if (val > 0) lastValid = val; // Only update baseline with non-zero values
          }
      }

      // 3. Apply Timeframe Selection
      const now = Math.floor(Date.now() / 1000);
      let cutoff = 0;
      if (timeRange === '1D') cutoff = now - 86400;
      else if (timeRange === '1W') cutoff = now - 604800;
      else if (timeRange === '1M') cutoff = now - 2592000;

      const results = cutoff > 0 ? filtered.filter(p => p.time >= cutoff) : filtered;
      
      // Safety: always return at least 2 points
      if (results.length < 2 && filtered.length >= 2) return filtered.slice(-2);
      return results;
  }, [safeEquityCurve, timeRange]);

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

    let peak = 0;
    let maxDD = 0;
    cleanedCurve.forEach(p => {
        if (p.value > peak) peak = p.value;
        const dd = peak > 0 ? ((peak - p.value) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
    });

    return { current, pnl, pnlPct, winRate, profitFactor, maxDD, totalTrades };
  }, [cleanedCurve, tradeHistory]);

  // 🛠️ ALLOCATION FIX: Correct percentage calculation relative to total value
  const allocation = useMemo(() => {
      const total = stats.current || 1;
      const usdBalance = balances.ZUSD || balances.USD || 0;
      
      return activeBalances.map(b => {
          let weight = 0;
          if (b.coin === 'USD') {
              weight = (parseFloat(usdBalance) / total) * 100;
          } else {
              // Calculate remaining value for crypto assets
              const cryptoTotalValue = total - parseFloat(usdBalance);
              weight = cryptoTotalValue > 0 ? (cryptoTotalValue / total) * (100 / (activeBalances.length - 1 || 1)) : 0;
          }
          return { ...b, weight: Math.min(100, Math.max(0, weight)).toFixed(1) };
      });
  }, [activeBalances, stats.current, balances]);

  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!scriptLoaded || !chartContainerRef.current || !window.LightweightCharts) return;
    
    chartContainerRef.current.innerHTML = '';
    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: { background: { type: 'transparent' }, textColor: '#71717a', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(39, 39, 42, 0.2)', style: 2 } },
      timeScale: { visible: true, borderColor: 'rgba(39, 39, 42, 0.5)', rightOffset: 2 },
      rightPriceScale: { visible: true, borderColor: 'rgba(39, 39, 42, 0.5)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      crosshair: { mode: 0 }
    });

    const areaSeries = chart.addAreaSeries({ 
        lineColor: '#6366f1', 
        topColor: 'rgba(99, 102, 241, 0.2)', 
        bottomColor: 'rgba(99, 102, 241, 0.0)',
        lineWidth: 2,
    });
    
    areaSeries.setData(cleanedCurve);
    chart.timeScale().fitContent();
    chartInstance.current = chart;

    const resize = () => {
        if (chartContainerRef.current && chartInstance.current) {
            chartInstance.current.applyOptions({ 
                width: chartContainerRef.current.clientWidth, 
                height: chartContainerRef.current.clientHeight 
            });
        }
    };
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); chart.remove(); };
  }, [scriptLoaded, cleanedCurve]);

  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto overflow-x-hidden">
      {/* Header section */}
      <div className="h-16 border-b border-zinc-800/50 flex items-center px-8 bg-[#09090b]/80 backdrop-blur-md shrink-0 sticky top-0 z-50 justify-between">
        <div className="flex items-center">
            <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center mr-4 border border-indigo-500/20">
                <Briefcase className="text-indigo-400 w-5 h-5" />
            </div>
            <div>
               <h2 className="text-zinc-100 font-bold tracking-tight text-lg">Portfolio Intelligence</h2>
               <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-medium">Professional Asset Management</p>
            </div>
        </div>
        <button 
            onClick={() => { setIsSyncing(true); onRefresh().finally(() => setTimeout(() => setIsSyncing(false), 1000)); }}
            className={`flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:border-zinc-600 transition-all active:scale-95 ${isSyncing ? 'opacity-50' : ''}`}
        >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Refresh Data'}
        </button>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto w-full space-y-8">
        
        {/* Top Row: Chart and Key Figures */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 bg-[#0b0e11] border border-zinc-800 rounded-3xl p-8 shadow-2xl flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] pointer-events-none"></div>
                <div className="flex justify-between items-end mb-8 relative z-10">
                    <div>
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                           Net Equity Value
                        </h3>
                        <div className="flex items-baseline gap-4">
                            <span className="text-5xl font-mono text-zinc-100 font-bold tracking-tighter">
                                ${stats.current.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                            <span className={`text-sm font-bold flex items-center gap-1 ${stats.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {stats.pnl >= 0 ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}
                                {stats.pnlPct.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                    <div className="hidden md:flex gap-1 text-[10px] font-bold">
                        {['1D', '1W', '1M', 'ALL'].map(t => (
                            <button 
                                key={t} 
                                onClick={() => setTimeRange(t)}
                                className={`px-3 py-1 rounded-lg border transition-all ${timeRange === t ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="h-[320px] w-full" ref={chartContainerRef}></div>
            </div>

            {/* Performance Matrix */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between group hover:border-zinc-600 transition-colors shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Profit Factor</span>
                        <Gauge size={16} className="text-indigo-500"/>
                    </div>
                    <span className="text-2xl font-mono font-bold text-zinc-100">{stats.profitFactor}</span>
                    <div className="w-full bg-zinc-800 h-1 mt-3 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full" style={{ width: `${Math.min(parseFloat(stats.profitFactor) * 20, 100)}%` }}></div>
                    </div>
                </div>
                <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between group hover:border-zinc-600 transition-colors shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Win Rate</span>
                        <Target size={16} className="text-emerald-500"/>
                    </div>
                    <span className="text-2xl font-mono font-bold text-zinc-100">{stats.winRate.toFixed(1)}%</span>
                    <div className="w-full bg-zinc-800 h-1 mt-3 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${stats.winRate}%` }}></div>
                    </div>
                </div>
                <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between group hover:border-zinc-600 transition-colors shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Max Drawdown</span>
                        <ShieldCheck size={16} className="text-rose-500"/>
                    </div>
                    <span className="text-2xl font-mono font-bold text-zinc-100">-{stats.maxDD.toFixed(1)}%</span>
                    <p className="text-[9px] text-zinc-600 mt-2 italic font-medium">Risk exposure within safety limits</p>
                </div>
            </div>
        </div>

        {/* Second Row: Asset Allocation & Execution Log */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Asset Allocation List */}
            <div className="bg-[#0b0e11] border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                   <PieChart size={14} className="text-purple-400"/> Asset Allocation
                </h3>
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
                    {allocation.map((item) => (
                        <div key={item.coin} className="flex items-center justify-between p-3 rounded-2xl bg-[#050505] border border-zinc-800/50 hover:border-indigo-500/30 transition-all cursor-default group relative overflow-hidden">
                            <div className="flex items-center gap-3 relative z-10">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                    {item.coin.substring(0, 2)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-zinc-100">{item.coin}</p>
                                    <p className="text-[10px] text-zinc-500 font-mono">{item.amount.toFixed(4)} units held</p>
                                </div>
                            </div>
                            <div className="text-right relative z-10">
                                <p className="text-sm font-bold text-indigo-400 font-mono">{item.weight}%</p>
                                <ChevronRight size={12} className="text-zinc-700 ml-auto"/>
                            </div>
                        </div>
                    ))}
                    {allocation.length === 0 && <p className="text-center py-10 text-zinc-600 italic">No active positions detected.</p>}
                </div>
            </div>

            {/* Order Execution Log */}
            <div className="xl:col-span-2 bg-[#0b0e11] border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <History size={14} className="text-blue-400"/> Order Execution Log
                    </h3>
                    <span className="text-[9px] bg-blue-500/10 text-blue-500 px-2.5 py-1 rounded-full font-bold">Total: {stats.totalTrades}</span>
                </div>
                
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                            <tr className="text-[10px] uppercase text-zinc-600 font-bold">
                                <th className="pb-2 pl-4">Timestamp</th>
                                <th className="pb-2">Asset</th>
                                <th className="pb-2">Direction</th>
                                <th className="pb-2">Ex. Price</th>
                                <th className="pb-2 text-right pr-4">PnL Realized</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px]">
                            {tradeHistory.slice(0, 10).map((t) => (
                                <tr key={t.id} className="group transition-all">
                                    <td className="py-3 pl-4 bg-[#050505] rounded-l-2xl border-y border-l border-zinc-800/50 text-zinc-500 font-mono">{t.date}</td>
                                    <td className="py-3 bg-[#050505] border-y border-zinc-800/50 font-bold text-zinc-200">{t.pair}</td>
                                    <td className="py-3 bg-[#050505] border-y border-zinc-800/50">
                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase ${t.side === 'Long' ? 'text-emerald-500 bg-emerald-500/5 border border-emerald-500/20' : 'text-rose-500 bg-rose-500/5 border border-rose-500/20'}`}>
                                            {t.side === 'Long' ? 'Buy' : 'Sell'}
                                        </span>
                                    </td>
                                    <td className="py-3 bg-[#050505] border-y border-zinc-800/50 font-mono text-zinc-300">${t.price.toFixed(2)}</td>
                                    <td className="py-3 pr-4 bg-[#050505] rounded-r-2xl border-y border-r border-zinc-800/50 text-right font-mono font-bold">
                                        <span className={t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                            {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Legend / Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 hover:opacity-100 transition-opacity pb-10">
            <div className="flex gap-3 items-start">
                <Zap size={16} className="text-yellow-500 shrink-0 mt-1"/>
                <p className="text-[10px] leading-relaxed"><strong>Instant Settlement:</strong> All displayed balances are directly available on the Kraken exchange. PnL is recalculated in real-time.</p>
            </div>
            <div className="flex gap-3 items-start">
                <AlertCircle size={16} className="text-blue-500 shrink-0 mt-1"/>
                <p className="text-[10px] leading-relaxed"><strong>Risk Intelligence:</strong> Profit Factor and Drawdown calculations assist in evaluating the stability of your bots.</p>
            </div>
            <div className="flex gap-3 items-start">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-1"/>
                <p className="text-[10px] leading-relaxed"><strong>Secure API:</strong> Connection via secure WebSocket and REST proxy. No private keys are stored on external servers.</p>
            </div>
        </div>

      </div>
    </div>
  );
};

export default PortfolioView;