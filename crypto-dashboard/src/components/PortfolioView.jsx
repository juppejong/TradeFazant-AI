import React, { useEffect, useRef, useMemo } from 'react';
import { Wallet, TrendingUp, PieChart, Activity, DollarSign, ArrowUpRight, ArrowDownRight, BarChart3, Layers, RefreshCw, History } from 'lucide-react';

const PortfolioView = ({ balances, scriptLoaded, equityCurve, onRefresh, tradeHistory = [] }) => {
  const [isSyncing, setIsSyncing] = React.useState(false);

  // 🛠️ BUG FIX: Negeer "Dust" (stof restjes). Toon alleen assets groter dan 0.00001
  const activeBalances = Object.entries(balances || {}).filter(([coin, amount]) => {
      const val = parseFloat(amount);
      return !isNaN(val) && val > 0.00001; 
  });
  
  const safeEquityCurve = Array.isArray(equityCurve) ? equityCurve : [];
  
  // 🛠️ BUG FIX V5: Robuust Mediaan Filter (Spike & Dip)
  const cleanedCurve = useMemo(() => {
      if (!safeEquityCurve || safeEquityCurve.length === 0) {
          const now = Math.floor(Date.now() / 1000);
          return [{ time: now - 86400, value: 0 }, { time: now, value: 0 }];
      }

      const uniqueMap = new Map();
      safeEquityCurve.forEach(p => {
          if (p.time && !isNaN(p.value)) uniqueMap.set(p.time, p);
      });
      const displayCurve = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);

      if (displayCurve.length <= 2) return displayCurve;

      const sortedVals = [...displayCurve].map(p => p.value).sort((a, b) => a - b);
      const median = sortedVals[Math.floor(sortedVals.length / 2)] || 0;

      let cleaned = [];
      let lastValid = median > 0 ? median : displayCurve[0].value;

      for (let i = 0; i < displayCurve.length; i++) {
          const curr = displayCurve[i].value;
          const isOutlier = median > 0 && (curr > median * 1.5 || curr < median * 0.5);

          if (isOutlier) {
              cleaned.push({ time: displayCurve[i].time, value: lastValid });
          } else {
              cleaned.push(displayCurve[i]);
              lastValid = curr; 
          }
      }
      return cleaned;
  }, [safeEquityCurve]);

  const currentTotal = cleanedCurve[cleanedCurve.length - 1].value;
  const startTotal = cleanedCurve[0].value;
  const pnl = currentTotal - startTotal;
  const pnlPct = startTotal > 0 ? (pnl / startTotal) * 100 : 0;
  const isProfitable = pnl >= 0;

  const chartContainerRef = useRef(null);

  const handleSync = async () => {
    if (!onRefresh) return;
    setIsSyncing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsSyncing(false), 800);
    }
  };

  useEffect(() => {
    if (!scriptLoaded || !chartContainerRef.current) return;
    
    chartContainerRef.current.innerHTML = '';
    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: { background: { type: 'transparent' }, textColor: '#a1a1aa', fontFamily: 'Inter, sans-serif' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(39, 39, 42, 0.4)', style: 3 } },
      timeScale: { visible: true, borderColor: 'rgba(39, 39, 42, 0.4)' },
      rightPriceScale: { visible: true, borderColor: 'rgba(39, 39, 42, 0.4)' },
      crosshair: { mode: 0 }
    });

    const areaSeries = chart.addAreaSeries({ 
        lineColor: '#6366f1', // Indigo 500
        topColor: 'rgba(99, 102, 241, 0.4)', 
        bottomColor: 'rgba(99, 102, 241, 0.0)',
        lineWidth: 3,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
    });
    
    try {
        areaSeries.setData(cleanedCurve);
        chart.timeScale().fitContent();
    } catch (e) { console.error(e); }

    const resize = () => chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
    window.addEventListener('resize', resize);
    resize();
    return () => { window.removeEventListener('resize', resize); chart.remove(); };
  }, [scriptLoaded, cleanedCurve]);

  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="h-16 border-b border-zinc-800 flex items-center px-6 bg-[#09090b] shrink-0 sticky top-0 z-50">
        <Wallet className="w-5 h-5 text-indigo-500 mr-3" />
        <div>
           <h2 className="text-zinc-100 font-bold tracking-wide">Portfolio Overview</h2>
           <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Live Equity & Asset Allocation</p>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-8">
        
        <div className="flex flex-col xl:flex-row gap-8">
            {/* Left Column: Equity Chart & Main Stats */}
            <div className="flex-1 space-y-8">
                <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden flex flex-col shadow-xl">
                   <div className="flex justify-between items-start mb-6 z-10 relative">
                      <div>
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                           <DollarSign size={14} className="text-zinc-400"/> Total Portfolio Value
                        </h3>
                        <div className="flex items-end gap-3">
                           <span className="text-5xl font-mono text-zinc-100 font-bold tracking-tight">
                             ${currentTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                           </span>
                           <div className={`flex items-center gap-1 mb-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${isProfitable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {isProfitable ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                              {isProfitable ? '+' : ''}{pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
                           </div>
                        </div>
                      </div>
                      <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                         <TrendingUp className="text-indigo-400 w-6 h-6" />
                      </div>
                   </div>
                   
                   <div className="h-[350px] w-full relative z-0" ref={chartContainerRef}></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#0b0e11] border border-zinc-800 rounded-xl p-5 flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-lg"><Activity className="text-blue-400 w-5 h-5"/></div>
                        <div>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Active Assets</p>
                            <p className="text-xl font-mono font-bold text-zinc-200">{activeBalances.length}</p>
                        </div>
                    </div>
                    <div className="bg-[#0b0e11] border border-zinc-800 rounded-xl p-5 flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-lg"><BarChart3 className="text-emerald-400 w-5 h-5"/></div>
                        <div>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Start Balance</p>
                            <p className="text-xl font-mono font-bold text-zinc-200">${startTotal.toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="bg-[#0b0e11] border border-zinc-800 rounded-xl p-5 flex items-center gap-4">
                        <div className="p-3 bg-purple-500/10 rounded-lg"><PieChart className="text-purple-400 w-5 h-5"/></div>
                        <div>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Account Health</p>
                            <p className="text-xl font-mono font-bold text-zinc-200">Excellent</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Asset Breakdown */}
            <div className="w-full xl:w-96 flex flex-col gap-6">
                <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-6 flex-1 shadow-xl">
                   <div className="flex justify-between items-center mb-6">
                     <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Layers size={14} className="text-indigo-400"/> Asset Balances
                     </h3>
                     <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="text-[10px] bg-zinc-800 hover:bg-indigo-600 text-zinc-300 hover:text-white px-2 py-1.5 rounded transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Force sync with Kraken API"
                     >
                        <RefreshCw size={10} className={isSyncing ? "animate-spin text-indigo-400" : ""} /> 
                        {isSyncing ? 'Syncing...' : 'Sync'}
                     </button>
                   </div>
                   
                   <div className="space-y-4 max-h-[430px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full">
                      {activeBalances.length > 0 ? activeBalances.map(([coin, amount]) => (
                        <div key={coin} className="group bg-[#050505] p-4 rounded-xl border border-zinc-800/50 hover:border-indigo-500/30 transition-colors flex justify-between items-center relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          
                          <div className="flex items-center gap-3 relative z-10">
                             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shadow-inner">
                                {coin.substring(0, 1)}
                             </div>
                             <span className="text-zinc-200 font-bold tracking-wide">{coin.replace('XXBT', 'BTC').replace('ZUSD', 'USD').replace('XETH', 'ETH')}</span>
                          </div>
                          <span className="text-base font-mono text-indigo-300 font-bold relative z-10">
                             {amount < 1 ? amount.toFixed(6) : amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                      )) : (
                        <div className="p-8 border border-zinc-800 border-dashed rounded-xl text-center flex flex-col items-center justify-center gap-3">
                           <Wallet className="w-8 h-8 text-zinc-600"/>
                           <p className="text-zinc-500 text-sm">No funds available.</p>
                        </div>
                      )}
                   </div>
                </div>
            </div>
        </div>

        {/* 📜 NEW: Recent Trades Section (Bottom Full Width) */}
        <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-6 shadow-xl mb-8">
           <div className="flex items-center justify-between mb-6 border-b border-zinc-800/50 pb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                 <History size={16} className="text-blue-400"/> Recent Transactions
              </h3>
              <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full font-mono">Last 20 trades</span>
           </div>
           
           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800/50">
                       <th className="pb-3 pl-2 font-bold">Time & Date</th>
                       <th className="pb-3 font-bold">Pair</th>
                       <th className="pb-3 font-bold">Type</th>
                       <th className="pb-3 font-bold">Side</th>
                       <th className="pb-3 font-bold">Price</th>
                       <th className="pb-3 font-bold">Amount</th>
                       <th className="pb-3 pr-2 font-bold text-right">Cost Value</th>
                    </tr>
                 </thead>
                 <tbody className="text-xs">
                    {tradeHistory.length > 0 ? tradeHistory.slice(0, 20).map((trade) => (
                       <tr key={trade.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition-colors group">
                          <td className="py-3 pl-2 text-zinc-400 font-mono text-[11px]">{trade.date}</td>
                          <td className="py-3 text-zinc-200 font-bold">{trade.pair.replace('XBT', 'BTC')}</td>
                          <td className="py-3 text-zinc-500 uppercase text-[10px] tracking-wider">{trade.type}</td>
                          <td className="py-3">
                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${trade.side === 'Long' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                                {trade.side === 'Long' ? 'BUY' : 'SELL'}
                             </span>
                          </td>
                          <td className="py-3 text-zinc-300 font-mono">${trade.price >= 10 ? trade.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : trade.price.toFixed(4)}</td>
                          <td className="py-3 text-zinc-300 font-mono">{trade.amount.toFixed(4)}</td>
                          <td className="py-3 pr-2 text-right font-mono text-zinc-400 group-hover:text-white transition-colors">
                             ${trade.cost ? trade.cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : (trade.price * trade.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>
                       </tr>
                    )) : (
                       <tr>
                          <td colSpan="7" className="py-12 text-center text-zinc-600">
                             <div className="flex flex-col items-center gap-2">
                                <Activity className="w-6 h-6 text-zinc-700" />
                                <span>No recent trades found in history.</span>
                             </div>
                          </td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>

      </div>
    </div>
  );
};

export default PortfolioView;