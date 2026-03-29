// -- HIER BEGINT DE VERKOOP LOGICA --
          else if (sellSignal && state.totalVolume > 0) {
            state.isProcessing = true; // LOCK AAN
            
            try {
                // 1. Haal EERST de actuele live-balans op van deze specifieke munt
                const displayParts = updatedBot.pair.display.split('/');
                const detectedBase = updatedBot.pair.base || displayParts[0];
                const baseKey = detectedBase === 'BTC' ? 'XXBT' : (detectedBase === 'ETH' ? 'XETH' : detectedBase);
                
                const resBal = await fetch('http://localhost:3001/api/balance', { method: 'POST', headers: getApiHeaders() });
                const bData = await resBal.json();
                
                // Hoeveel staat er écht in de wallet?
                const actualBaseBalance = parseFloat(bData[baseKey] || bData[detectedBase] || 0);
                
                // Verkoop letterlijk alles wat we hebben van deze munt (met de interne state als fallback)
                const volToSell = actualBaseBalance > 0 ? actualBaseBalance : state.totalVolume;

                // 2. Schiet de verkooporder in met het ECHTE volume
                const res = await fetch('http://localhost:3001/api/order', {
                  method: 'POST',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ pair: updatedBot.pair.altname, type: 'sell', ordertype: 'market', volume: volToSell.toFixed(8) })
                });
                const order = await res.json();

                if (!order.error) {
                  // 3. Bereken Winst/Verlies (We gebruiken state.totalVolume voor de originele investering)
                  const exitPrice = botCurrentClose; 
                  const entryPrice = state.averageEntryPrice || 0;
                  const volume = state.totalVolume || 0;
                  const pnl = (botCurrentClose - state.averageEntryPrice) * state.totalVolume;
                  const pnlPct = ((botCurrentClose - state.averageEntryPrice) / state.averageEntryPrice) * 100;
                  
                stats.trades.push({
                    id: Date.now().toString().slice(-8),
                    time: new Date().toLocaleString(),
                    entryPrice: entryPrice,
                    exitPrice: exitPrice, // ✅ Deze wordt nu expliciet opgeslagen
                    volume: volume,
                    pnl: pnl,
                    pnlPct: pnlPct
                  });
                  
                  if (pnl >= 0) {
                      stats.winCount = (stats.winCount || 0) + 1;
                      stats.grossProfit = (stats.grossProfit || 0) + pnl;
                  } else {
                      stats.lossCount = (stats.lossCount || 0) + 1;
                      stats.grossLoss = (stats.grossLoss || 0) + Math.abs(pnl);
                  }

                  state.totalVolume = 0;
                  state.averageEntryPrice = 0;
                  state.lastAction = 'SELL';
                  state.lastTradeTime = nowMs;
                  state.phase = 'WAITING';
                  playTradeSound('sell')
                  
                  updatedBot.logs.push({ 
                      time: new Date().toLocaleTimeString(), 
                      msg: `✅ SELL SUCCESSFUL @ $${botCurrentClose.toFixed(4)} (Sold: ${volToSell.toFixed(4)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`, 
                      type: 'sell' 
                  });

                  // 🔥 FORCEER DIRECTE OPSLAG NAAR SERVER
                  const newBotsArray = botsRef.current.map(b => b.id === updatedBot.id ? updatedBot : b);
                  fetch('http://localhost:3001/api/bots', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(newBotsArray)
                  }).catch(err => console.error("Fout bij opslaan bot state:", err));

                  if (typeof fetchBalances === 'function') fetchBalances();
                  if (typeof fetchOrders === 'function') setTimeout(() => fetchOrders(), 2000);

                } else {
                  logMsg = `❌ Auto-Sell Failed: ${order.error}`;
                  updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'error' });
                  state.phase = 'WAITING';
                }
            } catch (err) {
                updatedBot.logs.push({ time: new Date().toLocaleTimeString(), msg: `❌ Sell Error: ${err.message}`, type: 'error' });
                state.phase = 'WAITING';
            }
            state.isProcessing = false; // LOCK UIT
          }