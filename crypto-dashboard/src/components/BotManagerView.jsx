import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Activity, Layers, Bot, X, Trash2, Plus, Play, Pause, 
  ShieldAlert, Target, TrendingUp, AlertTriangle, Clock, ArrowDownToLine, 
  Sparkles, BrainCircuit, BarChart2, ShieldCheck, Power, SunMoon, HelpCircle, History
} from 'lucide-react';

// ℹ️ Reusable Tooltip Component
const InfoTooltip = ({ text }) => (
  <div className="relative group flex items-center ml-1.5 cursor-help">
    <HelpCircle size={12} className="text-zinc-500 hover:text-blue-400 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-[#18181b] border border-zinc-700 text-zinc-300 text-[10px] rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] text-center leading-relaxed pointer-events-none font-normal normal-case tracking-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);

const BotLogTerminal = ({ logs }) => {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="h-48 bg-[#050505] rounded p-3 overflow-y-auto text-[10px] font-mono border border-zinc-800/50 flex flex-col space-y-1">
      {logs.length === 0 && <span className="text-zinc-600">Bot initialized. Waiting for data...</span>}
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
  const [newBotStrategy, setNewBotStrategy] = useState('RSI_TREND');
  const [botTimeframe, setBotTimeframe] = useState('15m');
  
  // Sizing & Limits
  const [sizingType, setSizingType] = useState('percent');
  const [tradeAmount, setTradeAmount] = useState('0.01');
  const [tradePercent, setTradePercent] = useState('10'); 
  const [cooldownMins, setCooldownMins] = useState(15);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5);
  
  // 1. RSI Settings
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiBuyLevel, setRsiBuyLevel] = useState(30);
  const [rsiSellLevel, setRsiSellLevel] = useState(70);

  // 2. MACD Settings
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);

  // 3. EMA Cross Settings
  const [emaFast, setEmaFast] = useState(9);
  const [emaSlow, setEmaSlow] = useState(21);
  
  // Risk (Fixed fallback)
  const [slPct, setSlPct] = useState(3.0);
  const [tpPct, setTpPct] = useState(6.0);

  // 🧠 SMART SETTINGS
  const [useDynamicRisk, setUseDynamicRisk] = useState(false);
  const [atrMultiplierSL, setAtrMultiplierSL] = useState(1.5); 
  const [atrMultiplierTP, setAtrMultiplierTP] = useState(3.0); 
  
  const [useAdxFilter, setUseAdxFilter] = useState(false);
  const [adxThreshold, setAdxThreshold] = useState(25);
  
  const [useAiFilter, setUseAiFilter] = useState(false);
  const [aiMinConfidence, setAiMinConfidence] = useState(70);

  // 🕒 TIME SESSIONS FILTER
  const [useTimeFilter, setUseTimeFilter] = useState(false);
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('20:00');

  // 🚀 PRO SETTINGS
  const [useVolumeFilter, setUseVolumeFilter] = useState(false);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1.5);

  const [useTrailing, setUseTrailing] = useState(true);
  const [trailingPct, setTrailingPct] = useState(0.5);
  const [useDca, setUseDca] = useState(false);
  const [dcaCount, setDcaCount] = useState(3);
  const [dcaDropPct, setDcaDropPct] = useState(2.0);

  const [useBreakEven, setUseBreakEven] = useState(false);
  const [breakEvenTrigger, setBreakEvenTrigger] = useState(2.0);

  const [useCircuitBreaker, setUseCircuitBreaker] = useState(false);
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(3);

  const tfMapKeys = ['1m', '5m', '15m', '1H', '4H', '1D'];

  const createBot = () => {
    const newBot = { 
      id: Math.random().toString(), pair: newBotPair, strategy: newBotStrategy, 
      isRunning: true, 
      state: { phase: 'WAITING', currentAtr: 0, currentAdx: 0, lastAction: 'NONE', averageEntryPrice: 0, totalVolume: 0, tradesToday: 0, livePnl: 0, livePnlPct: 0, consecutiveLosses: 0 }, 
      stats: { trades: [], winCount: 0, lossCount: 0, grossProfit: 0, grossLoss: 0 },
      logs: [{time: new Date().toLocaleTimeString(), msg: `🚀 Bot started on ${newBotPair.display} (${newBotStrategy})`, type: 'success'}], 
      config: { 
        timeframe: botTimeframe, sizingType: sizingType, tradeAmount: parseFloat(tradeAmount), tradePercent: parseFloat(tradePercent),
        rsiPeriod: parseInt(rsiPeriod), rsiBuyLevel: parseInt(rsiBuyLevel), rsiSellLevel: parseInt(rsiSellLevel),
        macdFast: parseInt(macdFast), macdSlow: parseInt(macdSlow), macdSignal: parseInt(macdSignal),
        emaFast: parseInt(emaFast), emaSlow: parseInt(emaSlow),
        useTrailing, trailingPct: parseFloat(trailingPct),
        useDca, dcaCount: parseInt(dcaCount), dcaDropPct: parseFloat(dcaDropPct),
        useDynamicRisk, atrMultiplierSL: parseFloat(atrMultiplierSL), atrMultiplierTP: parseFloat(atrMultiplierTP),
        slPct: parseFloat(slPct), tpPct: parseFloat(tpPct),
        useAdxFilter, adxThreshold: parseInt(adxThreshold),
        useVolumeFilter, volumeMultiplier: parseFloat(volumeMultiplier),
        useTimeFilter, timeStart, timeEnd,
        cooldownMins: parseInt(cooldownMins), maxDailyLoss: parseFloat(maxDailyLoss),
        useAiFilter: useAiFilter, aiMinConfidence: parseInt(aiMinConfidence),
        useBreakEven, breakEvenTrigger: parseFloat(breakEvenTrigger),
        useCircuitBreaker, maxConsecutiveLosses: parseInt(maxConsecutiveLosses)
      } 
    };
    setBots([...bots, newBot]);
    setIsCreating(false);
  };

  const toggleBotState = (idx) => {
    const newBots = [...bots];
    newBots[idx].isRunning = !newBots[idx].isRunning;
    newBots[idx].logs.push({time: new Date().toLocaleTimeString(), msg: newBots[idx].isRunning ? '▶️ Bot resumed.' : '🛑 Bot manually paused.', type: newBots[idx].isRunning ? 'success' : 'error'});
    setBots(newBots);
  };

  const deleteBot = (id) => setBots(bots.filter(b => b.id !== id));

  return (
    <div className="flex-1 flex flex-col bg-[#050505] h-full overflow-y-auto">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] shrink-0">
        <div className="flex items-center"><Bot className="w-5 h-5 text-purple-500 mr-3" /><div><h2 className="text-zinc-100 font-bold tracking-wide">Auto Trading Bots 5.0</h2><p className="text-[10px] text-zinc-500 uppercase tracking-widest">Multi-Strategy Quant Engine</p></div></div>
        {!isCreating && (<button onClick={() => setIsCreating(true)} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-blue-900/20"><Plus size={14} /> <span>New Bot</span></button>)}
      </div>

      <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
         {isCreating ? (
           <div className="bg-[#0b0e11] border border-zinc-800 rounded-2xl p-6 w-full max-w-4xl mx-auto shadow-2xl space-y-8">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                 <h3 className="font-bold text-zinc-200 flex items-center gap-2"><Settings size={18} className="text-blue-500"/> Configure Algorithm</h3>
                 <button onClick={() => setIsCreating(false)} className="text-zinc-500 hover:text-rose-500"><X size={20}/></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Column 1: Basics, Strategy & Filters */}
                <div className="space-y-6">
                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2"><Activity size={14}/> Strategy & Market</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">
                          Trading Pair <InfoTooltip text="The crypto pair this bot will trade." />
                        </label>
                        <select value={newBotPair.id} onChange={(e) => setNewBotPair(availablePairs.find(p=>p.id===e.target.value))} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{availablePairs.map(p => <option key={p.id} value={p.id}>{p.display}</option>)}</select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">
                          Timeframe <InfoTooltip text="The size of each candle. 15m is standard. Lower timeframes are faster but contain more 'noise'." />
                        </label>
                        <select value={botTimeframe} onChange={(e) => setBotTimeframe(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{tfMapKeys.map(tf => <option key={tf} value={tf}>{tf}</option>)}</select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center">
                        Logic / Model <InfoTooltip text="The brain of the bot. Determines the mathematical rules for buying and selling." />
                      </label>
                      <select value={newBotStrategy} onChange={e => setNewBotStrategy(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-blue-400 font-semibold outline-none focus:border-blue-500">
                         <optgroup label="Momentum & Oscillators">
                           <option value="RSI">RSI (Pure, Mean Reversion)</option>
                           <option value="RSI_TREND">RSI Oscillator + SMA50 Trend Filter</option>
                         </optgroup>
                         <optgroup label="Trend Following">
                           <option value="MACD_CROSS">MACD Crossover (Classic)</option>
                           <option value="EMA_CROSS">EMA Trend Crossover (Golden/Death Cross)</option>
                         </optgroup>
                         <optgroup label="Volatility">
                           <option value="BB_VOL">Bollinger Breakout + Volume Filter</option>
                           <option value="MEAN_REVERSION">Mean Reversion (Extreme Rubber Band Effect)</option>
                         </optgroup>
                      </select>
                    </div>
                    
                    {/* RSI SETTINGS */}
                    {(newBotStrategy === 'RSI' || newBotStrategy === 'RSI_TREND') && (
                      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-zinc-800/50 mt-4">
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">Period <InfoTooltip text="Number of candles for the RSI calculation. 14 is the universal standard." /></label>
                          <input type="number" value={rsiPeriod} onChange={(e) => setRsiPeriod(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-300 text-center outline-none" />
                        </div>
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-emerald-500 font-bold flex items-center">Buy &lt; <InfoTooltip text="Buy when RSI drops below this number (oversold)." /></label>
                          <input type="number" value={rsiBuyLevel} onChange={(e) => setRsiBuyLevel(e.target.value)} className="w-full bg-[#050505] border border-emerald-900/50 rounded p-2 text-sm text-emerald-400 text-center outline-none" />
                        </div>
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-rose-500 font-bold flex items-center">Sell &gt; <InfoTooltip text="Sell when RSI rises above this number (overbought)." /></label>
                          <input type="number" value={rsiSellLevel} onChange={(e) => setRsiSellLevel(e.target.value)} className="w-full bg-[#050505] border border-rose-900/50 rounded p-2 text-sm text-rose-400 text-center outline-none" />
                        </div>
                      </div>
                    )}

                    {/* MACD SETTINGS */}
                    {(newBotStrategy === 'MACD_CROSS') && (
                      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-zinc-800/50 mt-4">
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-blue-500 font-bold flex items-center">Fast Length <InfoTooltip text="Fast moving average. Standard is 12." /></label>
                          <input type="number" value={macdFast} onChange={(e) => setMacdFast(e.target.value)} className="w-full bg-[#050505] border border-blue-900/50 rounded p-2 text-sm text-blue-400 text-center outline-none" />
                        </div>
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-orange-500 font-bold flex items-center">Slow Length <InfoTooltip text="Slow moving average. Standard is 26." /></label>
                          <input type="number" value={macdSlow} onChange={(e) => setMacdSlow(e.target.value)} className="w-full bg-[#050505] border border-orange-900/50 rounded p-2 text-sm text-orange-400 text-center outline-none" />
                        </div>
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">Signal Line <InfoTooltip text="The signal line (crossover trigger). Standard is 9." /></label>
                          <input type="number" value={macdSignal} onChange={(e) => setMacdSignal(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-400 text-center outline-none" />
                        </div>
                      </div>
                    )}

                    {/* EMA CROSS SETTINGS */}
                    {(newBotStrategy === 'EMA_CROSS') && (
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/50 mt-4">
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-emerald-500 font-bold flex items-center">Fast EMA <InfoTooltip text="The 'fast' line (e.g. 9). If it crosses above, the bot buys." /></label>
                          <input type="number" value={emaFast} onChange={(e) => setEmaFast(e.target.value)} className="w-full bg-[#050505] border border-emerald-900/50 rounded p-2 text-sm text-emerald-400 text-center outline-none" />
                        </div>
                        <div className="space-y-1 mt-2">
                          <label className="text-[10px] uppercase text-purple-500 font-bold flex items-center">Slow EMA <InfoTooltip text="The 'slow' trend line (e.g. 21)." /></label>
                          <input type="number" value={emaSlow} onChange={(e) => setEmaSlow(e.target.value)} className="w-full bg-[#050505] border border-purple-900/50 rounded p-2 text-sm text-purple-400 text-center outline-none" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ADX Trend Filter */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useAdxFilter ? 'border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.1)]' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-sky-400 font-bold flex items-center gap-2">
                         <TrendingUp size={14}/> ADX Trend Filter 
                         <InfoTooltip text="Average Directional Index measures if there is a trend at all. Prevents trading in a choppy (sideways) market." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useAdxFilter} onChange={e => setUseAdxFilter(e.target.checked)} className="accent-sky-500 w-4 h-4" /><span className="text-xs text-sky-400 font-bold uppercase">On</span></label>
                    </div>
                    {useAdxFilter ? (
                      <div className="space-y-2">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">
                            Only trade if ADX is higher than: <InfoTooltip text="Values below 25 indicate a weak trend. The bot will ignore buy signals." />
                          </label>
                          <input type="number" value={adxThreshold} onChange={(e) => setAdxThreshold(e.target.value)} className="w-full bg-[#050505] border border-sky-900/30 rounded p-2 text-sm text-sky-400 text-center outline-none" />
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 italic">Disabled. Bot trades in sideways markets too.</div>
                    )}
                  </div>

                  {/* Volume Surge Filter */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useVolumeFilter ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-indigo-400 font-bold flex items-center gap-2">
                         <BarChart2 size={14}/> Volume Surge Filter
                         <InfoTooltip text="Verifies if a price increase is supported by a large amount of trading volume (institutional money)." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useVolumeFilter} onChange={e => setUseVolumeFilter(e.target.checked)} className="accent-indigo-500 w-4 h-4" /><span className="text-xs text-indigo-400 font-bold uppercase">On</span></label>
                    </div>
                    {useVolumeFilter ? (
                      <div className="space-y-2">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">
                            Current volume must be X times higher than average: <InfoTooltip text="E.g. 1.5 means: Current volume must be 50% higher than the average of the last 20 candles." />
                          </label>
                          <input type="number" step="0.1" value={volumeMultiplier} onChange={(e) => setVolumeMultiplier(e.target.value)} className="w-full bg-[#050505] border border-indigo-900/30 rounded p-2 text-sm text-indigo-400 text-center outline-none" />
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 italic">Disabled. Volume is ignored on entry.</div>
                    )}
                  </div>

                  {/* 🕒 TIME SESSIONS FILTER */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useTimeFilter ? 'border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-orange-400 font-bold flex items-center gap-2">
                         <SunMoon size={14}/> Trading Hours (Sessions)
                         <InfoTooltip text="Restricts the bot to only scan and trade during the specified timespan (e.g. during Wall Street open)." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTimeFilter} onChange={e => setUseTimeFilter(e.target.checked)} className="accent-orange-500 w-4 h-4" /><span className="text-xs text-orange-400 font-bold uppercase">On</span></label>
                    </div>
                    {useTimeFilter ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-zinc-500 font-bold">Start Time</label>
                            <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className="w-full bg-[#050505] border border-orange-900/30 rounded p-2 text-sm text-orange-400 text-center outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-zinc-500 font-bold">End Time</label>
                            <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className="w-full bg-[#050505] border border-orange-900/30 rounded p-2 text-sm text-orange-400 text-center outline-none" />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 italic">Disabled. The bot scans the markets 24/7.</div>
                    )}
                  </div>

                  {/* AI Decision Filter */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useAiFilter ? 'border-purple-500/50' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-purple-400 font-bold flex items-center gap-2">
                         <Sparkles size={14}/> Gemini AI Filter
                         <InfoTooltip text="When the bot sees a signal, it sends it to Google Gemini. The trade is only executed if AI approves." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useAiFilter} onChange={e => setUseAiFilter(e.target.checked)} className="accent-purple-500 w-4 h-4" /><span className="text-xs text-purple-400 font-bold uppercase">On</span></label>
                    </div>
                    {useAiFilter && (
                      <div className="space-y-1">
                          <label className="text-[10px] uppercase text-purple-500 font-bold flex items-center">
                            Minimum AI Confidence (%) <InfoTooltip text="The AI returns a confidence score (0-100). Higher is safer, but results in fewer trades." />
                          </label>
                          <div className="relative">
                              <input type="number" value={aiMinConfidence} onChange={(e) => setAiMinConfidence(e.target.value)} className="w-full bg-[#050505] border border-purple-900/50 rounded p-2.5 text-sm text-purple-400 outline-none focus:border-purple-500" />
                              <span className="absolute right-4 top-2.5 text-purple-500">%</span>
                          </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Risk Management & Advanced Execution */}
                <div className="space-y-6">
                  
                  {/* Risk Base (Smart of Fixed) */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useDynamicRisk ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-emerald-400 font-bold flex items-center gap-2">
                         <ShieldAlert size={14}/> Smart ATR Risk Management
                         <InfoTooltip text="Dynamically adjusts the stop-loss based on current volatility. Wider in wild markets, tighter in calm markets." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useDynamicRisk} onChange={e => setUseDynamicRisk(e.target.checked)} className="accent-emerald-500 w-4 h-4" /><span className="text-xs text-emerald-400 font-bold uppercase">On</span></label>
                    </div>
                    {useDynamicRisk ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-rose-500 font-bold flex items-center">Stop-Loss ATR <InfoTooltip text="E.g. 1.5. The bot places the stop-loss 1.5x the ATR (average candle movement) below your buy price." /></label>
                          <input type="number" step="0.1" value={atrMultiplierSL} onChange={(e) => setAtrMultiplierSL(e.target.value)} className="w-full bg-[#050505] border border-rose-900/30 rounded p-2 text-sm text-rose-400 text-center outline-none focus:border-rose-500" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-emerald-500 font-bold flex items-center">Take-Profit ATR <InfoTooltip text="The profit target based on volatility. Always aim for a risk/reward of at least 1:2." /></label>
                          <input type="number" step="0.1" value={atrMultiplierTP} onChange={(e) => setAtrMultiplierTP(e.target.value)} className="w-full bg-[#050505] border border-emerald-900/30 rounded p-2 text-sm text-emerald-400 text-center outline-none focus:border-emerald-500" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold">Fixed Stop-Loss (%)</label><input type="number" step="0.1" value={slPct} onChange={(e) => setSlPct(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-400 text-center outline-none" /></div>
                        <div className="space-y-1"><label className="text-[10px] uppercase text-zinc-500 font-bold">Fixed Take-Profit (%)</label><input type="number" step="0.1" value={tpPct} onChange={(e) => setTpPct(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-zinc-400 text-center outline-none" /></div>
                      </div>
                    )}
                  </div>

                  {/* Break-Even Stop */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useBreakEven ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.1)]' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-teal-400 font-bold flex items-center gap-2">
                         <ShieldCheck size={14}/> Break-Even Stop (Risk-Free)
                         <InfoTooltip text="Automatically moves the Stop-Loss to your entry price once the trade is sufficiently in profit (risk-free)." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useBreakEven} onChange={e => setUseBreakEven(e.target.checked)} className="accent-teal-500 w-4 h-4" /><span className="text-xs text-teal-400 font-bold uppercase">On</span></label>
                    </div>
                    {useBreakEven && (
                      <div className="space-y-2">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">
                            Move Stop-Loss to $0 risk once profit reaches (%): <InfoTooltip text="As soon as the open position reaches this +% profit, Break-Even is activated." />
                          </label>
                          <input type="number" step="0.1" value={breakEvenTrigger} onChange={(e) => setBreakEvenTrigger(e.target.value)} className="w-full bg-[#050505] border border-teal-900/30 rounded p-2 text-sm text-teal-400 text-center outline-none" />
                      </div>
                    )}
                  </div>
                  
                  {/* Trailing */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useTrailing ? 'border-amber-500/30' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-amber-500 font-bold flex items-center gap-2">
                         <TrendingUp size={14}/> Trailing Execution
                         <InfoTooltip text="Lets your profits run as much as possible. The bot only sells when the price has dropped from the absolute top." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTrailing} onChange={e => setUseTrailing(e.target.checked)} className="accent-amber-500 w-4 h-4" /><span className="text-xs text-amber-500 font-bold uppercase">On</span></label>
                    </div>
                    {useTrailing && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">
                          Trailing Distance (%) <InfoTooltip text="The bot waits to sell until the price has dropped this % from the highest point." />
                        </label>
                        <input type="number" step="0.1" value={trailingPct} onChange={(e) => setTrailingPct(e.target.value)} className="w-full bg-[#050505] border border-amber-900/30 rounded p-2 text-sm text-amber-400 text-center outline-none" />
                      </div>
                    )}
                  </div>
                  
                  {/* DCA */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useDca ? 'border-blue-500/30' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-blue-400 font-bold flex items-center gap-2">
                         <ArrowDownToLine size={14}/> DCA (Dollar Cost Averaging)
                         <InfoTooltip text="Dangerous but effective. Automatically buys more if the trade goes the wrong way, to lower your average entry price." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useDca} onChange={e => setUseDca(e.target.checked)} className="accent-blue-500 w-4 h-4" /><span className="text-xs text-blue-400 font-bold uppercase">On</span></label>
                    </div>
                    {useDca && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">Max Entries <InfoTooltip text="The maximum total number of times the bot is allowed to buy more." /></label>
                          <input type="number" value={dcaCount} onChange={(e) => setDcaCount(e.target.value)} className="w-full bg-[#050505] border border-blue-900/30 rounded p-2 text-sm text-blue-400 text-center outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">Buy on drop of (%) <InfoTooltip text="The bot only buys more after the price has dropped by this percentage since the last purchase." /></label>
                          <input type="number" step="0.1" value={dcaDropPct} onChange={(e) => setDcaDropPct(e.target.value)} className="w-full bg-[#050505] border border-blue-900/30 rounded p-2 text-sm text-blue-400 text-center outline-none" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Circuit Breaker */}
                  <div className={`space-y-4 bg-[#09090b] p-5 rounded-xl border transition-colors ${useCircuitBreaker ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'border-zinc-800/50'}`}>
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="text-xs uppercase text-rose-400 font-bold flex items-center gap-2">
                         <Power size={14}/> Circuit Breaker (Auto-Pause)
                         <InfoTooltip text="An emergency stop. If your algorithm enters a 'loss spiral', this safeguard pulls the plug." />
                       </h4>
                       <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useCircuitBreaker} onChange={e => setUseCircuitBreaker(e.target.checked)} className="accent-rose-500 w-4 h-4" /><span className="text-xs text-rose-400 font-bold uppercase">On</span></label>
                    </div>
                    {useCircuitBreaker && (
                      <div className="space-y-2">
                          <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center">
                            Auto-pause bot after X consecutive losses: <InfoTooltip text="If the bot hits this number of consecutive Stop-Losses, it will be permanently paused until you manually restart it." />
                          </label>
                          <input type="number" value={maxConsecutiveLosses} onChange={(e) => setMaxConsecutiveLosses(e.target.value)} className="w-full bg-[#050505] border border-rose-900/30 rounded p-2 text-sm text-rose-400 text-center outline-none" />
                      </div>
                    )}
                  </div>

                  {/* Sizing */}
                  <div className="space-y-4 bg-[#09090b] p-5 rounded-xl border border-zinc-800/50">
                    <h4 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2 mb-2">
                      <Layers size={14}/> Position Sizing
                      <InfoTooltip text="How much capital the bot is allowed to use for its very first purchase (excluding DCA)." />
                    </h4>
                    <div className="space-y-1"><label className="text-[10px] text-zinc-500 uppercase font-bold">Risk per trade (% of total balance)</label><div className="relative"><input type="number" value={tradePercent} onChange={(e) => setTradePercent(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none" /><span className="absolute right-4 top-2.5 text-zinc-500">%</span></div></div>
                  </div>
                  
                </div>
              </div>

              <button onClick={createBot} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.2)] transition active:scale-95">Save & Start Bot</button>
           </div>
         ) : (
           <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {bots.length === 0 && <div className="col-span-2 text-center text-zinc-600 py-20 border border-dashed border-zinc-800 rounded-2xl">No active bots. Click "New Bot".</div>}
              {bots.map((bot, idx) => {
                 const pf = bot.stats.grossLoss === 0 ? (bot.stats.grossProfit > 0 ? '∞' : '0.0') : (bot.stats.grossProfit / bot.stats.grossLoss).toFixed(2);
                 const wr = bot.stats.trades.length === 0 ? 0 : Math.round((bot.stats.winCount / bot.stats.trades.length) * 100);
                 const totalPnL = bot.stats.grossProfit - bot.stats.grossLoss;
                 
                 return (
                  <div key={bot.id} className={`bg-[#0b0e11] border ${bot.isRunning ? 'border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-zinc-800'} rounded-2xl p-5 flex flex-col space-y-4 transition-colors duration-300`}>
                     <div className="flex justify-between items-start border-b border-zinc-800/50 pb-4">
                       <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${bot.isRunning ? 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-rose-500'}`}></div>
                            <span className="text-lg font-bold text-zinc-100 tracking-wide">{bot.pair.display}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                             <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold">{bot.config.timeframe}</span>
                             <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold uppercase">{bot.strategy.replace('_', ' ')}</span>
                             
                             {/* Filters Badges */}
                             {bot.config.useAdxFilter && <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded font-bold">ADX TREND</span>}
                             {bot.config.useVolumeFilter && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-bold">VOL SURGE</span>}
                             {bot.config.useTimeFilter && <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Clock size={10}/> TIME</span>}
                             {bot.config.useAiFilter && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Sparkles size={10}/> AI</span>}

                             {/* Risk & Execution Badges */}
                             {bot.config.useDynamicRisk && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">ATR RISK</span>}
                             {bot.config.useBreakEven && <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded font-bold">BREAK-EVEN</span>}
                             {bot.config.useTrailing && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold">TRAIL</span>}
                             {bot.config.useDca && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold">DCA</span>}
                             {bot.config.useCircuitBreaker && <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-bold">BREAKER</span>}
                          </div>
                       </div>
                       <div className="flex space-x-2 bg-[#050505] p-1 rounded-lg border border-zinc-800 shrink-0">
                         <button onClick={() => toggleBotState(idx)} className={`p-2 rounded transition ${bot.isRunning ? 'hover:bg-zinc-800 text-amber-500' : 'hover:bg-emerald-900/30 text-emerald-500'}`}>
                            {bot.isRunning ? <Pause size={16}/> : <Play size={16}/>}
                         </button>
                         <button onClick={() => deleteBot(bot.id)} className="p-2 rounded text-zinc-600 hover:text-rose-500 transition"><Trash2 size={16}/></button>
                       </div>
                     </div>

                     {/* Stats Overview */}
                     <div className="grid grid-cols-4 gap-3 bg-[#050505] p-3 rounded-xl border border-zinc-800/50">
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Winrate</span><span className={`text-sm font-bold font-mono ${wr >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{wr}%</span></div>
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Profit Factor</span><span className={`text-sm font-bold font-mono ${pf >= 1.5 ? 'text-emerald-400' : (pf >= 1 ? 'text-amber-400' : 'text-rose-400')}`}>{pf}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Trades</span><span className="text-sm font-bold font-mono text-zinc-200">{bot.stats.trades.length}</span></div>
                        <div className="flex flex-col"><span className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Net PnL</span><span className={`text-sm font-bold font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}</span></div>
                     </div>

                     <div className="bg-[#050505] p-3 rounded-xl border border-zinc-800/50 space-y-2">
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-zinc-500 uppercase font-bold">Current Position</span>
                            <span className={`text-xs font-bold ${bot.state.totalVolume > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                               {bot.state.totalVolume > 0 ? `${bot.state.totalVolume.toFixed(4)} ${bot.pair.base}` : 'No active position'}
                            </span>
                         </div>
                         {bot.state.totalVolume > 0 && (
                             <>
                               <div className="flex justify-between items-center">
                                  <span className="text-xs text-zinc-500">Average Entry</span>
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

                     {/* 📜 NIEUW: Trade History List */}
                     {bot.stats.trades.length > 0 && (
                        <div className="bg-[#050505] p-3 rounded-xl border border-zinc-800/50 flex flex-col">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-1">
                                 <History size={12}/> Trade History
                              </span>
                              <span className="text-[10px] text-zinc-600">Last {Math.min(bot.stats.trades.length, 50)} trades</span>
                           </div>
                           
                           {/* Scrollbare lijst, verbergt lelijke grote scrollbars */}
                           <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                              {[...bot.stats.trades].reverse().slice(0, 50).map((trade, i) => (
                                 <div key={i} className="flex justify-between items-center text-[10px] bg-[#09090b] p-2 rounded border border-zinc-800/50">
                                    <div className="flex flex-col space-y-0.5">
                                       <span className="text-zinc-500">{trade.exitTime || trade.time || 'Unknown time'}</span>
                                       <span className="text-zinc-300 font-mono">In: ${trade.entryPrice?.toFixed(4) || '0.00'}</span>
                                    </div>
                                    <div className="flex flex-col items-end space-y-0.5">
                                       <span className={`font-mono font-bold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl ? trade.pnl.toFixed(2) : '0.00'}
                                       </span>
                                       <span className="text-zinc-500 font-mono">Out: ${trade.exitPrice?.toFixed(4) || '0.00'}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}

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

export default BotManagerView;