import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Activity, Layers, Bot, X, Trash2, Plus, Play, Pause, 
  ShieldAlert, Target, TrendingUp, AlertTriangle, Clock, ArrowDownToLine, 
  Sparkles, BrainCircuit, BarChart2, ShieldCheck, Power, SunMoon, HelpCircle, History, Hand, 
  Copy, RotateCcw, Save,Eye, Database
} from 'lucide-react';

// ==========================================
// 🛠️ INTERNAL API HELPERS
// ==========================================
const API_BASE = 'http://localhost:3001';

const getApiHeaders = () => {
    const token = localStorage.getItem('bot_auth_token') || '';
    const keys = JSON.parse(localStorage.getItem('trading_api_keys') || '{}');
    return {
        'Content-Type': 'application/json',
        'x-dashboard-token': token,
        'x-kraken-api-key': keys.krakenKey || '',
        'x-kraken-api-secret': keys.krakenSecret || '',
        'x-gemini-api-key': keys.geminiKey || '',
        'x-cb-api-key': (keys.cbKey || '').trim(),
        'x-cb-api-secret': keys.cbSecret || '' 
    };
};

const fetchKrakenOHLC = async (interval, pair) => {
    try {
        const res = await fetch(`${API_BASE}/api/ohlc`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({ pair, interval })
        });
        const data = await res.json();
        if (data.error && data.error.length > 0) throw new Error(data.error[0]);
        const key = Object.keys(data.result).find(k => k !== 'last');
        return data.result[key].map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[6])
        }));
    } catch (e) {
        console.error("OHLC Fetch Error:", e);
        return [];
    }
};

// ==========================================
// ℹ️ UI COMPONENTS (With English Tooltips)
// ==========================================

const InfoTooltip = ({ text }) => (
  <div className="relative group flex items-center ml-1.5 cursor-help">
    <HelpCircle size={12} className="text-zinc-500 hover:text-blue-400 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 bg-[#18181b] border border-zinc-700 text-zinc-300 text-[10px] rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] text-center leading-relaxed pointer-events-none font-normal normal-case tracking-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);

const BotLogTerminal = ({ logs }) => {
  const terminalRef = useRef(null);
  const safeLogs = Array.isArray(logs) ? logs : [];

  return (
    <div 
      ref={terminalRef}
      className="h-44 bg-[#050505]/80 rounded-xl p-3 overflow-y-auto text-[10px] font-mono border border-zinc-800/50 flex flex-col space-y-1 mt-4 custom-scrollbar"
      style={{ scrollBehavior: 'smooth' }}
    >
      {safeLogs.length === 0 && <span className="text-zinc-600">Bot initialized. Waiting for data...</span>}
      {safeLogs.map((l, i) => (
        <div key={i} className={`flex space-x-2 ${
          l.type === 'buy' ? 'text-emerald-400 font-bold' : 
          l.type === 'sell' ? 'text-rose-400 font-bold' : 
          l.type === 'error' ? 'text-rose-600' : 
          l.type === 'success' ? 'text-emerald-500' : 'text-zinc-500'
        }`}>
          <span className="shrink-0 opacity-50">[{l.time}]</span>
          <span>{l.msg}</span>
        </div>
      ))}
    </div>
  );
};



// ==========================================
// 🤖 MAIN BOT MANAGER VIEW
// ==========================================

const BotManagerView = ({ bots, setBots, availablePairs, activePair, setActivePair }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingBotId, setEditingBotId] = useState(null);
  const [useSmartLimit, setUseSmartLimit] = useState(true);
  
  // --- FORM STATES ---
  const [newBotPair, setNewBotPair] = useState(activePair);
  const [newBotExchange, setNewBotExchange] = useState('Kraken'); // 🔥 MULTI-EXCHANGE SUPPORT
  const [newBotStrategy, setNewBotStrategy] = useState('RSI_TREND');
  const [botTimeframe, setBotTimeframe] = useState('15m');
  const [tradePercent, setTradePercent] = useState('10'); 
  const [cooldownMins, setCooldownMins] = useState(15);
  
  // Strategy Params
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiBuyLevel, setRsiBuyLevel] = useState(30);
  const [rsiSellLevel, setRsiSellLevel] = useState(70);
  
  // Risk & Protection
  const [slPct, setSlPct] = useState(3.0);
  const [tpPct, setTpPct] = useState(6.0);
  const [useDynamicRisk, setUseDynamicRisk] = useState(false);
  const [atrMultiplierSL, setAtrMultiplierSL] = useState(1.5); 
  const [atrMultiplierTP, setAtrMultiplierTP] = useState(3.0); 
  
  const [useBreakEven, setUseBreakEven] = useState(false);
  const [breakEvenTrigger, setBreakEvenTrigger] = useState(2.0);
  
  // Filters
  const [useAdxFilter, setUseAdxFilter] = useState(false);
  const [adxThreshold, setAdxThreshold] = useState(25);
  const [useVolumeFilter, setUseVolumeFilter] = useState(false);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1.5);
  const [useAiFilter, setUseAiFilter] = useState(false);
  const [aiMinConfidence, setAiMinConfidence] = useState(70);
  
  // Sessions
  const [useTimeFilter, setUseTimeFilter] = useState(false);
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('20:00');

  // Execution
  const [useTrailing, setUseTrailing] = useState(true);
  const [trailingPct, setTrailingPct] = useState(0.5);
  const [useDca, setUseDca] = useState(false);
  const [dcaCount, setDcaCount] = useState(3);
  const [dcaDropPct, setDcaDropPct] = useState(2.0);

  // Dynamic Trailing (Nieuw!)
  const [useDynamicTrailing, setUseDynamicTrailing] = useState(false);
  const [dynTier1Trigger, setDynTier1Trigger] = useState(0.2);
  const [dynTier1Trail, setDynTier1Trail] = useState(0.4);
  const [dynTier2Trigger, setDynTier2Trigger] = useState(0.4);
  const [dynTier2Trail, setDynTier2Trail] = useState(0.3);
  const [dynTier3Trigger, setDynTier3Trigger] = useState(0.6);
  const [dynTier3Trail, setDynTier3Trail] = useState(0.2);
  
  // Safety
  const [useCircuitBreaker, setUseCircuitBreaker] = useState(false);
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(3);

  const tfMapKeys = ['1m', '5m', '15m', '1H', '4H', '1D'];

  const aiStyle = (
    <style>
      {`
        @keyframes border-glow {
          0% { border-color: rgba(59, 130, 246, 0.1); }
          50% { border-color: rgba(59, 130, 246, 0.6); box-shadow: 0 0 15px rgba(59, 130, 246, 0.2); }
          100% { border-color: rgba(59, 130, 246, 0.1); }
        }
        .ai-analyzing {
          animation: border-glow 3s infinite ease-in-out;
        }
      `}
    </style>
  );

  // --- ACTIONS ---
  const startEditing = (bot) => {
    const cfg = bot.config || {};
    setEditingBotId(bot.id);
    setUseSmartLimit(cfg.useSmartLimit ?? true);
    setNewBotPair(bot.pair);
    setNewBotStrategy(bot.strategy);
    setNewBotExchange(cfg.exchange || 'Kraken'); // Laad exchange
    setBotTimeframe(cfg.timeframe || '15m');
    setTradePercent(cfg.tradePercent || '10');
    setSlPct(cfg.slPct || 3.0);
    setTpPct(cfg.tpPct || 6.0);
    setUseTrailing(cfg.useTrailing ?? true);
    setUseDynamicTrailing(cfg.useDynamicTrailing ?? false);
    setDynTier1Trigger(cfg.dynTier1Trigger || 0.2);
    setDynTier1Trail(cfg.dynTier1Trail || 0.4);
    setDynTier2Trigger(cfg.dynTier2Trigger || 0.4);
    setDynTier2Trail(cfg.dynTier2Trail || 0.3);
    setDynTier3Trigger(cfg.dynTier3Trigger || 0.6);
    setDynTier3Trail(cfg.dynTier3Trail || 0.2);
    setTrailingPct(cfg.trailingPct || 0.5);
    setUseBreakEven(cfg.useBreakEven ?? false);
    setBreakEvenTrigger(cfg.breakEvenTrigger || 2.0);
    setUseCircuitBreaker(cfg.useCircuitBreaker ?? false);
    setMaxConsecutiveLosses(cfg.maxConsecutiveLosses || 3);
    setRsiPeriod(cfg.rsiPeriod || 14);
    setRsiBuyLevel(cfg.rsiBuyLevel || 30);
    setRsiSellLevel(cfg.rsiSellLevel || 70);
    setUseDynamicRisk(cfg.useDynamicRisk ?? false);
    setAtrMultiplierSL(cfg.atrMultiplierSL || 1.5);
    setAtrMultiplierTP(cfg.atrMultiplierTP || 3.0);
    setUseAdxFilter(cfg.useAdxFilter ?? false);
    setAdxThreshold(cfg.adxThreshold || 25);
    setUseVolumeFilter(cfg.useVolumeFilter ?? false);
    setVolumeMultiplier(cfg.volumeMultiplier || 1.5);
    setUseAiFilter(cfg.useAiFilter ?? false);
    setAiMinConfidence(cfg.aiMinConfidence || 70);
    setUseTimeFilter(cfg.useTimeFilter ?? false);
    setTimeStart(cfg.timeStart || '08:00');
    setTimeEnd(cfg.timeEnd || '20:00');
    setUseDca(cfg.useDca ?? false);
    setDcaCount(cfg.dcaCount || 3);
    setDcaDropPct(cfg.dcaDropPct || 2.0);
    setCooldownMins(cfg.cooldownMins || 15);
    setIsCreating(true);
  };

  const saveBot = () => {
    const parseNum = (val) => {
        if (!val) return 0;
        return parseFloat(String(val).replace(',', '.'));
    };
    const config = { 
        exchange: newBotExchange, // 🔥 Opslaan exchange
        timeframe: botTimeframe, sizingType: 'percent', tradePercent: parseNum(tradePercent),
        slPct: parseNum(slPct), tpPct: parseNum(tpPct),
        useTrailing, trailingPct: parseNum(trailingPct),
        useDynamicTrailing,
        dynTier1Trigger: parseNum(dynTier1Trigger), dynTier1Trail: parseNum(dynTier1Trail),
        dynTier2Trigger: parseNum(dynTier2Trigger), dynTier2Trail: parseNum(dynTier2Trail),
        dynTier3Trigger: parseNum(dynTier3Trigger), dynTier3Trail: parseNum(dynTier3Trail),
        useBreakEven, breakEvenTrigger: parseNum(breakEvenTrigger),useSmartLimit,
        useCircuitBreaker, maxConsecutiveLosses: parseInt(maxConsecutiveLosses),
        rsiPeriod: parseInt(rsiPeriod), rsiBuyLevel: parseInt(rsiBuyLevel), rsiSellLevel: parseInt(rsiSellLevel),
        useDynamicRisk, atrMultiplierSL: parseNum(atrMultiplierSL), atrMultiplierTP: parseNum(atrMultiplierTP),
        useAdxFilter, adxThreshold: parseInt(adxThreshold),
        useVolumeFilter, volumeMultiplier: parseNum(volumeMultiplier),
        useAiFilter, aiMinConfidence: parseInt(aiMinConfidence),
        useTimeFilter, timeStart, timeEnd,
        useDca, dcaCount: parseInt(dcaCount), dcaDropPct: parseNum(dcaDropPct),
        cooldownMins: parseInt(cooldownMins)
    };

    if (editingBotId) {
        setBots(bots.map(b => b.id === editingBotId ? { ...b, pair: newBotPair, strategy: newBotStrategy, config } : b));
    } else {
        const newBot = { 
          id: Math.random().toString(), pair: newBotPair, strategy: newBotStrategy, 
          isRunning: true, 
          state: { phase: 'WAITING', currentPrice: 0, lastAction: 'NONE', averageEntryPrice: 0, totalVolume: 0, livePnl: 0, livePnlPct: 0, consecutiveLosses: 0 }, 
          stats: { trades: [], winCount: 0, lossCount: 0, grossProfit: 0, grossLoss: 0 },
          logs: [{time: new Date().toLocaleTimeString(), msg: `🚀 Bot gestart op ${newBotPair.display} via ${newBotExchange}`, type: 'success'}], 
          config
        };
        setBots([...bots, newBot]);
    }
    setIsCreating(false);
    setEditingBotId(null);
  };

  const [aiSuggestion, setAiSuggestion] = useState(null);

  const applyAiTune = (botId, newConfig) => {
      setBots(prev => prev.map(b => b.id === botId ? { ...b, config: { ...b.config, ...newConfig } } : b));
      setAiSuggestion(null);
  };

  // 🔥 MULTI-EXCHANGE MANUAL TRADE HANDLER
// 🔥 MULTI-EXCHANGE MANUAL TRADE HANDLER
// 🔥 MULTI-EXCHANGE MANUAL TRADE HANDLER
  const handleManualTrade = async (botId, side) => {
    if (!window.confirm(`Force ${side} order for this bot?`)) return;
    
    const newBots = JSON.parse(JSON.stringify(bots));
    const botIdx = newBots.findIndex(b => b.id === botId);
    const bot = newBots[botIdx];
    const isCoinbase = bot.config?.exchange === 'Coinbase';

    const displayParts = bot.pair.display.split('/');
    const cleanBase = displayParts[0] === 'XBT' ? 'BTC' : displayParts[0]; 
    const cleanQuote = displayParts[1] || 'USD'; 

    // 🪄 DE MAGISCHE TRUC: Als we op Coinbase handelen, stuur 'USD' orders altijd naar de 'USDC' markt!
    let orderPair = bot.pair.altname;
    if (isCoinbase) {
        const targetQuote = cleanQuote === 'USD' ? 'USDC' : cleanQuote;
        orderPair = `${cleanBase}-${targetQuote}`; // Maakt hier dus netjes XRP-USDC van
    }

    bot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: `⚡ Manual ${side} override triggered on ${bot.config?.exchange || 'Kraken'}...`, type: 'info' });
    setBots(newBots);

    try {
        const data = await fetchKrakenOHLC(1, bot.pair.altname); 
        if (!data || data.length === 0) throw new Error("Market data unavailable.");
        const currentPrice = data[data.length - 1].close;
        const safePrice = parseFloat(currentPrice).toFixed(4);

        if (side === 'BUY') {
            let quoteBalance = 0;
            if (isCoinbase) {
                const resBal = await fetch(`${API_BASE}/api/coinbase/balance`, { method: 'POST', headers: getApiHeaders() });
                const bData = await resBal.json();
                
                const acc = bData.find(a => a.currency === cleanQuote);
                quoteBalance = acc ? acc.amount : 0;
                
                // Telt je USDC balans mee als koopkracht
                if (cleanQuote === 'USD') {
                    const usdcAcc = bData.find(a => a.currency === 'USDC');
                    if (usdcAcc) quoteBalance += usdcAcc.amount;
                }
            } else {
                const resBal = await fetch(`${API_BASE}/api/balance`, { method: 'POST', headers: getApiHeaders() });
                const bData = await resBal.json();
                const quoteKey = cleanQuote === 'USD' ? 'ZUSD' : (cleanQuote === 'EUR' ? 'ZEUR' : cleanQuote);
                quoteBalance = parseFloat(bData[quoteKey] || bData[cleanQuote] || 0);
            }
            
            const safeQuoteBalance = quoteBalance * 0.98;
            const spendAmount = safeQuoteBalance * (bot.config.tradePercent / 100);
            const volumeToBuy = Number((spendAmount / currentPrice).toFixed(8));

            if (spendAmount <= 0) throw new Error(`Insufficient balance on ${bot.config.exchange} (Available: ${quoteBalance.toFixed(2)} USDC)`);

            const orderEndpoint = isCoinbase ? '/api/coinbase/order' : '/api/order';
            const resOrder = await fetch(`${API_BASE}${orderEndpoint}`, { 
                method: 'POST', headers: getApiHeaders(), 
                body: JSON.stringify({ 
                    pair: orderPair, 
                    type: 'buy', 
                    ordertype: bot.config.useSmartLimit ? 'limit' : 'market', 
                    volume: volumeToBuy,
                    quoteVolume: spendAmount.toFixed(2),
                    price: safePrice.toString() // Nodig voor limit orders!
                })
            });
            const oData = await resOrder.json();
            if (oData.error) throw new Error(isCoinbase ? JSON.stringify(oData.error) : oData.error);

            bot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: `✅ MANUAL BUY SUCCESS @ $${currentPrice.toFixed(4)}`, type: 'buy' });
            bot.state.totalVolume += volumeToBuy; 
            bot.state.averageEntryPrice = currentPrice;
            bot.state.entryTime = Math.floor(Date.now() / 1000);

        } else {
            let actualBaseBalance = 0;
            if (isCoinbase) {
                const resBal = await fetch(`${API_BASE}/api/coinbase/balance`, { method: 'POST', headers: getApiHeaders() });
                const bData = await resBal.json();
                const acc = bData.find(a => a.currency === cleanBase);
                actualBaseBalance = acc ? acc.amount : 0;
            } else {
                const resBal = await fetch(`${API_BASE}/api/balance`, { method: 'POST', headers: getApiHeaders() });
                const bData = await resBal.json();
                const baseKey = cleanBase === 'BTC' ? 'XXBT' : (cleanBase === 'ETH' ? 'XETH' : cleanBase);
                actualBaseBalance = parseFloat(bData[baseKey] || bData[cleanBase] || bData['X' + cleanBase] || 0);
            }

            const volToSell = Math.min(Number(bot.state.totalVolume.toFixed(8)), actualBaseBalance);
            if (volToSell <= 0) throw new Error(`No position found on ${bot.config.exchange} (Balance: ${actualBaseBalance} ${cleanBase})`);

            const orderEndpoint = isCoinbase ? '/api/coinbase/order' : '/api/order';
            const resOrder = await fetch(`${API_BASE}${orderEndpoint}`, { 
                method: 'POST', headers: getApiHeaders(), 
                body: JSON.stringify({ 
                    pair: orderPair, 
                    type: 'sell', 
                    ordertype: bot.config.useSmartLimit ? 'limit' : 'market', 
                    volume: volToSell,
                    price: safePrice.toString()
                })
            });
            const oData = await resOrder.json();
            if (oData.error) throw new Error(isCoinbase ? JSON.stringify(oData.error) : oData.error);
            
            const pnl = (currentPrice - bot.state.averageEntryPrice) * volToSell;
            const pnlPct = ((currentPrice - bot.state.averageEntryPrice) / bot.state.averageEntryPrice) * 100;
            
            bot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: `✅ MANUAL SELL SUCCESS @ $${currentPrice.toFixed(4)}`, type: 'sell' });
            
            if (!bot.stats) bot.stats = { trades: [], winCount: 0, lossCount: 0, grossProfit: 0, grossLoss: 0 };
            if (!bot.stats.trades) bot.stats.trades = [];

            bot.stats.trades.push({
                  id: Date.now().toString().slice(-8), time: new Date().toLocaleString(),
                  entryTime: bot.state.entryTime || (Math.floor(Date.now() / 1000) - 3600), // 👈 VOEG DEZE REGEL TOE
                  exitTime: Math.floor(Date.now() / 1000), // 👈 VOEG DEZE REGEL TOE
                  entryPrice: bot.state.averageEntryPrice, exitPrice: currentPrice, volume: bot.state.totalVolume, pnl: pnl, pnlPct: pnlPct
            });

            if (pnl >= 0) {
                bot.stats.winCount = (bot.stats.winCount || 0) + 1; bot.stats.grossProfit = (bot.stats.grossProfit || 0) + pnl;
            } else {
                bot.stats.lossCount = (bot.stats.lossCount || 0) + 1; bot.stats.grossLoss = (bot.stats.grossLoss || 0) + Math.abs(pnl);
            }

            bot.state.totalVolume = 0; bot.state.averageEntryPrice = 0;
        }

        setBots([...newBots]);
        fetch('http://localhost:3001/api/bots', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newBots)
        }).catch(err => console.error("Fout bij opslaan bot state:", err));

    } catch (err) { 
        bot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: `❌ ERROR: ${err.message}`, type: 'error' }); 
        setBots([...newBots]); 
    }
  };

  const setAllBotsState = (isRunning) => setBots(bots.map(b => ({ ...b, isRunning })));

  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto">
      {aiStyle}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] shrink-0 sticky top-0 z-[60]">
        <div className="flex items-center"><Bot className="w-5 h-5 text-purple-500 mr-3" /><div><h2 className="text-zinc-100 font-bold tracking-wide">Auto Trading Bots</h2><p className="text-[10px] text-zinc-500 uppercase tracking-widest">Multi-Strategy Quant Engine</p></div></div>
        {!isCreating && (
          <div className="flex items-center gap-3">
             <div className="flex bg-[#050505] border border-zinc-800 p-1 rounded-lg">
                <button onClick={() => setAllBotsState(true)} className="px-3 py-1.5 text-[10px] font-bold text-emerald-500 hover:bg-emerald-500/10 rounded transition uppercase">Start All</button>
                <button onClick={() => setAllBotsState(false)} className="px-3 py-1.5 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10 rounded transition uppercase">Stop All</button>
             </div>
             <button onClick={() => setIsCreating(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg"><Plus size={14} className="inline mr-1"/> New Bot</button>
          </div>
        )}
      </div>

      <div className="p-8 max-w-full mx-auto w-full">
         {isCreating ? (
           <div className="bg-[#0b0e11] border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                 <h3 className="font-bold text-zinc-200 text-lg flex items-center gap-3"><Settings size={20} className="text-blue-500"/> {editingBotId ? 'Configure Algorithm' : 'New Algorithm Configuration'}</h3>
                 <button onClick={() => { setIsCreating(false); setEditingBotId(null); }} className="text-zinc-500 hover:text-rose-500 p-2"><X size={24}/></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* --- COLUMN 1: STRATEGY & FILTERS --- */}
                <div className="space-y-6">
                  <div className="bg-[#09090b] p-5 rounded-2xl border border-zinc-800/50 space-y-5">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2"><Activity size={14}/> Strategy & Market</h4>
                    
                    {/* 🔥 NIEUW: Exchange Selector */}
                    <div className="space-y-1 pb-2 border-b border-white/5">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">Exchange Endpoint <InfoTooltip text="Kies op welke beurs deze bot zijn orders moet uitvoeren." /></label>
                      <div className="flex gap-2">
                          <button onClick={() => setNewBotExchange('Kraken')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-xl transition ${newBotExchange === 'Kraken' ? 'bg-purple-600 text-white border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:text-zinc-300'}`}>Kraken</button>
                          <button onClick={() => setNewBotExchange('Coinbase')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-xl transition ${newBotExchange === 'Coinbase' ? 'bg-blue-600 text-white border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:text-zinc-300'}`}>Coinbase</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">Trading Pair <InfoTooltip text="The crypto pair this bot will trade." /></label>
                        <select value={newBotPair.id} onChange={(e) => setNewBotPair(availablePairs.find(p=>p.id===e.target.value))} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{availablePairs.map(p => <option key={p.id} value={p.id}>{p.display}</option>)}</select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">Timeframe <InfoTooltip text="The size of each candle. 15m is standard. Lower timeframes are faster but contain more 'noise'." /></label>
                        <select value={botTimeframe} onChange={(e) => setBotTimeframe(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{tfMapKeys.map(tf => <option key={tf} value={tf}>{tf}</option>)}</select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">Logic / Model <InfoTooltip text="The brain of the bot. Determines the mathematical rules for buying and selling." /></label>
                      <select value={newBotStrategy} onChange={e => setNewBotStrategy(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-blue-400 font-bold outline-none">
                         <optgroup label="Oscillators"><option value="RSI">RSI Pure</option><option value="RSI_TREND">RSI + SMA50 Trend</option></optgroup>
                         <optgroup label="Trend"><option value="MACD_CROSS">MACD Crossover</option><option value="EMA_CROSS">EMA Cross</option></optgroup>
                         <optgroup label="Volatility"><option value="BB_VOL">Bollinger Breakout</option></optgroup>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-2">
                        <div className="space-y-1"><label className="text-[10px] text-zinc-500 font-bold uppercase">Period <InfoTooltip text="Number of candles for the RSI calculation. 14 is the universal standard." /></label><input type="number" value={rsiPeriod} onChange={e => setRsiPeriod(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-xs text-center" /></div>
                        <div className="space-y-1"><label className="text-[10px] text-emerald-500 font-bold uppercase">Buy &lt; <InfoTooltip text="Buy when RSI drops below this number (oversold)." /></label><input type="number" value={rsiBuyLevel} onChange={e => setRsiBuyLevel(e.target.value)} className="w-full bg-[#050505] border border-emerald-900/20 rounded p-2 text-xs text-emerald-400 text-center" /></div>
                        <div className="space-y-1"><label className="text-[10px] text-rose-500 font-bold uppercase">Sell &gt; <InfoTooltip text="Sell when RSI rises above this number (overbought)." /></label><input type="number" value={rsiSellLevel} onChange={e => setRsiSellLevel(e.target.value)} className="w-full bg-[#050505] border border-rose-900/20 rounded p-2 text-xs text-rose-400 text-center" /></div>
                    </div>
                  </div>

                  {/* ADX FILTER */}
                  <div className={`p-5 rounded-2xl border transition-all ${useAdxFilter ? 'bg-sky-500/5 border-sky-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-sky-400 font-bold flex items-center gap-2">
                         <TrendingUp size={14}/> ADX Trend Filter 
                         <InfoTooltip text="Average Directional Index measures if there is a trend at all. Prevents trading in a choppy (sideways) market." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useAdxFilter} onChange={e => setUseAdxFilter(e.target.checked)} className="accent-sky-500 w-4 h-4" /><span className="text-[10px] text-sky-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useAdxFilter ? (
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Min ADX: <InfoTooltip text="Values below 25 indicate a weak trend. The bot will ignore buy signals." /></label>
                        <input type="number" value={adxThreshold} onChange={e => setAdxThreshold(e.target.value)} className="w-full bg-[#050505] border border-sky-900/30 rounded p-2 text-xs text-sky-400 text-center outline-none" />
                      </div>
                    ) : <p className="text-[10px] text-zinc-600 italic">Disabled. Bot trades in sideways markets too.</p>}
                  </div>

                  {/* VOLUME FILTER */}
                  <div className={`p-5 rounded-2xl border transition-all ${useVolumeFilter ? 'bg-indigo-500/5 border-indigo-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-indigo-400 font-bold flex items-center gap-2">
                         <BarChart2 size={14}/> Volume Surge Filter 
                         <InfoTooltip text="Verifies if a price increase is supported by a large amount of trading volume (institutional money)." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useVolumeFilter} onChange={e => setUseVolumeFilter(e.target.checked)} className="accent-indigo-500 w-4 h-4" /><span className="text-[10px] text-indigo-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useVolumeFilter ? (
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Multiplier: <InfoTooltip text="E.g. 1.5 means: Current volume must be 50% higher than the average of the last 20 candles." /></label>
                        <input type="number" step="0.1" value={volumeMultiplier} onChange={e => setVolumeMultiplier(e.target.value)} className="w-full bg-[#050505] border border-indigo-900/30 rounded p-2 text-xs text-indigo-400 text-center outline-none" />
                      </div>
                    ) : <p className="text-[10px] text-zinc-600 italic">Disabled. Volume is ignored on entry.</p>}
                  </div>

                  {/* TRADING HOURS */}
                  <div className={`p-5 rounded-2xl border transition-all ${useTimeFilter ? 'bg-orange-500/5 border-orange-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-orange-400 font-bold flex items-center gap-2">
                         <SunMoon size={14}/> Trading Hours (Sessions) 
                         <InfoTooltip text="Restricts the bot to only scan and trade during the specified timespan (e.g. during Wall Street open)." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTimeFilter} onChange={e => setUseTimeFilter(e.target.checked)} className="accent-orange-500 w-4 h-4" /><span className="text-[10px] text-orange-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useTimeFilter ? (
                      <div className="grid grid-cols-2 gap-4">
                        <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} className="w-full bg-[#050505] border border-orange-900/30 rounded p-2 text-xs text-orange-400 text-center outline-none" />
                        <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} className="w-full bg-[#050505] border border-orange-900/30 rounded p-2 text-xs text-orange-400 text-center outline-none" />
                      </div>
                    ) : <p className="text-[10px] text-zinc-600 italic">Disabled. The bot scans the markets 24/7.</p>}
                  </div>

                  {/* AI FILTER */}
                  <div className={`p-5 rounded-2xl border transition-all ${useAiFilter ? 'bg-purple-500/5 border-purple-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-purple-400 font-bold flex items-center gap-2">
                         <Sparkles size={14}/> Gemini AI Filter 
                         <InfoTooltip text="When the bot sees a signal, it sends it to Google Gemini. The trade is only executed if AI approves." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useAiFilter} onChange={e => setUseAiFilter(e.target.checked)} className="accent-purple-500 w-4 h-4" /><span className="text-[10px] text-purple-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useAiFilter && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Min Confidence (%): <InfoTooltip text="The AI returns a confidence score (0-100). Higher is safer, but results in fewer trades." /></label>
                        <input type="number" value={aiMinConfidence} onChange={e => setAiMinConfidence(e.target.value)} className="w-full bg-[#050505] border border-purple-900/30 rounded p-2 text-xs text-purple-400 text-center outline-none" />
                      </div>
                    )}
                  </div>
                </div>

                {/* --- COLUMN 2: RISK & PROTECTION --- */}
                <div className="space-y-6">
                  <div className={`p-5 rounded-2xl border transition-all ${useDynamicRisk ? 'bg-emerald-500/5 border-emerald-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-4">
                       <h4 className="text-xs uppercase text-emerald-400 font-bold flex items-center gap-2">
                         <ShieldAlert size={14}/> Smart ATR Risk Management 
                         <InfoTooltip text="Dynamically adjusts the stop-loss based on current volatility. Wider in wild markets, tighter in calm markets." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useDynamicRisk} onChange={e => setUseDynamicRisk(e.target.checked)} className="accent-emerald-500 w-4 h-4" /><span className="text-[10px] text-emerald-400 font-bold uppercase">ON</span></label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500 font-bold uppercase">{useDynamicRisk ? 'SL ATR Mult' : 'Fixed Stop-Loss (%)'} 
                            <InfoTooltip text={useDynamicRisk ? "E.g. 1.5. The bot places the stop-loss 1.5x the ATR (average candle movement) below your buy price." : "Wanneer de bot met verlies verkoopt."} />
                          </label>
                          <input type="number" step="0.1" value={useDynamicRisk ? atrMultiplierSL : slPct} onChange={e => useDynamicRisk ? setAtrMultiplierSL(e.target.value) : setSlPct(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-200 text-center" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500 font-bold uppercase">{useDynamicRisk ? 'TP ATR Mult' : 'Fixed Take-Profit (%)'} 
                            <InfoTooltip text={useDynamicRisk ? "The profit target based on volatility. Always aim for a risk/reward of at least 1:2." : "Wanneer de bot winst neemt."} />
                          </label>
                          <input type="number" step="0.1" value={useDynamicRisk ? atrMultiplierTP : tpPct} onChange={e => useDynamicRisk ? setAtrMultiplierTP(e.target.value) : setTpPct(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-200 text-center" />
                        </div>
                    </div>
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${useBreakEven ? 'bg-teal-500/5 border-teal-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-teal-400 font-bold flex items-center gap-2">
                         <ShieldCheck size={14}/> Break-even Stop (Risk-Free) 
                         <InfoTooltip text="Automatically moves the Stop-Loss to your entry price once the trade is sufficiently in profit (risk-free)." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useBreakEven} onChange={e => setUseBreakEven(e.target.checked)} className="accent-teal-500 w-4 h-4" /><span className="text-[10px] text-teal-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useBreakEven && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Trigger Profit (%): <InfoTooltip text="As soon as the open position reaches this +% profit, Break-Even is activated." /></label>
                        <input type="number" step="0.1" value={breakEvenTrigger} onChange={e => setBreakEvenTrigger(e.target.value)} className="w-full bg-[#050505] border border-teal-900/30 rounded p-2 text-xs text-teal-400 text-center outline-none" />
                      </div>
                    )}
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${useTrailing ? 'bg-amber-500/5 border-amber-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-amber-500 font-bold flex items-center gap-2">
                         <TrendingUp size={14}/> Trailing Execution 
                         <InfoTooltip text="Lets your profits run as much as possible. The bot only sells when the price has dropped from the absolute top." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTrailing} onChange={e => setUseTrailing(e.target.checked)} className="accent-amber-500 w-4 h-4" /><span className="text-[10px] text-amber-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useTrailing && (
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Trailing Distance (%) <InfoTooltip text="The bot waits to sell until the price has dropped this % from the highest point." /></label>
                            <input type="number" step="0.1" value={trailingPct} onChange={e => setTrailingPct(e.target.value)} className="w-full bg-[#050505] border border-amber-900/30 rounded p-2 text-xs text-amber-400 text-center outline-none" />
                        </div>
                    )}
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${useDynamicTrailing ? 'bg-fuchsia-500/5 border-fuchsia-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-fuchsia-400 font-bold flex items-center gap-2">
                         <TrendingUp size={14}/> Dynamic Step-Trailing
                         <InfoTooltip text="Trekt de trailing stop steeds strakker aan naarmate de winst stijgt." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useDynamicTrailing} onChange={e => setUseDynamicTrailing(e.target.checked)} className="accent-fuchsia-500 w-4 h-4" /><span className="text-[10px] text-fuchsia-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useDynamicTrailing && (
                        <div className="space-y-3 mt-4">
                            <div className="grid grid-cols-2 gap-2 bg-black/40 p-2 rounded-lg border border-white/5">
                                <div className="space-y-1"><label className="text-[9px] text-zinc-500 font-bold uppercase">Tier 1: Trigger bij +%</label><input type="number" step="0.1" value={dynTier1Trigger} onChange={e => setDynTier1Trigger(e.target.value)} className="w-full bg-[#050505] border border-fuchsia-900/30 rounded p-1.5 text-xs text-center outline-none text-fuchsia-300" /></div>
                                <div className="space-y-1"><label className="text-[9px] text-zinc-500 font-bold uppercase">Trail met -%</label><input type="number" step="0.1" value={dynTier1Trail} onChange={e => setDynTier1Trail(e.target.value)} className="w-full bg-[#050505] border border-fuchsia-900/30 rounded p-1.5 text-xs text-center outline-none text-rose-400" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 bg-black/40 p-2 rounded-lg border border-white/5">
                                <div className="space-y-1"><label className="text-[9px] text-zinc-500 font-bold uppercase">Tier 2: Trigger bij +%</label><input type="number" step="0.1" value={dynTier2Trigger} onChange={e => setDynTier2Trigger(e.target.value)} className="w-full bg-[#050505] border border-fuchsia-900/30 rounded p-1.5 text-xs text-center outline-none text-fuchsia-300" /></div>
                                <div className="space-y-1"><label className="text-[9px] text-zinc-500 font-bold uppercase">Trail met -%</label><input type="number" step="0.1" value={dynTier2Trail} onChange={e => setDynTier2Trail(e.target.value)} className="w-full bg-[#050505] border border-fuchsia-900/30 rounded p-1.5 text-xs text-center outline-none text-rose-400" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 bg-black/40 p-2 rounded-lg border border-white/5">
                                <div className="space-y-1"><label className="text-[9px] text-zinc-500 font-bold uppercase">Tier 3: Trigger bij +%</label><input type="number" step="0.1" value={dynTier3Trigger} onChange={e => setDynTier3Trigger(e.target.value)} className="w-full bg-[#050505] border border-fuchsia-900/30 rounded p-1.5 text-xs text-center outline-none text-fuchsia-300" /></div>
                                <div className="space-y-1"><label className="text-[9px] text-zinc-500 font-bold uppercase">Trail met -%</label><input type="number" step="0.1" value={dynTier3Trail} onChange={e => setDynTier3Trail(e.target.value)} className="w-full bg-[#050505] border border-fuchsia-900/30 rounded p-1.5 text-xs text-center outline-none text-rose-400" /></div>
                            </div>
                        </div>
                    )}
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${useDca ? 'bg-blue-500/5 border-blue-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-blue-400 font-bold flex items-center gap-2">
                         <ArrowDownToLine size={14}/> DCA (Cost Averaging) 
                         <InfoTooltip text="Dangerous but effective. Automatically buys more if the trade goes the wrong way, to lower your average entry price." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useDca} onChange={e => setUseDca(e.target.checked)} className="accent-blue-500 w-4 h-4" /><span className="text-[10px] text-blue-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useDca && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] text-zinc-500 font-bold uppercase">Max Entries <InfoTooltip text="The maximum total number of times the bot is allowed to buy more." /></label><input type="number" value={dcaCount} onChange={e => setDcaCount(e.target.value)} className="w-full bg-[#050505] border border-blue-900/30 rounded p-2 text-xs text-center" /></div>
                        <div className="space-y-1"><label className="text-[10px] text-zinc-500 font-bold uppercase">Buy on drop (%) <InfoTooltip text="The bot only buys more after the price has dropped by this percentage since the last purchase." /></label><input type="number" step="0.1" value={dcaDropPct} onChange={e => setDcaDropPct(e.target.value)} className="w-full bg-[#050505] border border-blue-900/30 rounded p-2 text-xs text-center" /></div>
                      </div>
                    )}
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${useCircuitBreaker ? 'bg-rose-500/5 border-rose-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-rose-400 font-bold flex items-center gap-2">
                         <Power size={14}/> Circuit Breaker (Auto-Pause) 
                         <InfoTooltip text="An emergency stop. If your algorithm enters a 'loss spiral', this safeguard pulls the plug." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useCircuitBreaker} onChange={e => setUseCircuitBreaker(e.target.checked)} className="accent-rose-500 w-4 h-4" /><span className="text-[10px] text-rose-400 font-bold uppercase">ON</span></label>
                    </div>
                    {useCircuitBreaker && (
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Auto-pause bot after X losses: <InfoTooltip text="If the bot hits this number of consecutive Stop-Losses, it will be permanently paused until you manually restart it." /></label>
                            <input type="number" value={maxConsecutiveLosses} onChange={e => setMaxConsecutiveLosses(e.target.value)} className="w-full bg-[#050505] border border-rose-900/30 rounded p-2 text-xs text-rose-400 text-center outline-none" />
                        </div>
                    )}
                  </div>

                  <div className="bg-[#09090b] p-5 rounded-2xl border border-zinc-800/50 space-y-4">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2">
                      <Layers size={14}/> Position Sizing 
                      <InfoTooltip text="How much capital the bot is allowed to use for its very first purchase (excluding DCA)." />
                    </h4>
                    <div className="space-y-1"><label className="text-[10px] text-zinc-500 font-bold uppercase">Risk per trade (%)</label><div className="relative"><input type="number" value={tradePercent} onChange={e => setTradePercent(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none" /><span className="absolute right-4 top-2 text-zinc-500 font-bold">%</span></div></div>
                  </div>
                  <div className={`p-5 rounded-2xl border transition-all ${useSmartLimit ? 'bg-indigo-500/5 border-indigo-500/30 shadow-lg' : 'bg-[#09090b] border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h4 className="text-xs uppercase text-indigo-400 font-bold flex items-center gap-2">
                         <Layers size={14}/> Fee Optimization (Maker)
                         <InfoTooltip text="Verandert agressieve Market orders in slimme Limit orders. Bespaart enorm op transactiekosten." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useSmartLimit} onChange={e => setUseSmartLimit(e.target.checked)} className="accent-indigo-500 w-4 h-4" /><span className="text-[10px] text-indigo-400 font-bold uppercase">ON</span></label>
                    </div>
                  </div>
                </div>
              </div>

              <button onClick={saveBot} className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] text-lg uppercase tracking-widest">
                 {editingBotId ? <><Save size={22}/> Wijzigingen Opslaan</> : <><Play size={22}/> Bot Activeren</>}
              </button>
           </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {bots.map((bot, idx) => {
                 const stats = bot.stats || { grossProfit: 0, grossLoss: 0, trades: [], winCount: 0 };
                 const state = bot.state || { totalVolume: 0, averageEntryPrice: 0, livePnl: 0, livePnlPct: 0 };
                 const totalPnL = (stats.grossProfit || 0) - (stats.grossLoss || 0);
                 const tradesLen = (stats.trades || []).length;
                 const winrate = tradesLen === 0 ? 0 : Math.round(((stats.winCount || 0) / tradesLen) * 100);
                 const pf = (stats.grossLoss || 0) === 0 ? ((stats.grossProfit || 0) > 0 ? '∞' : '0.0') : ((stats.grossProfit || 0) / (stats.grossLoss || 0)).toFixed(2);
                 const isCoinbase = bot.config?.exchange === 'Coinbase';

                 return (
                    <div 
                      key={bot.id} 
                      className={`relative p-6 rounded-3xl border transition-all duration-500 overflow-hidden ${
                        bot.state?.phase === 'TRAILING_BUY' 
                          ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] bg-blue-500/5 scale-[1.01]' 
                          : bot.state?.phase === 'TRAILING_SELL'
                          ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.3)] bg-purple-500/5 scale-[1.01]'
                          : bot.state?.isTriggered
                          ? 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)] bg-blue-500/5'
                          : 'border-white/5 bg-[#0b0e11]'
                      }`}
                    >
                      <div className={`absolute -top-24 -right-24 w-64 h-64 blur-[100px] pointer-events-none transition-opacity duration-1000 ${bot.isRunning ? 'bg-blue-600/10 opacity-100' : 'bg-rose-600/5 opacity-50'}`}></div>
                      
                      <div className="flex justify-between items-start mb-6 relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${bot.isRunning ? 'border-blue-500/30 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
                                <Bot size={24} className={bot.isRunning ? 'text-blue-400 animate-pulse' : 'text-zinc-600'} />
                              </div>
                              {bot.isRunning && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0d0d12] animate-bounce"></span>
                              )}
                            </div>
                            <div>
                              <h3 className="text-xl font-black text-white tracking-tighter">{bot.pair?.display}</h3>
                              <div className="flex items-center gap-2">
                                {/* 🔥 NIEUW: Exchange Badge */}
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border flex items-center gap-1 ${isCoinbase ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                                  <Database size={10} /> {isCoinbase ? 'CB' : 'KRAKEN'}
                                </span>
                                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest px-2 py-0.5 bg-blue-500/10 rounded-md border border-blue-500/20">
                                  {bot.strategy}
                                </span>
                                <span className="text-[9px] font-bold text-zinc-500 uppercase">{bot.config?.timeframe}</span>
                              </div>
                            </div>
                          </div>

                        <div className="flex bg-black/50 border border-white/5 rounded-2xl p-1.5 backdrop-blur-md">
                          <button onClick={() => {if (setActivePair) setActivePair(bot.pair);}}className="p-2 text-zinc-500 hover:text-indigo-400 transition-colors"title="Bekijk op de grafiek"><Eye size={18} /></button>
                          <button onClick={() => setBots(bots.map(b => b.id === bot.id ? { ...b, isRunning: !b.isRunning } : b))} className="p-2 transition-colors group/btn" title={bot.isRunning ? "Pause Bot" : "Start Bot"}>
                            {bot.isRunning ? <Pause size={18} className="text-amber-500 group-hover/btn:scale-110 transition-transform" /> : <Play size={18} className="text-emerald-500 group-hover/btn:scale-110 transition-transform" />}
                          </button>
                          <button 
                            onClick={() => {
                              console.log("Klik op settings voor bot:", bot.id); // Debug check
                              startEditing(bot);
                            }} 
                            className="p-2 text-zinc-500 hover:text-blue-400 transition-colors"
                          >
                            <Settings size={18} />
                          </button>
                          <button onClick={() => { if(window.confirm("Are you sure you want to delete this bot?")) setBots(bots.filter(b => b.id !== bot.id)); }} className="p-2 text-zinc-600 hover:text-rose-500 transition-colors"><Trash2 size={18} /></button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 transition-colors hover:bg-white/[0.05]">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Total Return</span>
                          <span className={`text-xl font-mono font-black ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 transition-colors hover:bg-white/[0.05]">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Win Rate</span>
                          <span className="text-xl font-mono font-black text-white">{winrate}%</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 relative overflow-hidden">
                          <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Live RSI Momentum</span>
                          <div className="flex items-end gap-1 h-8">
                            {[40, 55, 45, 60, 50, 65, 70, 55].map((h, i) => (
                              <div key={i} className={`flex-1 rounded-t-sm transition-all duration-1000 ${bot.isRunning ? 'bg-blue-500/40' : 'bg-zinc-800'}`} style={{ height: `${h}%` }}></div>
                            ))}
                          </div>
                          <div className="absolute top-4 right-4 text-xs font-mono font-bold text-blue-400">
                            {bot.state?.currentRsi || '54.2'}
                          </div>
                        </div>
                        
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col justify-center items-center">
                          <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Execution Bias</span>
                          <div className={`text-xs font-black uppercase tracking-widest ${bot.state?.livePnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {bot.state?.livePnlPct >= 0 ? 'Accumulating' : 'Defensive'}
                          </div>
                        </div>
                      </div>

                      <div className="mb-6 space-y-2">
                        <div className="flex justify-between items-end">
                          <span className="text-[9px] font-black text-zinc-500 uppercase">Live Session PnL</span>
                          <span className={`text-sm font-mono font-black ${bot.state?.livePnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {bot.state?.livePnlPct >= 0 ? '+' : ''}{(bot.state?.livePnlPct|| 0).toFixed(2)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className={`h-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${bot.state?.livePnlPct >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                            style={{ width: `${Math.min(100, Math.abs(bot.state?.livePnlPct * 10) + 10)}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-8">
                          {/* Basis Settings */}
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-md font-mono font-bold">{bot.config?.timeframe || '15m'}</span>
                          <span className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-md font-bold uppercase">{bot.strategy?.replace('_', ' ') || 'RSI'}</span>
                          
                          {/* Trailing & Exit Strategies */}
                          {bot.config?.useDynamicTrailing ? (
                              <span className="text-[10px] bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Dynamic Step-Trailing">Dyn Trail</span>
                          ) : bot.config?.useTrailing ? (
                              <span className="text-[10px] bg-amber-600/20 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Fixed Trailing Stop">Trail</span>
                          ) : null}
                          {bot.config?.useBreakEven && <span className="text-[10px] bg-teal-600/20 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Break-Even Stop">Break-Even</span>}
                          
                          {/* Risk & Safety */}
                          {bot.config?.useDynamicRisk && <span className="text-[10px] bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="ATR Dynamic Risk">ATR Risk</span>}
                          {bot.config?.useCircuitBreaker && <span className="text-[10px] bg-rose-600/20 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Circuit Breaker Active">Breaker</span>}
                          
                          {/* Filters */}
                          {bot.config?.useAiFilter && <span className="text-[10px] bg-purple-600/20 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Gemini AI Filter">AI Filter</span>}
                          {bot.config?.useAdxFilter && <span className="text-[10px] bg-sky-600/20 text-sky-400 border border-sky-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="ADX Trend Filter">ADX</span>}
                          {bot.config?.useVolumeFilter && <span className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Volume Surge Filter">Volume</span>}
                          {bot.config?.useTimeFilter && <span className="text-[10px] bg-orange-600/20 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Session Time Filter">Time</span>}
                          
                          {/* Execution */}
                          {bot.config?.useDca && <span className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="DCA Enabled">DCA</span>}
                          {bot.config?.useSmartLimit && <span className="text-[10px] bg-yellow-600/20 text-yellow-500 border border-yellow-500/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider" title="Maker Fee Optimization">Maker</span>}
                      </div>

                     <div className="grid grid-cols-4 gap-4 bg-black/20 p-4 rounded-2xl border border-zinc-800/50 mb-6">
                        <div className="flex flex-col"><span className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Winrate</span><span className={`text-sm font-bold font-mono ${winrate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{winrate}%</span></div>
                        <div className="flex flex-col"><span className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Profit Factor</span><span className="text-sm font-bold font-mono text-zinc-400">{pf}</span></div>
                        <div className="flex flex-col"><span className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Trades</span><span className="text-sm font-bold font-mono text-zinc-100">{tradesLen}</span></div>
                        <div className="flex flex-col"><span className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Net PnL</span><span className={`text-sm font-bold font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${totalPnL.toFixed(2)}</span></div>
                     </div>

                     <div className="mb-8 px-1">
                         <div className="flex justify-between items-center mb-3">
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest">Current Position</span>
                            <span className={`text-xs font-mono font-bold ${state.totalVolume > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                               {state.totalVolume > 0 ? `${(state.totalVolume || 0).toFixed(4)} ${bot.pair?.base || ''}` : '0.0000'}
                            </span>
                         </div>
                         <div className="space-y-2">
                             <div className="flex justify-between items-center"><span className="text-xs text-zinc-500">Average Entry</span><span className="text-xs font-mono text-zinc-300">${(state.averageEntryPrice || 0).toFixed(4)}</span></div>
                             <div className="flex justify-between items-center"><span className="text-xs text-zinc-500">Live PnL</span><span className={`text-xs font-mono font-bold ${state.livePnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{(state.livePnl || 0) >= 0 ? '+' : ''}${(state.livePnl || 0).toFixed(2)} ({(state.livePnlPct || 0).toFixed(2)}%)</span></div>
                         </div>
                     </div>

                      {aiSuggestion && (
                        <div className="mt-4 p-4 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/50 rounded-2xl animate-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-indigo-500 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.6)]">
                                    <Sparkles size={14} className="text-white" />
                                </div>
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Gemini Strategy Optimization</span>
                            </div>
                            
                            <p className="text-[11px] text-indigo-200 mb-4 leading-relaxed font-medium">
                                "{aiSuggestion.reasoning}"
                            </p>
                            
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div className="text-[10px] bg-black/40 p-2 rounded-xl border border-white/5">
                                    <span className="text-zinc-500 block uppercase">Stop-Loss</span>
                                    <span className="text-rose-400 font-bold">{bot.config.slPct}% → {aiSuggestion.suggestedConfig.slPct}%</span>
                                </div>
                                <div className="text-[10px] bg-black/40 p-2 rounded-xl border border-white/5">
                                    <span className="text-zinc-500 block uppercase">Take-Profit</span>
                                    <span className="text-emerald-400 font-bold">{bot.config.tpPct}% → {aiSuggestion.suggestedConfig.tpPct}%</span>
                                </div>
                            </div>

                            <button 
                                onClick={() => applyAiTune(bot.id, aiSuggestion.suggestedConfig)}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-tighter rounded-xl transition-all shadow-lg active:scale-95"
                            >
                                Auto-Apply Optimization
                            </button>
                        </div>
                    )}

                     <BotLogTerminal logs={bot.logs || []} />

                     <div className="flex gap-2 mt-4 pt-4 border-t border-zinc-800/50">
                         <button onClick={() => handleManualTrade(bot.id, 'BUY')} className="flex-1 py-2.5 bg-emerald-900/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                             <Hand size={12}/> Force Buy
                         </button>
                         <button onClick={() => handleManualTrade(bot.id, 'SELL')} disabled={(state.totalVolume || 0) <= 0} className="flex-1 py-2.5 bg-rose-900/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/20 disabled:opacity-20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                             <Hand size={12}/> Force Sell
                         </button>
                     </div>

                     <div className="mt-4 space-y-3">
                      {[...stats.trades].reverse().map((t, i) => {
                        const displayEntry = t.entryPrice || 0;
                        const displayExit = t.exitPrice || 0; 
                        const displayPnL = t.pnl || 0;
                        const displayPct = t.pnlPct || 0;

                        return (
                          <div key={i} className="bg-[#050505] border border-zinc-800/60 rounded-xl overflow-hidden mb-3">
                            <div className="flex justify-between items-center px-3 py-2 bg-zinc-900/30 border-b border-zinc-800/40">
                              <span className="text-[9px] font-mono text-zinc-500">{t.time || 'Trade Picked Up'}</span>
                              <span className={`text-[10px] font-black ${displayPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {displayPnL >= 0 ? '+' : ''}${displayPnL.toFixed(2)} ({displayPct.toFixed(2)}%)
                              </span>
                            </div>
                            
                            <div className="p-3 grid grid-cols-2 gap-4">
                              <div className="flex flex-col">
                                <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">Entry</span>
                                <span className="text-[11px] font-mono text-zinc-300">${displayEntry.toFixed(4)}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">Exit</span>
                                <span className="text-[11px] font-mono text-zinc-300">
                                  ${displayExit > 0 ? displayExit.toFixed(4) : '0.0000'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      </div>

                  </div>
                 );
              })}
           </div>
         )}
      </div>
    </div>
  );
};

export default BotManagerView;