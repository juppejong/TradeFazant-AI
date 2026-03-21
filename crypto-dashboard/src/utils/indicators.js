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