import React, { useState, useEffect } from 'react';
import { getApiHeaders } from '../utils/api';

const LiveTicker = () => {
  const [tickerData, setTickerData] = useState([]);

  useEffect(() => {
    const fetchTicker = async () => {
      try {
        // Vraag een mooie selectie top-munten op
        const pairs = "XXBTZUSD,XETHZUSD,SOLUSD,ADAUSD,XRPUSD,DOTUSD,DOGEUSD,AVAXUSD,LINKUSD,POLUSD,UNIUSD,LTCUSD";
        const res = await fetch('http://localhost:3001/api/ticker', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ pair: pairs })
        });
        const json = await res.json();
        
        if (json.result) {
          const mapped = Object.keys(json.result).map(key => {
            const p = json.result[key];
            const open = parseFloat(p.o);
            const close = parseFloat(p.c[0]);
            const pct = ((close - open) / open) * 100;
            
            // Maak de namen mooi (bijv. BTC-USD in plaats van XXBTZUSD) net als Coinbase
            let symbol = key.replace('ZUSD', '-USD').replace('XXBT', 'BTC').replace('XETH', 'ETH');
            if (!symbol.includes('-')) symbol = symbol.replace('USD', '-USD');
            
            return { symbol, pct, close };
          }).sort((a, b) => b.pct - a.pct); // 🔥 Sorteert op hoogste winst ("Activa met winst")
          
          setTickerData(mapped);
        }
      } catch (e) { 
          console.error("Ticker fetch error", e); 
      }
    };

    fetchTicker();
    const interval = setInterval(fetchTicker, 60000); // Ververs data elke minuut
    return () => clearInterval(interval);
  }, []);

  if (tickerData.length === 0) return null;

  return (
    // De balk zelf (vast aan de onderkant, h-8 is lekker compact)
    <div className="h-[34px] bg-[#050505] border-t border-zinc-800 flex items-center shrink-0 overflow-hidden relative text-[11px] font-mono select-none">
      
      {/* CSS voor de eindeloze scroll-animatie */}
      <style>
        {`
          @keyframes ticker-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .ticker-track {
            display: flex;
            width: max-content;
            /* 40 seconden voor een rustige, leesbare scroll */
            animation: ticker-scroll 40s linear infinite; 
          }
          .ticker-track:hover {
            animation-play-state: paused; /* Pauzeert als je er met je muis op staat! */
          }
        `}
      </style>

      {/* Sticky Label aan de linkerkant (Net als Coinbase) */}
      <div className="absolute left-0 top-0 bottom-0 bg-[#09090b] border-r border-zinc-800 z-10 flex items-center px-4 shadow-[10px_0_15px_-3px_rgba(0,0,0,0.5)] cursor-default">
        <span className="font-bold text-zinc-100 flex items-center gap-2">🔥 Activa met winst</span>
      </div>

      {/* De scrollende track */}
      {/* padding-left zorgt dat hij netjes achter het sticky label vandaan komt */}
      <div className="ticker-track pl-40">
        {/* We renderen de lijst 2x achter elkaar. Als lijst 1 uit beeld scrolt, sluit lijst 2 naadloos aan! */}
        {[...tickerData, ...tickerData].map((coin, i) => (
          <div key={i} className="flex items-center space-x-2 mx-5 whitespace-nowrap cursor-pointer hover:bg-zinc-800/50 px-2 py-0.5 rounded transition">
            <span className="font-bold text-zinc-400">{coin.symbol}</span>
            <span className="text-zinc-200">US${coin.close < 0.1 ? coin.close.toFixed(4) : coin.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`font-bold ${coin.pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {coin.pct >= 0 ? '+' : ''}{coin.pct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveTicker;