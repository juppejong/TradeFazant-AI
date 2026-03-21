import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Activity, Layers, Bot, X, Trash2, Plus, Play, Pause, 
  ShieldAlert, Target, TrendingUp, AlertTriangle, Clock, ArrowDownToLine, Sparkles
} from 'lucide-react';
import { getApiHeaders, fetchKrakenOHLC } from '../utils/api';

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

  // We hebben de tfMap uit api.js nodig voor de dropdown
  const tfMapKeys = ['1m', '5m', '15m', '1H', '4H', '1D'];

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
                      <div className="space-y-1"><label className="text-[10px] text-zinc-500 uppercase font-bold">Tijdsframe</label><select value={botTimeframe} onChange={(e) => setBotTimeframe(e.target.value)} className="w-full bg-[#050505] border border-zinc-800 rounded p-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{tfMapKeys.map(tf => <option key={tf} value={tf}>{tf}</option>)}</select></div>
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

export default BotManagerView;