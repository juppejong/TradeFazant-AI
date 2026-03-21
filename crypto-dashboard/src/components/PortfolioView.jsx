// src/components/PortfolioView.jsx
import React, { useEffect, useRef } from 'react';
import { Wallet } from 'lucide-react';

const PortfolioView = ({ balances, scriptLoaded, equityCurve }) => {
  const activeBalances = Object.entries(balances || {}).filter(([coin, amount]) => amount > 0);
  const safeEquityCurve = Array.isArray(equityCurve) ? equityCurve : [];
  const currentTotal = safeEquityCurve.length > 0 ? safeEquityCurve[safeEquityCurve.length - 1].value : 0;
  const chartContainerRef = useRef(null);

  useEffect(() => {
    if (!scriptLoaded || !chartContainerRef.current) return;
    
    chartContainerRef.current.innerHTML = '';
    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: { background: { type: 'transparent' }, textColor: '#a1a1aa' },
      grid: { vertLines: { visible: false }, horzLines: { color: '#27272a' } },
      timeScale: { visible: false }
    });
    const areaSeries = chart.addAreaSeries({ lineColor: '#10b981', topColor: 'rgba(16, 185, 129, 0.4)', bottomColor: 'rgba(16, 185, 129, 0.0)' });
    
    const uniqueMap = new Map();
    safeEquityCurve.forEach(p => {
        if (p.time && !isNaN(p.value)) uniqueMap.set(p.time, p);
    });
    let displayCurve = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);

    if (displayCurve.length === 0) {
       const now = Math.floor(Date.now() / 1000);
       displayCurve = [{ time: now - 86400, value: 0 }, { time: now, value: 0 }];
    } else if (displayCurve.length === 1) {
       displayCurve.unshift({ time: displayCurve[0].time - 86400, value: displayCurve[0].value * 0.99 });
    }
    
    try {
        areaSeries.setData(displayCurve);
        chart.timeScale().fitContent();
    } catch (e) {}

    const resize = () => chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
    window.addEventListener('resize', resize);
    resize();
    return () => { window.removeEventListener('resize', resize); chart.remove(); };
  }, [scriptLoaded, safeEquityCurve]);

  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto min-h-0">
      <div className="h-16 border-b border-zinc-800 flex items-center px-6 bg-[#09090b] shrink-0">
        <Wallet className="w-5 h-5 text-emerald-500 mr-3" />
        <div><h2 className="text-zinc-100 font-bold tracking-wide">Mijn Portefeuille</h2><p className="text-[10px] text-zinc-500 uppercase tracking-widest">Echte Equity Curve & Saldi</p></div>
      </div>
      <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
        <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden h-64 flex flex-col">
           <div className="absolute top-6 left-6 z-10">
             <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Totale Balans Waarde</h3>
             <span className="text-4xl font-mono text-zinc-100 font-bold">${currentTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
           </div>
           <div className="absolute inset-0 top-12" ref={chartContainerRef}></div>
        </div>
        <section>
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Huidige Saldi</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {activeBalances.length > 0 ? activeBalances.map(([coin, amount]) => (
              <div key={coin} className="bg-[#0b0e11] p-5 rounded-2xl border border-zinc-800 flex flex-col justify-center relative overflow-hidden group hover:border-emerald-500/50 transition">
                <span className="text-zinc-500 font-bold text-xs uppercase mb-1 relative z-10">{coin}</span>
                <span className="text-2xl font-mono text-zinc-100 relative z-10">{amount < 1 ? amount.toFixed(6) : amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
              </div>
            )) : <div className="col-span-4 p-8 border border-zinc-800 border-dashed rounded-2xl text-center text-zinc-500">Geen fondsen of niet verbonden.</div>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PortfolioView;