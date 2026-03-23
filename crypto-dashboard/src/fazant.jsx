import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { calculateSMA, calculateEMA, calculateMACD, calculateBB, calculateRSI } from './utils/indicators';
import { tfMap, getApiHeaders, fetchKrakenPairs, fetchKrakenOHLC } from './utils/api';
import PortfolioView from './components/PortfolioView';
import AiAdvisorView from './components/AiAdvisorView';
import BotManagerView from './components/BotManagerView';
import ScreenerView from './components/ScreenerView'; // ✅ Toegevoegd
import { useKrakenMarketData } from './utils/websocket';
import TradingChart, { PopoutWindow } from './components/TradingChart';
import { 
  Settings, BarChart2, Activity, Layers, ChevronDown, LineChart, Bot, Wallet, 
  Maximize2, Search, User, LayoutGrid, Square, ExternalLink, Zap, // ✅ Zap toegevoegd
  ChevronRight, ChevronLeft, Sparkles, Send, X, Trash2, Plus, Play, Pause, Crosshair,
  ShieldAlert, Target, TrendingUp, AlertTriangle, Clock, ArrowDownToLine, KeyRound
} from 'lucide-react';

// ==========================================
// 🟢 MAIN COMPONENT
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
  
  const [aiMessages, setAiMessages] = useState([{ role: 'model', text: `Hello! I am your Google Gemini Trading Advisor.` }]);
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
  const [activeTab, setActiveTab] = useState('positions');
  
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
  // 🤖 BOT ENGINE 2.0 (English UI & Logs)
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
          let logMsg = `[Analytical] ${updatedBot.pair.display} | $${botCurrentClose.toFixed(4)}`;

          state.currentPrice = botCurrentClose;
          if (state.totalVolume > 0 && state.averageEntryPrice > 0) {
             state.livePnl = (botCurrentClose - state.averageEntryPrice) * state.totalVolume;
             state.livePnlPct = (botCurrentClose - state.averageEntryPrice) / state.averageEntryPrice * 100;
          } else {
             state.livePnl = 0; state.livePnlPct = 0;
          }

          const inCooldown = state.lastAction === 'SELL' && (nowMs - state.lastTradeTime < cfg.cooldownMins * 60000);
          if (inCooldown) logMsg += ` | ⏳ Cooldown period`;

          if (state.totalVolume > 0 && state.averageEntryPrice > 0) {
             logMsg += ` | PnL: ${state.livePnlPct.toFixed(2)}%`;
             if (cfg.slPct > 0 && state.livePnlPct <= -cfg.slPct) { logMsg = `💥 STOP-LOSS (${state.livePnlPct.toFixed(2)}%)`; sellSignal = true; }
             else if (cfg.tpPct > 0 && state.livePnlPct >= cfg.tpPct) { logMsg = `🎯 TAKE-PROFIT (${state.livePnlPct.toFixed(2)}%)`; sellSignal = true; }
             else if (cfg.useDca && state.currentEntries < cfg.dcaCount) {
                if (state.livePnlPct <= -cfg.dcaDropPct) { logMsg = `📉 DCA Triggered (${state.livePnlPct.toFixed(2)}%). Extra Entry!`; buySignal = true; }
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

                logMsg += ` | BB Top: ${upper.toFixed(2)} | VolSpike: ${volSpike ? 'Yes' : 'No'}`;
                if (botCurrentClose < lower && volSpike && state.totalVolume === 0) buySignal = true; 
                if (botCurrentClose > upper && state.totalVolume > 0) sellSignal = true;
              }
          }

          if (cfg.useTrailing) {
             if (buySignal && state.phase === 'WAITING') {
                state.phase = 'TRAILING_BUY'; state.extremePrice = botCurrentClose; 
                logMsg = `📉 Start Trailing Buy. Bottom: $${botCurrentClose.toFixed(4)}`; buySignal = false; 
             } else if (sellSignal && state.phase === 'WAITING') {
                state.phase = 'TRAILING_SELL'; state.extremePrice = botCurrentClose; 
                logMsg = `📈 Start Trailing Sell. Peak: $${botCurrentClose.toFixed(4)}`; sellSignal = false;
             }

             if (state.phase === 'TRAILING_BUY') {
                if (botCurrentClose < state.extremePrice) { state.extremePrice = botCurrentClose; logMsg = `👇 New bottom: $${botCurrentClose.toFixed(4)}`; buySignal = false; } 
                else if (botCurrentClose >= state.extremePrice * (1 + cfg.trailingPct/100)) { buySignal = true; state.phase = 'WAITING'; logMsg = `🟢 Reversal! Buy signal confirmed.`; } 
                else { logMsg += ` | Waiting for reversal...`; buySignal = false; }
             } else if (state.phase === 'TRAILING_SELL') {
                if (botCurrentClose > state.extremePrice) { state.extremePrice = botCurrentClose; logMsg = `👆 New peak: $${botCurrentClose.toFixed(4)}`; sellSignal = false; } 
                else if (botCurrentClose <= state.extremePrice * (1 - cfg.trailingPct/100)) { sellSignal = true; state.phase = 'WAITING'; logMsg = `🔴 Reversal! Sell signal confirmed.`; } 
                else { logMsg += ` | Waiting for reversal...`; sellSignal = false; }
             }
          }

          if (logMsg !== updatedBot.lastLog) {
             updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: logMsg, type: 'info' }].slice(-50);
             updatedBot.lastLog = logMsg; hasUpdates = true;
          }

          if ((buySignal || sellSignal) && cfg.useAiFilter) {
              updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `🧠 Asking AI for verification... (Min ${cfg.aiMinConfidence}%)`, type: 'info' }].slice(-50);
              hasUpdates = true; 
              try {
                  const recentDataStr = data.slice(-40).map(d => `T:${new Date(d.time*1000).getHours()}:${new Date(d.time*1000).getMinutes()} C:${d.close.toFixed(2)}`).join(',');
                  const res = await fetch('http://localhost:3001/api/ai/analyze', {
                      method: 'POST', headers: getApiHeaders(),
                      body: JSON.stringify({ pair: updatedBot.pair.display, timeframe: cfg.timeframe, data: recentDataStr })
                  });
                  const aiResult = await res.json();
                  
                  const aiMsg = `🧠 AI: ${aiResult.bias} (${aiResult.confidence}%). Advice: ${aiResult.advice}`;
                  updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: aiMsg, type: 'info' }].slice(-50);
                  
                  if (aiResult.confidence < cfg.aiMinConfidence) {
                      updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ Cancelled: AI Confidence too low.`, type: 'error' }].slice(-50);
                      buySignal = false; sellSignal = false;
                  } else if (buySignal && aiResult.bias !== 'BULLISH') {
                      updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ Buy Cancelled: AI trend is not Bullish.`, type: 'error' }].slice(-50);
                      buySignal = false;
                  } else if (sellSignal && aiResult.bias !== 'BEARISH') {
                      updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ Sell Cancelled: AI trend is not Bearish.`, type: 'error' }].slice(-50);
                      sellSignal = false;
                  }
              } catch (err) {
                  updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `❌ AI Error, trade skipped.`, type: 'error' }].slice(-50);
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
                  updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `⏳ Verifying Buy Order: ${volumeToBuy} ${updatedBot.pair.base}...`, type: 'info' }].slice(-50);
                  hasUpdates = true;
                  try {
                      const response = await fetch('http://localhost:3001/api/order', { 
                          method: 'POST', headers: getApiHeaders(), 
                          body: JSON.stringify({ pair: updatedBot.pair.altname, type: 'buy', ordertype: 'market', volume: volumeToBuy }) 
                      });
                      const apiData = await response.json();
                      if (apiData.error) {
                          updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ BUY REJECTED: ${apiData.error}`, type: 'error' });
                      } else {
                          updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `✅ BUY SUCCESSFUL @ $${botCurrentClose.toFixed(2)}`, type: 'buy' });
                          state.lastAction = 'BUY'; state.lastTradeTime = nowMs;
                          const oldTotalValue = state.totalVolume * state.averageEntryPrice;
                          const newTotalValue = oldTotalValue + (volumeToBuy * botCurrentClose);
                          state.totalVolume += volumeToBuy; state.averageEntryPrice = newTotalValue / state.totalVolume; state.currentEntries += 1;
                          
                          const newTrade = { id: 'bot-' + Date.now(), time: Math.floor(nowMs / 1000), date: new Date(nowMs).toLocaleString([], {month: 'short', day: '2-digit', hour: '2-digit', minute:'2-digit'}), pair: updatedBot.pair.display, type: 'market', side: 'Long', price: botCurrentClose, amount: volumeToBuy, fee: 0, cost: volumeToBuy * botCurrentClose, pnl: 0 };
                          setTradeHistory(prev => [newTrade, ...prev]); setPositions(prev => [...prev, newTrade]);
                          if (fetchOrdersRef.current) setTimeout(fetchOrdersRef.current, 2000);
                      }
                  } catch (err) { updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ SERVER ERROR: Buy failed.`, type: 'error' }); }
              }
          } 
          else if (sellSignal && state.totalVolume > 0) {
             const volToSell = Number(state.totalVolume.toFixed(8));
             updatedBot.logs = [...updatedBot.logs, { time: new Date().toLocaleTimeString(), msg: `⏳ Verifying Sell Order: ${volToSell} ${updatedBot.pair.base}...`, type: 'info' }].slice(-50);
             hasUpdates = true;
             try {
                 const response = await fetch('http://localhost:3001/api/order', { 
                     method: 'POST', headers: getApiHeaders(), 
                     body: JSON.stringify({ pair: updatedBot.pair.altname, type: 'sell', ordertype: 'market', volume: volToSell }) 
                 });
                 const apiData = await response.json();
                 if (apiData.error) {
                     updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ SELL REJECTED: ${apiData.error}`, type: 'error' });
                 } else {
                     updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `✅ SELL SUCCESSFUL @ $${botCurrentClose.toFixed(2)}`, type: 'sell' });
                     const pnl = (botCurrentClose - state.averageEntryPrice) * state.totalVolume;
                     stats.trades.push({ type: 'SELL', price: botCurrentClose, pnl, time: nowMs });
                     if (pnl > 0) { stats.winCount++; stats.grossProfit += pnl; } else { stats.lossCount++; stats.grossLoss += Math.abs(pnl); }
                     state.lastAction = 'SELL'; state.lastTradeTime = nowMs; state.averageEntryPrice = 0; state.totalVolume = 0; state.currentEntries = 0;
                     
                     const newTrade = { id: 'bot-' + Date.now(), time: Math.floor(nowMs / 1000), date: new Date(nowMs).toLocaleString([], {month: 'short', day: '2-digit', hour: '2-digit', minute:'2-digit'}), pair: updatedBot.pair.display, type: 'market', side: 'Short', price: botCurrentClose, amount: volToSell, fee: 0, cost: volToSell * botCurrentClose, pnl: pnl };
                     setTradeHistory(prev => [newTrade, ...prev]); setPositions(prev => [...prev, newTrade]);
                     if (fetchOrdersRef.current) setTimeout(fetchOrdersRef.current, 2000);
                 }
             } catch (err) { updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ SERVER ERROR: Sell failed.`, type: 'error' }); }
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

  // ==========================================
  // 📜 FETCH ORDERS & HISTORY
  // ==========================================
  const fetchOrders = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/orders', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) return;
      if (data.open) {
        const openArr = Object.values(data.open).map(o => ({ id: o.descr.txid || Math.random().toString(), time: Math.floor(parseFloat(o.opentm)), date: new Date(o.opentm * 1000).toLocaleString([], {month: 'short', day: '2-digit', hour: '2-digit', minute:'2-digit'}), pair: o.descr.pair, type: o.descr.ordertype, side: o.descr.type === 'buy' ? 'Long' : 'Short', price: parseFloat(o.descr.price), amount: parseFloat(o.vol), fee: 0, pnl: 0 }));
        setOpenOrders(openArr);
      }
      if (data.trades) {
        const tradesArr = Object.values(data.trades).map(t => ({ id: t.ordertxid || Math.random().toString(), time: Math.floor(parseFloat(t.time)), date: new Date(t.time * 1000).toLocaleString([], {month: 'short', day: '2-digit', hour: '2-digit', minute:'2-digit'}), pair: t.pair, type: t.ordertype, side: t.type === 'buy' ? 'Long' : 'Short', price: parseFloat(t.price), amount: parseFloat(t.vol), fee: parseFloat(t.fee), cost: parseFloat(t.cost), pnl: 0 })).sort((a,b) => b.time - a.time);
        setTradeHistory(tradesArr); setPositions(tradesArr); 
      }
    } catch (e) { }
  };
  useEffect(() => { fetchOrdersRef.current = fetchOrders; });

  // ==========================================
  // 💰 FETCH BALANCES & EQUITY
  // ==========================================
  const fetchBalances = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.join ? data.error.join(', ') : data.error);
      
      const newBalances = { ...balances };
      let cleanBalances = {};
      Object.keys(data).forEach(k => { 
          let cleanKey = k.replace('Z', '').replace('X', ''); 
          if (k === 'ZUSD') cleanKey = 'USD'; 
          if (k === 'XXBT') cleanKey = 'BTC'; 
          newBalances[cleanKey] = parseFloat(data[k]); 
          cleanBalances[cleanKey] = parseFloat(data[k]);
      });
      setBalances(newBalances); 
      setIsLoggedIn(true);

      let estTotal = cleanBalances['USD'] || 0;
      const heldCryptos = Object.keys(cleanBalances).filter(k => k !== 'USD' && cleanBalances[k] > 0.00001);
      
      if (heldCryptos.length > 0) {
          const pairQuery = heldCryptos.map(c => {
              if (c === 'BTC') return 'XXBTZUSD';
              if (c === 'ETH') return 'XETHZUSD';
              return `${c}USD`;
          }).join(',');

          try {
              const tickRes = await fetch('http://localhost:3001/api/ticker', { 
                  method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ pair: pairQuery }) 
              });
              const tickData = await tickRes.json();
              if (tickData.result) {
                  heldCryptos.forEach(c => {
                      let krakKey = c === 'BTC' ? 'XXBTZUSD' : c === 'ETH' ? 'XETHZUSD' : `${c}USD`;
                      let pairInfo = tickData.result[krakKey] || tickData.result[`X${c}ZUSD`] || tickData.result[`${c}ZUSD`];
                      if (pairInfo && pairInfo.c) {
                          estTotal += cleanBalances[c] * parseFloat(pairInfo.c[0]); 
                      }
                  });
              }
          } catch (e) { console.error("Error fetching live prices", e); }
      }

      const now = Math.floor(Date.now() / 1000);
      setEquityCurve(prev => {
          if (prev.length === 0) { 
              const newCurve = [{ time: now, value: estTotal }]; 
              localStorage.setItem('kraken_equity_curve', JSON.stringify(newCurve)); 
              return newCurve; 
          }
          const last = prev[prev.length - 1];
          if (now - last.time > 60 || Math.abs(last.value - estTotal) > 0.5) { 
              const newCurve = [...prev, { time: now, value: estTotal }]; 
              const trimmedCurve = newCurve.slice(-500); 
              localStorage.setItem('kraken_equity_curve', JSON.stringify(trimmedCurve)); 
              return trimmedCurve; 
          }
          return prev;
      });

      setTimeout(() => fetchOrders(), 1000); 
    } catch (err) { setIsLoggedIn(false); }
  };

  const hasFetchedBalance = useRef(false);
  useEffect(() => {
    if (hasFetchedBalance.current) return;
    hasFetchedBalance.current = true;
    fetchBalances();

    fetch('http://localhost:3001/api/bots')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setBots(data);
      })
      .catch(err => console.error("Kon bots niet laden:", err));

    const interval = setInterval(fetchBalances, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      if (bots.length === 0) return; // Voorkom het overschrijven met een lege lijst bij opstarten
      
      fetch('http://localhost:3001/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bots)
      }).catch(err => console.error("Kon bots niet opslaan:", err));
    }, [bots]);

  const saveSettings = () => {
      localStorage.setItem('trading_api_keys', JSON.stringify(apiKeys));
      setShowSettings(false);
      window.location.reload(); 
  };

  const handlePairSelect = (pair) => { setGridPairs(prev => { const newGrid = [...prev]; newGrid[activeIndex] = pair; return newGrid; }); setIsDropdownOpen(false); setSearchTerm(''); };
  const handleSignalChange = (signalKey, field, value) => { setSignals(prev => { const newState = { ...prev, [signalKey]: { ...prev[signalKey], [field]: value } }; if (signalKey === 'macd' && value === true) newState.rsi.active = false; if (signalKey === 'rsi' && value === true) newState.macd.active = false; return newState; }); };
  const openPopout = (pair) => { if (!pair) return; const newWin = window.open('', '', 'width=800,height=430,left=200,top=200'); if (!newWin) return alert("Pop-ups are blocked. Please allow pop-ups in your browser."); setPopoutCharts(prev => [...prev, { pair, win: newWin }]); };
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
    if (!amt || amt <= 0) return alert('Please enter a valid amount.');
    try {
      const payload = { pair: activePair.altname, type: side === 'Buy' ? 'buy' : 'sell', ordertype: orderType.toLowerCase(), volume: amt };
      if (orderType === 'Limit') payload.price = p;
      if (useSL && slInput) payload.slPrice = parseFloat(slInput);
      if (useTP && tpInput) payload.tpPrice = parseFloat(tpInput);

      const res = await fetch('http://localhost:3001/api/order', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.join ? data.error.join(', ') : data.error);

      alert(`Order successfully placed! TXID: ${data.txid?.join(', ')}`);
      setTimeout(() => { fetchBalances(); fetchOrders(); }, 1500); 
      setAmountInput(''); setTotalInput(''); setUseSL(false); setUseTP(false);
    } catch (err) { alert('Error placing order:\n' + err.message); }
  };

  const cancelOrder = async (txid) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      const res = await fetch('http://localhost:3001/api/cancel-order', { method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ txid }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.join ? data.error.join(', ') : data.error);
      alert('Order successfully cancelled!'); fetchOrders();
    } catch (err) { alert('Error cancelling: ' + err.message); }
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

  // ✨ NIEUW: Logica om een bot te starten vanuit de Screener
  const handleDeployFromScreener = (coin) => {
    const newBot = { 
      id: Math.random().toString(), 
      pair: { id: coin.id, altname: coin.alt, display: coin.display, wsname: coin.display.replace('USD', '/USD') }, 
      strategy: 'RSI_TREND', 
      isRunning: false, 
      state: { phase: 'WAITING', currentPrice: coin.price, lastAction: 'NONE', averageEntryPrice: 0, totalVolume: 0, livePnl: 0, livePnlPct: 0, consecutiveLosses: 0 }, 
      stats: { trades: [], winCount: 0, lossCount: 0, grossProfit: 0, grossLoss: 0 },
      logs: [{time: new Date().toLocaleTimeString(), msg: `🚀 Bot created via Screener for ${coin.display}`, type: 'success'}], 
      config: { 
          timeframe: '15m', sizingType: 'percent', tradePercent: 10,
          slPct: 3.0, tpPct: 6.0, useTrailing: true, trailingPct: 0.5,
          rsiPeriod: 14, rsiBuyLevel: 30, rsiSellLevel: 70,
          cooldownMins: 15
      }
    };
    setBots(prev => [...prev, newBot]);
    setCurrentView('bots');
  };

  const renderTableBody = () => {
    const isOpenOrdersTab = activeTab.includes('open'); const isHistoryTab = activeTab.includes('trade');
    const data = isOpenOrdersTab ? openOrders : (isHistoryTab ? tradeHistory : positions);
    if (data.length === 0) return <tr><td colSpan={isHistoryTab ? "7" : "6"} className="py-8 text-center text-zinc-600">No active data in this tab</td></tr>;

    return data.map((item) => (
      <tr key={item.id} className="hover:bg-zinc-800/30 transition border-b border-zinc-800/50 group text-[11px]">
        <td className="px-4 py-1.5 text-zinc-400">{item.date}</td>
        <td className="px-4 py-1.5 font-bold text-zinc-200">{item.pair}</td>
        <td className="px-4 py-1.5 text-blue-500 uppercase">{item.type}</td>
        <td className={`px-4 py-1.5 font-bold tracking-wider ${item.side === 'Long' ? 'text-emerald-500' : 'text-rose-500'}`}>{item.side === 'Long' ? 'BUY' : 'SELL'}</td>
        <td className="px-4 py-1.5 font-mono">{item.price >= 10 ? item.price.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : item.price}</td>
        <td className="px-4 py-1.5 font-mono">{item.amount.toFixed(4)}</td>
        {isHistoryTab && <td className="px-4 py-1.5 font-mono text-amber-500/80">${item.fee?.toFixed(2)}</td>}
        {!isHistoryTab && !isOpenOrdersTab && <td className={`px-4 py-1.5 text-right font-mono ${item.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{item.pnl >= 0 ? '+' : ''}${item.pnl.toFixed(4)}</td>}
        {isOpenOrdersTab && <td className="px-4 py-1.5 text-right"><button onClick={() => cancelOrder(item.id)} className="text-rose-500 hover:text-white hover:bg-rose-600 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold transition shadow-sm">Cancel</button></td>}
      </tr>
    ));
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-300 font-sans text-sm overflow-hidden">
      {/* ⚙️ API Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0b0e11] border border-zinc-800 p-6 rounded-2xl w-[400px] shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-bold flex items-center gap-2"><KeyRound size={18} className="text-blue-500"/> API Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-rose-500"><X size={20}/></button>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Kraken API Key</label>
                  <input type="text" value={apiKeys.krakenKey} onChange={e => setApiKeys({...apiKeys, krakenKey: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Leave blank for backend default" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Kraken API Secret</label>
                  <input type="password" value={apiKeys.krakenSecret} onChange={e => setApiKeys({...apiKeys, krakenSecret: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Leave blank for backend default" />
                </div>
                <div className="h-px bg-zinc-800/50 my-2"></div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Gemini API Key (Optional for AI)</label>
                  <input type="password" value={apiKeys.geminiKey} onChange={e => setApiKeys({...apiKeys, geminiKey: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Leave blank for backend default" />
                </div>
                <button onClick={saveSettings} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition mt-4 active:scale-95">Save & Restart</button>
              </div>
          </div>
        </div>
      )}

      {popoutCharts.map((pop, i) => (
        <PopoutWindow key={`popout-${i}`} title={`Trading - ${pop.pair?.display}`} externalWindow={pop.win} onClose={() => closePopout(i)}>
          <div className="flex-1 flex flex-col h-screen w-full overflow-hidden bg-[#09090b]">
             <TradingChart pair={pop.pair} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={tradeHistory} scriptLoaded={scriptLoaded} isActive={false} isDrawingMode={isDrawingMode} externalWindow={pop.win} />
          </div>
        </PopoutWindow>
      ))}

      <nav className="w-14 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center py-4 space-y-6 z-10 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20"><Activity size={20} className="text-white" /></div>
        
        <button onClick={() => setCurrentView('charts')} className={`p-2 rounded-lg transition ${currentView === 'charts' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Charts"><LineChart size={20} /></button>
        
        {/* ✨ NIEUWE KNOP: SCREENER */}
        <button onClick={() => setCurrentView('screener')} className={`p-2 rounded-lg transition ${currentView === 'screener' ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Market Screener"><Zap size={20} /></button>
        
        <button onClick={() => setCurrentView('ai')} className={`p-2 rounded-lg transition ${currentView === 'ai' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Gemini AI"><Sparkles size={20} /></button>
        
        <button onClick={() => setCurrentView('portfolio')} className={`p-2 rounded-lg transition ${currentView === 'portfolio' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Portfolio"><Wallet size={20} /></button>
        
        <button onClick={() => setCurrentView('bots')} className={`p-2 rounded-lg transition mt-4 ${currentView === 'bots' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Bot Manager"><Bot size={20} /></button>
        
        <div className="flex-1"></div>
        <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-500 hover:text-zinc-300" title="API Settings"><Settings size={20} /></button>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-[#09090b] border-b border-zinc-800 flex items-center px-4 shrink-0 relative">
          <div className="relative z-50">
            <div className="flex items-center cursor-pointer hover:bg-zinc-800/50 px-2 py-1 rounded transition border border-transparent hover:border-zinc-700" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <span className="font-bold text-lg text-zinc-100">{activePair.display.replace('XBT', 'BTC')}</span><ChevronDown size={16} className="ml-1 text-zinc-500" />
            </div>
            {isDropdownOpen && (
              <div className="absolute top-12 left-0 w-64 bg-[#0b0e11] border border-zinc-700 rounded-lg shadow-2xl flex flex-col max-h-[400px]">
                <div className="p-2 border-b border-zinc-800 relative"><Search size={16} className="absolute left-4 top-4 text-zinc-500" /><input type="text" placeholder="Search pair..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 pl-8 text-xs text-white outline-none focus:border-blue-500" autoFocus /></div>
                <div className="flex-1 overflow-y-auto">
                  {filteredPairs.map(p => (<div key={p.id} onClick={() => handlePairSelect(p)} className="px-4 py-2 hover:bg-zinc-800 cursor-pointer text-sm font-medium flex justify-between items-center transition"><span className="text-zinc-200">{p.display.replace('XBT', 'BTC')}</span><span className="text-zinc-500 text-[10px] uppercase">Kraken</span></div>))}
                </div>
              </div>
            )}
          </div>
          <div className="h-8 w-px bg-zinc-800 mx-4"></div>
          <div className="flex items-center space-x-6 text-[11px] font-mono">
            <div className="flex flex-col"><span className="text-emerald-500 font-bold text-sm">${formatPrice(currentPrice)}</span><span className="text-zinc-500 uppercase tracking-tighter">Live Price</span></div>
            <div className="flex flex-col"><span className="text-zinc-200 font-bold">${(balances[activePair.quote] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span><span className="text-zinc-500 uppercase tracking-tighter">{activePair.quote} Balance</span></div>
            <div className="flex flex-col"><span className="text-zinc-200 font-bold">{(balances[activePair.base] || 0).toFixed(4)}</span><span className="text-zinc-500 uppercase tracking-tighter">{activePair.base.replace('XBT', 'BTC')} Balance</span></div>
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center pl-6 border-l border-zinc-800 ml-4">
            {isLoggedIn ? (
              <div className="flex items-center space-x-4"><div className="flex items-center text-zinc-400 cursor-pointer transition" onClick={() => setShowSettings(true)}><div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center mr-2 text-white"><User className="w-4 h-4" /></div><span className="text-xs font-medium mr-2 text-emerald-500">API Connected</span></div></div>
            ) : (
              <button onClick={() => setShowSettings(true)} className="text-xs text-rose-500 px-3 py-1 bg-rose-500/10 rounded font-medium border border-rose-500/20 animate-pulse hover:bg-rose-500/20 transition cursor-pointer">
                Server Offline or API Error (Click)
              </button>
            )}
          </div>
        </header>

        {/* --- VIEW SWITCHER --- */}
        {currentView === 'screener' && <ScreenerView onDeployBot={handleDeployFromScreener} />}
        {currentView === 'ai' && <AiAdvisorView activePair={activePair} aiMessages={aiMessages} setAiMessages={setAiMessages} timeframe={timeframe} />}
        {currentView === 'portfolio' && <PortfolioView balances={balances} scriptLoaded={scriptLoaded} equityCurve={equityCurve} onRefresh={fetchBalances} tradeHistory={tradeHistory} />}
        {currentView === 'bots' && <BotManagerView bots={bots} setBots={setBots} availablePairs={availablePairs} activePair={activePair} />}

        {currentView === 'charts' && (
          <div className="flex-1 flex min-h-0 relative">
            <div className="flex-1 flex flex-col border-r border-zinc-800 min-w-0 relative">
              <button onClick={() => setShowRightPanel(!showRightPanel)} className="absolute top-1/2 -right-3.5 z-50 transform -translate-y-1/2 bg-zinc-800 border border-zinc-700 w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white shadow-xl transition-all hover:scale-110 active:scale-90" title={showRightPanel ? "Close sidebar" : "Open sidebar"}>{showRightPanel ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>

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
                  <button onClick={() => setIsDrawingMode(!isDrawingMode)} className={`flex items-center space-x-1 px-2 py-1 rounded transition ${isDrawingMode ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="Draw Line"><Crosshair size={14} /> <span>Draw Line</span></button>
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
                  {[`Open Orders (${openOrders.length})`, `Positions (${positions.length})`, `Trade History (${tradeHistory.length})`].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab.split(' ')[0].toLowerCase())} className={`py-2 px-4 text-[10px] font-bold uppercase border-b-2 transition ${activeTab.includes(tab.split(' ')[0].toLowerCase()) ? 'border-blue-500 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{tab}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="text-[10px] uppercase text-zinc-500 sticky top-0 bg-[#09090b] z-20 border-b border-zinc-800">
                      <tr className="h-8">
                        <th className="px-4 font-normal">Date & Time</th><th className="px-4 font-normal">Pair</th><th className="px-4 font-normal">Side</th><th className="px-4 font-normal">Price</th><th className="px-4 font-normal">Amount</th>{!activeTab.includes('open') && <th className="px-4 font-normal">{activeTab.includes('trade') ? 'Fee' : 'PnL'}</th>}<th className="px-4 font-normal text-right">{activeTab.includes('open') ? 'Action' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>{renderTableBody()}</tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* DRAG RESIZER */}
            {showRightPanel && (
              <div 
                className="w-1.5 bg-zinc-900 hover:bg-blue-500 cursor-col-resize z-50 flex-shrink-0 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizing(true);
                  const startX = e.clientX;
                  const startWidth = rightPanelWidth;
                  const onMouseMove = (moveEvent) => {
                     const delta = startX - moveEvent.clientX; // movement left = panel bigger
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
                  <div className="h-10 border-b border-zinc-800 flex items-center px-3 justify-between font-sans bg-[#09090b] text-[10px] uppercase font-bold tracking-widest">Orderbook</div>
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto flex flex-col justify-end">
                      {orderBook.asks.map((ask, i) => (<div key={`ask-${i}`} className="relative flex justify-between px-3 py-0.5 hover:bg-zinc-800/50 cursor-pointer" onClick={() => setPriceInput(ask.price.toString())}><div className="absolute right-0 top-0 bottom-0 bg-rose-500/10" style={{ width: `${ask.depth}%` }}></div><span className="w-1/2 text-rose-500 z-10">{formatPrice(ask.price)}</span><span className="w-1/2 text-right text-zinc-300 z-10">{ask.volume.toFixed(3)}</span></div>))}
                    </div>
                    <div className="py-2 border-y border-zinc-800 flex items-center justify-center bg-zinc-900/50 font-bold text-emerald-500">${formatPrice(currentPrice)}</div>
                    <div className="flex-1 overflow-y-auto">
                      {orderBook.bids.map((bid, i) => (<div key={`bid-${i}`} className="relative flex justify-between px-3 py-0.5 hover:bg-zinc-800/50 cursor-pointer" onClick={() => setPriceInput(bid.price.toString())}><div className="absolute right-0 top-0 bottom-0 bg-emerald-500/10" style={{ width: `${bid.depth}%` }}></div><span className="w-1/2 text-emerald-500 z-10">{formatPrice(bid.price)}</span><span className="text-zinc-200 z-10">{bid.volume.toFixed(3)}</span></div>))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col bg-[#0b0e11]" style={{ width: '55%' }}>
                  <div className="h-10 border-b border-zinc-800 flex items-center px-4 text-[10px] font-bold uppercase tracking-widest bg-[#09090b]">Place Order</div>
                  <div className="p-4 flex flex-col h-full space-y-4 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                    <div className="flex bg-[#09090b] p-1 rounded-lg border border-zinc-800"><button onClick={() => setTradeSide('Buy')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${tradeSide === 'Buy' ? 'bg-emerald-600/20 text-emerald-500' : 'text-zinc-500'}`}>BUY</button><button onClick={() => setTradeSide('Sell')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${tradeSide === 'Sell' ? 'bg-rose-600/20 text-rose-500' : 'text-zinc-500'}`}>SELL</button></div>
                    <div className="flex bg-[#09090b] p-1 rounded-lg border border-zinc-800">{['Limit', 'Market'].map(type => (<button key={type} onClick={() => setOrderType(type)} className={`flex-1 py-1 text-[10px] font-bold rounded uppercase transition ${orderType === type ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500'}`}>{type}</button>))}</div>
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500"><span>Balance</span><span className="text-zinc-200">{tradeSide === 'Buy' ? (balances[activePair.quote] || 0).toLocaleString('en-US', {minimumFractionDigits: 2}) : (balances[activePair.base] || 0).toFixed(6)} {tradeSide === 'Buy' ? activePair.quote : activePair.base.replace('XBT', 'BTC')}</span></div>
                      <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-2 focus-within:border-blue-500"><div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1"><span>Price</span><span>{activePair.quote}</span></div><input type="number" disabled={orderType === 'Market'} value={orderType === 'Market' ? '' : priceInput} onChange={(e) => onPriceChange(e.target.value)} placeholder={orderType === 'Market' ? 'MARKET' : '0.00'} className="w-full bg-transparent text-zinc-100 font-mono outline-none text-sm" /></div>
                      <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-2 focus-within:border-blue-500"><div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1"><span>Amount</span><span>{activePair.base.replace('XBT', 'BTC')}</span></div><input type="number" value={amountInput} onChange={(e) => onAmountChange(e.target.value)} placeholder="0.00" className="w-full bg-transparent text-zinc-100 font-mono outline-none text-sm" /></div>
                      <div className="flex justify-between gap-1">{[25, 50, 75, 100].map(pct => (<button key={pct} onClick={() => handleSliderClick(pct)} className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-[9px] rounded font-bold">{pct}%</button>))}</div>
                      <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-2 focus-within:border-blue-500"><div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1"><span>Total</span><span>{activePair.quote}</span></div><input type="number" value={totalInput} onChange={(e) => onTotalChange(e.target.value)} placeholder="0.00" className="w-full bg-transparent text-zinc-100 font-mono outline-none text-sm" /></div>
                      <div className="bg-[#09090b] border border-zinc-800/50 rounded-lg p-3 space-y-3">
                         <div className="flex items-center justify-between"><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} className="accent-rose-500 w-3 h-3" /><span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider flex items-center gap-1"><ShieldAlert size={12}/> Stop-Loss</span></label>{useSL && <input type="number" placeholder="Price" value={slInput} onChange={e => setSlInput(e.target.value)} className="w-24 bg-[#050505] border border-rose-900/50 rounded px-2 py-1 text-xs text-rose-400 outline-none focus:border-rose-500 font-mono" />}</div>
                         <div className="h-px bg-zinc-800/50"></div>
                         <div className="flex items-center justify-between"><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={useTP} onChange={e => setUseTP(e.target.checked)} className="accent-emerald-500 w-3 h-3" /><span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1"><Target size={12}/> Take-Profit</span></label>{useTP && <input type="number" placeholder="Price" value={tpInput} onChange={e => setTpInput(e.target.value)} className="w-24 bg-[#050505] border border-emerald-900/50 rounded px-2 py-1 text-xs text-emerald-400 outline-none focus:border-emerald-500 font-mono" />}</div>
                      </div>
                      
                      {isLoggedIn ? (
                        <button onClick={() => executeOrder(tradeSide)} className={`w-full py-3.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg transition active:scale-95 ${tradeSide === 'Buy' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20'}`}>{tradeSide === 'Buy' ? 'Open Buy Order' : 'Open Sell Order'}</button>
                      ) : (
                        <button onClick={() => setShowSettings(true)} className="w-full bg-rose-900/20 text-rose-500 font-bold py-3.5 rounded-lg transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer border border-rose-500/20 hover:bg-rose-900/40">Enter API Keys</button>
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