import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, TrendingUp, TrendingDown, Zap, BarChart2, 
  ArrowUpRight, ArrowDownRight, Search, Plus, Filter, RefreshCw, Clock
} from 'lucide-react';


// ==========================================
// 🛠️ GEOPTIMALISEERDE INDICATORS (Wilder's Smoothing)
// ==========================================

const getApiHeaders = () => {
  let keys = { krakenKey: '', krakenSecret: '', geminiKey: '' };
  try {
    const stored = localStorage.getItem('trading_api_keys');
    if (stored) keys = JSON.parse(stored);
  } catch (e) {}
  return {
    'Content-Type': 'application/json',
    'x-kraken-api-key': keys.krakenKey || '',
    'x-kraken-api-secret': keys.krakenSecret || '',
    'x-gemini-api-key': keys.geminiKey || ''
  };
};

const calculateSMA = (data, period) => {
    if (!data || data.length < period) return 0;
    const sum = data.slice(-period).reduce((acc, d) => acc + d.close, 0);
    return sum / period;
};

/**
 * Verbeterde RSI berekening volgens Wilder's Smoothing (RMA)
 * Dit komt overeen met de standaard RSI op Kraken/TradingView
 */
const calculateRSI = (data, period = 14) => {
    if (!data || data.length <= period) return 50;
    
    let gains = 0;
    let losses = 0;

    // 1. Bereken de initiële gemiddelden (eerste venster)
    for (let i = 1; i <= period; i++) {
        const diff = data[i].close - data[i - 1].close;
        if (diff >= 0) gains += diff; else losses += Math.abs(diff);
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;

    // 2. Pas Wilder's Smoothing toe op de rest van de data
    // Hoe meer data (candles), hoe nauwkeuriger de RSI wordt t.o.v. Kraken
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].close - data[i - 1].close;
        const currentGain = diff >= 0 ? diff : 0;
        const currentLoss = diff < 0 ? Math.abs(diff) : 0;

        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

// ==========================================
// 🟢 SCREENER COMPONENT
// ==========================================

const ScreenerView = ({ onDeployBot }) => {
  const [marketData, setMarketData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [screenerTimeframe, setScreenerTimeframe] = useState(15);

  const targetPairs = [
    { id: 'XXBTZUSD', display: 'BTC/USD', alt: 'XBTUSD' },
    { id: 'XETHZUSD', display: 'ETH/USD', alt: 'ETHUSD' },
    { id: 'SOLUSD', display: 'SOL/USD', alt: 'SOLUSD' },
    { id: 'ADAUSD', display: 'ADA/USD', alt: 'ADAUSD' },
    { id: 'DOTUSD', display: 'DOT/USD', alt: 'DOTUSD' },
    { id: 'LINKUSD', display: 'LINK/USD', alt: 'LINKUSD' },
    { id: 'POLUSD', display: 'POL/USD', alt: 'POLUSD' },
    { id: 'AVAXUSD', display: 'AVAX/USD', alt: 'AVAXUSD' },
    { id: 'DOGEUSD', display: 'DOGE/USD', alt: 'DOGEUSD' },
    { id: 'XRPUSD', display: 'XRP/USD', alt: 'XRPUSD' },
    { id: 'SHIBUSD', display: 'SHIB/USD', alt: 'SHIBUSD' },
    { id: 'NEARUSD', display: 'NEAR/USD', alt: 'NEARUSD' },
  ];

  const fetchScreenerData = async () => {
    setIsLoading(true);
    try {
        const results = await Promise.all(targetPairs.map(async (pair) => {
            try {
                const res = await fetch('http://localhost:3001/api/ohlc', {
                    method: 'POST',
                    headers: getApiHeaders(),
                    body: JSON.stringify({ pair: pair.alt, interval: screenerTimeframe })
                });
                
                if (!res.ok) throw new Error("HTTP error");
                const json = await res.json();
                
                if (!json.result) return { ...pair, price: 0, rsi: 50, trend: 'Bearish', change24h: 0, error: true };

                const key = Object.keys(json.result).find(k => k !== 'last');
                const ohlcData = json.result[key].map(d => ({ close: parseFloat(d[4]) }));
                
                // We hebben veel candles nodig voor een accurate RSI (Wilder's warm-up)
                const currentPrice = ohlcData[ohlcData.length - 1].close;
                const rsi = calculateRSI(ohlcData, 14);
                const sma50 = calculateSMA(ohlcData, 50);
                const trend = currentPrice > sma50 ? 'Bullish' : 'Bearish';
                
                const tickRes = await fetch('http://localhost:3001/api/ticker', {
                    method: 'POST', headers: getApiHeaders(),
                    body: JSON.stringify({ pair: pair.alt })
                });
                
                let change24h = 0;
                if (tickRes.ok) {
                    const tickJson = await tickRes.json();
                    if (tickJson && tickJson.result) {
                        const tKey = Object.keys(tickJson.result)[0];
                        const open24h = parseFloat(tickJson.result[tKey].o);
                        change24h = ((currentPrice - open24h) / open24h) * 100;
                    }
                }

                return { ...pair, price: currentPrice, rsi, trend, change24h };
            } catch (innerError) {
                return { ...pair, price: 0, rsi: 50, trend: 'Bearish', change24h: 0, error: true };
            }
        }));
        
        setMarketData(results);
        setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) { 
        console.error("Screener fetch error:", e);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchScreenerData(); }, [screenerTimeframe]);

  const filteredData = marketData.filter(m => m.display.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col bg-[#050505] overflow-hidden h-full text-zinc-300">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] shrink-0">
        <div className="flex items-center">
            <Zap className="w-5 h-5 text-yellow-500 mr-3" />
            <div>
                <h2 className="text-zinc-100 font-bold tracking-wide">Market War Room</h2>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Accuracy Mode: Wilder's Smoothing</p>
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="flex bg-black border border-zinc-800 p-1 rounded-xl shadow-inner">
                {[1, 5, 15].map(tf => (
                    <button 
                        key={tf} 
                        onClick={() => setScreenerTimeframe(tf)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${screenerTimeframe === tf ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {tf}M
                    </button>
                ))}
            </div>

            <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Zoek asset..." 
                    className="bg-[#0b0e11] border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500 transition-all w-48"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={fetchScreenerData} className="p-2 text-zinc-400 hover:text-white transition-colors">
                <RefreshCw size={18} className={isLoading ? 'animate-spin text-blue-500' : ''} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-10">
          {isLoading && marketData.length === 0 ? (
             [...Array(12)].map((_, i) => (
                <div key={i} className="h-44 bg-[#0b0e11] border border-zinc-800 rounded-2xl animate-pulse"></div>
             ))
          ) : filteredData.map((coin) => {
            const isOversold = coin.rsi < 35;
            const isBullish = coin.trend === 'Bullish';
            const hasConfluence = isOversold && isBullish;

            return (
              <div 
                key={coin.id} 
                className={`bg-[#0b0e11] border rounded-2xl p-5 flex flex-col justify-between transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl shadow-black/50 ${hasConfluence ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/50' : 'border-zinc-800'} ${coin.error ? 'opacity-50 grayscale' : ''}`}
              >
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Kraken Realtime</span>
                        <span className="text-lg font-bold text-zinc-100">{coin.display}</span>
                    </div>
                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${coin.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 my-4">
                    <div className="bg-black/30 p-3 rounded-xl border border-zinc-800/50 relative overflow-hidden">
                        <span className="text-[9px] text-zinc-500 uppercase block mb-1">RSI (14)</span>
                        <span className={`text-sm font-mono font-bold ${coin.rsi < 30 ? 'text-emerald-400' : coin.rsi > 70 ? 'text-rose-400' : 'text-zinc-200'}`}>
                            {coin.rsi.toFixed(2)}
                        </span>
                        {!coin.error && coin.rsi < 35 && <span className="ml-2 inline-block w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>}
                    </div>
                    <div className="bg-black/30 p-3 rounded-xl border border-zinc-800/50">
                        <span className="text-[9px] text-zinc-500 uppercase block mb-1">Trend Signal</span>
                        <span className={`text-sm font-bold flex items-center gap-1 ${coin.trend === 'Bullish' ? 'text-blue-400' : 'text-zinc-500'}`}>
                            {coin.trend === 'Bullish' ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                            {coin.trend}
                        </span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex-1 text-[10px] text-zinc-400 flex flex-col justify-center">
                        <span className="font-mono font-bold text-zinc-200">
                           {coin.price < 0.01 ? coin.price.toFixed(6) : coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString()}
                        </span>
                        <span className="opacity-50 text-[9px] uppercase tracking-tighter">{coin.error ? 'Connection error' : `TF: ${screenerTimeframe}m`}</span>
                    </div>
                    <button 
                        onClick={() => onDeployBot(coin)}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl transition-all shadow-lg active:scale-95"
                    >
                        <Plus size={18} />
                    </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="h-10 border-t border-zinc-800 bg-[#09090b] flex items-center px-6 justify-between shrink-0">
         <div className="flex items-center gap-4">
             <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-widest">Laatste sync: {lastUpdate || '---'}</span>
             <div className="h-3 w-px bg-zinc-800"></div>
             <div className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold uppercase"><Clock size={12}/> {screenerTimeframe}m Interval</div>
         </div>
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[9px] text-zinc-500 font-bold uppercase"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div> Koop Signaal</div>
            <div className="flex items-center gap-2 text-[9px] text-zinc-500 font-bold uppercase"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Trend Bullish</div>
         </div>
      </div>
    </div>
  );
};

export default ScreenerView;