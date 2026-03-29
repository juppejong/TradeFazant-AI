TradeFazant AI 📈🤖
The Ultimate Multi-Exchange Quantitative Trading Terminal.
Powered by Kraken, Coinbase Advanced, and Google Gemini AI.

TradeFazant AI is een geavanceerd trading dashboard dat de kloof overbrugt tussen handmatig handelen en volledige algoritme-automatisering. Het combineert real-time marktdata, AI-gedreven analyses en slimme order-executie in één strakke, modulaire interface.

✨ Belangrijkste Functies
🤖 Auto-Trading Engine (24/7 Intelligentie)
Multi-Strategy Bots: Lanceer bots op basis van RSI, Bollinger Bands en SMA Trend-filters.

Trailing Execution: Geavanceerde Trailing Buy en Trailing Sell om bodems en toppen beter te timen.

Risk Management: Ingebouwde Stop-Loss (SL) en Take-Profit (TP) per bot.

DCA Support: Automatische Dollar Cost Averaging om posities te verbeteren bij prijsdalingen.

💸 Fee Optimization & Multi-Exchange
Kraken & Coinbase Advanced: Volledige ondersteuning voor beide exchanges binnen één interface.

Smart Limit Orders (Maker): Bespaar tot 40% op handelskosten door automatisch gebruik te maken van "Post-Only" Limit orders in plaats van dure Market orders.

Unified Portfolio: Bekijk je totale balans van verschillende exchanges in één overzichtelijk dashboard.

🧠 Gemini AI Advisor
Deep Market Analysis: Gemini analyseert live candles en indicators om trends te voorspellen.

AI Trading Filter: Optionele filter waarbij de bot alleen een trade opent als de AI de trend bevestigt.

📊 Visual Command Center (Gadgets)
Advanced Charting: TradingView Lightweight Charts met indicators, markers voor je trades en bot-entry points.

Live Market Ticker: Een soepel scrollende ticker onderaan het scherm met de grootste stijgers van de dag.

Fear & Greed Index: Real-time sentiment-meter geïntegreerd in je dashboard.

Smart Toast Notifications: Directe, visuele meldingen bij elke trade, winstneming of foutmelding.

🚀 Installatie & Setup
Volg deze stappen om TradeFazant AI lokaal op je machine te draaien.

1. Repository Clonen
```
git clone https://github.com/juppejong/TradeFazant-AI.git
cd TradeFazant-AI
```
2. Backend Installatie
De backend verzorgt de beveiligde communicatie met de exchanges en de AI.

```
cd crypto-backend
npm install
node server.js
```
De backend draait nu op http://localhost:3001.

3. Frontend Installatie
Open een nieuw terminalvenster en start het dashboard.

```
cd crypto-dashboard
npm install
npm run dev
```
Het dashboard opent nu automatisch in je browser (meestal op http://localhost:5173).

⚙️ Configuratie
Zodra het dashboard draait, kun je de verbinding instellen:

Klik op het Settings (tandwiel) icoon linksboven of de rode API Keys knop.

Voer je API-gegevens in:

Kraken: Key & Secret (voor spot trading).

Coinbase: Key & Private Key (voor Coinbase Advanced trading).

Google Gemini: API Key (voor de AI Advisor functies).

Klik op Save & Restart. Je keys worden veilig in je browser bewaard en versleuteld naar je lokale server gestuurd voor de bots.

🛠️ Tech Stack
Frontend: React 18, Tailwind CSS (styling), Lucide React (icons).

Charts: Lightweight Charts (TradingView).

Backend: Node.js, Express.

Intelligence: Google Gemini 2.5 Flash API.

Data: Kraken REST/WebSockets & Coinbase Advanced API.

⚠️ Disclaimer
Dit is experimentele software. Handelen in cryptocurrency brengt grote financiële risico's met zich mee. Gebruik TradeFazant AI op eigen risico. De ontwikkelaars zijn niet verantwoordelijk voor eventuele verliezen.
