// src/utils/indicators.js

export const calculateSMA = (data, period, source = 'close') => {
  const smaData = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j][source];
    smaData.push({ time: data[i].time, value: sum / period });
  }
  return smaData;
};

export const calculateEMA = (data, period) => {
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

export const calculateMACD = (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  // ... (plak hier de rest van je originele calculateMACD code)
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

export const calculateBB = (data, period, stdDevMultiplier) => {
  // ... (plak hier de rest van je originele calculateBB code)
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

export const calculateRSI = (data, period) => {
  // ... (plak hier de rest van je originele calculateRSI code)
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

// ... (laat je bestaande SMA, EMA, MACD, BB, RSI code gewoon staan) ...

// ==========================================
// 📈 DYNAMISCH RISICO & TREND INDICATOREN
// ==========================================

export const calculateATR = (data, period = 14) => {
  const atrData = [];
  if (data.length <= period) return atrData;
  let trSum = 0;
  const trValues = [0]; // True Range van eerste candle is 0

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    // True Range is de grootste van de 3 absolute prijsverschillen
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trValues.push(tr);
  }

  // Eerste ATR is een simpele gemiddelde (SMA) van de TR
  for(let i=1; i<=period; i++) trSum += trValues[i];
  let prevAtr = trSum / period;
  atrData.push({ time: data[period].time, value: prevAtr });

  // Vanaf daar gebruiken we Wilder's Smoothing
  for (let i = period + 1; i < data.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + trValues[i]) / period; 
    atrData.push({ time: data[i].time, value: currentAtr });
    prevAtr = currentAtr;
  }
  return atrData;
};

export const calculateADX = (data, period = 14) => {
  const adxData = [];
  if (data.length <= period * 2) return adxData;
  
  let trSum = 0, plusDmSum = 0, minusDmSum = 0;
  const trArr = [0], plusDmArr = [0], minusDmArr = [0];

  for (let i = 1; i < data.length; i++) {
    const upMove = data[i].high - data[i-1].high;
    const downMove = data[i-1].low - data[i].low;
    
    let plusDM = 0;
    if (upMove > downMove && upMove > 0) plusDM = upMove;
    let minusDM = 0;
    if (downMove > upMove && downMove > 0) minusDM = downMove;

    const tr = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close));
    
    trArr.push(tr); plusDmArr.push(plusDM); minusDmArr.push(minusDM);
  }

  for (let i=1; i<=period; i++) { trSum+=trArr[i]; plusDmSum+=plusDmArr[i]; minusDmSum+=minusDmArr[i]; }

  const dxArr = [];
  for (let i = period; i < data.length; i++) {
    if (i > period) {
      trSum = trSum - (trSum/period) + trArr[i];
      plusDmSum = plusDmSum - (plusDmSum/period) + plusDmArr[i];
      minusDmSum = minusDmSum - (minusDmSum/period) + minusDmArr[i];
    }
    const plusDI = 100 * (plusDmSum / trSum);
    const minusDI = 100 * (minusDmSum / trSum);
    const dx = 100 * (Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1));
    dxArr.push({time: data[i].time, dx, plusDI, minusDI});
  }

  let adxSum = 0;
  for(let i=0; i<period; i++) adxSum += dxArr[i].dx;
  let prevAdx = adxSum / period;
  
  adxData.push({ time: dxArr[period-1].time, adx: prevAdx, plusDI: dxArr[period-1].plusDI, minusDI: dxArr[period-1].minusDI });

  for (let i = period; i < dxArr.length; i++) {
    const currentAdx = ((prevAdx * (period - 1)) + dxArr[i].dx) / period;
    adxData.push({ time: dxArr[i].time, adx: currentAdx, plusDI: dxArr[i].plusDI, minusDI: dxArr[i].minusDI });
    prevAdx = currentAdx;
  }
  
  return adxData;
};