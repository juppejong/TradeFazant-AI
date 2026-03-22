const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');

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
        reject({ message: "API Keys ontbreken. Vul deze in bij de settings." });
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
    } catch (err) { res.status(500).json({ error: 'Fout bij ophalen paren' }); }
});

app.post('/api/ohlc', requireAuth, async (req, res) => {
    try {
        const { pair, interval } = req.body;
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/OHLC?pair=${pair}&interval=${interval}`);
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Fout bij ophalen OHLC' }); }
});

app.post('/api/ticker', requireAuth, async (req, res) => {
    try {
        const { pair } = req.body;
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/Ticker?pair=${pair}`);
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Fout bij ophalen Ticker' }); }
});

app.post('/api/depth', requireAuth, async (req, res) => {
    try {
        const { pair, count } = req.body;
        const response = await axios.get(`${KRAKEN_API_URL}/0/public/Depth?pair=${pair}&count=${count || 15}`);
        res.json(response.data);
    } catch (err) { res.status(500).json({ error: 'Fout bij ophalen Depth' }); }
});

// ==========================================
// 🤖 AI ENDPOINTS (Auto-Tune & Chat & Analyze)
// ==========================================
app.post('/api/chat', requireAuth, async (req, res) => {
    try {
        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;
        const { message } = req.body;
        if (!geminiKey) return res.status(400).json({ error: "Gemini API key ontbreekt in instellingen." });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const sysPrompt = "Je bent een expert crypto quant trader. Antwoord altijd in het Nederlands. Wees to-the-point.";
        const payload = { contents: [{ parts: [{ text: message }] }], systemInstruction: { parts: [{ text: sysPrompt }] } };

        const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Geen antwoord.";
        res.json({ text });
    } catch (err) { 
        console.error("🔥 Gemini Chat Error:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
        res.status(500).json({ error: "Fout bij communicatie met AI." }); 
    }
});

app.post('/api/ai/analyze', requireAuth, async (req, res) => {
    try {
        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;
        const { pair, timeframe, data } = req.body;
        if (!geminiKey) return res.status(400).json({ error: "Gemini API key ontbreekt" });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const sysPrompt = "Je bent een kwantitatieve trading AI. Analyseer de OHLC data. Je antwoord moet UITSLUITEND uit een JSON object bestaan. Formaat: {\"bias\": \"BULLISH\"|\"BEARISH\"|\"NEUTRAL\", \"confidence\": getal_tussen_0_en_100, \"advice\": \"TRADE\"|\"NO_TRADE\", \"reasoning\": \"korte_verklaring\"}";
        const prompt = `Analyseer dit muntpaar: ${pair} op timeframe: ${timeframe}\nData:\n${data}`;
        
        const payload = { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sysPrompt }] }, generationConfig: { responseMimeType: "application/json" } };

        const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // FIX: Verwijder eventuele markdown codeblok-tags (```json en ```) die Gemini soms meestuurt
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(text));
    } catch (err) {
        res.status(500).json({ error: "AI Analyse mislukt", bias: "NEUTRAL", confidence: 0, advice: "NO_TRADE", reasoning: "Fout bij ophalen." });
    }
});

app.post('/api/ai/tune', requireAuth, async (req, res) => {
    try {
        const geminiKey = req.headers['x-gemini-api-key'] || GEMINI_API_KEY;
        const { pair, timeframe, strategy, data } = req.body;
        if (!geminiKey) return res.status(400).json({ error: "Geen API key" });
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const sysPrompt = `Je bent een expert kwantitatieve trading AI. Genereer optimale parameters voor de ${strategy} strategie. Geef UITSLUITEND JSON: {"rsiPeriod": number, "rsiBuyLevel": number, "rsiSellLevel": number, "trailingPct": number, "slPct": number, "tpPct": number}`;
        const prompt = `Paar: ${pair}\nTF: ${timeframe}\nData:\n${data}`;
        
        const payload = { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sysPrompt }] }, generationConfig: { responseMimeType: "application/json" } };
        
        const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        let text = response.data.candidates[0].content.parts[0].text;
        
        // FIX: Verwijder eventuele markdown codeblok-tags
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(text));
    } catch(err) { res.status(500).json({error: "Tuning mislukt"}); }
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
    } catch (err) { res.status(500).json({ error: err.message || 'Fout bij ophalen balans' }); }
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
    } catch (err) { res.status(500).json({ error: err.message || 'Fout bij plaatsen order.' }); }
});

app.post('/api/orders', requireAuth, async (req, res) => {
    try {
        const apiKey = req.headers['x-kraken-api-key'];
        const apiSecret = req.headers['x-kraken-api-secret'];
        const openOrders = await krakenPrivateApi('OpenOrders', {}, 3, apiKey, apiSecret);
        const closedOrders = await krakenPrivateApi('ClosedOrders', {}, 3, apiKey, apiSecret);
        const tradesHistory = await krakenPrivateApi('TradesHistory', {}, 3, apiKey, apiSecret);
        res.json({ 
            open: openOrders.result?.open || {}, 
            closed: closedOrders.result?.closed || {},
            trades: tradesHistory.result?.trades || {}
        });
    } catch (err) { res.status(500).json({ error: err.message || 'Fout bij ophalen order historie' }); }
});

app.post('/api/cancel-order', requireAuth, async (req, res) => {
    try {
        const apiKey = req.headers['x-kraken-api-key'];
        const apiSecret = req.headers['x-kraken-api-secret'];
        const { txid } = req.body;
        const data = await krakenPrivateApi('CancelOrder', { txid }, 3, apiKey, apiSecret); 
        if (data.error && data.error.length > 0) return res.status(400).json({ error: data.error });
        res.json({ success: true, result: data.result });
    } catch (err) { res.status(500).json({ error: err.message || 'Fout bij annuleren order' }); }
});

const fs = require('fs');
const path = require('path');

const BOTS_FILE = path.join(__dirname, 'bots_data.json');

// Hulpfunctie om bots te laden van schijf
const loadBotsFromFile = () => {
    try {
        if (fs.existsSync(BOTS_FILE)) {
            const data = fs.readFileSync(BOTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Fout bij lezen van bots_data.json:", err);
    }
    return [];
};

// Initialiseer de lijst bij het opstarten van de server
let globalBots = loadBotsFromFile();

// Endpoint om de lijst met bots op te vragen
app.get('/api/bots', (req, res) => {
    res.json(globalBots);
});

// Endpoint om de lijst met bots bij te werken en op te slaan
app.post('/api/bots', (req, res) => {
    globalBots = req.body;
    try {
        fs.writeFileSync(BOTS_FILE, JSON.stringify(globalBots, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Fout bij schrijven naar bots_data.json:", err);
        res.status(500).json({ error: "Kon bots niet opslaan op schijf" });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Crypto Backend draait op poort ${PORT}`);
    console.log(`🛡️ Dynamische API Keys via Headers Geactiveerd!`);
    console.log(`====================================================`);
});