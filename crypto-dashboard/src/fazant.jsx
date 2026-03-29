import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { calculateSMA, calculateEMA, calculateMACD, calculateBB, calculateRSI } from './utils/indicators';
import { tfMap, getApiHeaders, fetchKrakenPairs, fetchKrakenOHLC, fetchCoinbaseBalances } from './utils/api';
import PortfolioView from './components/PortfolioView';
import WhaleHubView from './components/WhaleHubView';
import AiAdvisorView from './components/AiAdvisorView';
import BotManagerView from './components/BotManagerView';
import ScreenerView from './components/ScreenerView'; // ✅ Toegevoegd
import MasterDashboardView from './components/MasterDashboardView'; // ✅ Toegevoegd
import { useKrakenMarketData } from './utils/websocket';
import TradingChart, { PopoutWindow } from './components/TradingChart';
import { 
  Settings, BarChart2, Activity, Layers, ChevronDown, LineChart, Bot, Wallet, 
  Maximize2, Search, User, LayoutGrid, Square, ExternalLink, Zap, // ✅ Zap toegevoegd
  ChevronRight, ChevronLeft, Sparkles, Send, X, Trash2, Plus, Play, Pause, Crosshair,
  ShieldAlert, Target, TrendingUp, AlertTriangle, Clock, ArrowDownToLine, KeyRound, Waves, LayoutDashboard
} from 'lucide-react';

// ==========================================
// 🟢 MAIN COMPONENT
// ==========================================
export default function TradingDashboard() {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
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
    try { 
      return JSON.parse(localStorage.getItem('trading_api_keys')) || 
      { krakenKey: '', krakenSecret: '', geminiKey: '', cbKey: '', cbSecret: '' }; 
    }
    catch { return { krakenKey: '', krakenSecret: '', geminiKey: '', cbKey: '', cbSecret: '' }; }
  });
  
  const [aiMessages, setAiMessages] = useState([{ role: 'model', text: `Hello! I am your Google Gemini Trading Advisor.` }]);
  const activePair = gridPairs[activeIndex] || { id: 'XXBTZUSD', altname: 'XBTUSD', display: 'BTC/USD', base: 'BTC', quote: 'USD', wsname: 'XBT/USD' };

  const [layout, setLayout] = useState(1);
  const [popoutCharts, setPopoutCharts] = useState([]);
  const [showVolume, setShowVolume] = useState(false);
  const [timeframe, setTimeframe] = useState('1m');
  
  const [signals, setSignals] = useState({
    sma1: { active: false, period: 50, color: '#2962FF' }, sma2: { active: false, period: 200, color: '#FF6D00' },
    bb: { active: false, period: 20, stdDev: 2, color: '#9c27b0' }, rsi: { active: true, period: 14, color: '#e91e63' },
    macd: { active: false, color: '#2962FF' }
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balances, setBalances] = useState([]);
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
  const playTradeSound = (type) => {
    try {
      const audio = new Audio(type === 'buy' ? '/sounds/buy.mp3' : '/sounds/sell.mp3');
      audio.volume = 0.5; // Zet het volume op 50% zodat je niet schrikt
      audio.play();
    } catch (error) {
      console.error("Geluid kon niet worden afgespeeld:", error);
    }
  };

  const [bots, setBots] = useState([]); 
  const [whaleTrades, setWhaleTrades] = useState([]); // Voeg deze regel toe
  const botsRef = useRef(bots);
  const balancesRef = useRef(balances);
  const fetchOrdersRef = useRef(null);
  
  useEffect(() => { botsRef.current = bots; }, [bots]);
  useEffect(() => { balancesRef.current = balances; }, [balances]);

  useEffect(() => {
  const fetchWhales = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/whales');
      const data = await res.json();
      setWhaleTrades(data);
    } catch (e) {
      console.error("Whale fetch error in main dashboard", e);
    }
  };

  fetchWhales();
  const interval = setInterval(fetchWhales, 30000); // Elke 30 sec verversen
  return () => clearInterval(interval);
}, []);



    // ==========================================
    // 🤖 BOT ENGINE 2.0 (English UI & Logs)
    // ==========================================
    useEffect(() => {
    const engineInterval = setInterval(async () => {
      const currentBots = botsRef.current;
      const currentBalances = balancesRef.current;
      if (currentBots.length === 0) return;

      const updatedBots = await Promise.all(currentBots.map(async (bot) => {
        if (!bot.isRunning || bot.state.isProcessing) return bot; // Stop als bot al bezig is met een order
        
        const updatedBot = JSON.parse(JSON.stringify(bot)); // Deep copy om state vervuiling te voorkomen
        const { config: cfg, state, stats } = updatedBot;

        try {
          const tfMins = tfMap[cfg.timeframe] || 1;
          const data = await fetchKrakenOHLC(tfMins, updatedBot.pair.altname);
          if (!data || data.length < 50) return updatedBot;

          const botCurrentClose = data[data.length - 1].close;
          const nowMs = Date.now();
          let buySignal = false, sellSignal = false;
          let logMsg = `[Analytical] ${updatedBot.pair.display} | $${botCurrentClose.toFixed(4)} | RSI: ${state.currentRsi}`;

          // 1. Update Basis State
          state.currentPrice = botCurrentClose;
          if (state.totalVolume > 0 && state.averageEntryPrice > 0) {
            state.livePnlPct = ((botCurrentClose - state.averageEntryPrice) / state.averageEntryPrice) * 100;
          } else {
            state.livePnlPct = 0;
          }

          // 2. Cooldown & Safety Checks
          const inCooldown = state.lastAction === 'SELL' && (nowMs - state.lastTradeTime < cfg.cooldownMins * 60000);
          
          if (state.totalVolume > 0) {
            if (cfg.slPct > 0 && state.livePnlPct <= -cfg.slPct) { 
              logMsg = `💥 STOP-LOSS TRIGGERED (${state.livePnlPct.toFixed(2)}%)`; 
              sellSignal = true; 
            }
            else if (cfg.tpPct > 0 && state.livePnlPct >= cfg.tpPct) { 
              logMsg = `🎯 TAKE-PROFIT TRIGGERED (${state.livePnlPct.toFixed(2)}%)`; 
              sellSignal = true; 
            }
          }

          // 3. Strategy Logic (RSI / BB)
          if (!buySignal && !sellSignal && (!inCooldown || state.totalVolume > 0)) {
            if (updatedBot.strategy === 'RSI' || updatedBot.strategy === 'RSI_TREND') {
              const rsiVals = calculateRSI(data, cfg.rsiPeriod);
              const rsi = rsiVals[rsiVals.length - 1].value;
              state.currentRsi = rsi.toFixed(1);
              
              let trendUp = true;
              if (updatedBot.strategy === 'RSI_TREND') {
                const sma = calculateSMA(data, 50);
                trendUp = botCurrentClose > sma[sma.length - 1].value;
                logMsg += ` | ${trendUp ? 'Bull' : 'Bear'}`;
              }

              if (rsi <= cfg.rsiBuyLevel && trendUp && state.totalVolume === 0) {
                  buySignal = true;
                  state.isTriggered = true;
              } else if (rsi >= cfg.rsiSellLevel && state.totalVolume > 0) {
                  sellSignal = true;
              } else {
                  state.isTriggered = false;
              }
            }
          }


          // 4. Trailing Intercept & Logic (Opgelost!)
          // 4. Trailing Intercept & Logic (MOET VOOR DE EXECUTIE STAAN)
          if (cfg.useTrailing) {
              if (state.phase === 'WAITING') {
                  if (buySignal) {
                      // KAPERING: Reset het signaal zodat stap 6 niet direct koopt
                      buySignal = false; 
                      state.phase = 'TRAILING_BUY';
                      state.extremePrice = botCurrentClose;
                      logMsg = `⏳ RSI hit! Start Trailing Buy vanaf $${botCurrentClose.toFixed(4)}`;
                  } else if (sellSignal) {
                      // KAPERING: Reset het signaal zodat stap 6 niet direct verkoopt
                      sellSignal = false; 
                      state.phase = 'TRAILING_SELL';
                      state.extremePrice = botCurrentClose;
                      logMsg = `⏳ Target hit! Start Trailing Sell vanaf $${botCurrentClose.toFixed(4)}`;
                  }
              } 
              else if (state.phase === 'TRAILING_BUY') {
                  buySignal = false; // Altijd false houden zolang we in de fase zitten
                  
                  if (botCurrentClose < state.extremePrice) {
                      state.extremePrice = botCurrentClose;
                      logMsg = `👇 Lagere bodem: $${botCurrentClose.toFixed(4)}`;
                  } else if (botCurrentClose >= state.extremePrice * (1 + cfg.trailingPct / 100)) {
                      buySignal = true; // NU pas mag er echt gekocht worden
                      state.phase = 'WAITING';
                      logMsg = `🟢 Trailing Reversal! Kopen op $${botCurrentClose.toFixed(4)}`;
                  } else {
                      logMsg = `📉 Trailing Buy... Wacht op ${cfg.trailingPct}% stijging vanaf $${state.extremePrice.toFixed(4)}`;
                  }
              } else if (state.phase === 'TRAILING_SELL') {
                  sellSignal = false; // Altijd false houden zolang we in de fase zitten
                  
                  if (botCurrentClose > state.extremePrice) {
                      state.extremePrice = botCurrentClose;
                      logMsg = `👆 Hogere piek: $${botCurrentClose.toFixed(4)}`;
                  } else if (botCurrentClose <= state.extremePrice * (1 - cfg.trailingPct / 100)) {
                      sellSignal = true; // NU pas mag er echt verkocht worden
                      state.phase = 'WAITING';
                      logMsg = `🔴 Trailing Reversal! Verkopen op $${botCurrentClose.toFixed(4)}`;
                  } else {
                      logMsg = `📈 Trailing Sell... Wacht op ${cfg.trailingPct}% daling vanaf $${state.extremePrice.toFixed(4)}`;
                  }
              }
          }

          // 5. AI Filter Check (Indien van toepassing)
          if ((buySignal || sellSignal) && cfg.useAiFilter) {
            try {
              const aiRes = await fetch('http://localhost:3001/api/ai/analyze', {
                method: 'POST',
                headers: getApiHeaders(),
                body: JSON.stringify({ pair: updatedBot.pair.display, timeframe: cfg.timeframe, data: data.slice(-20).map(d => d.close).join(',') })
              });
              const aiResult = await aiRes.json();
              state.aiConfidence = aiResult.confidence;
              state.aiBias = aiResult.bias;

              if (aiResult.confidence < cfg.aiMinConfidence || (buySignal && aiResult.bias !== 'BULLISH')) {
                buySignal = false;
                sellSignal = false;
                logMsg += ` | 🧠 AI Blocked Trade (Low Confidence/Wrong Bias)`;
              }
            } catch (e) { buySignal = false; sellSignal = false; }
          }

// 6. Execution (Nu met Coinbase USDC Routing!)
          if (buySignal && state.totalVolume === 0) {
            state.isProcessing = true; 
            
            try {
                const isCoinbase = updatedBot.config?.exchange === 'Coinbase';
                const displayParts = updatedBot.pair.display.split('/');
                const cleanBase = displayParts[0] === 'XBT' ? 'BTC' : displayParts[0];
                const cleanQuote = displayParts[1] || 'USD';
                
                // 🪄 DE MAGISCHE TRUC VOOR DE AUTO-BOT
                let orderPair = updatedBot.pair.altname;
                if (isCoinbase) {
                    const targetQuote = cleanQuote === 'USD' ? 'USDC' : cleanQuote;
                    orderPair = `${cleanBase}-${targetQuote}`;
                }

                let quoteBalance = 0;
                if (isCoinbase) {
                    const resBal = await fetch('http://localhost:3001/api/coinbase/balance', { method: 'POST', headers: getApiHeaders() });
                    const bData = await resBal.json();
                    const acc = bData.find(a => a.currency === cleanQuote);
                    quoteBalance = acc ? acc.amount : 0;
                    if (cleanQuote === 'USD') {
                        const usdcAcc = bData.find(a => a.currency === 'USDC');
                        if (usdcAcc) quoteBalance += usdcAcc.amount;
                    }
                } else {
                    const resBal = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders() });
                    const bData = await resBal.json();
                    const quoteKey = cleanQuote === 'USD' ? 'ZUSD' : (cleanQuote === 'EUR' ? 'ZEUR' : cleanQuote);
                    quoteBalance = parseFloat(bData[quoteKey] || bData[cleanQuote] || 0);
                }

                const safeQuoteBalance = quoteBalance * 0.98;
                const spendAmount = safeQuoteBalance * (cfg.tradePercent / 100);
                const vol = Number((spendAmount / botCurrentClose).toFixed(8));

                if (spendAmount <= 0 || isNaN(vol)) {
                    throw new Error(`Onvoldoende balans op ${updatedBot.config?.exchange || 'Kraken'} (${quoteBalance.toFixed(2)} beschikbaar)`);
                }

                const orderEndpoint = isCoinbase ? 'http://localhost:3001/api/coinbase/order' : 'http://localhost:3001/api/order';
                const res = await fetch(orderEndpoint, {
                  method: 'POST',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ 
                      pair: orderPair, 
                      type: 'buy', 
                      ordertype: 'market', 
                      volume: vol,
                      quoteVolume: spendAmount.toFixed(2)
                  })
                });
                const order = await res.json();
                
                if (!order.error) {
                  state.totalVolume = vol;
                  state.averageEntryPrice = botCurrentClose;
                  state.lastAction = 'BUY';
                  state.lastTradeTime = nowMs;
                  state.phase = 'WAITING'; 
                  playTradeSound('buy');
                  
                  updatedBot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: `✅ AUTO BUY SUCCESS @ $${botCurrentClose.toFixed(4)}`, type: 'buy' });

                  const newBotsArray = botsRef.current.map(b => b.id === updatedBot.id ? updatedBot : b);
                  fetch('http://localhost:3001/api/bots', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newBotsArray)
                  }).catch(err => console.error("Fout bij opslaan bot state:", err));

                  if (typeof fetchBalances === 'function') fetchBalances();
                  if (typeof fetchOrders === 'function') setTimeout(() => fetchOrders(), 2000);

                } else {
                  logMsg = `❌ Auto-Buy Failed: ${isCoinbase ? JSON.stringify(order.error) : order.error}`;
                  updatedBot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'error' });
                  state.phase = 'WAITING'; 
                }
            } catch (err) {
                logMsg = `❌ Pre-Buy Error: ${err.message}`;
                updatedBot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'error' });
                state.phase = 'WAITING';
            }
            state.isProcessing = false; 
          }
          // -- HIER BEGINT DE VERKOOP LOGICA --
          else if (sellSignal && state.totalVolume > 0) {
            state.isProcessing = true;
            try {
                const isCoinbase = updatedBot.config?.exchange === 'Coinbase';
                const displayParts = updatedBot.pair.display.split('/');
                const cleanBase = displayParts[0] === 'XBT' ? 'BTC' : displayParts[0];
                const cleanQuote = displayParts[1] || 'USD';
                
                let orderPair = updatedBot.pair.altname;
                if (isCoinbase) {
                    const targetQuote = cleanQuote === 'USD' ? 'USDC' : cleanQuote;
                    orderPair = `${cleanBase}-${targetQuote}`;
                }

                let actualBaseBalance = 0;
                if (isCoinbase) {
                    const resBal = await fetch('http://localhost:3001/api/coinbase/balance', { method: 'POST', headers: getApiHeaders() });
                    const bData = await resBal.json();
                    const acc = bData.find(a => a.currency === cleanBase);
                    actualBaseBalance = acc ? acc.amount : 0;
                } else {
                    const resBal = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders() });
                    const bData = await resBal.json();
                    const baseKey = cleanBase === 'BTC' ? 'XXBT' : (cleanBase === 'ETH' ? 'XETH' : cleanBase);
                    actualBaseBalance = parseFloat(bData[baseKey] || bData[cleanBase] || 0);
                }

                const volToSell = Math.min(Number(state.totalVolume.toFixed(8)), actualBaseBalance);
                
                if (volToSell <= 0) {
                    throw new Error(`Geen ${cleanBase} positie gevonden om te verkopen.`);
                }

                const orderEndpoint = isCoinbase ? 'http://localhost:3001/api/coinbase/order' : 'http://localhost:3001/api/order';
                const res = await fetch(orderEndpoint, {
                  method: 'POST',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ pair: orderPair, type: 'sell', ordertype: 'market', volume: volToSell })
                });
                const order = await res.json();
                
                if (!order.error) {
                  const pnl = (botCurrentClose - state.averageEntryPrice) * volToSell;
                  const pnlPct = ((botCurrentClose - state.averageEntryPrice) / state.averageEntryPrice) * 100;

                  state.totalVolume = 0;
                  state.averageEntryPrice = 0;
                  state.lastAction = 'SELL';
                  state.lastTradeTime = nowMs;
                  state.phase = 'WAITING';
                  playTradeSound(pnl >= 0 ? 'profit' : 'loss');

                  if (!updatedBot.stats) updatedBot.stats = { trades: [], winCount: 0, lossCount: 0, grossProfit: 0, grossLoss: 0 };
                  updatedBot.stats.trades.push({
                      id: Date.now().toString().slice(-8), time: new Date().toLocaleString(),
                      entryPrice: state.averageEntryPrice, exitPrice: botCurrentClose, volume: volToSell, pnl: pnl, pnlPct: pnlPct
                  });

                  if (pnl >= 0) {
                      updatedBot.stats.winCount++; updatedBot.stats.grossProfit += pnl;
                  } else {
                      updatedBot.stats.lossCount++; updatedBot.stats.grossLoss += Math.abs(pnl);
                  }

                  updatedBot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: `✅ AUTO SELL SUCCESS @ $${botCurrentClose.toFixed(4)}`, type: 'sell' });

                  const newBotsArray = botsRef.current.map(b => b.id === updatedBot.id ? updatedBot : b);
                  fetch('http://localhost:3001/api/bots', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newBotsArray)
                  }).catch(err => console.error("Fout bij opslaan bot state:", err));

                  if (typeof fetchBalances === 'function') fetchBalances();
                  if (typeof fetchOrders === 'function') setTimeout(() => fetchOrders(), 2000);

                } else {
                  logMsg = `❌ Auto-Sell Failed: ${isCoinbase ? JSON.stringify(order.error) : order.error}`;
                  updatedBot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'error' });
                  state.phase = 'WAITING';
                }
            } catch (err) {
                logMsg = `❌ Pre-Sell Error: ${err.message}`;
                updatedBot.logs.unshift({ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'error' });
                state.phase = 'WAITING';
            }
            state.isProcessing = false;
          }

// -- HIER BEGINT DE VERKOOP LOGICA --
          else if (sellSignal && state.totalVolume > 0) {
            state.isProcessing = true; // LOCK AAN
            
            try {
                // 1. Haal EERST de actuele live-balans op van deze specifieke munt
                const displayParts = updatedBot.pair.display.split('/');
                const detectedBase = updatedBot.pair.base || displayParts[0];
                const baseKey = detectedBase === 'BTC' ? 'XXBT' : (detectedBase === 'ETH' ? 'XETH' : detectedBase);
                
                const resBal = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders() });
                const bData = await resBal.json();
                
                // Hoeveel staat er écht in de wallet?
                const actualBaseBalance = parseFloat(bData[baseKey] || bData[detectedBase] || 0);
                
                // Verkoop letterlijk alles wat we hebben van deze munt (met de interne state als fallback)
                const volToSell = actualBaseBalance > 0 ? actualBaseBalance : state.totalVolume;

                // 2. Schiet de verkooporder in met het ECHTE volume
                const res = await fetch('http://localhost:3001/api/order', {
                  method: 'POST',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ pair: updatedBot.pair.altname, type: 'sell', ordertype: 'market', volume: volToSell.toFixed(8) })
                });
                const order = await res.json();

                if (!order.error) {
                  // 3. Bereken Winst/Verlies (We gebruiken state.totalVolume voor de originele investering)
                  const exitPrice = botCurrentClose; 
                  const entryPrice = state.averageEntryPrice || 0;
                  const volume = state.totalVolume || 0;
                  const pnl = (botCurrentClose - state.averageEntryPrice) * state.totalVolume;
                  const pnlPct = ((botCurrentClose - state.averageEntryPrice) / state.averageEntryPrice) * 100;
                  
                stats.trades.push({
                    id: Date.now().toString().slice(-8),
                    time: new Date().toLocaleString(),
                    entryPrice: entryPrice,
                    exitPrice: exitPrice, // ✅ Deze wordt nu expliciet opgeslagen
                    volume: volume,
                    pnl: pnl,
                    pnlPct: pnlPct
                  });
                  
                  if (pnl >= 0) {
                      stats.winCount = (stats.winCount || 0) + 1;
                      stats.grossProfit = (stats.grossProfit || 0) + pnl;
                  } else {
                      stats.lossCount = (stats.lossCount || 0) + 1;
                      stats.grossLoss = (stats.grossLoss || 0) + Math.abs(pnl);
                  }

                  state.totalVolume = 0;
                  state.averageEntryPrice = 0;
                  state.lastAction = 'SELL';
                  state.lastTradeTime = nowMs;
                  state.phase = 'WAITING';
                  playTradeSound('sell')
                  
                  updatedBot.logs.push({ 
                      time: new Date().toLocaleTimeString(), 
                      msg: `✅ SELL SUCCESSFUL @ $${botCurrentClose.toFixed(4)} (Sold: ${volToSell.toFixed(4)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`, 
                      type: 'sell' 
                  });

                  // 🔥 FORCEER DIRECTE OPSLAG NAAR SERVER
                  const newBotsArray = botsRef.current.map(b => b.id === updatedBot.id ? updatedBot : b);
                  fetch('http://localhost:3001/api/bots', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newBotsArray)
                  }).catch(err => console.error("Fout bij opslaan bot state:", err));

                  if (typeof fetchBalances === 'function') fetchBalances();
                  if (typeof fetchOrders === 'function') setTimeout(() => fetchOrders(), 2000);

                } else {
                  logMsg = `❌ Auto-Sell Failed: ${order.error}`;
                  updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'error' });
                  state.phase = 'WAITING';
                }
            } catch (err) {
                updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ Sell Error: ${err.message}`, type: 'error' });
                state.phase = 'WAITING';
            }
            state.isProcessing = false; // LOCK UIT
          }

          // Update logs if message changed
const currentLogs = Array.isArray(updatedBot.logs) ? updatedBot.logs : [];

const rsiVals = calculateRSI(data, cfg.rsiPeriod || 14);
const rsi = rsiVals[rsiVals.length - 1].value;
updatedBot.state.currentRsi = rsi.toFixed(1);

if (logMsg !== updatedBot.lastLog) {
  updatedBot.logs = [
    { time: new Date().toLocaleTimeString(), msg: logMsg, type: 'info' }, 
    ...currentLogs 
  ].slice(0, 50);
  updatedBot.lastLog = logMsg;
}

          return updatedBot;
        } catch (e) {
          console.error("Bot Error:", e);
          return bot;
        }
      }));

      setBots(updatedBots);
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
// fazant.jsx - Regel 493
const fetchBalances = async () => {
    let rawBalancesArray = []; 
    const now = Math.floor(Date.now() / 1000);

    // --- 1. KRAKEN FETCH ---
    try {
        const resK = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders() });
        const dataK = await resK.json();
        
        if (!dataK.error && typeof dataK === 'object') {
            Object.keys(dataK).forEach(k => { 
                const amount = parseFloat(dataK[k]);
                if (amount > 0.00000001) { 
                    let cleanKey = k.replace('Z', '').replace('X', ''); 
                    if (k === 'ZUSD') cleanKey = 'USD'; 
                    if (k === 'XXBT') cleanKey = 'BTC'; 
                    rawBalancesArray.push({ currency: cleanKey, amount: amount, exchange: 'Kraken' });
                }
            });
        }
    } catch (e) { console.error("Kraken balance fail", e); }

    // --- 2. COINBASE FETCH ---
    if (apiKeys.cbKey) {
        try {
            const cbData = await fetchCoinbaseBalances(); 
            if (Array.isArray(cbData)) {
                cbData.forEach(acc => {
                    const amount = acc.amount;
                    if (amount > 0.00000001) {
                        const key = acc.currency === 'XBT' ? 'BTC' : acc.currency;
                        rawBalancesArray.push({ currency: key, amount: amount, exchange: 'Coinbase' });
                    }
                });
            }
        } catch (e) { console.error("Coinbase balance fail", e); }
    }

    setBalances(rawBalancesArray);
    setIsLoggedIn(rawBalancesArray.length > 0);

    // --- 3. BEREKEN TOTALE USD WAARDE VOOR DE GRAFIEK (DE FIX!) ---
    let totalUsdValueForChart = 0;
    const cryptos = [...new Set(rawBalancesArray.filter(b => b.currency !== 'USD').map(b => b.currency))];

    try {
        let prices = {};
        if (cryptos.length > 0) {
            // Gebruik de openbare Kraken API net als in PortfolioView (werkt altijd!)
            const pairs = cryptos.map(c => `${c === 'BTC' ? 'XBT' : c}USD`).join(',');
            const resP = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`);
            const dataP = await resP.json();
            if (!dataP.error) prices = dataP.result;
        }

        rawBalancesArray.forEach(b => {
            if (b.currency === 'USD') {
                totalUsdValueForChart += b.amount;
            } else {
                let searchCoin = b.currency === 'BTC' ? 'XBT' : b.currency;
                let priceKey = Object.keys(prices).find(k => k.includes(searchCoin));
                if (priceKey && prices[priceKey]) {
                    totalUsdValueForChart += b.amount * parseFloat(prices[priceKey].c[0]);
                }
            }
        });
    } catch (e) { console.error("Kon live prijzen niet ophalen voor de grafiek", e); }

    // --- 4. GRAFIEK UPDATE ---
    if (totalUsdValueForChart > 0) {
        setEquityCurve(currentCurve => {
            const prevCurve = currentCurve.length > 0 ? currentCurve : (JSON.parse(localStorage.getItem('kraken_equity_curve')) || []);
            const lastValue = prevCurve[prevCurve.length - 1]?.value || 0;
            
            if (Math.abs(totalUsdValueForChart - lastValue) > 0.1 || prevCurve.length === 0) {
                const newCurve = [...prevCurve, { time: now, value: totalUsdValueForChart }];
                const trimmedCurve = newCurve.slice(-500); 
                localStorage.setItem('kraken_equity_curve', JSON.stringify(trimmedCurve));
                return trimmedCurve;
            }
            return prevCurve;
        });
    }

    setTimeout(() => fetchOrders(), 1000); 
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
  const handleSliderClick = (pct) => { 
      // Haal de juiste balans op afhankelijk van of we kopen (Quote) of verkopen (Base)
      const available = tradeSide === 'Buy' ? getBalance(activePair.quote) : getBalance(activePair.base); 
      const spend = available * (pct / 100); 
      const p = orderType === 'Market' ? currentPrice : parseFloat(priceInput) || currentPrice; 
      
      if (tradeSide === 'Buy') {
          setTotalInput(spend.toFixed(2)); 
          if (p > 0) setAmountInput((spend / p).toFixed(6)); 
      } else {
          setAmountInput(spend.toFixed(6));
          if (p > 0) setTotalInput((spend * p).toFixed(2));
      }
  };

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

    return data.map((item, index) => (
      <tr key={`${item.id}-${index}`} className="hover:bg-zinc-800/30 transition border-b border-zinc-800/50 group text-[11px]">
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

  // Helper om de multi-exchange balans netjes op te tellen
  const getBalance = (currency) => {
      if (!Array.isArray(balances)) return 0;
      let searchCurrency = currency.replace('XBT', 'BTC').replace('ZUSD', 'USD').replace('ZEUR', 'EUR');
      return balances
          .filter(b => b.currency === searchCurrency)
          .reduce((sum, b) => sum + b.amount, 0); // Telt Kraken en Coinbase bij elkaar op!
  };

  // Helper voor het juiste valuta-symbool (€ of $)
  const getCurrencySymbol = (quote) => {
      if (quote.includes('EUR')) return '€';
      if (quote.includes('USD')) return '$';
      return ''; // Laat leeg voor crypto/crypto pairs (bijv. ETH/BTC)
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
                  <label className="text-[10px] uppercase text-zinc-500 font-bold flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div> Coinbase API Key
                  </label>
                  <input type="text" value={apiKeys.cbKey} onChange={e => setApiKeys({...apiKeys, cbKey: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Coinbase Advanced Key" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold">Coinbase API Secret</label>
                  <textarea value={apiKeys.cbSecret} onChange={e => setApiKeys({...apiKeys, cbSecret: e.target.value})} className="w-full bg-[#050505] border border-zinc-800 rounded p-2 text-sm text-white outline-none focus:border-blue-500 h-24 font-mono text-[8px]" placeholder="Plak hier de VOLLEDIGE Private Key (inclusief BEGIN/END regels)"></textarea>
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
             <TradingChart bots={bots} pair={pop.pair} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={tradeHistory} scriptLoaded={scriptLoaded} isActive={false} isDrawingMode={isDrawingMode} externalWindow={pop.win} />
          </div>
        </PopoutWindow>
      ))}

      <nav className="w-14 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center py-4 space-y-6 z-10 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20"><Activity size={20} className="text-white" /></div>

        <button 
          onClick={() => setCurrentView('dashboard')} 
          className={`p-2 rounded-lg transition ${currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`} 
          title="Master Dashboard"
        >
          <LayoutDashboard size={20} />
        </button>
        
        <button onClick={() => setCurrentView('charts')} className={`p-2 rounded-lg transition ${currentView === 'charts' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Charts"><LineChart size={20} /></button>
        
        {/* ✨ NIEUWE KNOP: SCREENER */}
        <button onClick={() => setCurrentView('screener')} className={`p-2 rounded-lg transition ${currentView === 'screener' ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Market Screener"><Zap size={20} /></button>
        
        <button onClick={() => setCurrentView('ai')} className={`p-2 rounded-lg transition ${currentView === 'ai' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Gemini AI"><Sparkles size={20} /></button>
        
        <button onClick={() => setCurrentView('portfolio')} className={`p-2 rounded-lg transition ${currentView === 'portfolio' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Portfolio"><Wallet size={20} /></button>
        
        <button onClick={() => setCurrentView('bots')} className={`p-2 rounded-lg transition mt-4 ${currentView === 'bots' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} title="Bot Manager"><Bot size={20} /></button>

        <button 
          onClick={() => setCurrentView('whales')} 
          className={`p-2 rounded-lg transition ${currentView === 'whales' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'}`} 
          title="Intelligence Hub"
        >
          <Waves size={20} />
        </button>
        
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
              <div className="flex flex-col">
                <span className="text-emerald-500 font-bold text-sm">{getCurrencySymbol(activePair.quote)}{formatPrice(currentPrice)}</span>
                <span className="text-zinc-500 uppercase tracking-tighter">Live Price</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-200 font-bold">{getCurrencySymbol(activePair.quote)}{getBalance(activePair.quote).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span className="text-zinc-500 uppercase tracking-tighter">{activePair.quote} Balance</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-200 font-bold">{getBalance(activePair.base).toFixed(4)}</span>
                <span className="text-zinc-500 uppercase tracking-tighter">{activePair.base.replace('XBT', 'BTC')} Balance</span>
              </div>
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
        {currentView === 'dashboard' && (
          <MasterDashboardView 
            balances={balances} 
            bots={bots} 
            whaleTrades={whaleTrades} 
            currentPrice={currentPrice} 
            activePair={activePair}
            equityCurve={equityCurve}
          />
        )}
        {currentView === 'screener' && <ScreenerView onDeployBot={handleDeployFromScreener} />}
        {currentView === 'ai' && <AiAdvisorView activePair={activePair} aiMessages={aiMessages} setAiMessages={setAiMessages} timeframe={timeframe} />}
        {currentView === 'portfolio' && <PortfolioView balances={balances} scriptLoaded={scriptLoaded} equityCurve={equityCurve} onRefresh={fetchBalances} tradeHistory={tradeHistory} />}
        {currentView === 'bots' && <BotManagerView bots={bots} setBots={setBots} availablePairs={availablePairs} activePair={activePair} />}
        {currentView === 'whales' && <WhaleHubView activePair={activePair} />}

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
                  <TradingChart bots={bots} pair={gridPairs[activeIndex]} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={tradeHistory} scriptLoaded={scriptLoaded} isActive={true} isDrawingMode={isDrawingMode} onPopout={() => openPopout({ ...gridPairs[activeIndex] })} />
                ) : (
                  gridPairs.slice(0, 4).map((p, i) => (<TradingChart key={`chart-${i}-${p?.id}`} bots={bots} pair={p} timeframe={timeframe} showVolume={showVolume} signals={signals} positions={tradeHistory} scriptLoaded={scriptLoaded} isActive={activeIndex === i} isDrawingMode={isDrawingMode} onClick={() => setActiveIndex(i)} onPopout={() => openPopout({ ...p })} />))
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
                      <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500"><span>Balance</span><span className="text-zinc-200">{tradeSide === 'Buy' ? getBalance(activePair.quote).toLocaleString('en-US', {minimumFractionDigits: 2}) : getBalance(activePair.base).toFixed(6)} {tradeSide === 'Buy' ? activePair.quote : activePair.base.replace('XBT', 'BTC')}</span></div>
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