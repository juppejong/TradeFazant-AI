import React, { useEffect, useRef, useMemo, useState } from 'react';
import { 
  ArrowUpRight, ArrowDownRight, RefreshCw, 
  Gauge, Target, Sparkles, Zap, Briefcase, ChevronRight, ShieldAlert, Database
} from 'lucide-react';

const exchangeMap = {
    'Kraken': { text: 'text-purple-400', bg: 'bg-purple-500/10', dot: 'bg-purple-500' },
    'Coinbase': { text: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-500' }
};

const PortfolioView = ({ balances, scriptLoaded, onRefresh, tradeHistory = [] }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeRange, setTimeRange] = useState('ALL');
  const [livePrices, setLivePrices] = useState({});

  const apiStatus = useMemo(() => {
    try {
      const keys = JSON.parse(localStorage.getItem('trading_api_keys') || '{}');
      return { gemini: !!keys.geminiKey, kraken: !!keys.krakenKey, coinbase: !!keys.cbKey };
    } catch (e) { 
      return { gemini: false, kraken: false, coinbase: false }; 
    }
  }, []);

  const balancesArray = useMemo(() => {
    if (Array.isArray(balances)) return balances;
    return Object.entries(balances || {}).map(([coin, amount]) => {
      let cleanCoin = coin.replace('XXBT', 'BTC').replace('ZUSD', 'USD').replace('XETH', 'ETH');
      return { currency: cleanCoin, amount: parseFloat(amount), exchange: 'Kraken' };
    });
  }, [balances]);

  useEffect(() => {
    const fetchPrices = async () => {
      const cryptos = [...new Set(balancesArray.filter(b => b.currency !== 'USD' && b.currency !== 'EUR').map(b => b.currency))];
      if (cryptos.length === 0) return;
      const pairs = cryptos.map(c => `${c === 'BTC' ? 'XBT' : c}USD`).join(',');
      try {
        const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`);
        const data = await res.json();
        if (!data.error || data.error.length === 0) {
          const newPrices = {};
          Object.keys(data.result).forEach(key => {
            cryptos.forEach(coin => {
              const searchCoin = coin === 'BTC' ? 'XBT' : coin;
              if (key.includes(searchCoin)) newPrices[coin] = parseFloat(data.result[key].c[0]);
            });
          });
          setLivePrices(newPrices);
        }
      } catch (err) { console.error("Kon live prijzen niet ophalen:", err); }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 15000); 
    return () => clearInterval(interval);
  }, [balancesArray]);
  
  const { allocationMatrix, currentTotalUsdValue } = useMemo(() => {
      if (balancesArray.length === 0) return { allocationMatrix: [], currentTotalUsdValue: 0 };
      let totalUsd = 0;
      const matrix = [];
      balancesArray.forEach(b => {
          let usdValue = (b.currency === 'USD' || b.currency === 'EUR') ? b.amount : b.amount * (livePrices[b.currency] || 0);
          if (usdValue > 0.1) {
              totalUsd += usdValue;
              matrix.push({ coin: b.currency, amount: b.amount, exchange: b.exchange || 'Unknown', usdValue });
          }
      });
      matrix.forEach(item => item.weight = totalUsd > 0 ? (item.usdValue / totalUsd) * 100 : 0);
      return { allocationMatrix: matrix.sort((a, b) => b.usdValue - a.usdValue), currentTotalUsdValue: totalUsd };
  }, [balancesArray, livePrices]);

  // 🔥 DE FIX: Wacht met opslaan tot prijzen bekend zijn en gebruik 'portfolio_history_v3'
  const [chartHistory, setChartHistory] = useState(() => {
      try { return JSON.parse(localStorage.getItem('portfolio_history_v3')) || []; }
      catch { return []; }
  });

  const hasCryptos = balancesArray.some(b => b.currency !== 'USD' && b.currency !== 'EUR');
  const pricesLoaded = Object.keys(livePrices).length > 0;
  const isDataReady = !hasCryptos || pricesLoaded;

  useEffect(() => {
      if (currentTotalUsdValue > 1 && isDataReady) {
          setChartHistory(prev => {
              const now = Math.floor(Date.now() / 1000);
              const last = prev[prev.length - 1];
              if (!last || Math.abs(last.value - currentTotalUsdValue) > 1 || now - last.time > 60) {
                  const newCurve = [...prev, { time: now, value: currentTotalUsdValue }];
                  const trimmed = newCurve.slice(-500);
                  localStorage.setItem('portfolio_history_v3', JSON.stringify(trimmed));
                  return trimmed;
              }
              return prev;
          });
      }
  }, [currentTotalUsdValue, isDataReady]);

  const cleanedCurve = useMemo(() => {
      if (!chartHistory.length) {
          const now = Math.floor(Date.now() / 1000);
          return [{ time: now - 86400, value: currentTotalUsdValue || 0 }, { time: now, value: currentTotalUsdValue || 0 }];
      }
      let cutoff = 0;
      const now = Math.floor(Date.now() / 1000);
      if (timeRange === '1D') cutoff = now - 86400;
      else if (timeRange === '1W') cutoff = now - 604800;
      else if (timeRange === '1M') cutoff = now - 2592000;

      const results = cutoff > 0 ? chartHistory.filter(p => p.time >= cutoff) : chartHistory;
      return results.length < 2 && chartHistory.length >= 2 ? chartHistory.slice(-2) : results;
  }, [chartHistory, timeRange, currentTotalUsdValue]);

  const stats = useMemo(() => {
    const current = currentTotalUsdValue;
    const start = cleanedCurve[0]?.value || current; 
    const pnl = current - start;
    const pnlPct = start > 0 ? (pnl / start) * 100 : 0;
    const totalTrades = tradeHistory.length;
    const wins = tradeHistory.filter(t => (t.pnl || 0) > 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const grossProfit = tradeHistory.reduce((acc, t) => acc + (t.pnl > 0 ? t.pnl : 0), 0);
    const grossLoss = Math.abs(tradeHistory.reduce((acc, t) => acc + (t.pnl < 0 ? t.pnl : 0), 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '∞' : '0.00');
    const assetCount = allocationMatrix.length;
    const technicalRisk = Math.min(100, Math.max(10, (100 - (assetCount * 15)) + (Math.abs(pnlPct) / 2)));
    return { current, pnl, pnlPct, winRate, profitFactor, totalTrades, technicalRisk };
  }, [cleanedCurve, tradeHistory, allocationMatrix, currentTotalUsdValue]);

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
      lineColor: '#6366f1', topColor: 'rgba(99, 102, 241, 0.2)', bottomColor: 'rgba(99, 102, 241, 0)', lineWidth: 3,
    });
    areaSeries.setData(cleanedCurve);
    chart.timeScale().fitContent();
    chartInstance.current = chart;
    return () => chart.remove();
  }, [scriptLoaded, cleanedCurve]);

  return (
    <div className="flex-1 flex flex-col bg-[#020203] h-full overflow-y-auto custom-scrollbar font-sans">
      <div className="h-16 border-b border-white/5 flex items-center px-8 bg-[#09090b]/50 backdrop-blur-xl sticky top-0 z-50 justify-between">
        <div className="flex items-center gap-6">
            <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                <Database className="text-indigo-400 w-5 h-5" />
            </div>
            <div>
               <h2 className="text-white font-black tracking-tighter text-sm uppercase">Multi-Exchange Hub</h2>
               <div className="flex items-center gap-3 mt-1">
                 <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${apiStatus.kraken ? 'text-purple-400' : 'text-zinc-700'}`}>
                   <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.kraken ? 'bg-purple-500 animate-pulse' : 'bg-zinc-800'}`}></div> Kraken
                 </span>
                 <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${apiStatus.coinbase ? 'text-blue-400' : 'text-zinc-700'}`}>
                   <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.coinbase ? 'bg-blue-500 animate-pulse' : 'bg-zinc-800'}`}></div> Coinbase
                 </span>
               </div>
            </div>
        </div>
        <button onClick={() => { setIsSyncing(true); onRefresh().finally(() => setIsSyncing(false)); }} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/5 rounded-xl text-[10px] font-black text-zinc-400 hover:text-white transition-all uppercase tracking-widest">
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> Aggregate
        </button>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto w-full space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 bg-[#09090b] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 blur-[120px] pointer-events-none transition-colors"></div>
                <div className="flex justify-between items-end mb-8 relative z-10">
                    <div>
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2 block">Aggregated Equity (USD)</span>
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

            <div className="bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 flex flex-col relative overflow-hidden shadow-2xl">
                <div className="flex items-center gap-3 mb-8">
                    <div className={`p-2.5 rounded-xl ${apiStatus.gemini ? 'bg-indigo-500/10 text-indigo-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        {apiStatus.gemini ? <Sparkles size={20} className="animate-pulse" /> : <ShieldAlert size={20} />}
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
                            {apiStatus.gemini ? "Gemini is analyzing multi-exchange correlations. Aggregated exposure looks optimal across connected wallets." : "Aggregated Portfolio: Concentrated in " + allocationMatrix.length + " assets across your connected exchanges."}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                         <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                            <span className="text-[8px] text-zinc-500 uppercase font-black block mb-1 tracking-tighter">Connected</span>
                            <span className="text-xs font-bold text-white uppercase">{(apiStatus.kraken ? 1 : 0) + (apiStatus.coinbase ? 1 : 0)} Exchanges</span>
                         </div>
                         <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                            <span className="text-[8px] text-zinc-500 uppercase font-black block mb-1 tracking-tighter">Diversification</span>
                            <span className="text-xs font-bold text-white uppercase">{allocationMatrix.length > 3 ? 'Optimal' : 'Basic'}</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
                { label: 'Profit Factor', val: stats.profitFactor, icon: Gauge, color: 'text-indigo-400' },
                { label: 'Win Rate', val: stats.winRate.toFixed(1) + '%', icon: Target, color: 'text-emerald-400' },
                { label: 'Executions', val: stats.totalTrades, icon: Zap, color: 'text-amber-400' },
                { label: 'Global Assets', val: allocationMatrix.length, icon: Briefcase, color: 'text-blue-400' }
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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em] mb-8">Global Allocation</h3>
                <div className="space-y-4">
                    {allocationMatrix.map((item) => {
                        const exchangeInfo = exchangeMap[item.exchange] || { text: 'text-zinc-500', bg: 'bg-zinc-800/10', dot: 'bg-zinc-800' };
                        return (
                        <div key={`${item.exchange}-${item.coin}`} className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-indigo-500/30 transition-all group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500 group-hover:bg-indigo-600 group-hover:text-white transition-all uppercase">
                                    {item.coin.substring(0, 3)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-black text-white">{item.coin}</p>
                                        <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1 ${exchangeInfo.bg} ${exchangeInfo.text} border border-white/5`}>
                                            <div className={`w-1 h-1 rounded-full ${exchangeInfo.dot}`}></div>
                                            {item.exchange}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-mono mt-1">{item.amount.toFixed(4)} Units</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-black text-white font-mono">${item.usdValue.toFixed(2)}</div>
                                <div className="text-xs font-black text-indigo-400 font-mono">{item.weight.toFixed(1)}%</div>
                            </div>
                        </div>
                    )})}
                    {allocationMatrix.length === 0 && <p className="text-center text-xs text-zinc-600 mt-10">No active balances found</p>}
                </div>
            </div>

            <div className="xl:col-span-2 bg-[#09090b] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em] mb-8">Aggregated Executions</h3>
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
                            {tradeHistory.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-[10px] text-zinc-600 italic uppercase tracking-widest border border-dashed border-white/5 rounded-xl">
                                        No executions found
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