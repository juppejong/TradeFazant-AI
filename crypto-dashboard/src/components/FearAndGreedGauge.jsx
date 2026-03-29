import React, { useState, useEffect } from 'react';

const FearAndGreedGauge = () => {
  const [fngData, setFngData] = useState({ value: 50, classification: 'Neutral' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFnG = async () => {
      try {
        const res = await fetch('https://api.alternative.me/fng/');
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          setFngData({
            value: parseInt(data.data[0].value),
            classification: data.data[0].value_classification
          });
        }
      } catch (err) {
        console.error('Fout bij ophalen Fear & Greed:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFnG();
    const interval = setInterval(fetchFnG, 3600000); 
    return () => clearInterval(interval);
  }, []);

  const getColor = (val) => {
    if (val <= 25) return '#ef4444'; // Rose
    if (val <= 45) return '#f97316'; // Oranje
    if (val <= 55) return '#eab308'; // Geel
    if (val <= 75) return '#84cc16'; // Limoen
    return '#10b981';                // Smaragd
  };

  const currentColor = getColor(fngData.value);

  return (
    // 🔥 De container is nu exact h-[50px] en flex-row (horizontaal)
    <div className="h-[50px] bg-[#0b0e11] border border-zinc-800 rounded-xl px-4 flex items-center shadow-sm min-w-[280px]">
      {loading ? (
         <span className="text-zinc-600 animate-pulse text-[10px] font-bold uppercase tracking-widest w-full text-center">Loading Data...</span>
      ) : (
         <>
           {/* Linkerkant: Kloppend bolletje, Titel en Cijfer */}
           <div className="flex items-center space-x-3 shrink-0">
             
             {/* Live Pulserend Bolletje */}
             <div className="relative flex items-center justify-center">
                <span className="absolute w-2.5 h-2.5 rounded-full animate-ping opacity-50" style={{ backgroundColor: currentColor }}></span>
                <span className="relative w-2 h-2 rounded-full" style={{ backgroundColor: currentColor }}></span>
             </div>
             
             {/* Tekst */}
             <div className="flex flex-col justify-center">
               <span className="text-[8px] uppercase text-zinc-500 font-bold tracking-widest leading-none mb-1">Fear & Greed</span>
               <div className="flex items-baseline space-x-1.5">
                 <span className="text-sm font-black font-mono leading-none" style={{ color: currentColor }}>{fngData.value}</span>
                 <span className="text-[10px] font-bold uppercase text-zinc-200 leading-none">{fngData.classification}</span>
               </div>
             </div>
           </div>
           
           {/* Rechterkant: De Horizontale Gradient Balk */}
           <div className="flex-1 ml-5 flex items-center">
               <div className="w-full h-1.5 bg-zinc-900 rounded-full relative">
                  {/* De regenboog achtergrond */}
                  <div className="absolute inset-0 rounded-full opacity-50 bg-gradient-to-r from-rose-500 via-yellow-500 to-emerald-500"></div>
                  
                  {/* De witte indicator (schuift naar het juiste percentage) */}
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 bg-white rounded-[1px] shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-all duration-1000 ease-out z-10"
                    style={{ left: `calc(${fngData.value}% - 3px)` }}
                  ></div>
               </div>
           </div>
         </>
      )}
    </div>
  );
};

export default FearAndGreedGauge;