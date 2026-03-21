// src/components/AiAdvisorView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Activity, Layers, Send, TrendingUp, X } from 'lucide-react';
import { getApiHeaders, fetchKrakenOHLC } from '../utils/api';
import { calculateRSI } from '../utils/indicators';

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

export default AiAdvisorView;