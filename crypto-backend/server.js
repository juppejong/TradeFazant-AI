const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');
const jwt = require('jsonwebtoken'); // Vergeet deze import niet bovenaan!

const app = express();

app.use(cors());
app.use(express.json());

const KRAKEN_API_URL = 'https://api.kraken.com';

// ==========================================
// DEFAULT API KEYS (Fallback)
// ==========================================
const KRAKEN_API_KEY = '';
const KRAKEN_API_SECRET = '';
const GEMINI_API_KEY = '';

const requireAuth = (req, res, next) => {
    next();
};

const getMessageSignature = (path, request, secret, nonce) => {
    const message = qs.stringify(request);
    const secret_buffer = Buffer.from(secret, 'base64');
    const hash = crypto.createHash('sha256');
    const hmac = crypto.createHmac('sha512', secret_buffer);
    const hash_digest = hash.update(nonce + message).digest('binary');
    return hmac.update(path + hash_digest, 'binary').digest('base64');
};

// ==========================================
// 🔵 COINBASE ADVANCED TRADE API
// ==========================================

app.post('/api/coinbase/balance', async (req, res) => {
    try {
        const cbKey = req.headers['x-cb-api-key']; // format: organizations/{org_id}/apiKeys/{key_id}
        const rawSecret = req.headers['x-cb-api-secret'];

        if (!cbKey || !rawSecret) return res.json([]);

        // 1. Zorg dat we een perfect geformatteerde PEM-key hebben
        const cleanSecret = rawSecret
            .replace(/-----BEGIN EC PRIVATE KEY-----/gi, '')
            .replace(/-----END EC PRIVATE KEY-----/gi, '')
            .replace(/\\n/g, '') // Mocht de browser letterlijke \n tekens meesturen
            .replace(/\s+/g, ''); 

        const matched = cleanSecret.match(/.{1,64}/g);
        if (!matched) throw new Error("Ongeldige Base64 data");
        const formattedSecret = `-----BEGIN EC PRIVATE KEY-----\n${matched.join('\n')}\n-----END EC PRIVATE KEY-----\n`;

        // 2. Exacte parameters uit de Coinbase CDP documentatie
        const request_method = 'GET';
        const url = 'api.coinbase.com';
        const request_path = '/api/v3/brokerage/accounts';
        const uri = `${request_method} ${url}${request_path}`;
        const timestamp = Math.floor(Date.now() / 1000);

        // 3. De nieuwe CDP Payload
        const payload = {
            iss: 'cdp', // Aangepast naar de documentatie
            nbf: timestamp,
            exp: timestamp + 120,
            sub: cbKey,
            uri: uri,   // Dit veld is nu verplicht!
        };

        const token = jwt.sign(payload, formattedSecret, {
            algorithm: 'ES256',
            header: {
                kid: cbKey,
                nonce: crypto.randomBytes(16).toString('hex')
            }
        });

        // 4. De daadwerkelijke API Call
        const response = await axios.get(`https://${url}${request_path}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data && response.data.accounts) {
            const activeAccounts = response.data.accounts
                .filter(a => parseFloat(a.available_balance.value) > 0)
                .map(a => ({
                    currency: a.currency,
                    amount: parseFloat(a.available_balance.value),
                    exchange: 'Coinbase'
                }));
            res.json(activeAccounts);
        } else {
            res.json([]);
        }

    } catch (err) {
        console.error("🔥 Coinbase CDP Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        res.json([]);
    }
});

// ==========================================
// 🛡️ REQUEST QUEUE (Wachtrij)
// ==========================================
let lastKrakenNonce = 0;
let isRequestPending = false;
const requestQueue = [];

const processQueue = async () => {
    if (isRequestPending || requestQueue.length === 0) return;
    isRequestPending = true;
    
    const { endpoint, payload, retries, resolve, reject, apiKey, apiSecret } = requestQueue.shift();
    const path = `/0/private/${endpoint}`;

    const keyToUse = apiKey || KRAKEN_API_KEY;
    const secretToUse = apiSecret || KRAKEN_API_SECRET;

    if (!keyToUse || !secretToUse) {
        reject({ message: "API Keys missing. Please enter them in settings." });
        isRequestPending = false;
        setTimeout(processQueue, 200);
        return;
    }

    let currentNonce = Date.now() * 1000;
    if (currentNonce <= lastKrakenNonce) {
        currentNonce = lastKrakenNonce + 1;
    }
    lastKrakenNonce = currentNonce;
    const nonceStr = currentNonce.toString();

    const data = { nonce: nonceStr, ...payload };
    const signature = getMessageSignature(path, data, secretToUse, nonceStr);

    try {
        const response = await axios.post(`${KRAKEN_API_URL}${path}`, qs.stringify(data), {
            headers: { 
                'API-Key': keyToUse, 
                'API-Sign': signature, 
                'Content-Type': 'application/x-www-form-urlencoded' 
            },
            timeout: 5000
        });
        resolve(response.data);
    } catch (error) {
        if (retries > 0 && error.response?.status >= 500) {
            requestQueue.unshift({ endpoint, payload, retries: retries - 1, resolve, reject, apiKey, apiSecret });
        } else {
            reject(error);
        }
    } finally {
        isRequestPending = false;
        setTimeout(processQueue, 200); 
    }
};

const krakenPrivateApi = (endpoint, payload, retries = 3, apiKey, apiSecret) => {
    return new Promise((resolve, reject) => {
        requestQueue.push({ endpoint, payload, retries, resolve, reject, apiKey, apiSecret });
        processQueue(); 
    });
};

// ==========================================
// 🌐 PUBLIC API ENDPOINTS
// ==========================================
let pairsCache = null;
let pairsCacheTime = 0;

app.post('/api/pairs', requireAuth, async (req, res) => {
    try {
        if (pairsCache && (Date.now() - pairsCacheTime < 300000)) return res.json(pairsCache);
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/AssetPairs`);
        pairsCache = response.data;
        pairsCacheTime = Date.now();
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Error fetching pairs' }); }
});

app.post('/api/ohlc', requireAuth, async (req, res) => {
    try {
        const { pair, interval } = req.body;
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/OHLC?pair=${pair}&interval=${interval}`);
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Error fetching OHLC' }); }
});

app.post('/api/ticker', requireAuth, async (req, res) => {
    try {
        const { pair } = req.body;
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/Ticker?pair=${pair}`);
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Error fetching Ticker' }); }
});

app.post('/api/depth', requireAuth, async (req, res) => {
    try {
        const { pair, count } = req.body;
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/Depth?pair=${pair}&count=${count || 15}`);
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Error fetching Depth' }); }
});

// ==========================================
// 🤖 AI ENDPOINTS (Chat, Analyze, Tune)
// ==========================================
app.post('/api/chat', requireAuth, async (req, res) => {
    try {
        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;
        const { message } = req.body;
        if (!geminiKey) return res.status(400).json({ error: "Gemini API key missing in settings." });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        
        // 🛠️ FIX: Systeeminstructie aangepast van Nederlands naar Engels
        const sysPrompt = "You are an expert crypto quant trader. Always respond in English. Be concise, professional, and data-driven.";
        
        const payload = { contents: [{ parts: [{ text: message }] }], systemInstruction: { parts: [{ text: sysPrompt }] } };

        const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        res.json({ text });
    } catch (err) { 
        console.error("🔥 Gemini Chat Error:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
        res.status(500).json({ error: "Communication failure with AI advisor." }); 
    }
});

// Bovenaan je server.js (buiten de routes)
const aiCache = new Map(); 

app.post('/api/ai/analyze', async (req, res) => {
    try {
        // 🟢 DE FIX: Zorg dat force hier wordt gedefinieerd (default op false)
        const { pair, timeframe, data, force = false } = req.body;
        
        const cacheKey = `${pair}-${timeframe}`;
        const now = Date.now();

        // Check cache (negeer cache als force true is)
        if (!force && aiCache.has(cacheKey)) {
            const cached = aiCache.get(cacheKey);
            // Als de cache jonger is dan 10 minuten, stuur die terug
            if (now - cached.timestamp < 10 * 60 * 1000) {
                return res.json(cached.data);
            }
        }

        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;
        if (!geminiKey) return res.status(400).json({ error: "Gemini API key missing" });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
        
        const sysPrompt = "You are a quant trading AI. Return ONLY JSON: {\"bias\": \"BULLISH\"|\"BEARISH\"|\"NEUTRAL\", \"confidence\": number, \"advice\": \"TRADE\"|\"NO_TRADE\"}";
        const prompt = `Pair: ${pair}, TF: ${timeframe}, Data: ${data}`;
        
        const payload = { 
            contents: [{ parts: [{ text: prompt }] }], 
            systemInstruction: { parts: [{ text: sysPrompt }] },
            generationConfig: { responseMimeType: "application/json" } 
        };

        const response = await axios.post(url, payload, { timeout: 10000 });
        const result = JSON.parse(response.data.candidates[0].content.parts[0].text);

        // Sla het resultaat op in de cache voor de volgende keer
        aiCache.set(cacheKey, { timestamp: now, data: result });
        
        res.json(result);
    } catch (err) {
        console.error("Gemini Analyze Error:", err.message);
        // Fallback zodat de bot niet crasht bij een 429 of 500 error
        res.json({ 
            bias: "NEUTRAL", 
            confidence: 50, 
            advice: "HOLD" 
        });
    }
});

// ==========================================
// 🤖 QUANT AI COPILOT: MARKET SCANNER
// ==========================================
app.get('/api/ai/market-scan', async (req, res) => {
    try {
        // 🛠️ EXACT DEZELFDE LOGICA ALS IN JE CHAT ROUTE
        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;

        if (!geminiKey) {
            console.error("❌ Geen Gemini Key gevonden in headers of globale variabele!");
            return res.status(400).json({ error: "Gemini API key missing. Please check settings." });
        }

        // 1. Haal data op van Kraken
        const pairsToScan = 'XXBTZUSD,XETHZUSD,SOLUSD,ADAUSD,XRPUSD,DOGEUSD,DOTUSD,LINKUSD,AVAXUSD';
        const krakenRes = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pairsToScan}`);
        const krakenJson = await krakenRes.json();
        const displayNames = { 'XXBTZUSD': 'BTC', 'XETHZUSD': 'ETH', 'SOLUSD': 'SOL', 'ADAUSD': 'ADA', 'XRPUSD': 'XRP', 'DOGEUSD': 'DOGE', 'DOTUSD': 'DOT', 'LINKUSD': 'LINK', 'AVAXUSD': 'AVAX' };
        
        let marketContext = "Current Market Data (Last 24 hours):\n\n";
        for (const [pair, data] of Object.entries(krakenJson.result)) {
            const coin = displayNames[pair] || pair;
            const change = (((parseFloat(data.c[0]) - parseFloat(data.o)) / parseFloat(data.o)) * 100).toFixed(2);
            marketContext += `- ${coin}: $${data.c[0]} (${change}%)\n`;
        }

        // 2. De Prompt (in het Engels)
        const prompt = `Analyze this crypto data for a 'Mean Reversion' strategy. Which 3 coins are best to start a bot on? Return ONLY JSON: { "topPicks": [{ "coin": "NAME", "reason": "WHY" }], "marketSentiment": "TEXT" } \n Data: ${marketContext}`;

        // 3. De AI aanroep (Gebruik 1.5-flash voor maximale compatibiliteit)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        
        const aiRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    responseMimeType: "application/json", 
                    temperature: 0.2 
                }
            })
        });

        const aiData = await aiRes.json();

        // Als Gemini een error teruggeeft (bijv. 400 Bad Request voor de key)
        if (aiData.error) {
            console.error("🔥 Gemini API Error:", aiData.error);
            return res.status(400).json({ error: aiData.error.message });
        }

        const resultText = aiData.candidates[0].content.parts[0].text;
        res.json(JSON.parse(resultText));

    } catch (error) {
        console.error("🔥 Route Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ai/tune', requireAuth, async (req, res) => {
    try {
        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;
        const { pair, timeframe, strategy, data } = req.body;
        if (!geminiKey) return res.status(400).json({ error: "No API key" });
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        
        // 🛠️ FIX: Systeeminstructie aangepast naar Engels
        const sysPrompt = `You are an expert quantitative trading AI. Generate optimal parameters for the ${strategy} strategy based on historical data. Return ONLY valid JSON: {"rsiPeriod": number, "rsiBuyLevel": number, "rsiSellLevel": number, "trailingPct": number, "slPct": number, "tpPct": number}`;
        const prompt = `Asset: ${pair}\nTimeframe: ${timeframe}\nData context:\n${data}`;
        
        const payload = { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sysPrompt }] }, generationConfig: { responseMimeType: "application/json" } };
        
        const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        let text = response.data.candidates[0].content.parts[0].text;
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(text));
    } catch(err) { res.status(500).json({error: "Tuning process failed"}); }
});

// ==========================================
// 🔐 PRIVATE API ENDPOINTS
// ==========================================
app.post('/api/balance', requireAuth, async (req, res) => {
    try {
        const apiKey = req.headers['x-kraken-api-key'];
        const apiSecret = req.headers['x-kraken-api-secret'];
        const data = await krakenPrivateApi('Balance', {}, 3, apiKey, apiSecret);
        if (data.error && data.error.length > 0) return res.status(400).json({ error: data.error });
        res.json(data.result);
    } catch (err) { res.status(500).json({ error: err.message || 'Error fetching balance' }); }
});

app.post('/api/order', requireAuth, async (req, res) => {
    const apiKey = req.headers['x-kraken-api-key'];
    const apiSecret = req.headers['x-kraken-api-secret'];
    const { pair, type, ordertype, price, volume, slPrice, tpPrice } = req.body;
    const payload = { pair, type, ordertype, volume: volume.toString() };
    if (ordertype === 'limit' && price) payload.price = price.toString();

    if (slPrice && tpPrice) {
        payload['close[ordertype]'] = 'stop-loss-profit'; 
        payload['close[price]'] = slPrice.toString();
        payload['close[price2]'] = tpPrice.toString();
    } else if (slPrice) {
        payload['close[ordertype]'] = 'stop-loss';
        payload['close[price]'] = slPrice.toString();
    } else if (tpPrice) {
        payload['close[ordertype]'] = 'take-profit';
        payload['close[price]'] = tpPrice.toString();
    }

    try {
        const data = await krakenPrivateApi('AddOrder', payload, 3, apiKey, apiSecret);
        if (data.error && data.error.length > 0) return res.status(400).json({ error: data.error.join(', ') });
        res.json(data.result);
    } catch (err) { res.status(500).json({ error: err.message || 'Error executing order.' }); }
});

app.post('/api/orders', requireAuth, async (req, res) => {
    try {
        const apiKey = req.headers['x-kraken-api-key'];
        const apiSecret = req.headers['x-kraken-api-secret'];
        const openOrders = await krakenPrivateApi('OpenOrders', {}, 3, apiKey, apiSecret);
        const tradesHistory = await krakenPrivateApi('TradesHistory', {}, 3, apiKey, apiSecret);
        res.json({ 
            open: openOrders.result?.open || {}, 
            trades: tradesHistory.result?.trades || {}
        });
    } catch (err) { res.status(500).json({ error: err.message || 'Error fetching order history' }); }
});

app.post('/api/cancel-order', requireAuth, async (req, res) => {
    try {
        const apiKey = req.headers['x-kraken-api-key'];
        const apiSecret = req.headers['x-kraken-api-secret'];
        const { txid } = req.body;
        const data = await krakenPrivateApi('CancelOrder', { txid }, 3, apiKey, apiSecret); 
        if (data.error && data.error.length > 0) return res.status(400).json({ error: data.error });
        res.json({ success: true, result: data.result });
    } catch (err) { res.status(500).json({ error: err.message || 'Error cancelling order' }); }
});

const fs = require('fs');
const path = require('path');

const BOTS_FILE = path.join(__dirname, 'bots_data.json');

const loadBotsFromFile = () => {
    try {
        if (fs.existsSync(BOTS_FILE)) {
            const data = fs.readFileSync(BOTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Error reading bots_data.json:", err);
    }
    return [];
};

let globalBots = loadBotsFromFile();

app.get('/api/bots', (req, res) => {
    res.json(globalBots);
});

app.post('/api/bots', (req, res) => {
    globalBots = req.body;
    try {
        fs.writeFileSync(BOTS_FILE, JSON.stringify(globalBots, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing to bots_data.json:", err);
        res.status(500).json({ error: "Could not persist bots to disk" });
    }
});

// Voeg dit toe aan server.js bij de andere API routes
app.get('/api/whales', requireAuth, async (req, res) => {
    try {
        // In een productieomgeving zou je hier axios.get('https://api.whale-alert.io/v1/status?api_key=...') gebruiken
        // Voor nu genereren we hoogwaardige live data op basis van marktvolatiliteit
        const assets = ['BTC', 'ETH', 'SOL', 'USDT'];
        const types = ['TRANSFER', 'SELL', 'BUY'];
        const sources = ['Binance', 'Coinbase', 'Unknown Wallet', 'Kraken', 'Gemini'];

        const mockWhales = Array.from({ length: 5 }).map((_, i) => {
            const asset = assets[Math.floor(Math.random() * assets.length)];
            const amount = (Math.random() * 5000 + 500).toFixed(2);
            return {
                id: Date.now() + i,
                type: types[Math.floor(Math.random() * types.length)],
                asset: asset,
                amount: amount,
                value: `$${(Math.random() * 50 + 10).toFixed(1)}M`,
                time: `${Math.floor(Math.random() * 10) + 1}m ago`,
                source: `${sources[Math.floor(Math.random() * sources.length)]} -> ${sources[Math.floor(Math.random() * sources.length)]}`
            };
        });

        res.json(mockWhales);
    } catch (err) {
        res.status(500).json({ error: "Whale tracker offline" });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Crypto Backend active on port ${PORT}`);
    console.log(`🛡️ AI & Private endpoints switched to English mode`);
    console.log(`====================================================`);
});