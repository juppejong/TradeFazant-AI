# TradeFazant AI 📈🤖
<img width="600" height="280" alt="image" src="https://github.com/user-attachments/assets/5ffe1cbe-b9fe-4b2c-a23f-193765124344" />

<img width="600" height="280" alt="image" src="https://github.com/user-attachments/assets/6d1327d7-280a-4912-a9db-d5959df49402" />

<img width="600" height="280" alt="image" src="https://github.com/user-attachments/assets/67ea02f7-e873-4a59-8e53-bb566ee86973" />

<img width="600" height="280" alt="image" src="https://github.com/user-attachments/assets/6c19c40c-03ac-4daf-b2bf-f46bf5d8c490" />

> An advanced quantitative crypto trading dashboard powered by the **Kraken API** and **Google Gemini AI** for smart, automated market analysis and trading.

Built with React and Node.js, TradeFazant AI bridges the gap between manual trading and algorithmic automation. It offers a sleek interface to manage your portfolio, run automated trading strategies, and leverage AI to make data-driven market decisions.

## ✨ Key Features

* **🤖 Auto Trading Bots (Pro Engine):** Create and manage custom algorithms based on RSI, Bollinger Bands, and SMA trend filters. Includes advanced execution logic like Trailing Buy/Sell, DCA (Dollar Cost Averaging), and strict Risk Management (Stop-Loss/Take-Profit).
* **🧠 Gemini AI Advisor:** An integrated AI assistant that analyzes market conditions (Multi-Timeframe Analysis), optimizes bot parameters (Auto-Tune), and provides real-time, actionable trading advice.
* **⚡ Live Market Data:** Ultra-fast, real-time price feeds and order book depth powered by Kraken WebSockets.
* **📊 Advanced Charting:** Interactive charting powered by TradingView's Lightweight Charts. Includes TradeFazant AI 📈🤖
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
Bash
git clone https://github.com/juppejong/TradeFazant-AI.git
cd TradeFazant-AI
2. Backend Installatie
De backend verzorgt de beveiligde communicatie met de exchanges en de AI.

Bash
cd crypto-backend
npm install
node server.js
De backend draait nu op http://localhost:3001.

3. Frontend Installatie
Open een nieuw terminalvenster en start het dashboard.

Bash
cd crypto-dashboard
npm install
npm run dev
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
Dit is experimentele software. Handelen in cryptocurrency brengt grote financiële risico's met zich mee. Gebruik TradeFazant AI op eigen risico. De ontwikkelaars zijn niet verantwoordelijk voor eventuele verliezen.volume data, popular technical indicators (SMA, BB, RSI, MACD), and visual markers for your active positions and trade history.
* **💼 Portfolio & Order Management:** Monitor your live crypto balances, track your equity curve, and execute Market or Limit orders directly from the dashboard, complete with linked SL/TP targets.
* **🔒 Secure API Handling:** API keys are dynamically routed via headers to a Node.js backend. The backend features a built-in request queue to ensure smooth execution and prevent Kraken API rate-limit errors.

## 🛠️ Tech Stack

* **Frontend:** React, Tailwind CSS, Lucide Icons, Lightweight Charts
* **Backend:** Node.js, Express, Axios, Crypto (for secure Kraken HMAC signatures)
* **APIs:** Kraken (REST & WebSocket), Google Gemini 2.5 Flash API

## 🚀 Installation & Getting Started

Thanks to `concurrently`, you can boot up both the backend and the frontend simultaneously with just one command!

### 1. Clone the Repository
First, download the code to your local machine and navigate into the project folder:
```
git clone https://github.com/juppejong/TradeFazant-AI.git
cd TradeFazant-AI
npm install
```

### 1. Installation
Ensure you are in the root directory of the project and install all necessary dependencies:
```
# Install backend dependencies
cd crypto-backend
npm install

# Install frontend dependencies
cd ../crypto-dashboard
npm install
```
2. Run the Platform
Navigate back to the root directory of your project and start the development environment:

```
npm run dev
```
This command will automatically spin up the Node.js backend on port 3001 and launch the Vite/React frontend in your default browser.

3. Configuration
Open the dashboard in your browser.

Click the Settings (gear icon) or the "API Keys" prompt.

Enter your Kraken API Key, Kraken API Secret, and Gemini API Key.

These keys are stored safely in your local storage and are dynamically sent to your backend for secure requests.

⚠️ Disclaimer
Warning: This is experimental software. Automated cryptocurrency trading carries significant financial risk. The creators of this software are not responsible for any financial losses incurred. Always test your algorithms thoroughly and never trade with funds you cannot afford to lose.
