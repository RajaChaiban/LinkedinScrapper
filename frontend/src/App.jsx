import { useState, useEffect } from 'react'
import { Rocket, Building2, MapPin, Search, Users, Briefcase, MessageSquare, Clock, Terminal } from 'lucide-react'

function App() {
  const [scrapeTarget, setScrapeTarget] = useState('jobs') // 'jobs' or 'recruiters'
  const [formData, setFormData] = useState({
    company: '',
    location: '',
    keywords: '',
    timePosted: '' // New field for minutes
  })
  const [status, setStatus] = useState('idle') // idle, running, completed
  const [logs, setLogs] = useState([]) // Array of log messages
  const [leads, setLeads] = useState([])
  const [messageTemplate, setMessageTemplate] = useState("Hi {firstName}, I noticed you're hiring for {role} at {company}. I'd love to connect!")

  const handleLaunch = async () => {
    setStatus('running')
    setLogs(['🚀 Initializing Human-Agent...'])
    setLeads([]) // Clear previous results

    // Construct Query Params
    const queryParams = new URLSearchParams({
      company: formData.company,
      location: formData.location,
      keywords: formData.keywords,
      ...(formData.timePosted && { time_posted_minutes: formData.timePosted })
    }).toString()

    // Start EventSource connection
    const eventSource = new EventSource(`http://localhost:8000/stream-scrape?${queryParams}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'status') {
          setLogs(prev => [...prev, `> ${data.message}`])
        } else if (data.type === 'result') {
          setLeads(data.data)
          setLogs(prev => [...prev, '✅ Scrape Complete!'])
          setStatus('completed')
          eventSource.close()
        } else if (data.type === 'error') {
          setLogs(prev => [...prev, `❌ Error: ${data.message}`])
          setStatus('error')
          eventSource.close()
        }
      } catch (e) {
        console.error("Error parsing SSE:", e)
      }
    }

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err)
      setLogs(prev => [...prev, '❌ Connection lost to agent.'])
      setStatus('error')
      eventSource.close()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              AutoApply Agent
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              status === 'running' ? 'bg-amber-100 text-amber-700 animate-pulse' : 
              status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {status === 'running' ? 'Agent Active' : status === 'completed' ? 'Task Complete' : 'Ready'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-12 gap-8">
        
        {/* Left Sidebar - Controls */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          
          {/* Campaign Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-500" />
              Target Parameters
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Company</label>
                <input 
                  type="text" 
                  placeholder="e.g. Google, Capital One"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={formData.company}
                  onChange={(e) => setFormData({...formData, company: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input 
                    type="text" 
                    placeholder="e.g. New York, Remote"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input 
                    type="text" 
                    placeholder="e.g. Software Engineer, Recruiter"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.keywords}
                    onChange={(e) => setFormData({...formData, keywords: e.target.value})}
                  />
                </div>
              </div>
              
              {/* New Time Filter Input */}
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Posted Within (Minutes)</label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input 
                    type="number" 
                    placeholder="e.g. 30 (Leave empty for any time)"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.timePosted}
                    onChange={(e) => setFormData({...formData, timePosted: e.target.value})}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Mode Selector */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <div className="grid grid-cols-2 gap-1">
              <button 
                onClick={() => setScrapeTarget('jobs')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  scrapeTarget === 'jobs' 
                    ? 'bg-blue-50 text-blue-700 shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Find Jobs
              </button>
              <button 
                onClick={() => setScrapeTarget('recruiters')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  scrapeTarget === 'recruiters' 
                    ? 'bg-purple-50 text-purple-700 shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users className="w-4 h-4" />
                Find Recruiters
              </button>
            </div>
          </div>

          {/* Launch Button */}
          <button 
            onClick={handleLaunch}
            disabled={status === 'running' || !formData.company}
            className={`w-full py-3 rounded-xl font-semibold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all ${
              status === 'running' 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {status === 'running' ? (
              <>Running Agent...</>
            ) : (
              <>Launch Campaign <Rocket className="w-5 h-5" /></>
            )}
          </button>

          {/* Live Agent Logs */}
          <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-800 p-4 h-64 flex flex-col">
            <h3 className="text-gray-400 text-xs font-mono mb-2 flex items-center gap-2">
              <Terminal className="w-3 h-3" /> AGENT LOGS
            </h3>
            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 scrollbar-hide">
              {logs.length === 0 && <span className="text-gray-600 italic">Ready to launch...</span>}
              {logs.map((log, i) => (
                <div key={i} className="text-green-400 break-words animate-in fade-in slide-in-from-bottom-1">
                  {log}
                </div>
              ))}
              <div id="log-end" />
            </div>
          </div>
        </div>

        {/* Right Content - Results */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {scrapeTarget === 'jobs' ? (
            // JOBS VIEW
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-semibold text-lg">Found Jobs ({leads.length})</h2>
              </div>
              
              <div className="flex-1 p-6 bg-gray-50/50 overflow-y-auto max-h-[700px]">
                {leads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                    <Briefcase className="w-12 h-12 opacity-20" />
                    <p>No jobs scraped yet. Launch the agent to begin.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leads.map((job, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow group">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-blue-600 group-hover:underline cursor-pointer">
                              {job.title}
                            </h3>
                            <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                              <Building2 className="w-3 h-3" /> {job.company}
                              <span className="text-gray-300">|</span>
                              <MapPin className="w-3 h-3" /> {job.location}
                            </div>
                          </div>
                          <a href={job.url} target="_blank" rel="noreferrer" className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md text-gray-700 transition-colors">
                            Apply
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // RECRUITERS VIEW (Placeholder)
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[600px] p-6">
               <div className="text-center text-gray-500 mt-20">
                 <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                 <p>Switch to 'Find Jobs' to test the Live Agent.</p>
                 <p className="text-sm mt-2">Recruiter mode coming soon.</p>
               </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

export default App