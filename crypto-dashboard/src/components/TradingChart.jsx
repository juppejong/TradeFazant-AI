// src/components/TradingChart.jsx
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { fetchKrakenOHLC, tfMap } from '../utils/api';
import { calculateSMA, calculateBB, calculateRSI, calculateMACD } from '../utils/indicators';
import { wsClient } from '../utils/websocket';

export const PopoutWindow = ({ title, externalWindow, onClose, children }) => {
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

export default TradingChart;