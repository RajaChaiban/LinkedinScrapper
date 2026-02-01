import { useState, useRef } from 'react';

function App() {
  const [logs, setLogs] = useState([
    { time: "10:42:01", type: "SYSTEM", msg: "Initializing neural processing unit...", color: "text-primary" },
    { time: "10:42:05", type: "AUTH", msg: "Secure handshake established.", color: "text-green-500" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [scrapeTarget, setScrapeTarget] = useState('jobs');
  
  // Form State
  const [formData, setFormData] = useState({
    company: '',
    location: '',
    keywords: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addLog = (type, msg, color = "text-slate-300") => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { time, type, msg, color }]);
  };

  const handleLaunch = async () => {
    if (!formData.company || !formData.location) {
        addLog("ERROR", "Please fill in Company and Location.", "text-red-500");
        return;
    }

    setIsLoading(true);
    addLog("SYSTEM", "Starting AI Agent sequence...", "text-blue-400");
    
    try {
      const response = await fetch('http://localhost:8000/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_company: formData.company,
          location: formData.location,
          keywords: formData.keywords,
          scrape_target: scrapeTarget
        })
      });
      
      const data = await response.json();
      addLog("API", data.message, "text-green-400");
      
      // Simulate streaming logs for the demo visual
      setTimeout(() => addLog("SCRAPER", `Targeting: ${formData.company}`, "text-primary"), 1000);
      setTimeout(() => addLog("ANALYTICS", `Searching for ${scrapeTarget}...`, "text-yellow-500"), 2500);
      setTimeout(() => {
        addLog("SUCCESS", "Data extraction complete.", "text-green-500");
        setIsLoading(false);
      }, 5000);

    } catch (error) {
      addLog("ERROR", "Connection failed. Is backend running?", "text-red-500");
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden max-w-[480px] mx-auto shadow-2xl bg-[#0a192f] mesh-gradient font-display text-white selection:bg-primary/30">
      <style>{`
        :root {
            --linkedin-blue: #0077B5;
            --glass-bg: rgba(255, 255, 255, 0.08);
            --glass-border: rgba(255, 255, 255, 0.15);
        }
        .mesh-gradient {
            background-color: #0a192f;
            background-image: 
                radial-gradient(at 0% 0%, rgba(0, 119, 181, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(0, 119, 181, 0.1) 0px, transparent 50%),
                radial-gradient(at 50% 50%, rgba(10, 25, 47, 1) 0px, transparent 100%);
        }
        .glass-card {
            background: var(--glass-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
        }
        .terminal-bg {
            background: rgba(5, 10, 20, 0.85);
            backdrop-filter: blur(8px);
        }
        .toggle-glow {
            box-shadow: 0 0 15px rgba(0, 119, 181, 0.3);
        }
        .button-glow {
            box-shadow: 0 0 20px rgba(0, 119, 181, 0.4);
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center p-4 pb-2 justify-between z-20">
        <div className="flex size-10 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white cursor-pointer hover:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-xl">menu_open</span>
        </div>
        <div className="flex flex-col items-center">
          <h2 className="text-white text-base font-bold tracking-tight">AI Scraper</h2>
          <div className="flex items-center gap-1">
            <div className={`size-1.5 ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'} rounded-full`}></div>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{isLoading ? 'Processing' : 'System Online'}</span>
          </div>
        </div>
        <div className="flex w-10 items-center justify-end">
          <button className="flex size-10 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6 pt-4 scrollbar-hide">
        
        {/* Configuration Card */}
        <div className="glass-card rounded-[2rem] p-6 space-y-5">
          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-tight">Campaign Setup</h3>
            <p className="text-xs text-slate-400">Target specific LinkedIn datasets</p>
          </div>
          
          <div className="space-y-4">
            {/* Target Company */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Target Company</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary text-xl">corporate_fare</span>
                <input 
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 h-14 pl-12 pr-4 text-sm placeholder:text-slate-500 transition-all" 
                  placeholder="e.g. Microsoft, Tesla"
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Location</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary text-xl">explore</span>
                <input 
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 h-14 pl-12 pr-4 text-sm placeholder:text-slate-500 transition-all" 
                  placeholder="e.g. London, United Kingdom"
                />
              </div>
            </div>

            {/* Keywords */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Key Search Terms</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary text-xl">psychology</span>
                <input 
                  name="keywords"
                  value={formData.keywords}
                  onChange={handleInputChange}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 h-14 pl-12 pr-4 text-sm placeholder:text-slate-500 transition-all" 
                  placeholder="e.g. Head of Recruitment"
                />
              </div>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="pt-2">
            <div className="relative p-1 bg-black/40 rounded-2xl flex items-center h-14 border border-white/5">
              <div 
                className={`absolute inset-y-1 w-1/2 bg-primary rounded-xl transition-all duration-300 toggle-glow ${scrapeTarget === 'jobs' ? 'left-1' : 'left-[calc(50%-4px)] translate-x-full'}`}
              ></div>
              <button 
                onClick={() => setScrapeTarget('jobs')}
                className={`flex-1 relative z-10 flex items-center justify-center gap-2 font-bold text-sm transition-colors ${scrapeTarget === 'jobs' ? 'text-white' : 'text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[18px]">work</span>
                Jobs
              </button>
              <button 
                onClick={() => setScrapeTarget('recruiters')}
                className={`flex-1 relative z-10 flex items-center justify-center gap-2 font-bold text-sm transition-colors ${scrapeTarget === 'recruiters' ? 'text-white' : 'text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[18px]">groups</span>
                Recruiters
              </button>
            </div>
          </div>
        </div>

        {/* Launch Button */}
        <button 
          onClick={handleLaunch}
          disabled={isLoading}
          className="w-full relative group"
        >
          <div className="absolute -inset-1 bg-primary rounded-[2rem] blur opacity-30 group-hover:opacity-60 transition-opacity"></div>
          <div className="relative flex items-center justify-center gap-4 bg-primary text-white h-20 rounded-[2rem] font-black text-xl button-glow border-t border-white/20 active:scale-[0.97] transition-all disabled:opacity-70 disabled:grayscale">
            {isLoading ? (
               <span className="material-symbols-outlined text-3xl animate-spin">refresh</span>
            ) : (
               <span className="material-symbols-outlined text-3xl">auto_awesome</span>
            )}
            {isLoading ? 'Agent Active...' : 'Launch AI Agent'}
          </div>
        </button>

        {/* Live Logs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">terminal</span>
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">Live Agent Stream</h4>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono text-slate-500">v4.2.0-stable</span>
              <div className={`size-2 bg-primary rounded-full shadow-[0_0_8px_#0077B5] ${isLoading ? 'animate-pulse' : ''}`}></div>
            </div>
          </div>

          <div className="terminal-bg border border-white/10 rounded-3xl p-5 font-mono text-[11px] h-72 overflow-y-auto shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/10 blur-sm pointer-events-none"></div>
            <div className="flex flex-col gap-3">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-slate-600 shrink-0">{log.time}</span>
                  <div className="flex flex-col">
                    <span className={`${log.color.replace('text-slate-300', 'text-primary')} font-bold`}>● {log.type || 'INFO'}</span>
                    <span className="text-slate-300">{log.msg}</span>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 items-start opacity-50">
                <span className="text-slate-600 shrink-0">...</span>
                <div className="flex flex-col">
                  <span className="text-slate-500 animate-pulse">Waiting for next packet block...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Nav */}
      <div className="bg-[#050a14]/95 backdrop-blur-xl border-t border-white/5 flex justify-around items-center py-4 px-6 z-30">
        <button className="flex flex-col items-center gap-1.5 text-primary">
          <span className="material-symbols-outlined text-2xl fill-1">grid_view</span>
          <span className="text-[9px] font-black uppercase tracking-tighter">Dashboard</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors">
          <span className="material-symbols-outlined text-2xl">monitoring</span>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Insights</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors">
          <span className="material-symbols-outlined text-2xl">inventory_2</span>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Exports</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors">
          <span className="material-symbols-outlined text-2xl">settings_account_box</span>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Settings</span>
        </button>
      </div>
    </div>
  );
}

export default App;