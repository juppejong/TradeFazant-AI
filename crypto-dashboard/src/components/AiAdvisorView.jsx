import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Activity, Layers, Send, TrendingUp, X, Cpu, Zap, Search } from 'lucide-react';
import { getApiHeaders, fetchKrakenOHLC } from '../utils/api';
import { calculateSMA, calculateMACD, calculateRSI } from '../utils/indicators';



// ==========================================
// 🟢 AI ADVISOR VIEW COMPONENT
// ==========================================

const AiAdvisorView = ({ activePair, aiMessages, setAiMessages, timeframe }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState([]);
  const [heatmapWidth, setHeatmapWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef(null);
  const [insight, setInsight] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);

  const quickPrompts = [
    "What is the current market sentiment?",
    "Identify key support and resistance levels.",
    "Should I adjust my Stop-Loss based on current volatility?"
  ];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages, isLoading]);

  const formatMessage = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, i) => {
      let isBullet = false;
      let contentStr = line;

      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        isBullet = true;
        contentStr = line.trim().substring(2);
      }

      const parts = contentStr.split(/(\*\*.*?\*\*)/g);
      const formattedLine = parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j} className="text-blue-400 font-bold">{part.slice(2, -2)}</strong>;
        }
        return <span key={j}>{part}</span>;
      });

      if (isBullet) {
        return <li key={i} className="ml-4 list-disc marker:text-blue-500 mt-1">{formattedLine}</li>;
      }
      return <p key={i} className="mb-2 last:mb-0">{formattedLine}</p>;
    });
  };

  // De functie die de backend aanroept
const scanMarket = async () => {
    setIsScanning(true);
    setError(null);
    setInsight(null);

    try {
      // ✅ We gebruiken nu jouw eigen getApiHeaders() functie!
      const res = await fetch('http://localhost:3001/api/ai/market-scan', {
        method: 'GET', // Of verander naar POST in server.js als je dat liever hebt
        headers: getApiHeaders() 
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scan market');
      }
      
      setInsight(data);
    } catch (err) {
      console.error("Scan error:", err);
      setError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const sendMessage = async (overrideMsg = null) => {
    const userMsg = overrideMsg || input.trim();
    if (!userMsg) return;
    setInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    
    try {
      let contextStr = "";
      try {
          const recentData = await fetchKrakenOHLC(15, activePair.altname);
          if (recentData && recentData.length > 0) {
              const last = recentData[recentData.length - 1];
              const rsiVals = calculateRSI(recentData, 14);
              const rsi = rsiVals.length ? rsiVals[rsiVals.length-1].value.toFixed(1) : 'Unknown';
              contextStr = `\n\n[SYSTEM CONTEXT: The user is analyzing ${activePair.display}. Price: $${last.close.toFixed(4)}. RSI: ${rsi}. MANDATORY: Respond EXCLUSIVELY in English.]`;
          }
      } catch (e) { 
          contextStr = "\n\n[SYSTEM: Respond in English only.]"; 
      }

      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ message: userMsg + contextStr })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiMessages(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'error', text: `System Error: ${err.message}` }]);
    } finally { setIsLoading(false); }
  };

  const handleGenerateStrategy = async () => {
    setIsLoading(true);
    try {
      setAiMessages(prev => [...prev, { role: 'user', text: `Generate an optimal Trading Bot Strategy for ${activePair.display}...` }]);
      
      const data15m = await fetchKrakenOHLC(15, activePair.altname);
      if (!data15m || data15m.length === 0) throw new Error("No market data available.");
      
      const rsiVals = calculateRSI(data15m, 14);
      const macdVals = calculateMACD(data15m);
      const rsi = rsiVals.length ? rsiVals[rsiVals.length-1].value.toFixed(1) : 'N/A';
      const macdHist = macdVals.length ? macdVals[macdVals.length-1].histogram.toFixed(4) : 'N/A';
      const recentCloses = data15m.slice(-10).map(d => d.close.toFixed(2)).join(', ');

      const prompt = `Act as an expert Quantitative Trader. Provide your answer entirely in English.
      I want to deploy an automated trading bot on ${activePair.display}. 
      Recent context: Closes [${recentCloses}], RSI ${rsi}, MACD ${macdHist}.
      
      Provide a highly recommended configuration:
      1. Core Strategy
      2. Indicator Settings
      3. SL (%) and TP (%)
      4. Brief reasoning.`;

      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ message: prompt })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setAiMessages(prev => [...prev, { role: 'model', text: data.text }]);
    } catch(err) {
      setAiMessages(prev => [...prev, { role: 'error', text: "Failed to generate strategy: " + err.message }]);
    } finally { setIsLoading(false); }
  };

  const handleMultiTimeframeAnalyze = async () => {
    setIsLoading(true);
    try {
      setAiMessages(prev => [...prev, { role: 'user', text: `Perform a Deep Multi-Timeframe Analysis (1m, 5m, 15m) for ${activePair.display}...` }]);
      
      const [data1m, data5m, data15m] = await Promise.all([
         fetchKrakenOHLC(1, activePair.altname),
         fetchKrakenOHLC(5, activePair.altname),
         fetchKrakenOHLC(15, activePair.altname)
      ]);

      const formatData = (dData) => {
          if(!dData || !dData.length) return 'Data unavailable';
          const rsiVals = calculateRSI(dData, 14);
          const macdVals = calculateMACD(dData);
          const smaVals = calculateSMA(dData, 50);
          
          const rsi = rsiVals.length ? rsiVals[rsiVals.length-1].value.toFixed(1) : 'N/A';
          const macdHist = macdVals.length ? macdVals[macdVals.length-1].histogram.toFixed(4) : 'N/A';
          const close = dData[dData.length-1].close;
          const sma = smaVals.length ? smaVals[smaVals.length-1].value : close;
          const trend = close > sma ? 'Bullish' : 'Bearish';
          
          return `Price: $${close.toFixed(2)} | Trend: ${trend} | RSI: ${rsi} | MACD Hist: ${macdHist}`;
      };

      const payloadStr = `[1 Minute] -> ${formatData(data1m)}\n[5 Minutes] -> ${formatData(data5m)}\n[15 Minutes] -> ${formatData(data15m)}\n\nEvaluate confluence. Respond EXCLUSIVELY in English. Keep it extremely professional.`;

      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST', headers: getApiHeaders(),
        body: JSON.stringify({ message: payloadStr })
      });
      
      const resData = await res.json();
      if (resData.error) throw new Error(resData.error);
      
      setAiMessages(prev => [...prev, { role: 'model', text: resData.text }]);
    } catch(err) {
      setAiMessages(prev => [...prev, { role: 'error', text: "Could not analyze multi-timeframe data: " + err.message }]);
    } finally { setIsLoading(false); }
  };

  const fetchHeatmap = async () => {
      setShowHeatmap(true);
      setIsHeatmapLoading(true);
      try {
          const pairs = "XXBTZUSD,XETHZUSD,SOLUSD,ADAUSD,XRPUSD,DOTUSD,DOGEUSD,AVAXUSD,LINKUSD,POLUSD";
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
      } catch(e) { console.error("Heatmap error", e); }
      setIsHeatmapLoading(false);
  };

return (
    <div className="flex-1 flex overflow-hidden bg-[#050505]">
      <div className="flex-1 flex flex-col min-w-0">
          <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] shrink-0">
            <div className="flex items-center">
              <Sparkles className="w-5 h-5 text-blue-500 mr-3" />
              <div>
                <h2 className="text-zinc-100 font-bold tracking-wide">Quant AI Copilot</h2>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Powered by Gemini Pro</p>
              </div>
            </div>
            <div className="flex space-x-3 overflow-x-auto [&::-webkit-scrollbar]:hidden pr-2">
                {/* 🚀 NIEUWE SCAN MARKET KNOP */}
                <button onClick={scanMarket} disabled={isScanning} className={`whitespace-nowrap flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg ${isScanning ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'}`}>
                  {isScanning ? <Activity size={14} className="animate-spin" /> : <Search size={14} />} 
                  <span>{isScanning ? 'Scanning...' : 'Scan Market'}</span>
                </button>
                {/* BESTAANDE KNOPPEN */}
                <button onClick={fetchHeatmap} className="whitespace-nowrap flex items-center space-x-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg">
                  <Activity size={14} /> <span>Live Heatmap</span>
                </button>
                <button onClick={handleMultiTimeframeAnalyze} className="whitespace-nowrap flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-blue-900/20">
                  <Layers size={14} /> <span>Deep Analysis</span>
                </button>
                <button onClick={handleGenerateStrategy} className="whitespace-nowrap flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-emerald-900/20">
                  <Cpu size={14} /> <span>Generate Strategy</span>
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* 🚀 NIEUW: ERROR MELDING VAN SCANNER */}
            {error && (
              <div className="bg-rose-900/30 border border-rose-500/50 text-rose-400 p-4 rounded-xl shadow-xl">
                <p className="font-bold flex items-center gap-2"><span>⚠️</span> Scan Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            )}

            {/* 🚀 NIEUW: RESULTATEN VAN DE MARKET SCANNER */}
            {insight && (
              <div className="bg-[#0b0e11] border border-zinc-800 p-6 rounded-2xl shadow-xl animate-fade-in space-y-5">
                <div className="border-l-4 border-indigo-500 pl-4">
                  <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Market Sentiment</h3>
                  <p className="text-zinc-200 text-sm italic">"{insight.marketSentiment}"</p>
                </div>
                <div>
                  <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">Top 3 Mean Reversion Picks</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {insight.topPicks.map((pick, idx) => (
                      <div key={idx} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between hover:border-indigo-500/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-extrabold text-zinc-100">{pick.coin}</span>
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-md font-bold uppercase">Pick #{idx + 1}</span>
                        </div>
                        <p className="text-zinc-400 text-xs leading-relaxed">{pick.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* BESTAANDE LEEG-SCHERM (Verdwijnt nu óók netjes als er een insight is) */}
            {aiMessages.length === 0 && !insight && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
                    <Zap size={48} className="text-blue-500" />
                    <div className="max-w-md">
                        <h3 className="text-lg font-bold text-zinc-200 mb-2">Institutional Quant Copilot</h3>
                        <p className="text-sm text-zinc-400">Ask about market trends, bot settings, or use the tools above for automated reports.</p>
                    </div>
                </div>
            )}
            
            {/* BESTAANDE CHAT BERICHTEN */}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-5 rounded-2xl text-sm leading-relaxed max-w-[85%] shadow-xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : msg.role === 'error' ? 'bg-rose-900/30 text-rose-200 border border-rose-500/30 rounded-bl-none' : 'bg-[#0b0e11] border border-zinc-800 text-zinc-300 rounded-bl-none'}`}>
                  {formatMessage(msg.text)}
                </div>
              </div>
            ))}
            
            {/* BESTAANDE LOADING ANIMATIE VOOR CHAT */}
            {isLoading && (
               <div className="flex items-start">
                   <div className="p-4 rounded-xl bg-[#0b0e11] border border-zinc-800 text-zinc-500 w-20 flex justify-center items-center rounded-bl-none shadow-xl">
                      <div className="flex space-x-1.5">
                         <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                         <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                         <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                   </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* BESTAANDE CHAT INPUT BOX */}
          <div className="p-6 bg-[#09090b] border-t border-zinc-800 shrink-0 flex flex-col space-y-4">
            <div className="flex space-x-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              {quickPrompts.map((prompt, idx) => (
                <button key={idx} onClick={() => sendMessage(prompt)} disabled={isLoading} className="whitespace-nowrap px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-blue-500/50 rounded-xl text-xs font-medium transition active:scale-95 disabled:opacity-50">
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex space-x-3">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={`Ask about ${activePair.display}...`} className="flex-1 bg-[#050505] border border-zinc-800 focus:border-blue-500 rounded-xl px-5 py-4 text-sm text-white outline-none transition" />
              <button onClick={() => sendMessage()} disabled={isLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white px-8 rounded-xl transition flex items-center justify-center font-bold shadow-lg shadow-blue-900/20">
                 <Send size={18} />
              </button>
            </div>
          </div>
      </div>

      {/* BESTAANDE HEATMAP SIDEBAR */}
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
                  <h3 className="text-zinc-200 font-bold text-xs uppercase tracking-widest flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500"/> Market Heatmap</h3>
                  <button onClick={() => setShowHeatmap(false)} className="text-zinc-500 hover:text-white p-1.5 rounded hover:bg-zinc-800 transition"><X size={16}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 bg-[#0b0e11]">
                   {isHeatmapLoading ? (
                       <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
                           <Activity className="animate-pulse w-8 h-8 text-zinc-600"/>
                           <span className="text-xs font-bold uppercase tracking-widest">Syncing Matrix...</span>
                       </div>
                   ) : (
                       <div className="grid grid-cols-2 gap-3">
                           {heatmapData.map(h => (
                               <div key={h.symbol} className={`p-4 rounded-xl flex flex-col items-center justify-center transition-all ${h.pct >= 0 ? 'bg-emerald-900/20 border border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.05)]' : 'bg-rose-900/20 border border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.05)]'}`}>
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