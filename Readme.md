# TradeFazant AI 📈🤖

> **The Ultimate Multi-Exchange Quantitative Trading Terminal.**
> Built with **React** and **Node.js**, leveraging **Kraken**, **Coinbase Advanced**, and **Google Gemini AI**.

TradeFazant AI is an advanced trading platform designed to bridge the gap between manual trading and algorithmic automation. It offers a sophisticated interface to manage your portfolio, run automated trading strategies, and utilize AI for real-time market analysis.
<img width="1902" height="909" alt="image" src="https://github.com/user-attachments/assets/5da788ec-55e1-4022-a0ac-57e7fa400364" />


---

## ✨ Key Features

### 🤖 Advanced Auto-Trading Engine
* **Multi-Strategy Support:** Create and manage bots using RSI, Bollinger Bands, and SMA trend filters.
* **Intelligent Execution:** Features advanced logic such as **Trailing Buy** and **Trailing Sell** to capture better entry and exit points.
* **Risk Management:** Set strict Stop-Loss (SL) and Take-Profit (TP) targets for every automated strategy.
* **DCA Capability:** Integrated Dollar Cost Averaging (DCA) to manage positions during market pullbacks.
* **Live Bot Tracking:** Monitor bot performance, logs, and real-time PnL directly from the dashboard.

### 💸 Multi-Exchange & Fee Optimization
* **Dual Exchange Support:** Seamlessly trade on both **Kraken** and **Coinbase Advanced** simultaneously.
* **Smart Limit Orders (Maker):** Optimize your profits by automatically using "Post-Only" Limit orders to qualify for lower Maker fees instead of expensive Market fees.
* **Unified Portfolio:** View your live balances and equity curves across different exchanges in one centralized view.

### 🧠 Gemini AI Intelligence
* **AI Advisor:** An integrated assistant that analyzes multi-timeframe market conditions and provides actionable advice.
* **Automated Filtering:** Bots can be configured with an AI Filter, ensuring trades only execute when the Gemini AI confirms the market bias.

### 📊 Professional Visualization Tools
* **High-Fidelity Charting:** Powered by TradingView's Lightweight Charts, including indicators like SMA, BB, RSI, and MACD.
* **Visual Trade Markers:** See exactly where your bots or manual orders entered and exited the market on the chart.
* **Real-time "Gadgets":** Includes a scrolling Market Ticker for top gainers, a Fear & Greed Index gauge, and a live Orderbook pressure bar.
* **Toast Notification System:** Receive instant visual feedback for order executions, profit hits, or system errors.

---

## 🚀 Installation & Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/juppejong/TradeFazant-AI.git
cd TradeFazant-AI
```

### 2. Install Backend Dependencies
The backend handles exchange communication and secure HMAC signatures.
```bash
cd crypto-backend
npm install
node server.js
```
*The backend server starts on port `3001`.*

### 3. Install Frontend Dependencies
The frontend provides the interactive React dashboard.
```bash
cd ../crypto-dashboard
npm install
npm run dev
```
*The dashboard will launch in your browser (typically at `http://localhost:5173`).*

---

## ⚙️ Configuration

1.  Open the dashboard in your browser.
2.  Click the **Settings (gear icon)** or the **API Keys** status prompt in the header.
3.  Enter your credentials:
    * **Kraken:** API Key and Secret.
    * **Coinbase:** API Key and Private Key.
    * **Google Gemini:** API Key for AI features.
4.  Click **Save & Restart**. Your keys are stored locally in your browser and used securely by your local backend.

---

## 🛠️ Tech Stack

* **Frontend:** React 18, Tailwind CSS, Lucide Icons.
* **Charting:** Lightweight Charts (TradingView).
* **Backend:** Node.js, Express.
* **AI:** Google Gemini 2.5 Flash API.
* **Data:** Kraken REST/WebSockets & Coinbase Advanced API.

---

⚠️ **Disclaimer** *This is experimental software for educational and research purposes. Automated cryptocurrency trading involves significant financial risk. The creators are not responsible for any financial losses. Always test strategies thoroughly and never trade with money you cannot afford to lose.*
