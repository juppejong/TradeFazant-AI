import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
  Settings, BarChart2, Activity, Layers, ChevronDown, LineChart, Bot, Wallet, 
  Maximize2, Search, User, LayoutGrid, Square, ExternalLink, 
  ChevronRight, ChevronLeft, Sparkles, Send, X, Trash2, Plus, Play, Pause, Crosshair,
  ShieldAlert, Target, TrendingUp, AlertTriangle, Clock, ArrowDownToLine, KeyRound
} from 'lucide-react';

// ==========================================
// 🟢 HULPFUNCTIES & API
// ==========================================
const tfMap = { '1m': 1, '5m': 5, '15m': 15, '1H': 60, '4H': 240, '1D': 1440 };

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

const fetchKrakenPairs = async () => {
  try {
    const res = await fetch('http://localhost:3001/api/pairs', { method: 'POST', headers: getApiHeaders() });
    const json = await res.json();
    const pairs = [];
    for (const key in json.result) {
      const pair = json.result[key];
      if (pair.wsname && pair.wsname.includes('/USD') && !pair.wsname.includes('.d')) {
        pairs.push({ 
            id: key, 
            altname: pair.altname, 
            display: pair.wsname, 
            wsname: pair.wsname, 
            base: pair.wsname.split('/')[0], 
            quote: pair.wsname.split('/')[1] 
        });
      }
    }
    return pairs.sort((a, b) => a.display.localeCompare(b.display));
  } catch (error) { return []; }
};

const fetchKrakenOHLC = async (interval, pairAltname) => {
  try {
    const res = await fetch('http://localhost:3001/api/ohlc', {
      method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ pair: pairAltname, interval })
    });
    const json = await res.json();
    const pairKey = Object.keys(json.result).find(k => k !== 'last');
    return json.result[pairKey].map(d => ({
      time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[6])
    }));
  } catch (error) { return []; }
};

// ==========================================
// 🚀 PRO WEBSOCKET ARCHITECTUUR (SINGLETON)
// ==========================================
class KrakenWSManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.subs = { ticker: {}, book: {} };
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.connect();
  }

  connect() {
    if (this.ws) return;
    this.ws = new WebSocket('wss://ws.kraken.com');
    
    this.ws.onopen = () => {
      this.isConnected = true;
      Object.keys(this.subs.ticker).forEach(pair => this.sendSub(pair, 'ticker'));
      Object.keys(this.subs.book).forEach(pair => this.sendSub(pair, 'book', 25));
      
      this.pingInterval = setInterval(() => {
        if (this.isConnected) this.ws.send(JSON.stringify({ event: 'ping' }));
      }, 20000);
    };
    
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (Array.isArray(msg)) this.handleMessage(msg);
    };
    
    this.ws.onclose = () => {
      this.isConnected = false;
      this.ws = null;
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      if (this.ws) this.ws.close();
    };
  }

  sendSub(pair, name, depth) {
    if (!this.isConnected) return;
    const payload = { event: 'subscribe', pair: [pair], subscription: { name } };
    if (depth) payload.subscription.depth = depth;
    this.ws.send(JSON.stringify(payload));
  }

  sendUnsub(pair, name, depth) {
    if (!this.isConnected) return;
    const payload = { event: 'unsubscribe', pair: [pair], subscription: { name } };
    if (depth) payload.subscription.depth = depth;
    this.ws.send(JSON.stringify(payload));
  }

  subscribe(type, pair, cb) {
    if (!this.subs[type][pair]) {
      this.subs[type][pair] = new Set();
      this.sendSub(pair, type, type === 'book' ? 25 : null);
    }
    this.subs[type][pair].add(cb);
  }

  unsubscribe(type, pair, cb) {
    if (!this.subs[type][pair]) return;
    this.subs[type][pair].delete(cb);
    if (this.subs[type][pair].size === 0) {
      delete this.subs[type][pair];
      this.sendUnsub(pair, type, type === 'book' ? 25 : null);
    }
  }

  handleMessage(data) {
    if (data.length < 4) return;
    const pair = data[data.length - 1];
    const channelName = data[data.length - 2];
    if (typeof channelName !== 'string' || typeof pair !== 'string') return;

    if (channelName === 'ticker' && this.subs.ticker[pair]) {
      this.subs.ticker[pair].forEach(cb => cb(data[1]));
    } else if (channelName.startsWith('book') && this.subs.book[pair]) {
      let payload = data[1];
      if (data.length === 5) payload = { ...data[1], ...data[2] };
      this.subs.book[pair].forEach(cb => cb(payload));
    }
  }
}

const wsClient = new KrakenWSManager();

// --- CUSTOM HOOK: Live Data via WebSocket ---
const useKrakenMarketData = (wsname) => {
  const [currentPrice, setCurrentPrice] = useState(0);
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const asksMap = useRef(new Map());
  const bidsMap = useRef(new Map());

  useEffect(() => {
    if (!wsname) return;

    asksMap.current.clear();
    bidsMap.current.clear();
    setOrderBook({ asks: [], bids: [] });

    const handleTicker = (data) => {
      if (data.c && data.c[0]) setCurrentPrice(parseFloat(data.c[0]));
    };

    const handleBook = (data) => {
      if (data.as) {
        data.as.forEach(a => asksMap.current.set(parseFloat(a[0]), parseFloat(a[1])));
        data.bs.forEach(b => bidsMap.current.set(parseFloat(b[0]), parseFloat(b[1])));
      } else {
        if (data.a) data.a.forEach(a => parseFloat(a[1]) === 0 ? asksMap.current.delete(parseFloat(a[0])) : asksMap.current.set(parseFloat(a[0]), parseFloat(a[1])));
        if (data.b) data.b.forEach(b => parseFloat(b[1]) === 0 ? bidsMap.current.delete(parseFloat(b[0])) : bidsMap.current.set(parseFloat(b[0]), parseFloat(b[1])));
      }

      const asks = Array.from(asksMap.current.entries()).sort((a, b) => a[0] - b[0]).slice(0, 15);
      const bids = Array.from(bidsMap.current.entries()).sort((a, b) => b[0] - a[0]).slice(0, 15);

      let askCum = 0, bidCum = 0;
      const asksF = asks.map(a => { askCum += a[1]; return { price: a[0], volume: a[1], cumulative: askCum }; }).reverse();
      const bidsF = bids.map(b => { bidCum += b[1]; return { price: b[0], volume: b[1], cumulative: bidCum }; });
      const maxVol = Math.max(askCum, bidCum);

      setOrderBook({
        asks: asksF.map(a => ({ ...a, depth: maxVol ? (a.cumulative / maxVol) * 100 : 0 })),
        bids: bidsF.map(b => ({ ...b, depth: maxVol ? (b.cumulative / maxVol) * 100 : 0 }))
      });
    };

    wsClient.subscribe('ticker', wsname, handleTicker);
    wsClient.subscribe('book', wsname, handleBook);

    return () => {
      wsClient.unsubscribe('ticker', wsname, handleTicker);
      wsClient.unsubscribe('book', wsname, handleBook);
    };
  }, [wsname]);

  return { currentPrice, orderBook };
};

// ==========================================
// 📊 INDICATOREN & ANALYSE
// ==========================================
const calculateSMA = (data, period, source = 'close') => {
  const smaData = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j][source];
    smaData.push({ time: data[i].time, value: sum / period });
  }
  return smaData;
};

const calculateEMA = (data, period) => {
  const emaData = [];
  if (data.length < period) return emaData;
  const multiplier = 2 / (period + 1);
  let prevEma = data.slice(0, period).reduce((acc, val) => acc + val.close, 0) / period;
  emaData.push({ time: data[period - 1].time, value: prevEma });
  for (let i = period; i < data.length; i++) {
    const ema = (data[i].close - prevEma) * multiplier + prevEma;
    emaData.push({ time: data[i].time, value: ema });
    prevEma = ema;
  }
  return emaData;
};

const calculateMACD = (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  const fastEma = calculateEMA(data, fastPeriod);
  const slowEma = calculateEMA(data, slowPeriod);
  const macdMap = new Map();
  slowEma.forEach(e => macdMap.set(e.time, { slow: e.value }));
  fastEma.forEach(e => { if (macdMap.has(e.time)) macdMap.get(e.time).fast = e.value; });
  const macdOutput = []; const macdForSignal = [];
  data.forEach(d => {
      const vals = macdMap.get(d.time);
      if (vals && vals.fast !== undefined && vals.slow !== undefined) {
          const val = vals.fast - vals.slow;
          macdOutput.push({ time: d.time, value: val });
          macdForSignal.push({ time: d.time, close: val });
      }
  });
  const signalLine = calculateEMA(macdForSignal, signalPeriod);
  const signalMap = new Map(); signalLine.forEach(s => signalMap.set(s.time, s.value));
  const finalOutput = [];
  macdOutput.forEach(m => {
      const sig = signalMap.get(m.time);
      if (sig !== undefined) finalOutput.push({ time: m.time, macd: m.value, signal: sig, histogram: m.value - sig });
  });
  return finalOutput;
};

const calculateBB = (data, period, stdDevMultiplier) => {
  const upper = [], middle = [], lower = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j].close;
    const sma = sum / period;
    let sumSq = 0; for (let j = 0; j < period; j++) sumSq += Math.pow(data[i - j].close - sma, 2);
    const stdDev = Math.sqrt(sumSq / period);
    middle.push({ time: data[i].time, value: sma });
    upper.push({ time: data[i].time, value: sma + stdDevMultiplier * stdDev });
    lower.push({ time: data[i].time, value: sma - stdDevMultiplier * stdDev });
  }
  return { upper, middle, lower };
};

const calculateRSI = (data, period) => {
  const rsiData = [];
  if (data.length < period) return rsiData;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) avgGain += change; else avgLoss -= change;
  }
  avgGain /= period; avgLoss /= period;
  rsiData.push({ time: data[period].time, value: avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)) });
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0; const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    let rs = avgGain / avgLoss;
    rsiData.push({ time: data[i].time, value: avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)) });
  }
  return rsiData;
};

// ==========================================
// 🤖 BOT SYSTEM PANELS
// ==========================================
const BotLogTerminal = ({ logs }) => {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="h-48 bg-[#050505] rounded p-3 overflow-y-auto text-[10px] font-mono border border-zinc-800/50 flex flex-col space-y-1">
      {logs.length === 0 && <span className="text-zinc-600">Bot geïnitialiseerd. Wachten op data...</span>}
      {logs.map((l, i) => (
        <div key={i} className={`flex space-x-2 ${l.type === 'buy' ? 'text-emerald-400 font-bold' : l.type === 'sell' ? 'text-rose-400 font-bold' : l.type === 'error' ? 'text-rose-600' : l.type === 'success' ? 'text-emerald-500' : 'text-zinc-500'}`}>
          <span className="shrink-0">[{l.time}]</span><span>{l.msg}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

const BotManagerView = ({ bots, setBots, availablePairs, activePair }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newBotPair, setNewBotPair] = useState(activePair);
  const [newBotStrategy, setNewBotStrategy] = useState('RSI');
  const [botTimeframe, setBotTimeframe] = useState('5m');
  const [sizingType, setSizingType] = useState('percent');
  const [tradeAmount, setTradeAmount] = useState('0.01');
  const [tradePercent, setTradePercent] = useState('10'); 
  const [cooldownMins, setCooldownMins] = useState(15);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5);
  const [useDca, setUseDca] = useState(false);
  const [dcaCount, setDcaCount] = useState(3);
  const [dcaDropPct, setDcaDropPct] = useState(2.0);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiBuyLevel, setRsiBuyLevel] = useState(30);
  const [rsiSellLevel, setRsiSellLevel] = useState(70);
  const [useTrailing, setUseTrailing] = useState(true);
  const [trailingPct, setTrailingPct] = useState(0.5);
  const [slPct, setSlPct] = useState(3.0);
  const [tpPct, setTpPct] = useState(6.0);
  const [useAiFilter, setUseAiFilter] = useState(false);
  const [aiMinConfidence, setAiMinConfidence] = useState(70);

  const handleAutoTune = async () => {
     alert("Gemini AI analyseert marktomstandigheden... Dit kan even duren.");
     try {
         const data = await fetchKrakenOHLC(15, newBotPair.altname);
         const recentStr = data.slice(-40).map(d => d.close).join(',');
         const res = await fetch('http://localhost:3001/api/ai/tune', {
           method: 'POST', headers: getApiHeaders(),
           body: JSON.stringify({ pair: newBotPair.display, timeframe: botTimeframe, strategy: newBotStrategy, data: recentStr })
         });
         if (!res.ok) throw new Error(`Server error (${res.status})`);
         const config = await res.json();
         if (config.rsiPeriod) setRsiPeriod(config.rsiPeriod);
         if (config.rsiBuyLevel) setRsiBuyLevel(config.rsiBuyLevel);
         if (config.rsiSellLevel) setRsiSellLevel(config.rsiSellLevel);
         if (config.trailingPct) { setTrailingPct(config.trailingPct); setUseTrailing(true); }
         if (config.slPct) setSlPct(config.slPct);
         if (config.tpPct) setTpPct(config.tpPct);
         alert(`✅ Parameters succesvol geüpdatet via Gemini AI!`);
     } catch (err) { alert("Auto-Tune Mislukt: " + err.message); }
  };

  const createBot = () => {
    const newBot = { 
      id: Math.random().toString(), pair: newBotPair, strategy: newBotStrategy, 
      isRunning: true, 
      state: { phase: 'WAITING', lastAction: 'NONE', extremePrice: 0, averageEntryPrice: 0, totalVolume: 0, currentEntries: 0, lastTradeTime: 0, dailyStartEquity: 0, currentPrice: 0, livePnl: 0, livePnlPct: 0 }, 
      stats: { trades: [], winCount: 0, lossCount: 0, grossProfit: 0, grossLoss: 0 },
      logs: [{time: new Date().toLocaleTimeString(), msg: `🚀 Bot gestart op ${newBotPair.display} (${newBotStrategy})`, type: 'success'}], 
      config: { 
        timeframe: botTimeframe, sizingType: sizingType, tradeAmount: parseFloat(tradeAmount), tradePercent: parseFloat(tradePercent),
        useDca: useDca, dcaCount: parseInt(dcaCount), dcaDropPct: parseFloat(dcaDropPct),
        cooldownMins: parseInt(cooldownMins), maxDailyLoss: parseFloat(maxDailyLoss),
        useTrailing: useTrailing, trailingPct: parseFloat(trailingPct), slPct: parseFloat(slPct), tpPct: parseFloat(tpPct), 
        rsiPeriod: parseInt(rsiPeriod), rsiBuyLevel: parseInt(rsiBuyLevel), rsiSellLevel: parseInt(rsiSellLevel),
        useAiFilter: useAiFilter, aiMinConfidence: parseInt(aiMinConfidence)
      } 
    };
    setBots([...bots, newBot]);
    setIsCreating(false);
  };

  const toggleBotState = (idx) => {
    const newBots = [...bots];
    newBots[idx].isRunning = !newBots[idx].isRunning;
    newBots[idx].logs.push({time: new Date().toLocaleTimeString(), msg: newBots[idx].isRunning ? '▶️ Bot hervat.' : '🛑 Bot handmatig gepauzeerd.', type: newBots[idx].isRunning ? 'success' : 'error'});
    setBots(newBots);
  };

  const deleteBot = (id) => setBots(bots.filter(b => b.id !== id));

  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] shrink-0">
        <div className="flex items-center"><Bot className="w-5 h-5 text-purple-500 mr-3" /><div><h2 className="text-zinc-100 font-bold tracking-wide">Auto Trading Bots 2.0</h2><p className="text-[10px] text-zinc-500 uppercase tracking-widest">Pro Kwantitatieve Engine</p></div></div>
        {!isCreating && (<button onClick={() => setIsCreating(true)} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-blue-900/20"><Plus size={14} /> <span>Nieuwe Bot</span></button>)}
      </div>

      <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
         {isCreating ? (
           <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-6 w-full max-w-4xl mx-auto shadow-2xl space-y-8">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                 <h3 className="font-bold text-zinc-200 flex items-center gap-2"><Settings size={18} className="text-blue-500"/> Algoritme Configureren</h3>
                 <button onClick={() => setIsCreating(false)} className="text-zinc-500 hover:text-rose-500"><X size={20}/></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Kolom 1: Basis & Strategie */}
                <div className="space-y-6">
                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2"><Activity size={14}/> Strategie & Markt</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-[10px] text-zinc-500 uppercase font-bold">Muntpaar</label><select value={newBotPair.id} onChange={(e) => setNewBotPair(availablePairs.find(p=>p.id===e.target.value))} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{availablePairs.map(p => <option key={p.id} value={p.id}>{p.display}</option>)}</select></div>
                      <div className="space-y-1"><label className="text-[10px] text-zinc-500 uppercase font-bold">Tijdsframe</label><select value={botTimeframe} onChange={(e) => setBotTimeframe(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{Object.keys(tfMap).map(tf => <option key={tf} value={tf}>{tf}</option>)}</select></div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold">Logica</label>
                      <select value={newBotStrategy} onChange={e => setNewBotStrategy(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-blue-400 font-semibold outline-none focus:border-blue-500">
                         <option value="RSI">RSI (Puur, zonder trend filter)</option>
                         <option value="RSI_TREND">RSI Oscillator + SMA50 Trend Filter</option>
                         <option value="BB_VOL">Bollinger Breakout + Volume Filter</option>
                      </select>
                    </div>
                    
                    {(newBotStrategy === 'RSI' || newBotStrategy === 'RSI_TREND') && (
                      <div className="grid grid-cols-3 gap-4 pt-2">
                        <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold">RSI Periode</label><input type="number" value={rsiPeriod} onChange={(e) => setRsiPeriod(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-300 text-center outline-none" /></div>
                        <div className="space-y-1"><label className="text-[10px] uppercase text-emerald-500 font-bold">Koop &lt;</label><input type="number" value={rsiBuyLevel} onChange={(e) => setRsiBuyLevel(e.target.value)} className="w-full bg-[#050505] border border-emerald-900/50 rounded p-2 text-sm text-emerald-400 text-center outline-none" /></div>
                        <div className="space-y-1"><label className="text-[10px] uppercase text-rose-500 font-bold">Verkoop &gt;</label><input type="number" value={rsiSellLevel} onChange={(e) => setRsiSellLevel(e.target.value)} className="w-full bg-[#050505] border border-rose-900/50 rounded p-2 text-sm text-rose-400 text-center outline-none" /></div>
                      </div>
                    )}
                  </div>

                  {/* FASE 5: AI Decision Filter */}
                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-blue-900/30">
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-blue-400 font-bold flex items-center gap-2"><Sparkles size={14}/> AI Decision Filter</h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useAiFilter} onChange={e => setUseAiFilter(e.target.checked)} className="accent-blue-500 w-4 h-4" /><span className="text-xs text-blue-400 font-bold uppercase">Actief</span></label>
                    </div>
                    {useAiFilter ? (
                      <div className="space-y-1">
                          <label className="text-[10px] uppercase text-blue-500 font-bold">Minimale AI Zekerheid (%)</label>
                          <div className="relative">
                              <input type="number" value={aiMinConfidence} onChange={(e) => setAiMinConfidence(e.target.value)} className="w-full bg-[#050505] border border-blue-900/50 rounded p-2.5 text-sm text-blue-400 outline-none focus:border-blue-500" />
                              <span className="absolute right-4 top-2.5 text-blue-500">%</span>
                          </div>
                          <p className="text-[10px] text-zinc-500 mt-2">De bot voert pas een trade uit als de AI de trend bevestigt met minimaal deze zekerheid.</p>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 italic">De bot voert trades direct uit op basis van technische indicatoren.</div>
                    )}
                  </div>

                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2"><Layers size={14}/> Positiegrootte (Sizing)</h4>
                    <div className="flex bg-[#050505] p-1 rounded-lg border border-zinc-800">
                      <button onClick={() => setSizingType('percent')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${sizingType === 'percent' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500'}`}>% van Balans</button>
                      <button onClick={() => setSizingType('fixed')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${sizingType === 'fixed' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500'}`}>Vaste Waarde</button>
                    </div>
                    {sizingType === 'percent' ? (
                      <div className="space-y-1"><label className="text-[10px] text-zinc-500 uppercase font-bold">Risico per trade (% van totale {newBotPair.quote})</label><div className="relative"><input type="number" value={tradePercent} onChange={(e) => setTradePercent(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none" /><span className="absolute right-4 top-2.5 text-zinc-500">%</span></div></div>
                    ) : (
                      <div className="space-y-1"><label className="text-[10px] text-zinc-500 uppercase font-bold">Vaste inleg in {newBotPair.base}</label><input type="number" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 font-mono outline-none" /></div>
                    )}
                  </div>
                </div>

                {/* Kolom 2: Risk & Trailing */}
                <div className="space-y-6">
                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2"><ShieldAlert size={14}/> Risk Management</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-[10px] uppercase text-rose-500 font-bold">Stop-Loss (%)</label><input type="number" step="0.1" value={slPct} onChange={(e) => setSlPct(e.target.value)} className="w-full bg-[#050505] border border-rose-900/30 rounded p-2 text-sm text-rose-400 text-center outline-none focus:border-rose-500" /></div>
                      <div className="space-y-1"><label className="text-[10px] uppercase text-emerald-500 font-bold">Take-Profit (%)</label><input type="number" step="0.1" value={tpPct} onChange={(e) => setTpPct(e.target.value)} className="w-full bg-[#050505] border border-emerald-900/30 rounded p-2 text-sm text-emerald-400 text-center outline-none focus:border-emerald-500" /></div>
                      <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center gap-1"><Clock size={10}/> Afkoelperiode (Min)</label><input type="number" value={cooldownMins} onChange={(e) => setCooldownMins(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-300 text-center outline-none" /></div>
                      <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center gap-1"><AlertTriangle size={10}/> Max Dagverlies (%)</label><input type="number" value={maxDailyLoss} onChange={(e) => setMaxDailyLoss(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-300 text-center outline-none" /></div>
                    </div>
                  </div>

                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2"><TrendingUp size={14}/> Trailing Executie</h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTrailing} onChange={e => setUseTrailing(e.target.checked)} className="accent-blue-500 w-4 h-4" /><span className="text-xs text-blue-400 font-bold uppercase">Actief</span></label>
                    </div>
                    {useTrailing ? (
                      <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold">Koop/Verkoop pas na omkering van (%)</label><input type="number" step="0.1" value={trailingPct} onChange={(e) => setTrailingPct(e.target.value)} className="w-full bg-[#050505] border border-blue-900/30 rounded p-2 text-sm text-blue-400 text-center outline-none" /></div>
                    ) : (
                      <div className="text-xs text-zinc-600 italic">Trailing is uitgeschakeld. Orders worden direct op het signaal uitgevoerd.</div>
                    )}
                  </div>
                  
                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2"><ArrowDownToLine size={14}/> DCA (Extra instapmomenten)</h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useDca} onChange={e => setUseDca(e.target.checked)} className="accent-purple-500 w-4 h-4" /><span className="text-xs text-purple-400 font-bold uppercase">Actief</span></label>
                    </div>
                    {useDca ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold">Max Extra Entries</label><input type="number" value={dcaCount} onChange={(e) => setDcaCount(e.target.value)} className="w-full bg-[#050505] border border-purple-900/30 rounded p-2 text-sm text-purple-400 text-center outline-none" /></div>
                        <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold">Koop bij daling van (%)</label><input type="number" step="0.1" value={dcaDropPct} onChange={(e) => setDcaDropPct(e.target.value)} className="w-full bg-[#050505] border border-purple-900/30 rounded p-2 text-sm text-purple-400 text-center outline-none" /></div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 italic">DCA is uitgeschakeld. De bot doet maximaal 1 trade per cyclus.</div>
                    )}
                  </div>
                </div>
              </div>

              <button onClick={createBot} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold uppercase tracking-widest rounded-xl shadow-lg transition active:scale-95">Opslaan & Start Algoritme</button>
           </div>
         ) : (
           <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {bots.length === 0 && <div className="col-span-2 text-center text-zinc-600 py-20 border border-dashed border-zinc-800 rounded-2xl">Je hebt nog geen actieve bots draaien. Klik op "Nieuwe Bot" om er een te configureren.</div>}
              {bots.map((bot, idx) => {
                 const pf = bot.stats.grossLoss === 0 ? (bot.stats.grossProfit > 0 ? '∞' : '0.0') : (bot.stats.grossProfit / bot.stats.grossLoss).toFixed(2);
                 const wr = bot.stats.trades.length === 0 ? 0 : Math.round((bot.stats.winCount / bot.stats.trades.length) * 100);
                 const totalPnL = bot.stats.grossProfit - bot.stats.grossLoss;
                 
                 return (
                  <div key={bot.id} className={`bg-[#0b0e11] border ${bot.isRunning ? 'border-emerald-500/30' : 'border-zinc-800'} rounded-2xl p-5 flex flex-col space-y-4 transition-colors duration-300 shadow-xl`}>
                     <div className="flex justify-between items-start border-b border-zinc-800/50 pb-4">
                       <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${bot.isRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500'}`}></div>
                            <span className="text-lg font-bold text-zinc-100 tracking-wide">{bot.pair.display}</span>
                          </div>
                          <div className="flex items-center space-x-2 mt-2">
                             <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{bot.strategy}</span>
                             {bot.config.useAiFilter && <span className="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1"><Sparkles size={10}/> AI Filter</span>}
                             <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{bot.config.timeframe} TF</span>
                             {bot.config.useTrailing && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">TRAIL</span>}
                          </div>
                       </div>
                       <div className="flex space-x-2 bg-[#050505] p-1 rounded-lg border border-zinc-800">
                         <button onClick={() => toggleBotState(idx)} className={`p-2 rounded transition ${bot.isRunning ? 'hover:bg-zinc-800 text-amber-500' : 'hover:bg-emerald-900/30 text-emerald-500'}`} title={bot.isRunning ? "Pauzeer Bot" : "Start Bot"}>
                            {bot.isRunning ? <Pause size={16}/> : <Play size={16}/>}
                         </button>
                         <button onClick={() => deleteBot(bot.id)} className="p-2 rounded text-zinc-600 hover:text-rose-500 hover:bg-rose-900/20 transition" title="Verwijder Bot"><Trash2 size={16}/></button>
                       </div>
                     </div>

                     <div className="bg-[#050505] p-3 rounded-xl border border-zinc-800/50 space-y-2">
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-zinc-500 uppercase font-bold">Huidige Positie</span>
                            <span className={`text-xs font-bold ${bot.state.totalVolume > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                               {bot.state.totalVolume > 0 ? `${bot.state.totalVolume.toFixed(4)} ${bot.pair.base}` : 'Geen actieve positie'}
                            </span>
                         </div>
                         {bot.state.totalVolume > 0 && (
                             <>
                               <div className="flex justify-between items-center">
                                  <span className="text-xs text-zinc-500">Gemiddelde Instap</span>
                                  <span className="text-xs font-mono text-zinc-300">${bot.state.averageEntryPrice.toFixed(4)}</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <span className="text-xs text-zinc-500">Live PnL</span>
                                  <span className={`text-xs font-mono font-bold ${bot.state.livePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                     {bot.state.livePnl >= 0 ? '+' : ''}${bot.state.livePnl.toFixed(2)} ({bot.state.livePnlPct.toFixed(2)}%)
                                  </span>
                               </div>
                             </>
                         )}
                     </div>

                     <div className="grid grid-cols-4 gap-3 bg-[#050505] p-3 rounded-xl border border-zinc-800/50">
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Winrate</span><span className={`text-sm font-bold font-mono ${wr >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{wr}%</span></div>
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Profit Factor</span><span className={`text-sm font-bold font-mono ${pf >= 1.5 ? 'text-emerald-400' : (pf >= 1 ? 'text-amber-400' : 'text-rose-400')}`}>{pf}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Trades</span><span className="text-sm font-bold font-mono text-zinc-200">{bot.stats.trades.length}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Net PnL</span><span className={`text-sm font-bold font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}</span></div>
                     </div>
                     
                     <BotLogTerminal logs={bot.logs} />
                  </div>
                 );
              })}
           </div>
         )}
      </div>
    </div>
  );
};

const AiAdvisorView = ({ activePair, aiMessages, setAiMessages, timeframe }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState([]);
  const [heatmapWidth, setHeatmapWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef(null);

  const quickPrompts = [
    "Wat is de algemene trend van Bitcoin vandaag?",
    "Welke invloed heeft het ordervolume op de huidige koers?",
    "Leg in simpele taal uit wat de RSI en MACD nu laten zien."
  ];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages, isLoading]);

  const sendMessage = async (overrideMsg = null) => {
    const userMsg = overrideMsg || input.trim();
    if (!userMsg) return;
    setInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiMessages(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'error', text: `Systeemfout: ${err.message}` }]);
    } finally { setIsLoading(false); }
  };

  const handleMultiTimeframeAnalyze = async () => {
    setIsLoading(true);
    try {
      setAiMessages(prev => [...prev, { role: 'user', text: `Voer een Multi-Timeframe Analyse (1m, 5m, 15m) uit voor ${activePair.display}...` }]);
      
      const [data1m, data5m, data15m] = await Promise.all([
         fetchKrakenOHLC(1, activePair.altname),
         fetchKrakenOHLC(5, activePair.altname),
         fetchKrakenOHLC(15, activePair.altname)
      ]);

      const formatData = (dData) => {
          if(!dData || !dData.length) return 'Data onbeschikbaar';
          const rsiVals = calculateRSI(dData, 14);
          const rsi = rsiVals.length ? rsiVals[rsiVals.length-1].value.toFixed(1) : 'N/A';
          const close = dData[dData.length-1].close.toFixed(2);
          return `Prijs: $${close} | RSI: ${rsi}`;
      };

      const payloadStr = `[1 Minuut] -> ${formatData(data1m)}\n[5 Minuten] -> ${formatData(data5m)}\n[15 Minuten] -> ${formatData(data15m)}\n\nBeoordeel de samenvloeiing (confluence) van de timeframes voor dit muntpaar.`;

      const res = await fetch('http://localhost:3001/api/ai/analyze', {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ pair: activePair.display, timeframe: 'MULTI (1m,5m,15m)', data: payloadStr })
      });
      
      if (!res.ok) throw new Error(`Server fout (${res.status})`);
      
      const resData = await res.json();
      if (resData.error) throw new Error(resData.error);
      
      const formattedMsg = `📊 **AI MULTI-TIMEFRAME RAPPORT** 📊\n\n**Bias:** ${resData.bias === 'BULLISH' ? '📈 BULLISH' : resData.bias === 'BEARISH' ? '📉 BEARISH' : '➖ NEUTRAL'}\n**Confluence Zekerheid:** ${resData.confidence}%\n**Advies:** ${resData.advice === 'TRADE' ? '✅ Positie Nemen' : '⛔ Geen Trade'}\n\n**Onderbouwing:**\n${resData.reasoning}`;

      setAiMessages(prev => [...prev, { role: 'model', text: formattedMsg }]);
    } catch(err) {
      setAiMessages(prev => [...prev, { role: 'error', text: "Kon multi-timeframe data niet analyseren: " + err.message }]);
    } finally { setIsLoading(false); }
  };

  const fetchHeatmap = async () => {
      setShowHeatmap(true);
      setIsHeatmapLoading(true);
      try {
          const pairs = "XXBTZUSD,XETHZUSD,SOLUSD,ADAUSD,XRPUSD,DOTUSD,DOGEUSD,AVAXUSD,LINKUSD,MATICUSD";
          const res = await fetch('http://localhost:3001/api/ticker', {
              method: 'POST', headers: getApiHeaders(),
              body: JSON.stringify({ pair: pairs })
          });
          const json = await res.json();
          if (json.result) {
              const mapped = Object.keys(json.result).map(key => {
                  const p = json.result[key];
                  const open = parseFloat(p.o);
                  const close = parseFloat(p.c[0]);
                  const pct = ((close - open) / open) * 100;
                  return { 
                      symbol: key.replace('ZUSD','').replace('XXBT','BTC').replace('XETH','ETH').replace('USD',''), 
                      pct, 
                      close 
                  };
              }).sort((a,b) => b.pct - a.pct);
              setHeatmapData(mapped);
          }
      } catch(e) { console.error("Heatmap fout", e); }
      setIsHeatmapLoading(false);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#050505]">
      <div className="flex-1 flex flex-col min-w-0">
          <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] shrink-0">
            <div className="flex items-center">
              <Sparkles className="w-5 h-5 text-blue-500 mr-3" />
              <div><h2 className="text-zinc-100 font-bold tracking-wide">Gemini Trading Adviseur</h2><p className="text-[10px] text-zinc-500 uppercase tracking-widest">Pro AI Integratie</p></div>
            </div>
            <div className="flex space-x-3">
                <button onClick={fetchHeatmap} className="flex items-center space-x-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg">
                  <Activity size={14} /> <span>AI Heatmap</span>
                </button>
                <button onClick={handleMultiTimeframeAnalyze} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-blue-900/20">
                  <Layers size={14} /> <span>Multi-Timeframe Analyse</span>
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-4 rounded-xl text-sm leading-relaxed max-w-[80%] whitespace-pre-wrap shadow-lg ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : msg.role === 'error' ? 'bg-rose-900/30 text-rose-200 border border-rose-500/30 rounded-bl-none' : 'bg-[#0b0e11] border border-zinc-800 text-zinc-300 rounded-bl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="p-4 rounded-xl bg-[#0b0e11] border border-zinc-800 text-zinc-500 w-16 text-center rounded-bl-none animate-pulse">...</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-6 bg-[#09090b] border-t border-zinc-800 shrink-0 flex flex-col space-y-3">
            <div className="flex space-x-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
              {quickPrompts.map((prompt, idx) => (
                <button key={idx} onClick={() => sendMessage(prompt)} disabled={isLoading} className="whitespace-nowrap px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-full text-xs font-semibold transition active:scale-95 disabled:opacity-50">
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex space-x-3">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Vraag om marktanalyse of algemeen crypto advies..." className="flex-1 bg-[#050505] border border-zinc-700 focus:border-blue-500 rounded-xl px-5 py-4 text-sm text-white outline-none transition shadow-inner" />
              <button onClick={() => sendMessage()} disabled={isLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white px-6 rounded-xl transition flex items-center justify-center"><Send size={20} /></button>
            </div>
          </div>
      </div>

      {showHeatmap && (
         <>
            <div 
               className="w-1.5 bg-zinc-900 hover:bg-purple-500 cursor-col-resize z-50 flex-shrink-0 transition-colors"
               onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizing(true);
                  const startX = e.clientX;
                  const startWidth = heatmapWidth;
                  const onMouseMove = (moveEvent) => {
                     const delta = startX - moveEvent.clientX;
                     setHeatmapWidth(Math.max(250, Math.min(800, startWidth + delta)));
                  };
                  const onMouseUp = () => {
                     setIsResizing(false);
                     document.removeEventListener('mousemove', onMouseMove);
                     document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
               }}
            />
            <div 
               className="flex flex-col bg-[#0b0e11] border-l border-zinc-800 shrink-0"
               style={{ width: heatmapWidth, transition: isResizing ? 'none' : 'width 0.3s' }}
            >
               <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#09090b]">
                  <h3 className="text-zinc-200 font-bold text-xs uppercase tracking-widest flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500"/> Top Movers</h3>
                  <button onClick={() => setShowHeatmap(false)} className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800"><X size={16}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 bg-[#0b0e11]">
                   {isHeatmapLoading ? (
                       <div className="text-zinc-500 text-center animate-pulse text-xs py-10">Live marktgegevens ophalen...</div>
                   ) : (
                       <div className="grid grid-cols-2 gap-3">
                           {heatmapData.map(h => (
                               <div key={h.symbol} className={`p-4 rounded-xl flex flex-col items-center justify-center transition-all ${h.pct >= 0 ? 'bg-emerald-900/20 border border-emerald-500/30' : 'bg-rose-900/20 border border-rose-500/30'}`}>
                                   <span className="font-bold text-zinc-100 text-lg mb-1">{h.symbol}</span>
                                   <span className={`text-sm font-mono font-bold ${h.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                       {h.pct > 0 ? '+' : ''}{h.pct.toFixed(2)}%
                                   </span>
                                   <span className="text-[10px] text-zinc-500 font-mono mt-1">${h.close.toLocaleString('en-US', {maximumFractionDigits: 4})}</span>
                               </div>
                           ))}
                       </div>
                   )}
               </div>
            </div>
         </>
      )}
    </div>
  );
};

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

const PopoutWindow = ({ title, externalWindow, onClose, children }) => {
  const [container, setContainer] = useState(null);
  const onCloseRef = useRef(onClose);
  
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => { 
    if (externalWindow && !externalWindow.closed) {
        externalWindow.document.title = title; 
    }
  }, [title, externalWindow]);
  
  useEffect(() => {
    if (!externalWindow) return;
    
    if (externalWindow.document.head.querySelectorAll('style').length === 0) { 
        document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
            externalWindow.document.head.appendChild(node.cloneNode(true));
        }); 
    }
    
    externalWindow.document.body.style.margin = '0'; 
    externalWindow.document.body.style.backgroundColor = '#09090b';
    
    const div = externalWindow.document.createElement('div'); 
    div.style.width = '100vw'; 
    div.style.height = '100vh'; 
    div.style.display = 'flex'; 
    div.style.flexDirection = 'column'; 
    externalWindow.document.body.appendChild(div);
    setContainer(div);
    
    const handleUnload = () => {
        if (onCloseRef.current) onCloseRef.current();
    }; 
    externalWindow.addEventListener('unload', handleUnload);
    
    const closeWithMain = () => { if (externalWindow && !externalWindow.closed) externalWindow.close(); }; 
    window.addEventListener('unload', closeWithMain);
    
    return () => { 
        externalWindow.removeEventListener('unload', handleUnload); 
        window.removeEventListener('unload', closeWithMain); 
        if (div.parentNode) div.parentNode.removeChild(div); 
    };
  }, [externalWindow]); 
  
  return container ? ReactDOM.createPortal(children, container) : null;
};

const TradingChart = ({ pair, timeframe, showVolume, signals, positions, scriptLoaded, isActive, onClick, onPopout, isDrawingMode, externalWindow }) => {
  const chartContainerRef = useRef(null); const chartRef = useRef(null); const seriesRefs = useRef({ candle: null, volume: null, sma1: null, sma2: null, bbUpper: null, bbMiddle: null, bbLower: null, rsi: null, macdLine: null, macdSignal: null, macdHist: null });
  const [marketData, setMarketData] = useState([]); const customLinesRef = useRef([]);

  useEffect(() => { const loadData = async () => { setMarketData([]); if (!pair || !pair.altname) return; const initialData = await fetchKrakenOHLC(tfMap[timeframe], pair.altname); if (initialData.length > 0) setMarketData(initialData); }; loadData(); }, [pair?.altname, timeframe]);
  
  useEffect(() => {
    if (!scriptLoaded || !chartContainerRef.current) return;
    
    const chart = window.LightweightCharts.createChart(chartContainerRef.current, { 
        layout: { background: { type: 'solid', color: '#09090b' }, textColor: '#a1a1aa' }, 
        grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } }, 
        crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal }, 
        rightPriceScale: { borderColor: '#334155' }, 
        timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false }, 
        localization: { priceFormatter: price => price.toFixed(4) } 
    });
    
    chartRef.current = chart;
    
    seriesRefs.current.candle = chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#ef4444', borderDownColor: '#ef4444', borderUpColor: '#10b981', wickDownColor: '#ef4444', wickUpColor: '#10b981', priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    seriesRefs.current.volume = chart.addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '', scaleMargins: { top: 0.8, bottom: 0 } });
    seriesRefs.current.sma1 = chart.addLineSeries({ color: signals.sma1.color, lineWidth: 2, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    seriesRefs.current.sma2 = chart.addLineSeries({ color: signals.sma2.color, lineWidth: 2, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    seriesRefs.current.bbUpper = chart.addLineSeries({ color: signals.bb.color, lineWidth: 1, lineStyle: 2, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    seriesRefs.current.bbMiddle = chart.addLineSeries({ color: signals.bb.color, lineWidth: 1, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    seriesRefs.current.bbLower = chart.addLineSeries({ color: signals.bb.color, lineWidth: 1, lineStyle: 2, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    seriesRefs.current.rsi = chart.addLineSeries({ color: signals.rsi.color, lineWidth: 2, priceScaleId: 'bottom_pane' });
    seriesRefs.current.macdLine = chart.addLineSeries({ color: '#2962FF', lineWidth: 2, priceScaleId: 'bottom_pane' });
    seriesRefs.current.macdSignal = chart.addLineSeries({ color: '#FF6D00', lineWidth: 2, priceScaleId: 'bottom_pane' });
    seriesRefs.current.macdHist = chart.addHistogramSeries({ priceScaleId: 'bottom_pane' });
    chart.priceScale('bottom_pane').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    
    chart.subscribeClick((param) => { 
        if (window.appIsDrawingMode && param.point && seriesRefs.current.candle) { 
            const price = seriesRefs.current.candle.coordinateToPrice(param.point.y); 
            if (price) { 
                const line = seriesRefs.current.candle.createPriceLine({ price: price, color: '#3b82f6', lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: 'Support/Res' }); 
                customLinesRef.current.push(line); 
            } 
        } 
    });
    
    const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
            if (externalWindow) {
                chartRef.current.applyOptions({ width: externalWindow.innerWidth, height: externalWindow.innerHeight });
            } else {
                const rect = chartContainerRef.current.getBoundingClientRect();
                chartRef.current.applyOptions({ width: rect.width, height: rect.height });
            }
        }
    };

    let resizeObserver;
    if (externalWindow) {
        externalWindow.addEventListener('resize', handleResize);
        setTimeout(handleResize, 100); 
    } else {
        resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(chartContainerRef.current);
    }

    return () => { 
        if (externalWindow) externalWindow.removeEventListener('resize', handleResize);
        if (resizeObserver) resizeObserver.disconnect(); 
        chart.remove(); 
        chartRef.current = null; 
    };
  }, [scriptLoaded, externalWindow]);

  useEffect(() => { window.appIsDrawingMode = isDrawingMode; }, [isDrawingMode]);

  useEffect(() => {
    if (!chartRef.current || marketData.length === 0) return;
    
    const candleData = marketData.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
    const volumeData = marketData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' }));
    
    seriesRefs.current.candle.setData(candleData); 
    seriesRefs.current.volume.setData(volumeData); 
    seriesRefs.current.volume.applyOptions({ visible: showVolume });
    
    seriesRefs.current.sma1.setData(signals.sma1.active ? calculateSMA(marketData, signals.sma1.period) : []);
    seriesRefs.current.sma2.setData(signals.sma2.active ? calculateSMA(marketData, signals.sma2.period) : []);
    if (signals.bb.active) { 
        const bbData = calculateBB(marketData, signals.bb.period, signals.bb.stdDev); 
        seriesRefs.current.bbUpper.setData(bbData.upper); seriesRefs.current.bbMiddle.setData(bbData.middle); seriesRefs.current.bbLower.setData(bbData.lower); 
    } else { 
        seriesRefs.current.bbUpper.setData([]); seriesRefs.current.bbMiddle.setData([]); seriesRefs.current.bbLower.setData([]); 
    }
    seriesRefs.current.rsi.setData(signals.rsi.active ? calculateRSI(marketData, signals.rsi.period) : []);
    if (signals.macd.active) { 
        const macdResult = calculateMACD(marketData); 
        seriesRefs.current.macdLine.setData(macdResult.map(d => ({ time: d.time, value: d.macd }))); 
        seriesRefs.current.macdSignal.setData(macdResult.map(d => ({ time: d.time, value: d.signal }))); 
        seriesRefs.current.macdHist.setData(macdResult.map(d => ({ time: d.time, value: d.histogram, color: d.histogram >= 0 ? '#26a69a' : '#ef5350' }))); 
    } else { 
        seriesRefs.current.macdLine.setData([]); seriesRefs.current.macdSignal.setData([]); seriesRefs.current.macdHist.setData([]); 
    }
  }, [marketData, showVolume, signals]);

  useEffect(() => {
    if (!seriesRefs.current.candle || !pair) return;
    const currentPairPositions = positions.filter(p => p.pair === pair.id || p.pair === pair.altname || p.pair === pair.display);
    const sortedPositions = [...currentPairPositions].sort((a, b) => a.time - b.time);
    const markers = sortedPositions.map(pos => { const isBuy = pos.side === 'Long'; return { time: pos.time, position: isBuy ? 'belowBar' : 'aboveBar', color: isBuy ? '#10b981' : '#ef4444', shape: isBuy ? 'arrowUp' : 'arrowDown', text: `${isBuy ? 'Buy' : 'Sell'} @ ${pos.price}`, size: 2 }; });
    seriesRefs.current.candle.setMarkers(markers);
  }, [positions, pair]);

  useEffect(() => {
    if (marketData.length === 0 || !pair || !pair.wsname || !chartRef.current) return;
    
    let currentCandles = [...marketData];

    const handleLivePrice = (payload) => {
        if (!payload.c || !payload.c[0]) return;
        const newPrice = parseFloat(payload.c[0]);
        
        const lastCandle = currentCandles[currentCandles.length - 1]; 
        const now = Math.floor(Date.now() / 1000); 
        const tfSeconds = tfMap[timeframe] * 60;
        
        let updatedCandle;
        if (now - lastCandle.time >= tfSeconds) { 
            updatedCandle = { time: now, open: newPrice, high: newPrice, low: newPrice, close: newPrice, volume: 0 }; 
            currentCandles.push(updatedCandle);
            if(currentCandles.length > 2000) currentCandles.shift();
        } else { 
            updatedCandle = { ...lastCandle, close: newPrice, high: Math.max(lastCandle.high, newPrice), low: Math.min(lastCandle.low, newPrice) }; 
            currentCandles[currentCandles.length - 1] = updatedCandle;
        }

        if (seriesRefs.current.candle) seriesRefs.current.candle.update(updatedCandle);
        if (seriesRefs.current.volume && showVolume) seriesRefs.current.volume.update({ time: updatedCandle.time, value: updatedCandle.volume, color: updatedCandle.close >= updatedCandle.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' });

        if (signals.sma1.active && seriesRefs.current.sma1) { const res = calculateSMA(currentCandles, signals.sma1.period); if(res.length) seriesRefs.current.sma1.update(res[res.length-1]); }
        if (signals.sma2.active && seriesRefs.current.sma2) { const res = calculateSMA(currentCandles, signals.sma2.period); if(res.length) seriesRefs.current.sma2.update(res[res.length-1]); }
        if (signals.bb.active && seriesRefs.current.bbUpper) { const res = calculateBB(currentCandles, signals.bb.period, signals.bb.stdDev); if(res.upper.length) { seriesRefs.current.bbUpper.update(res.upper[res.upper.length-1]); seriesRefs.current.bbMiddle.update(res.middle[res.middle.length-1]); seriesRefs.current.bbLower.update(res.lower[res.lower.length-1]); } } 
        if (signals.rsi.active && seriesRefs.current.rsi) { const res = calculateRSI(currentCandles, signals.rsi.period); if(res.length) seriesRefs.current.rsi.update(res[res.length-1]); }
        if (signals.macd.active && seriesRefs.current.macdLine) { const res = calculateMACD(currentCandles); if(res.length) { const last = res[res.length-1]; seriesRefs.current.macdLine.update({ time: last.time, value: last.macd }); seriesRefs.current.macdSignal.update({ time: last.time, value: last.signal }); seriesRefs.current.macdHist.update({ time: last.time, value: last.histogram, color: last.histogram >= 0 ? '#26a69a' : '#ef5350' }); } }
    };

    wsClient.subscribe('ticker', pair.wsname, handleLivePrice);
    
    return () => {
        wsClient.unsubscribe('ticker', pair.wsname, handleLivePrice);
    };
  }, [marketData.length, timeframe, pair?.wsname, signals, showVolume]); 

  return (
    <div className={`flex-1 relative bg-[#09090b] border-r border-b border-zinc-800 min-h-0 transition-colors ${isActive ? 'ring-2 ring-inset ring-blue-500 z-10' : ''}`} onClick={onClick}>
      <div className={`absolute inset-0 ${isDrawingMode ? 'cursor-crosshair' : ''}`} ref={chartContainerRef}></div>
      {marketData.length === 0 && (<div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-zinc-600 animate-pulse text-xs">Ophalen {pair?.display}...</span></div>)}
      <div className="absolute top-3 left-3 z-10 bg-[#09090b]/80 border border-zinc-800 px-2 py-1 rounded text-xs text-zinc-300 font-semibold backdrop-blur flex items-center space-x-2 pointer-events-none">
        <span>{pair?.display.replace('XBT', 'BTC')}</span>{isActive && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>}
      </div>
      {onPopout && (<button onClick={(e) => { e.stopPropagation(); onPopout(); }} className="absolute top-3 right-3 z-10 bg-[#09090b]/80 border border-zinc-800 p-1.5 rounded text-zinc-400 hover:text-white backdrop-blur transition hover:bg-zinc-800" title="Open in nieuw venster"><ExternalLink className="w-3.5 h-3.5" /></button>)}
    </div>
  );
};

// ==========================================
// 🟢 HOOFD COMPONENT
// ==========================================
export default function TradingDashboard() {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [currentView, setCurrentView] = useState('charts');
  const [availablePairs, setAvailablePairs] = useState([]);
  const [gridPairs, setGridPairs] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  
  const [rightPanelWidth, setRightPanelWidth] = useState(560);
  const [isResizing, setIsResizing] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [apiKeys, setApiKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trading_api_keys')) || { krakenKey: '', krakenSecret: '', geminiKey: '' }; }
    catch { return { krakenKey: '', krakenSecret: '', geminiKey: '' }; }
  });
  
  const [aiMessages, setAiMessages] = useState([{ role: 'model', text: `Hallo! Ik ben je Google Gemini Trading Adviseur.` }]);
  const activePair = gridPairs[activeIndex] || { id: 'XXBTZUSD', altname: 'XBTUSD', display: 'BTC/USD', base: 'BTC', quote: 'USD', wsname: 'XBT/USD' };

  const [layout, setLayout] = useState(1);
  const [popoutCharts, setPopoutCharts] = useState([]);
  const [showVolume, setShowVolume] = useState(true);
  const [timeframe, setTimeframe] = useState('1m');
  
  const [signals, setSignals] = useState({
    sma1: { active: true, period: 50, color: '#2962FF' }, sma2: { active: false, period: 200, color: '#FF6D00' },
    bb: { active: false, period: 20, stdDev: 2, color: '#9c27b0' }, rsi: { active: false, period: 14, color: '#e91e63' },
    macd: { active: false, color: '#2962FF' }
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balances, setBalances] = useState({ USD: 0, BTC: 0, ETH: 0, SOL: 0 });
  const [tradeSide, setTradeSide] = useState('Buy'); 
  const [orderType, setOrderType] = useState('Limit');
  const [activeTab, setActiveTab] = useState('posities');
  
  const [useSL, setUseSL] = useState(false); const [slInput, setSlInput] = useState('');
  const [useTP, setUseTP] = useState(false); const [tpInput, setTpInput] = useState('');
  
  const { currentPrice, orderBook } = useKrakenMarketData(activePair?.wsname);

  const [priceInput, setPriceInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [totalInput, setTotalInput] = useState('');

  const [openOrders, setOpenOrders] = useState([]);
  const [positions, setPositions] = useState([]); 
  const [tradeHistory, setTradeHistory] = useState([]); 
  const [equityCurve, setEquityCurve] = useState(() => {
     const saved = localStorage.getItem('kraken_equity_curve');
     return saved ? (JSON.parse(saved) || []) : [];
  });

  const [bots, setBots] = useState([]); 
  const botsRef = useRef(bots);
  const balancesRef = useRef(balances);
  const fetchOrdersRef = useRef(null);
  
  useEffect(() => { botsRef.current = bots; }, [bots]);
  useEffect(() => { balancesRef.current = balances; }, [balances]);

  // ==========================================
  // 🤖 BOT ENGINE 2.0 (FASE 3 & 5 LOGICA)
  // ==========================================
  useEffect(() => {
    const engineInterval = setInterval(async () => {
      const currentBots = botsRef.current;
      const currentBalances = balancesRef.current;
      if (currentBots.length === 0) return;
      let hasUpdates = false;

      const updatedBots = await Promise.all(currentBots.map(async (bot) => {
        if (!bot.isRunning) return bot;
        const updatedBot = { ...bot };
        const cfg = updatedBot.config;
        const state = updatedBot.state;
        const stats = updatedBot.stats;

        try {
          const tfMins = tfMap[cfg.timeframe] || 1;
          const data = await fetchKrakenOHLC(tfMins, updatedBot.pair.altname);
          if (data.length < 50) return updatedBot;

          const botCurrentClose = data[data.length - 1].close;
          const nowMs = Date.now();
          let buySignal = false, sellSignal = false;
          let logMsg = `[Analytisch] ${updatedBot.pair.display} | $${botCurrentClose.toFixed(4)}`;

          state.currentPrice = botCurrentClose;
          if (state.totalVolume > 0 && state.averageEntryPrice > 0) {
             state.livePnl = (botCurrentClose - state.averageEntryPrice) * state.totalVolume;
             state.livePnlPct = (botCurrentClose - state.averageEntryPrice) / state.averageEntryPrice * 100;
          } else {
             state.livePnl = 0; state.livePnlPct = 0;
          }

          const inCooldown = state.lastAction === 'SELL' && (nowMs - state.lastTradeTime < cfg.cooldownMins * 60000);
          if (inCooldown) logMsg += ` | ⏳ Afkoelperiode`;

          if (state.totalVolume > 0 && state.averageEntryPrice > 0) {
             logMsg += ` | PnL: ${state.livePnlPct.toFixed(2)}%`;
             if (cfg.slPct > 0 && state.livePnlPct <= -cfg.slPct) { logMsg = `💥 STOP-LOSS (${state.livePnlPct.toFixed(2)}%)`; sellSignal = true; }
             else if (cfg.tpPct > 0 && state.livePnlPct >= cfg.tpPct) { logMsg = `🎯 TAKE-PROFIT (${state.livePnlPct.toFixed(2)}%)`; sellSignal = true; }
             else if (cfg.useDca && state.currentEntries < cfg.dcaCount) {
                if (state.livePnlPct <= -cfg.dcaDropPct) { logMsg = `📉 DCA Bereikt (${state.livePnlPct.toFixed(2)}%). Extra Entry!`; buySignal = true; }
             }
          }

          if (!buySignal && !sellSignal && (!inCooldown || state.totalVolume > 0)) {
              if (updatedBot.strategy === 'RSI' || updatedBot.strategy === 'RSI_TREND') {
                const rsiVals = calculateRSI(data, cfg.rsiPeriod);
                const rsi = rsiVals[rsiVals.length-1].value;
                let trendUp = true;
                if (updatedBot.strategy === 'RSI_TREND') {
                   const sma = calculateSMA(data, 50);
                   trendUp = botCurrentClose > sma[sma.length-1].value;
                   logMsg += ` | RSI: ${rsi.toFixed(1)} | Trend: ${trendUp ? 'Bull' : 'Bear'}`;
                } else { logMsg += ` | RSI: ${rsi.toFixed(1)}`; }
                
                if (rsi <= cfg.rsiBuyLevel && trendUp && state.totalVolume === 0) buySignal = true;
                if (rsi >= cfg.rsiSellLevel && state.totalVolume > 0) sellSignal = true;
              } 
              else if (updatedBot.strategy === 'BB_VOL') {
                const bb = calculateBB(data, 20, 2);
                const upper = bb.upper[bb.upper.length-1].value;
                const lower = bb.lower[bb.lower.length-1].value;
                const volSma = calculateSMA(data, 20, 'volume');
                const avgVol = volSma[volSma.length-1].value;
                const currentVol = data[data.length-1].volume;
                const volSpike = currentVol > (avgVol * 1.5);

                logMsg += ` | BB Boven: ${upper.toFixed(2)} | VolSpike: ${volSpike ? 'Ja' : 'Nee'}`;
                if (botCurrentClose < lower && volSpike && state.totalVolume === 0) buySignal = true; 
                if (botCurrentClose > upper && state.totalVolume > 0) sellSignal = true;
              }
          }

          if (cfg.useTrailing) {
             if (buySignal && state.phase === 'WAITING') {
                state.phase = 'TRAILING_BUY'; state.extremePrice = botCurrentClose; 
                logMsg = `📉 Start Trailing Buy. Bodem: $${botCurrentClose.toFixed(4)}`; buySignal = false; 
             } else if (sellSignal && state.phase === 'WAITING') {
                state.phase = 'TRAILING_SELL'; state.extremePrice = botCurrentClose; 
                logMsg = `📈 Start Trailing Sell. Top: $${botCurrentClose.toFixed(4)}`; sellSignal = false;
             }

             if (state.phase === 'TRAILING_BUY') {
                if (botCurrentClose < state.extremePrice) { state.extremePrice = botCurrentClose; logMsg = `👇 Nieuwe bodem: $${botCurrentClose.toFixed(4)}`; buySignal = false; } 
                else if (botCurrentClose >= state.extremePrice * (1 + cfg.trailingPct/100)) { buySignal = true; state.phase = 'WAITING'; logMsg = `🟢 Omkering! Koopsignaal definitief.`; } 
                else { logMsg += ` | Wacht op omkering...`; buySignal = false; }
             } else if (state.phase === 'TRAILING_SELL') {
                if (botCurrentClose > state.extremePrice) { state.extremePrice = botCurrentClose; logMsg = `👆 Nieuwe top: $${botCurrentClose.toFixed(4)}`; sellSignal = false; } 
                else if (botCurrentClose <= state.extremePrice * (1 - cfg.trailingPct/100)) { sellSignal = true; state.phase = 'WAITING'; logMsg = `🔴 Omkering! Verkoopsignaal definitief.`; } 
                else { logMsg += ` | Wacht op omkering...`; sellSignal = false; }
             }
          }

          if (logMsg !== updatedBot.lastLog) {
             updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: logMsg, type: 'info' }].slice(-50);
             updatedBot.lastLog = logMsg; hasUpdates = true;
          }

          if ((buySignal || sellSignal) && cfg.useAiFilter) {
              updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `🧠 Vraagt AI om verificatie... (Min ${cfg.aiMinConfidence}%)`, type: 'info' }].slice(-50);
              hasUpdates = true; 
              try {
                  const recentDataStr = data.slice(-40).map(d => `T:${new Date(d.time*1000).getHours()}:${new Date(d.time*1000).getMinutes()} C:${d.close.toFixed(2)}`).join(',');
                  const res = await fetch('http://localhost:3001/api/ai/analyze', {
                      method: 'POST', headers: getApiHeaders(),
                      body: JSON.stringify({ pair: updatedBot.pair.display, timeframe: cfg.timeframe, data: recentDataStr })
                  });
                  const aiResult = await res.json();
                  
                  const aiMsg = `🧠 AI: ${aiResult.bias} (${aiResult.confidence}%). Advies: ${aiResult.advice}`;
                  updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: aiMsg, type: 'info' }].slice(-50);
                  
                  if (aiResult.confidence < cfg.aiMinConfidence) {
                      updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ Geannuleerd: AI Zekerheid te laag.`, type: 'error' }].slice(-50);
                      buySignal = false; sellSignal = false;
                  } else if (buySignal && aiResult.bias !== 'BULLISH') {
                      updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ Buy Geannuleerd: AI trend is niet Bullish.`, type: 'error' }].slice(-50);
                      buySignal = false;
                  } else if (sellSignal && aiResult.bias !== 'BEARISH') {
                      updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ Sell Geannuleerd: AI trend is niet Bearish.`, type: 'error' }].slice(-50);
                      sellSignal = false;
                  }
              } catch (err) {
                  updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ AI Fout, trade overgeslagen.`, type: 'error' }].slice(-50);
                  buySignal = false; sellSignal = false;
              }
          }

          if (buySignal) {
             let volumeToBuyRaw = 0;
             if (cfg.sizingType === 'percent') {
                 const availableQuote = currentBalances[updatedBot.pair.quote] || 0;
                 volumeToBuyRaw = (availableQuote * (cfg.tradePercent / 100)) / botCurrentClose;
             } else { volumeToBuyRaw = cfg.tradeAmount; }
             
             const volumeToBuy = Number(volumeToBuyRaw.toFixed(8));
             
             if (volumeToBuy > 0) {
                 updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `⏳ Verificatie Buy Order: ${volumeToBuy} ${updatedBot.pair.base}...`, type: 'info' }].slice(-50);
                 hasUpdates = true;
                 try {
                     const response = await fetch('http://localhost:3001/api/order', { 
                         method: 'POST', headers: getApiHeaders(), 
                         body: JSON.stringify({ pair: updatedBot.pair.altname, type: 'buy', ordertype: 'market', volume: volumeToBuy }) 
                     });
                     const apiData = await response.json();
                     if (apiData.error) {
                         updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ BUY GEWEIGERD: ${apiData.error}`, type: 'error' });
                     } else {
                         updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `✅ BUY SUCCESVOL @ $${botCurrentClose.toFixed(2)}`, type: 'buy' });
                         state.lastAction = 'BUY'; state.lastTradeTime = nowMs;
                         const oldTotalValue = state.totalVolume * state.averageEntryPrice;
                         const newTotalValue = oldTotalValue + (volumeToBuy * botCurrentClose);
                         state.totalVolume += volumeToBuy; state.averageEntryPrice = newTotalValue / state.totalVolume; state.currentEntries += 1;
                         
                         const newTrade = { id: 'bot-' + Date.now(), time: Math.floor(nowMs / 1000), date: new Date(nowMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), pair: updatedBot.pair.display, type: 'market', side: 'Long', price: botCurrentClose, amount: volumeToBuy, fee: 0, cost: volumeToBuy * botCurrentClose, pnl: 0 };
                         setTradeHistory(prev => [newTrade, ...prev]); setPositions(prev => [...prev, newTrade]);
                         if (fetchOrdersRef.current) setTimeout(fetchOrdersRef.current, 2000);
                     }
                 } catch (err) { updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ SERVER FOUT: Buy mislukt.`, type: 'error' }); }
             }
          } 
          else if (sellSignal && state.totalVolume > 0) {
             const volToSell = Number(state.totalVolume.toFixed(8));
             updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `⏳ Verificatie Sell Order: ${volToSell} ${updatedBot.pair.base}...`, type: 'info' }].slice(-50);
             hasUpdates = true;
             try {
                 const response = await fetch('http://localhost:3001/api/order', { 
                     method: 'POST', headers: getApiHeaders(), 
                     body: JSON.stringify({ pair: updatedBot.pair.altname, type: 'sell', ordertype: 'market', volume: volToSell }) 
                 });
                 const apiData = await response.json();
                 if (apiData.error) {
                     updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ SELL GEWEIGERD: ${apiData.error}`, type: 'error' });
                 } else {
                     updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `✅ SELL SUCCESVOL @ $${botCurrentClose.toFixed(2)}`, type: 'sell' });
                     const pnl = (botCurrentClose - state.averageEntryPrice) * state.totalVolume;
                     stats.trades.push({ type: 'SELL', price: botCurrentClose, pnl, time: nowMs });
                     if (pnl > 0) { stats.winCount++; stats.grossProfit += pnl; } else { stats.lossCount++; stats.grossLoss += Math.abs(pnl); }
                     state.lastAction = 'SELL'; state.lastTradeTime = nowMs; state.averageEntryPrice = 0; state.totalVolume = 0; state.currentEntries = 0;
                     
                     const newTrade = { id: 'bot-' + Date.now(), time: Math.floor(nowMs / 1000), date: new Date(nowMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), pair: updatedBot.pair.display, type: 'market', side: 'Short', price: botCurrentClose, amount: volToSell, fee: 0, cost: volToSell * botCurrentClose, pnl: pnl };
                     setTradeHistory(prev => [newTrade, ...prev]); setPositions(prev => [...prev, newTrade]);
                     if (fetchOrdersRef.current) setTimeout(fetchOrdersRef.current, 2000);
                 }
             } catch (err) { updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ SERVER FOUT: Sell mislukt.`, type: 'error' }); }
          }
          return updatedBot;
        } catch(e) { return bot; }
      }));
      if (hasUpdates) setBots(updatedBots);
    }, 10000); 
    return () => clearInterval(engineInterval);
  }, []);

  useEffect(() => {
    if (window.LightweightCharts) setScriptLoaded(true);
    else {
      const script = document.createElement('script'); script.src = 'https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js'; script.async = true; script.onload = () => setScriptLoaded(true); document.body.appendChild(script);
      return () => { if (document.body.contains(script)) document.body.removeChild(script); };
    }
  }, []);

  useEffect(() => { fetchKrakenPairs().then(pairs => { if (pairs.length > 0) setAvailablePairs(pairs); }); }, []);

  useEffect(() => {
    if (availablePairs.length > 0 && gridPairs.length === 0) {
      const savedGridIds = localStorage.getItem('kraken_grid_pairs'); const savedIndex = localStorage.getItem('kraken_active_index'); let loadedSuccessfully = false;
      if (savedGridIds) { try { const parsedIds = JSON.parse(savedGridIds); const loadedPairs = parsedIds.map(id => availablePairs.find(p => p.id === id)).filter(Boolean); if (loadedPairs.length === 4) { setGridPairs(loadedPairs); if (savedIndex) setActiveIndex(Number(savedIndex)); loadedSuccessfully = true; } } catch (e) { } }
      if (!loadedSuccessfully) { const btc = availablePairs.find(p => p.display.includes('BTC/USD')) || availablePairs[0]; const eth = availablePairs.find(p => p.display.includes('ETH/USD')) || availablePairs[1]; const sol = availablePairs.find(p => p.display.includes('SOL/USD')) || availablePairs[2]; const xrp = availablePairs.find(p => p.display.includes('XRP/USD')) || availablePairs[3]; setGridPairs([btc, eth, sol, xrp]); }
    }
  }, [availablePairs, gridPairs.length]);

  useEffect(() => { if (gridPairs.length === 4) { localStorage.setItem('kraken_grid_pairs', JSON.stringify(gridPairs.map(p => p.id))); localStorage.setItem('kraken_active_index', activeIndex.toString()); } }, [gridPairs, activeIndex]);

  useEffect(() => {
     if(!isLoggedIn || currentPrice === 0) return;
     let estTotal = balances['USD'] || 0;
     if (activePair.base === 'BTC') estTotal += (balances['BTC']||0) * currentPrice;
     if (activePair.base === 'ETH') estTotal += (balances['ETH']||0) * currentPrice;
     if (activePair.base === 'SOL') estTotal += (balances['SOL']||0) * currentPrice;
     const now = Math.floor(Date.now() / 1000);
     setEquityCurve(prev => {
         if (prev.length === 0) { const newCurve = [{ time: now, value: estTotal }]; localStorage.setItem('kraken_equity_curve', JSON.stringify(newCurve)); return newCurve; }
         const last = prev[prev.length - 1];
         if (now - last.time > 3600 || Math.abs(last.value - estTotal) > 1.0) { const newCurve = [...prev, { time: now, value: estTotal }]; const trimmedCurve = newCurve.slice(-500); localStorage.setItem('kraken_equity_curve', JSON.stringify(trimmedCurve)); return trimmedCurve; }
         return prev;
     });
  }, [balances, currentPrice, activePair, isLoggedIn]);

  const fetchOrders = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/orders', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) return;
      if (data.open) {
        const openArr = Object.values(data.open).map(o => ({ id: o.descr.txid || Math.random().toString(), time: Math.floor(parseFloat(o.opentm)), date: new Date(o.opentm * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), pair: o.descr.pair, type: o.descr.ordertype, side: o.descr.type === 'buy' ? 'Long' : 'Short', price: parseFloat(o.descr.price), amount: parseFloat(o.vol), fee: 0, pnl: 0 }));
        setOpenOrders(openArr);
      }
      if (data.trades) {
        const tradesArr = Object.values(data.trades).map(t => ({ id: t.ordertxid || Math.random().toString(), time: Math.floor(parseFloat(t.time)), date: new Date(t.time * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), pair: t.pair, type: t.ordertype, side: t.type === 'buy' ? 'Long' : 'Short', price: parseFloat(t.price), amount: parseFloat(t.vol), fee: parseFloat(t.fee), cost: parseFloat(t.cost), pnl: 0 })).sort((a,b) => b.time - a.time);
        setTradeHistory(tradesArr); setPositions(tradesArr); 
      }
    } catch (e) { }
  };
  useEffect(() => { fetchOrdersRef.current = fetchOrders; });

  const hasFetchedBalance = useRef(false);
  useEffect(() => {
    if (hasFetchedBalance.current) return;
    hasFetchedBalance.current = true;
    const autoFetchBalance = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({}) });
        const data = await res.json();
        if (data.error) throw new Error(data.error.join ? data.error.join(', ') : data.error);
        const newBalances = { ...balances };
        Object.keys(data).forEach(k => { let cleanKey = k.replace('Z', '').replace('X', ''); if (k === 'ZUSD') cleanKey = 'USD'; if (k === 'XXBT') cleanKey = 'BTC'; newBalances[cleanKey] = parseFloat(data[k]); });
        setBalances(newBalances); setIsLoggedIn(true);
        setTimeout(() => fetchOrders(), 1000); 
      } catch (err) { setIsLoggedIn(false); }
    };
    autoFetchBalance();
  }, []);

  const saveSettings = () => {
      localStorage.setItem('trading_api_keys', JSON.stringify(apiKeys));
      setShowSettings(false);
      window.location.reload(); 
  };

  const handlePairSelect = (pair) => { setGridPairs(prev => { const newGrid = [...prev]; newGrid[activeIndex] = pair; return newGrid; }); setIsDropdownOpen(false); setSearchTerm(''); };
  const handleSignalChange = (signalKey, field, value) => { setSignals(prev => { const newState = { ...prev, [signalKey]: { ...prev[signalKey], [field]: value } }; if (signalKey === 'macd' && value === true) newState.rsi.active = false; if (signalKey === 'rsi' && value === true) newState.macd.active = false; return newState; }); };
  const openPopout = (pair) => { if (!pair) return; const newWin = window.open('', '', 'width=800,height=430,left=200,top=200'); if (!newWin) return alert("Pop-ups worden geblokkeerd. Sta pop-ups toe in je browser."); setPopoutCharts(prev => [...prev, { pair, win: newWin }]); };
  const closePopout = (indexToRemove) => { setPopoutCharts(prev => prev.filter((_, i) => i !== indexToRemove)); };
  const onPriceChange = (val) => { setPriceInput(val); if (amountInput && !isNaN(val)) setTotalInput((parseFloat(amountInput) * parseFloat(val)).toFixed(2)); };
  const onAmountChange = (val) => { setAmountInput(val); const p = orderType === 'Market' ? currentPrice : parseFloat(priceInput); if (!isNaN(val) && p > 0) setTotalInput((parseFloat(val) * p).toFixed(2)); else setTotalInput(''); };
  const onTotalChange = (val) => { setTotalInput(val); const p = orderType === 'Market' ? currentPrice : parseFloat(priceInput); if (!isNaN(val) && p > 0) setAmountInput((parseFloat(val) / p).toFixed(6)); else setAmountInput(''); };
  useEffect(() => { 
      if (orderType === 'Market') { setPriceInput(currentPrice.toString()); if (amountInput) setTotalInput((parseFloat(amountInput) * currentPrice).toFixed(2)); } 
      if (currentPrice > 0 && !priceInput) { setPriceInput(currentPrice.toFixed(4)); }
  }, [orderType, currentPrice]);
  const handleSliderClick = (pct) => { const available = balances[activePair.quote] || 0; const spend = available * (pct / 100); const p = orderType === 'Market' ? currentPrice : parseFloat(priceInput) || currentPrice; setTotalInput(spend.toFixed(2)); if (p > 0) setAmountInput((spend / p).toFixed(6)); };

  const executeOrder = async (side) => {
    const amt = parseFloat(amountInput); const p = orderType === 'Market' ? currentPrice : parseFloat(priceInput);
    if (!amt || amt <= 0) return alert('Vul een geldig aantal in.');
    try {
      const payload = { pair: activePair.altname, type: side === 'Buy' ? 'buy' : 'sell', ordertype: orderType.toLowerCase(), volume: amt };
      if (orderType === 'Limit') payload.price = p;
      if (useSL && slInput) payload.slPrice = parseFloat(slInput);
      if (useTP && tpInput) payload.tpPrice = parseFloat(tpInput);

      const res = await fetch('http://localhost:3001/api/order', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.join ? data.error.join(', ') : data.error);

      alert(`Order succesvol geplaatst! Transactie ID: ${data.txid?.join(', ')}`);
      setTimeout(() => {
         fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({}) }).then(r => r.json()).then(bData => { if(!bData.error) { const nb = { ...balances }; Object.keys(bData).forEach(k => { let ck = k.replace('Z', '').replace('X', ''); if (k === 'ZUSD') ck = 'USD'; if (k === 'XXBT') ck = 'BTC'; nb[ck] = parseFloat(bData[k]); }); setBalances(nb); } });
         fetchOrders();
      }, 1500); 
      setAmountInput(''); setTotalInput(''); setUseSL(false); setUseTP(false);
    } catch (err) { alert('Fout bij plaatsen order:\n' + err.message); }
  };

  const cancelOrder = async (txid) => {
    if (!window.confirm("Weet je zeker dat je deze order wilt annuleren?")) return;
    try {
      const res = await fetch('http://localhost:3001/api/cancel-order', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ txid }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.join ? data.error.join(', ') : data.error);
      alert('Order succesvol geannuleerd!'); fetchOrders();
    } catch (err) { alert('Fout bij annuleren: ' + err.message); }
  };

  const formatPrice = (price) => { if (typeof price !== 'number' || isNaN(price)) return '0.0000'; return price < 1 ? price.toFixed(5) : price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}); };
  const filteredPairs = availablePairs.filter(p => p.display.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
      if (currentPrice === 0 || !activePair) return;
      setPositions(currentPos => currentPos.map(pos => {
          if (pos.pair !== activePair.display && pos.pair !== activePair.altname) return pos; 
          const pnlDiff = pos.side === 'Long' ? (currentPrice - pos.price) : (pos.price - currentPrice);
          return { ...pos, pnl: pnlDiff * pos.amount };
      }));
  }, [currentPrice, activePair]);

  const renderTableBody = () => {
    const isOpenOrdersTab = activeTab.includes('open'); const isHistoryTab = activeTab.includes('historie');
    const data = isOpenOrdersTab ? openOrders : (isHistoryTab ? tradeHistory : positions);
    if (data.length === 0) return <tr><td colSpan={isHistoryTab ? "7" : "6"} className="py-8 text-center text-zinc-600">Geen actieve data in dit tabblad</td></tr>;

    return data.map((item) => (
      <tr key={item.id} className="hover:bg-zinc-800/30 transition border-b border-zinc-800/50 group text-[11px]">
        <td className="px-4 py-1.5 text-zinc-400">{item.date}</td>
        <td className="px-4 py-1.5 font-bold text-zinc-200">{item.pair}</td>
        <td className="px-4 py-1.5 text-blue-500 uppercase">{item.type}</td>
        <td className={`px-4 py-1.5 ${item.side === 'Long' ? 'text-emerald-500' : 'text-rose-500'}`}>{item.side}</td>
        <td className="px-4 py-1.5 font-mono">{item.price >= 10 ? item.price.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : item.price}</td>
        <td className="px-4 py-1.5 font-mono">{item.amount.toFixed(4)}</td>
        {isHistoryTab && <td className="px-4 py-1.5 font-mono text-amber-500/80">${item.fee?.toFixed(2)}</td>}
        {!isHistoryTab && !isOpenOrdersTab && <td className={`px-4 py-1.5 text-right font-mono ${item.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{item.pnl >= 0 ? '+' : ''}${item.pnl.toFixed(4)}</td>}
        {isOpenOrdersTab && <td className="px-4 py-1.5 text-right"><button onClick={() => cancelOrder(item.id)} className="text-rose-500 hover:text-white hover:bg-rose-600 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold transition shadow-sm">Annuleer</button></td>}
      </tr>
    ));
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-300 font-sans text-sm overflow-hidden">
      {/* ⚙️ Instellingen Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0b0e11] border border-zinc-800 p-6 rounded-2xl w-[400px] shadow-2xl">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-white font-bold flex items-center gap-2"><KeyRound size={18} className="text-blue-500"/> API Instellingen</h3>
               <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-rose-500"><X size={20}/></button>
             </div>
             <div className="space-y-4">
               <div className="space-y-1">
                 <label className="text-[10px] uppercase text-zinc-500 font-bold">Kraken API Key</label>
                 <input type="text" value={apiKeys.krakenKey} onChange={e => setApiKeys({...apiKeys, krakenKey: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Laat leeg voor backend default" />
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] uppercase text-zinc-500 font-bold">Kraken API Secret</label>
                 <input type="password" value={apiKeys.krakenSecret} onChange={e => setApiKeys({...apiKeys, krakenSecret: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Laat leeg voor backend default" />
               </div>
               <div className="h-px bg-zinc-800/50 my-2"></div>
               <div className="space-y-1">
                 <label className="text-[10px] uppercase text-zinc-500 font-bold">Gemini API Key (Optioneel voor AI)</label>
                 <input type="password" value={apiKeys.geminiKey} onChange={e => setApiKeys({...apiKeys, geminiKey: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Laat leeg voor backend default" />
               </div>
               <button onClick={saveSettings} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition mt-4 active:scale-95">Opslaan & Herstarten</button>
             </div>
          </div>
        </div>
      )}

      {popoutCharts.map((pop, i) => (
        <PopoutWindow key={`popout-${i}`} title={`Trading - ${pop.pair?.display}`} externalWindow={pop.win} onClose={() => closePopout(i)}>
          <div className="flex-1 flex flex-col h-screen w-full overflow-hidden bg-[#09090b]">
             <TradingChart pair={pop.pair} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={positions} scriptLoaded={scriptLoaded} isActive={false} isDrawingMode={isDrawingMode} externalWindow={pop.win} />
          </div>
        </PopoutWindow>
      ))}

      <nav className="w-14 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center py-4 space-y-6 z-10 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20"><Activity size={20} className="text-white" /></div>
        <button onClick={() => setCurrentView('charts')} className={`p-2 rounded-lg transition ${currentView === 'charts' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Grafieken"><LineChart size={20} /></button>
        <button onClick={() => setCurrentView('ai')} className={`p-2 rounded-lg transition ${currentView === 'ai' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Gemini AI"><Sparkles size={20} /></button>
        <button onClick={() => setCurrentView('portfolio')} className={`p-2 rounded-lg transition ${currentView === 'portfolio' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Portefeuille"><Wallet size={20} /></button>
        <button onClick={() => setCurrentView('bots')} className={`p-2 rounded-lg transition mt-4 ${currentView === 'bots' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Bot Manager"><Bot size={20} /></button>
        <div className="flex-1"></div>
        <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-500 hover:text-zinc-300" title="API Instellingen"><Settings size={20} /></button>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-[#09090b] border-b border-zinc-800 flex items-center px-4 shrink-0 relative">
          <div className="relative z-50">
            <div className="flex items-center cursor-pointer hover:bg-zinc-800/50 px-2 py-1 rounded transition border border-transparent hover:border-zinc-700" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <span className="font-bold text-lg text-zinc-100">{activePair.display.replace('XBT', 'BTC')}</span><ChevronDown size={16} className="ml-1 text-zinc-500" />
            </div>
            {isDropdownOpen && (
              <div className="absolute top-12 left-0 w-64 bg-[#0b0e11] border border-zinc-700 rounded-lg shadow-2xl flex flex-col max-h-[400px]">
                <div className="p-2 border-b border-zinc-800 relative"><Search size={16} className="absolute left-4 top-4 text-zinc-500" /><input type="text" placeholder="Zoek munt..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 pl-8 text-xs text-white outline-none focus:border-blue-500" autoFocus /></div>
                <div className="flex-1 overflow-y-auto">
                  {filteredPairs.map(p => (<div key={p.id} onClick={() => handlePairSelect(p)} className="px-4 py-2 hover:bg-zinc-800 cursor-pointer text-sm font-medium flex justify-between items-center transition"><span className="text-zinc-200">{p.display.replace('XBT', 'BTC')}</span><span className="text-zinc-500 text-[10px] uppercase">Kraken</span></div>))}
                </div>
              </div>
            )}
          </div>
          <div className="h-8 w-px bg-zinc-800 mx-4"></div>
          <div className="flex items-center space-x-6 text-[11px] font-mono">
            <div className="flex flex-col"><span className="text-emerald-500 font-bold text-sm">${formatPrice(currentPrice)}</span><span className="text-zinc-500 uppercase tracking-tighter">Live Prijs</span></div>
            <div className="flex flex-col"><span className="text-zinc-200 font-bold">${(balances[activePair.quote] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span><span className="text-zinc-500 uppercase tracking-tighter">{activePair.quote} Balans</span></div>
            <div className="flex flex-col"><span className="text-zinc-200 font-bold">{(balances[activePair.base] || 0).toFixed(4)}</span><span className="text-zinc-500 uppercase tracking-tighter">{activePair.base.replace('XBT', 'BTC')} Balans</span></div>
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center pl-6 border-l border-zinc-800 ml-4">
            {isLoggedIn ? (
              <div className="flex items-center space-x-4"><div className="flex items-center text-zinc-400 cursor-pointer transition" onClick={() => setShowSettings(true)}><div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center mr-2 text-white"><User className="w-4 h-4" /></div><span className="text-xs font-medium mr-2 text-emerald-500">API Connected</span></div></div>
            ) : (
              <button onClick={() => setShowSettings(true)} className="text-xs text-rose-500 px-3 py-1 bg-rose-500/10 rounded font-medium border border-rose-500/20 animate-pulse hover:bg-rose-500/20 transition cursor-pointer">
                Server Offline of API Fout (Klik)
              </button>
            )}
          </div>
        </header>

        {currentView === 'ai' && <AiAdvisorView activePair={activePair} aiMessages={aiMessages} setAiMessages={setAiMessages} timeframe={timeframe} />}
        {currentView === 'portfolio' && <PortfolioView balances={balances} scriptLoaded={scriptLoaded} equityCurve={equityCurve} />}
        {currentView === 'bots' && <BotManagerView bots={bots} setBots={setBots} availablePairs={availablePairs} activePair={activePair} />}

        {currentView === 'charts' && (
          <div className="flex-1 flex min-h-0 relative">
            <div className="flex-1 flex flex-col border-r border-zinc-800 min-w-0 relative">
              <button onClick={() => setShowRightPanel(!showRightPanel)} className="absolute top-1/2 -right-3.5 z-50 transform -translate-y-1/2 bg-zinc-800 border border-zinc-700 w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white shadow-xl transition-all hover:scale-110 active:scale-90" title={showRightPanel ? "Sluit zijbalk" : "Open zijbalk"}>{showRightPanel ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>

              <div className="h-10 border-b border-zinc-800 flex items-center px-3 space-x-4 text-[11px] bg-[#09090b] z-20">
                <div className="flex space-x-1">{Object.keys(tfMap).map(tf => (<button key={tf} onClick={() => setTimeframe(tf)} className={`px-2 py-0.5 rounded transition ${timeframe === tf ? 'text-zinc-100 bg-zinc-800 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}>{tf}</button>))}</div>
                <div className="w-px h-4 bg-zinc-800"></div>
                <div className="flex items-center space-x-3 text-zinc-400 overflow-x-visible whitespace-nowrap flex-1">
                  <label className="flex items-center space-x-1 cursor-pointer"><input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} className="accent-blue-500" /><span>VOL</span></label>
                  <div className="relative">
                    <button onClick={() => setShowIndicatorMenu(!showIndicatorMenu)} className={`flex items-center space-x-1 px-2 py-1 rounded transition ${showIndicatorMenu ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}><Activity size={14}/><span>Indicators</span><ChevronDown size={12}/></button>
                    {showIndicatorMenu && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-[#0b0e11] border border-zinc-700 rounded-lg shadow-xl p-3 z-50 flex flex-col space-y-3">
                         <label className="flex items-center justify-between cursor-pointer"><span className="text-zinc-200 font-bold">SMA (50+200)</span><input type="checkbox" checked={signals.sma1.active} onChange={(e) => handleSignalChange('sma1', 'active', e.target.checked)} className="accent-blue-500" /></label>
                         <label className="flex items-center justify-between cursor-pointer"><span className="text-zinc-200 font-bold">Bollinger Bands</span><input type="checkbox" checked={signals.bb.active} onChange={(e) => handleSignalChange('bb', 'active', e.target.checked)} className="accent-purple-500" /></label>
                         <div className="h-px bg-zinc-800 my-1"></div>
                         <label className="flex items-center justify-between cursor-pointer"><span className="text-zinc-200 font-bold">RSI (14)</span><input type="checkbox" checked={signals.rsi.active} onChange={(e) => handleSignalChange('rsi', 'active', e.target.checked)} className="accent-pink-500" /></label>
                         <label className="flex items-center justify-between cursor-pointer"><span className="text-zinc-200 font-bold">MACD (12,26)</span><input type="checkbox" checked={signals.macd.active} onChange={(e) => handleSignalChange('macd', 'active', e.target.checked)} className="accent-blue-500" /></label>
                      </div>
                    )}
                  </div>
                  <div className="w-px h-4 bg-zinc-800 mx-2"></div>
                  <button onClick={() => setIsDrawingMode(!isDrawingMode)} className={`flex items-center space-x-1 px-2 py-1 rounded transition ${isDrawingMode ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="Teken Lijn"><Crosshair size={14} /> <span>Teken Lijn</span></button>
                </div>
                <button onClick={() => setLayout(layout === 1 ? 4 : 1)} className={`p-1 rounded transition ${layout === 4 ? 'bg-blue-600 text-white' : 'hover:bg-zinc-800 text-zinc-500'}`}>{layout === 1 ? <LayoutGrid size={14} /> : <Square size={14} />}</button>
              </div>

              <div className={`flex-1 flex flex-col bg-[#09090b] ${layout === 4 ? 'grid grid-cols-2 grid-rows-2' : ''}`}>
                {layout === 1 ? (
                  <TradingChart pair={gridPairs[activeIndex]} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={tradeHistory} scriptLoaded={scriptLoaded} isActive={true} isDrawingMode={isDrawingMode} onPopout={() => openPopout({ ...gridPairs[activeIndex] })} />
                ) : (
                  gridPairs.slice(0, 4).map((p, i) => (<TradingChart key={`chart-${i}-${p?.id}`} pair={p} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={tradeHistory} scriptLoaded={scriptLoaded} isActive={activeIndex === i} isDrawingMode={isDrawingMode} onClick={() => setActiveIndex(i)} onPopout={() => openPopout({ ...p })} />))
                )}
              </div>

              <div className="h-44 border-t border-zinc-800 bg-[#09090b] flex flex-col shrink-0 z-10 overflow-hidden">
                <div className="flex px-4 border-b border-zinc-800 bg-[#0b0e11]/50">
                  {[`Open Orders (${openOrders.length})`, `Posities (${positions.length})`, `Trade Historie (${tradeHistory.length})`].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab.toLowerCase())} className={`py-2 px-4 text-[10px] font-bold uppercase border-b-2 transition ${activeTab.includes(tab.split(' ')[0].toLowerCase()) ? 'border-blue-500 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{tab}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="text-[10px] uppercase text-zinc-500 sticky top-0 bg-[#09090b] z-20 border-b border-zinc-800">
                      <tr className="h-8">
                        <th className="px-4 font-normal">Datum</th><th className="px-4 font-normal">Paar</th><th className="px-4 font-normal">Kant</th><th className="px-4 font-normal">Prijs</th><th className="px-4 font-normal">Aantal</th>{!activeTab.includes('open') && <th className="px-4 font-normal">{activeTab.includes('historie') ? 'Fee' : 'PnL'}</th>}<th className="px-4 font-normal text-right">{activeTab.includes('open') ? 'Actie' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>{renderTableBody()}</tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* DRAG RESIZER HIER! */}
            {showRightPanel && (
              <div 
                className="w-1.5 bg-zinc-900 hover:bg-blue-500 cursor-col-resize z-50 flex-shrink-0 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizing(true);
                  const startX = e.clientX;
                  const startWidth = rightPanelWidth;
                  const onMouseMove = (moveEvent) => {
                     const delta = startX - moveEvent.clientX; // beweging naar links = panel groter
                     setRightPanelWidth(Math.max(350, Math.min(800, startWidth + delta)));
                  };
                  const onMouseUp = () => {
                     setIsResizing(false);
                     document.removeEventListener('mousemove', onMouseMove);
                     document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              />
            )}

            <div 
               className="flex flex-col bg-[#0b0e11] shrink-0 overflow-hidden" 
               style={{ width: showRightPanel ? rightPanelWidth : 0, transition: isResizing ? 'none' : 'width 0.3s' }}
            >
              <div className="flex h-full" style={{ width: rightPanelWidth }}>
                <div className="border-r border-zinc-800 flex flex-col font-mono text-[11px]" style={{ width: '45%' }}>
                  <div className="h-10 border-b border-zinc-800 flex items-center px-3 justify-between font-sans bg-[#09090b] text-[10px] uppercase font-bold tracking-widest">Orderboek</div>
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto flex flex-col justify-end">
                      {orderBook.asks.map((ask, i) => (<div key={`ask-${i}`} className="relative flex justify-between px-3 py-0.5 hover:bg-zinc-800/50 cursor-pointer" onClick={() => setPriceInput(ask.price.toString())}><div className="absolute right-0 top-0 bottom-0 bg-rose-500/10" style={{ width: `${ask.depth}%` }}></div><span className="w-1/2 text-rose-500 z-10">{formatPrice(ask.price)}</span><span className="w-1/2 text-right text-zinc-300 z-10">{ask.volume.toFixed(3)}</span></div>))}
                    </div>
                    <div className="py-2 border-y border-zinc-800 flex items-center justify-center bg-zinc-900/50 font-bold text-emerald-500">${formatPrice(currentPrice)}</div>
                    <div className="flex-1 overflow-y-auto">
                      {orderBook.bids.map((bid, i) => (<div key={`bid-${i}`} className="relative flex justify-between px-3 py-0.5 hover:bg-zinc-800/50 cursor-pointer" onClick={() => setPriceInput(bid.price.toString())}><div className="absolute right-0 top-0 bottom-0 bg-emerald-500/10" style={{ width: `${bid.depth}%` }}></div><span className="w-1/2 text-emerald-500 z-10">{formatPrice(bid.price)}</span><span className="w-1/2 text-right text-zinc-300 z-10">{bid.volume.toFixed(3)}</span></div>))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col bg-[#0b0e11]" style={{ width: '55%' }}>
                  <div className="h-10 border-b border-zinc-800 flex items-center px-4 text-[10px] font-bold uppercase tracking-widest bg-[#09090b]">Plaats Order</div>
                  <div className="p-4 flex flex-col h-full space-y-4 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                    <div className="flex bg-[#09090b] p-1 rounded-lg border border-zinc-800"><button onClick={() => setTradeSide('Buy')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${tradeSide === 'Buy' ? 'bg-emerald-600/20 text-emerald-500' : 'text-zinc-500'}`}>BUY</button><button onClick={() => setTradeSide('Sell')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${tradeSide === 'Sell' ? 'bg-rose-600/20 text-rose-500' : 'text-zinc-500'}`}>SELL</button></div>
                    <div className="flex bg-[#09090b] p-1 rounded-lg border border-zinc-800">{['Limit', 'Market'].map(type => (<button key={type} onClick={() => setOrderType(type)} className={`flex-1 py-1 text-[10px] font-bold rounded uppercase transition ${orderType === type ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500'}`}>{type}</button>))}</div>
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500"><span>Balans</span><span className="text-zinc-200">{tradeSide === 'Buy' ? (balances[activePair.quote] || 0).toLocaleString('en-US', {minimumFractionDigits: 2}) : (balances[activePair.base] || 0).toFixed(6)} {tradeSide === 'Buy' ? activePair.quote : activePair.base.replace('XBT', 'BTC')}</span></div>
                      <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-2 focus-within:border-blue-500"><div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1"><span>Prijs</span><span>{activePair.quote}</span></div><input type="number" disabled={orderType === 'Market'} value={orderType === 'Market' ? '' : priceInput} onChange={(e) => onPriceChange(e.target.value)} placeholder={orderType === 'Market' ? 'MARKET' : '0.00'} className="w-full bg-transparent text-zinc-100 font-mono outline-none text-sm" /></div>
                      <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-2 focus-within:border-blue-500"><div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1"><span>Aantal</span><span>{activePair.base.replace('XBT', 'BTC')}</span></div><input type="number" value={amountInput} onChange={(e) => onAmountChange(e.target.value)} placeholder="0.00" className="w-full bg-transparent text-zinc-100 font-mono outline-none text-sm" /></div>
                      <div className="flex justify-between gap-1">{[25, 50, 75, 100].map(pct => (<button key={pct} onClick={() => handleSliderClick(pct)} className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-[9px] rounded font-bold">{pct}%</button>))}</div>
                      <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-2 focus-within:border-blue-500"><div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1"><span>Totaal</span><span>{activePair.quote}</span></div><input type="number" value={totalInput} onChange={(e) => onTotalChange(e.target.value)} placeholder="0.00" className="w-full bg-transparent text-zinc-100 font-mono outline-none text-sm" /></div>
                      <div className="bg-[#09090b] border border-zinc-800/50 rounded-lg p-3 space-y-3">
                         <div className="flex items-center justify-between"><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} className="accent-rose-500 w-3 h-3" /><span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider flex items-center gap-1"><ShieldAlert size={12}/> Stop-Loss</span></label>{useSL && <input type="number" placeholder="Prijs" value={slInput} onChange={e => setSlInput(e.target.value)} className="w-24 bg-[#050505] border border-rose-900/50 rounded px-2 py-1 text-xs text-rose-400 outline-none focus:border-rose-500 font-mono" />}</div>
                         <div className="h-px bg-zinc-800/50"></div>
                         <div className="flex items-center justify-between"><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTP} onChange={e => setUseTP(e.target.checked)} className="accent-emerald-500 w-3 h-3" /><span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1"><Target size={12}/> Take-Profit</span></label>{useTP && <input type="number" placeholder="Prijs" value={tpInput} onChange={e => setTpInput(e.target.value)} className="w-24 bg-[#050505] border border-emerald-900/50 rounded px-2 py-1 text-xs text-emerald-400 outline-none focus:border-emerald-500 font-mono" />}</div>
                      </div>
                      
                      {isLoggedIn ? (
                        <button onClick={() => executeOrder(tradeSide)} className={`w-full py-3.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg transition active:scale-95 ${tradeSide === 'Buy' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20'}`}>{tradeSide === 'Buy' ? 'Open Buy Order' : 'Open Sell Order'}</button>
                      ) : (
                        <button onClick={() => setShowSettings(true)} className="w-full bg-rose-900/20 text-rose-500 font-bold py-3.5 rounded-lg transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer border border-rose-500/20 hover:bg-rose-900/40">Vul API Keys in</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}