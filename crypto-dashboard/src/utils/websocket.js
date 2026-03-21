// src/utils/websocket.js
import { useState, useEffect, useRef } from 'react';

export class KrakenWSManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.subs = { ticker: {}, book: {} };
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.connect();
  }

  connect() {
    if (this.ws) return;
    this.ws = new WebSocket('wss://ws.kraken.com');
    
    this.ws.onopen = () => {
      this.isConnected = true;
      Object.keys(this.subs.ticker).forEach(pair => this.sendSub(pair, 'ticker'));
      Object.keys(this.subs.book).forEach(pair => this.sendSub(pair, 'book', 25));
      
      this.pingInterval = setInterval(() => {
        if (this.isConnected) this.ws.send(JSON.stringify({ event: 'ping' }));
      }, 20000);
    };
    
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (Array.isArray(msg)) this.handleMessage(msg);
    };
    
    this.ws.onclose = () => {
      this.isConnected = false;
      this.ws = null;
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      if (this.ws) this.ws.close();
    };
  }

  sendSub(pair, name, depth) {
    if (!this.isConnected) return;
    const payload = { event: 'subscribe', pair: [pair], subscription: { name } };
    if (depth) payload.subscription.depth = depth;
    this.ws.send(JSON.stringify(payload));
  }

  sendUnsub(pair, name, depth) {
    if (!this.isConnected) return;
    const payload = { event: 'unsubscribe', pair: [pair], subscription: { name } };
    if (depth) payload.subscription.depth = depth;
    this.ws.send(JSON.stringify(payload));
  }

  subscribe(type, pair, cb) {
    if (!this.subs[type][pair]) {
      this.subs[type][pair] = new Set();
      this.sendSub(pair, type, type === 'book' ? 25 : null);
    }
    this.subs[type][pair].add(cb);
  }

  unsubscribe(type, pair, cb) {
    if (!this.subs[type][pair]) return;
    this.subs[type][pair].delete(cb);
    if (this.subs[type][pair].size === 0) {
      delete this.subs[type][pair];
      this.sendUnsub(pair, type, type === 'book' ? 25 : null);
    }
  }

  handleMessage(data) {
    if (data.length < 4) return;
    const pair = data[data.length - 1];
    const channelName = data[data.length - 2];
    if (typeof channelName !== 'string' || typeof pair !== 'string') return;

    if (channelName === 'ticker' && this.subs.ticker[pair]) {
      this.subs.ticker[pair].forEach(cb => cb(data[1]));
    } else if (channelName.startsWith('book') && this.subs.book[pair]) {
      let payload = data[1];
      if (data.length === 5) payload = { ...data[1], ...data[2] };
      this.subs.book[pair].forEach(cb => cb(payload));
    }
  }
}

export const wsClient = new KrakenWSManager();

export const useKrakenMarketData = (wsname) => {
  const [currentPrice, setCurrentPrice] = useState(0);
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const asksMap = useRef(new Map());
  const bidsMap = useRef(new Map());

  useEffect(() => {
    if (!wsname) return;

    asksMap.current.clear();
    bidsMap.current.clear();
    setOrderBook({ asks: [], bids: [] });

    const handleTicker = (data) => {
      if (data.c && data.c[0]) setCurrentPrice(parseFloat(data.c[0]));
    };

    const handleBook = (data) => {
      if (data.as) {
        data.as.forEach(a => asksMap.current.set(parseFloat(a[0]), parseFloat(a[1])));
        data.bs.forEach(b => bidsMap.current.set(parseFloat(b[0]), parseFloat(b[1])));
      } else {
        if (data.a) data.a.forEach(a => parseFloat(a[1]) === 0 ? asksMap.current.delete(parseFloat(a[0])) : asksMap.current.set(parseFloat(a[0]), parseFloat(a[1])));
        if (data.b) data.b.forEach(b => parseFloat(b[1]) === 0 ? bidsMap.current.delete(parseFloat(b[0])) : bidsMap.current.set(parseFloat(b[0]), parseFloat(b[1])));
      }

      const asks = Array.from(asksMap.current.entries()).sort((a, b) => a[0] - b[0]).slice(0, 15);
      const bids = Array.from(bidsMap.current.entries()).sort((a, b) => b[0] - a[0]).slice(0, 15);

      let askCum = 0, bidCum = 0;
      const asksF = asks.map(a => { askCum += a[1]; return { price: a[0], volume: a[1], cumulative: askCum }; }).reverse();
      const bidsF = bids.map(b => { bidCum += b[1]; return { price: b[0], volume: b[1], cumulative: bidCum }; });
      const maxVol = Math.max(askCum, bidCum);

      setOrderBook({
        asks: asksF.map(a => ({ ...a, depth: maxVol ? (a.cumulative / maxVol) * 100 : 0 })),
        bids: bidsF.map(b => ({ ...b, depth: maxVol ? (b.cumulative / maxVol) * 100 : 0 }))
      });
    };

    wsClient.subscribe('ticker', wsname, handleTicker);
    wsClient.subscribe('book', wsname, handleBook);

    return () => {
      wsClient.unsubscribe('ticker', wsname, handleTicker);
      wsClient.unsubscribe('book', wsname, handleBook);
    };
  }, [wsname]);

  return { currentPrice, orderBook };
};