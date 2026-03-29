// src/utils/api.js

export const tfMap = { '1m': 1, '5m': 5, '15m': 15, '1H': 60, '4H': 240, '1D': 1440 };

// 🛠️ FIX: Voeg cbKey en cbSecret toe aan de headers helper
export const getApiHeaders = () => {
  let keys = { krakenKey: '', krakenSecret: '', geminiKey: '', cbKey: '', cbSecret: '' };
  try {
    const stored = localStorage.getItem('trading_api_keys');
    if (stored) {
      const parsed = JSON.parse(stored);
      keys = { ...keys, ...parsed };
    }
  } catch (e) { console.error(e); }

  return {
    'Content-Type': 'application/json',
    'x-kraken-api-key': keys.krakenKey || '',
    'x-kraken-api-secret': keys.krakenSecret || '',
    'x-gemini-api-key': keys.geminiKey || '',
    'x-cb-api-key': (keys.cbKey || '').trim(),
    // STUUR DE SECRET RUW DOOR: De server repareert de formatering.
    'x-cb-api-secret': keys.cbSecret || '' 
  };
};

export const fetchKrakenPairs = async () => {
  try {
    const res = await fetch('http://localhost:3001/api/pairs', { method: 'POST', headers: getApiHeaders() });
    const json = await res.json();
    const pairs = [];
    for (const key in json.result) {
      const pair = json.result[key];
      if (pair.wsname && pair.wsname.includes('/USD') && !pair.wsname.includes('.d')) {
        pairs.push({ 
            id: key, 
            altname: pair.altname, 
            display: pair.wsname, 
            wsname: pair.wsname, 
            base: pair.wsname.split('/')[0], 
            quote: pair.wsname.split('/')[1] 
        });
      }
    }
    return pairs.sort((a, b) => a.display.localeCompare(b.display));
  } catch (error) { return []; }
};

export const fetchKrakenOHLC = async (interval, pairAltname) => {
  try {
    const res = await fetch('http://localhost:3001/api/ohlc', {
      method: 'POST', headers: getApiHeaders(), body: JSON.stringify({ pair: pairAltname, interval })
    });
    const json = await res.json();
    const pairKey = Object.keys(json.result).find(k => k !== 'last');
    return json.result[pairKey].map(d => ({
      time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[6])
    }));
  } catch (error) { return []; }
};

// 🚀 Coinbase Balance Fetcher
export const fetchCoinbaseBalances = async () => {
  try {
    // We gebruiken getApiHeaders() om consistentie te waarborgen
    const headers = getApiHeaders();
    
    const res = await fetch('http://localhost:3001/api/coinbase/balance', {
      method: 'POST',
      headers: headers
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("fetchCoinbaseBalances error:", error);
    throw error; // Laat de fazant.jsx catch dit afhandelen
  }
};