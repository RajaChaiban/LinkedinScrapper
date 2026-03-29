import { useState, useEffect, useRef, useMemo } from 'react'
import { Rocket, Building2, MapPin, Search, Users, Briefcase, MessageSquare, Clock, Terminal, ExternalLink, Filter, ChevronRight, Hash, ArrowUpRight, X, ChevronDown, Check, FileText, Upload, AlertCircle, Sparkles, ArrowUpDown, UserCircle, GraduationCap, UserPlus } from 'lucide-react'

const COMPANIES = {
  "Google": ["Mountain View, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Remote"],
  "Meta": ["Menlo Park, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Remote"],
  "Amazon": ["Seattle, WA", "New York, NY", "Arlington, VA", "Austin, TX", "Remote"],
  "Apple": ["Cupertino, CA", "Austin, TX", "New York, NY", "Remote"],
  "Microsoft": ["Redmond, WA", "New York, NY", "Atlanta, GA", "Remote"],
  "Netflix": ["Los Gatos, CA", "Los Angeles, CA", "New York, NY", "Remote"],
  "Capital One": ["McLean, VA", "New York, NY", "Richmond, VA", "Plano, TX", "Remote"],
  "JPMorgan Chase": ["New York, NY", "Columbus, OH", "Jersey City, NJ", "Remote"],
  "Goldman Sachs": ["New York, NY", "Dallas, TX", "Salt Lake City, UT", "West Palm Beach, FL", "Remote"],
  "Anthropic": ["San Francisco, CA", "New York, NY", "Remote"],
  "OpenAI": ["San Francisco, CA", "Remote"],
  "Stripe": ["San Francisco, CA", "New York, NY", "Seattle, WA", "Remote"],
  "Salesforce": ["San Francisco, CA", "Indianapolis, IN", "New York, NY", "Remote"],
  "Tesla": ["Austin, TX", "Palo Alto, CA", "Fremont, CA"],
  "NVIDIA": ["Santa Clara, CA", "Austin, TX", "Remote"],
  "Adobe": ["San Jose, CA", "New York, NY", "Seattle, WA", "Remote"],
  "Uber": ["San Francisco, CA", "New York, NY", "Seattle, WA", "Remote"],
  "Airbnb": ["San Francisco, CA", "New York, NY", "Remote"],
  "Spotify": ["New York, NY", "Los Angeles, CA", "Remote"],
  "LinkedIn": ["Sunnyvale, CA", "New York, NY", "San Francisco, CA", "Remote"],
  "Palantir": ["Denver, CO", "New York, NY", "Palo Alto, CA", "Remote"],
  "Coinbase": ["San Francisco, CA", "New York, NY", "Remote"],
  "Databricks": ["San Francisco, CA", "New York, NY", "Seattle, WA", "Remote"],
  "Snowflake": ["San Mateo, CA", "New York, NY", "Seattle, WA", "Remote"],
}

// Helper to get score color
const getScoreColor = (score) => {
  if (score === null || score === undefined) return { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' }
  if (score >= 8) return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' }
  if (score >= 6) return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' }
  if (score >= 4) return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' }
  return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' }
}

function App() {
  const [scrapeTarget, setScrapeTarget] = useState('jobs') // 'jobs' or 'recruiters'
  const [selectedCompanies, setSelectedCompanies] = useState([])
  const [selectedLocations, setSelectedLocations] = useState([])
  const [keywords, setKeywords] = useState('')
  const [timePosted, setTimePosted] = useState('')
  const [companySearch, setCompanySearch] = useState('')
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false)
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)
  const [status, setStatus] = useState('idle') // idle, running, analyzing, completed
  const [logs, setLogs] = useState([]) // Array of log messages
  const [leads, setLeads] = useState([])
  const [selectedJob, setSelectedJob] = useState(null) // index of selected job
  const [searchFilter, setSearchFilter] = useState('') // filter results
  const [sortByScore, setSortByScore] = useState(false)
  const [useCDP, setUseCDP] = useState(true) // true = connect to existing Chrome, false = launch new

  // Auto-connect state (recruiter mode)
  const [university, setUniversity] = useState('')
  const [autoConnect, setAutoConnect] = useState(false)
  const [useConnectionNote, setUseConnectionNote] = useState(false)
  const [connectionNote, setConnectionNote] = useState('')
  const [connectionLimit, setConnectionLimit] = useState(10)
  const [connectProgress, setConnectProgress] = useState(null) // { sent_count, limit, current_name }
  const [connectionStatuses, setConnectionStatuses] = useState({}) // keyed by profile_url
  const resultsEndRef = useRef(null)
  const companyDropdownRef = useRef(null)
  const locationDropdownRef = useRef(null)

  // Resume state
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeStatus, setResumeStatus] = useState('none') // 'none', 'uploading', 'uploaded', 'error'
  const [resumeInfo, setResumeInfo] = useState(null)
  const [resumeError, setResumeError] = useState('')

  // Analysis progress state
  const [analysisProgress, setAnalysisProgress] = useState(null) // { current, total, job_title }

  // Apply Wizard state
  const [applyMode, setApplyMode] = useState(false)
  const [applyStatus, setApplyStatus] = useState('idle') // idle, scraping, previewing, applying, done
  const [applyPreviews, setApplyPreviews] = useState([])
  const [applyResults, setApplyResults] = useState([])
  const [selectedForApply, setSelectedForApply] = useState(new Set())
  const [applyLogs, setApplyLogs] = useState([])
  const [applySummary, setApplySummary] = useState(null)
  const [relevanceThreshold, setRelevanceThreshold] = useState(7)
  const [expandedPreview, setExpandedPreview] = useState(null)

  const fileInputRef = useRef(null)

  // Check resume status on mount
  useEffect(() => {
    fetch('http://localhost:8001/resume-status')
      .then(res => res.json())
      .then(data => {
        if (data.uploaded) {
          setResumeStatus('uploaded')
          setResumeInfo({ filename: data.filename, text_length: data.text_length })
        }
      })
      .catch(() => {})
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target)) {
        setCompanyDropdownOpen(false)
      }
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setLocationDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Compute available locations from selected companies
  const availableLocations = useMemo(() => {
    const locs = new Set()
    for (const company of selectedCompanies) {
      const offices = COMPANIES[company]
      if (offices) offices.forEach(loc => locs.add(loc))
    }
    // Sort with "Remote" first, then alphabetical
    return [...locs].sort((a, b) => {
      if (a === 'Remote') return -1
      if (b === 'Remote') return 1
      return a.localeCompare(b)
    })
  }, [selectedCompanies])

  // Remove locations that are no longer available when companies change
  useEffect(() => {
    setSelectedLocations(prev => prev.filter(loc => availableLocations.includes(loc)))
  }, [availableLocations])

  // Clear leads when switching between modes
  useEffect(() => {
    setLeads([])
    setSearchFilter('')
    setSelectedJob(null)
    setSortByScore(false)
    setConnectionStatuses({})
    setConnectProgress(null)
  }, [scrapeTarget])

  // Filtered company list for the search input
  const filteredCompanies = Object.keys(COMPANIES).filter(name =>
    name.toLowerCase().includes(companySearch.toLowerCase())
  )

  // Filter leads based on search input
  const filteredLeads = useMemo(() => {
    let result = leads.filter(job => {
      if (!searchFilter.trim()) return true
      const q = searchFilter.toLowerCase()
      return (
        (job.name || '').toLowerCase().includes(q) ||
        (job.title || '').toLowerCase().includes(q) ||
        (job.company || '').toLowerCase().includes(q) ||
        (job.location || '').toLowerCase().includes(q)
      )
    })

    // Sort by score if enabled
    if (sortByScore) {
      result = [...result].sort((a, b) => {
        const scoreA = a.analysis?.score ?? -1
        const scoreB = b.analysis?.score ?? -1
        return scoreB - scoreA
      })
    }

    return result
  }, [leads, searchFilter, sortByScore])

  // Check if any job has analysis data
  const hasAnalysisData = leads.some(job => job.analysis?.score !== null && job.analysis?.score !== undefined)

  // Download leads as CSV
  const downloadCSV = () => {
    if (!leads.length) return
    const isRecruiters = scrapeTarget === 'recruiters'
    const headers = isRecruiters
      ? ['Name', 'Title', 'Company', 'Location', 'Profile URL', 'Connection Degree', 'Mutual Connections', 'Connection Status']
      : ['Title', 'Company', 'Location', 'URL', 'Fit Score', 'Summary']
    const rows = leads.map(r => isRecruiters
      ? [r.name, r.title, r.company, r.location, r.profile_url, r.connection_degree, r.mutual_connections, r.connection_status ?? '']
      : [r.title, r.company, r.location, r.url, r.analysis?.score ?? '', r.analysis?.summary ?? '']
    )
    const escape = (cell) => `"${(cell ?? '').toString().replace(/"/g, '""')}"`
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `linkedin_${isRecruiters ? 'recruiters' : 'jobs'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Scroll logs to bottom on new log entry
  useEffect(() => {
    const logEnd = document.getElementById('log-end')
    if (logEnd) logEnd.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleConnect = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Resume upload handlers
  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.docx')) {
      setResumeError('Please upload a .pdf or .docx file')
      setResumeStatus('error')
      return
    }

    setResumeFile(file)
    setResumeStatus('uploading')
    setResumeError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('http://localhost:8001/upload-resume', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Upload failed')
      }

      const data = await res.json()
      setResumeInfo(data)
      setResumeStatus('uploaded')
    } catch (err) {
      setResumeError(err.message)
      setResumeStatus('error')
    }
  }

  const clearResume = async () => {
    try {
      await fetch('http://localhost:8001/resume', { method: 'DELETE' })
    } catch {}
    setResumeFile(null)
    setResumeStatus('none')
    setResumeInfo(null)
    setResumeError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Check if search text is a custom entry (not an exact match in COMPANIES)
  const companySearchTrimmed = companySearch.trim()
  const isExactMatch = Object.keys(COMPANIES).some(
    name => name.toLowerCase() === companySearchTrimmed.toLowerCase()
  )
  const alreadySelected = selectedCompanies.some(
    c => c.toLowerCase() === companySearchTrimmed.toLowerCase()
  )
  const showAddCustom = companySearchTrimmed && !isExactMatch && !alreadySelected

  const addCustomCompany = () => {
    if (!companySearchTrimmed || alreadySelected) return
    setSelectedCompanies(prev => [...prev, companySearchTrimmed])
    setCompanySearch('')
  }

  const toggleCompany = (company) => {
    setSelectedCompanies(prev =>
      prev.includes(company)
        ? prev.filter(c => c !== company)
        : [...prev, company]
    )
  }

  const removeCompany = (company) => {
    setSelectedCompanies(prev => prev.filter(c => c !== company))
  }

  const toggleLocation = (loc) => {
    setSelectedLocations(prev =>
      prev.includes(loc)
        ? prev.filter(l => l !== loc)
        : [...prev, loc]
    )
  }

  const removeLocation = (loc) => {
    setSelectedLocations(prev => prev.filter(l => l !== loc))
  }

  const handleLaunch = async () => {
    setStatus('running')
    setLogs(['> Initializing Human-Agent...'])
    setLeads([]) // Clear previous results
    setAnalysisProgress(null)
    setSortByScore(false)
    setConnectionStatuses({})
    setConnectProgress(null)

    // Construct Query Params
    const effectiveKeywords = (scrapeTarget === 'recruiters' && !keywords.trim())
      ? 'recruiter OR talent acquisition'
      : keywords
    const queryParams = new URLSearchParams({
      companies: selectedCompanies.join(','),
      location: selectedLocations.join(','),
      keywords: effectiveKeywords,
      mode: scrapeTarget,
      use_cdp: useCDP,
      ...(scrapeTarget === 'jobs' && timePosted && { time_posted_minutes: timePosted }),
      ...(scrapeTarget === 'recruiters' && university.trim() && { university: university.trim() }),
      ...(scrapeTarget === 'recruiters' && autoConnect && { auto_connect: true }),
      ...(scrapeTarget === 'recruiters' && autoConnect && useConnectionNote && { connection_note: connectionNote.slice(0, 300) }),
      ...(scrapeTarget === 'recruiters' && autoConnect && { connection_limit: connectionLimit }),
    }).toString()

    // Start EventSource connection
    const eventSource = new EventSource(`http://localhost:8001/stream-scrape?${queryParams}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setLogs(prev => [...prev, `> ${data.message}`])
        } else if (data.type === 'analysis_start') {
          setStatus('analyzing')
          setLogs(prev => [...prev, `> Starting AI analysis for ${data.total} jobs...`])
          setAnalysisProgress({ current: 0, total: data.total, job_title: '' })
        } else if (data.type === 'analysis_progress') {
          setAnalysisProgress({
            current: data.current,
            total: data.total,
            job_title: data.job_title
          })
          setLogs(prev => [...prev, `> Analyzing: ${data.job_title} (${data.current}/${data.total})`])
        } else if (data.type === 'connect_start') {
          setLogs(prev => [...prev, `> Auto-connect: targeting up to ${data.limit} of ${data.total_candidates} unconnected profiles`])
          setConnectProgress({ sent_count: 0, limit: data.limit, current_name: '' })

        } else if (data.type === 'connect_result') {
          setConnectionStatuses(prev => ({ ...prev, [data.profile_url]: data.status }))
          setConnectProgress(prev => ({ ...prev, sent_count: data.sent_count, current_name: data.name }))
          setLogs(prev => [...prev, `> ${data.status === 'sent' ? 'Connected:' : 'Skipped:'} ${data.name} (${data.sent_count}/${data.limit})`])

        } else if (data.type === 'connect_captcha') {
          setLogs(prev => [...prev, `> CAPTCHA detected — auto-connect paused. Solve in your browser.`])

        } else if (data.type === 'connect_weekly_limit') {
          setLogs(prev => [...prev, `> LinkedIn weekly invitation limit reached. Auto-connect stopped.`])

        } else if (data.type === 'connect_complete') {
          setConnectProgress(null)
          setLogs(prev => [...prev, `> Auto-connect complete: ${data.sent_count} sent out of ${data.total_attempted} candidates`])

        } else if (data.type === 'result') {
          setLeads(data.data)
          setLogs(prev => [...prev, '> Scrape Complete!'])
          setStatus('completed')
          setAnalysisProgress(null)
          eventSource.close()
        } else if (data.type === 'error') {
          setLogs(prev => [...prev, `> Error: ${data.message}`])
          setStatus('error')
          setAnalysisProgress(null)
          eventSource.close()
        }
      } catch (e) {
        console.error("Error parsing SSE:", e)
      }
    }

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err)
      setLogs(prev => [...prev, '> Connection lost to agent.'])
      setStatus('error')
      setAnalysisProgress(null)
      eventSource.close()
    }
  }

  const handleStartApplyWizard = () => {
    if (selectedCompanies.length === 0) return
    if (resumeStatus !== 'uploaded') return

    setApplyMode(true)
    setApplyStatus('scraping')
    setApplyPreviews([])
    setApplyResults([])
    setSelectedForApply(new Set())
    setApplyLogs(['> Starting Application Wizard...'])
    setApplySummary(null)

    const queryParams = new URLSearchParams({
      companies: selectedCompanies.join(','),
      location: selectedLocations.join(','),
      keywords: keywords,
      preview_only: 'true',
      relevance_threshold: relevanceThreshold,
      use_cdp: useCDP,
      ...(timePosted && { time_posted_minutes: timePosted }),
    }).toString()

    const eventSource = new EventSource(`http://localhost:8001/stream-apply?${queryParams}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setApplyLogs(prev => [...prev, `> ${data.message}`])
        } else if (data.type === 'analysis_progress') {
          setApplyStatus('scraping')
          setApplyLogs(prev => [...prev, `> Analyzing: ${data.job_title} (${data.current}/${data.total}) - Score: ${data.score}/10`])
        } else if (data.type === 'preview') {
          setApplyStatus('previewing')
          setApplyPreviews(prev => [...prev, data])
          if (data.relevance_score >= relevanceThreshold) {
            setSelectedForApply(prev => new Set([...prev, data.job_id]))
          }
        } else if (data.type === 'preview_done') {
          setApplyLogs(prev => [...prev, `> ${data.total_previews} jobs ready for review.`])
        } else if (data.type === 'applying') {
          setApplyStatus('applying')
          setApplyLogs(prev => [...prev, `> Applying to: ${data.job_title} at ${data.company} (${data.current}/${data.total})`])
        } else if (data.type === 'applied') {
          setApplyResults(prev => [...prev, data])
          setApplyLogs(prev => [...prev, `> ${data.success ? 'Applied' : 'Failed'}: ${data.job_title} - ${data.message || ''}`])
        } else if (data.type === 'done') {
          setApplyStatus('done')
          setApplySummary(data)
          setApplyLogs(prev => [...prev, `> Complete! Applied: ${data.total_applied}, Failed: ${data.total_failed}, Skipped: ${data.total_skipped}`])
          eventSource.close()
        } else if (data.type === 'error') {
          setApplyLogs(prev => [...prev, `> Error: ${data.message}`])
          if (data.severity === 'error') {
            setApplyStatus('done')
            eventSource.close()
          }
        }
      } catch (e) {
        console.error("Error parsing apply SSE:", e)
      }
    }

    eventSource.onerror = () => {
      setApplyLogs(prev => [...prev, '> Connection lost.'])
      setApplyStatus('done')
      eventSource.close()
    }
  }

  const handleApplyToSelected = () => {
    if (selectedForApply.size === 0) return

    setApplyStatus('applying')
    setApplyResults([])
    setApplyLogs(prev => [...prev, `> Applying to ${selectedForApply.size} selected jobs...`])

    const queryParams = new URLSearchParams({
      companies: selectedCompanies.join(','),
      location: selectedLocations.join(','),
      keywords: keywords,
      preview_only: 'false',
      relevance_threshold: relevanceThreshold,
      use_cdp: useCDP,
      approved_jobs: [...selectedForApply].join(','),
      ...(timePosted && { time_posted_minutes: timePosted }),
    }).toString()

    const eventSource = new EventSource(`http://localhost:8001/stream-apply?${queryParams}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setApplyLogs(prev => [...prev, `> ${data.message}`])
        } else if (data.type === 'applying') {
          setApplyLogs(prev => [...prev, `> Applying: ${data.job_title} at ${data.company} (${data.current}/${data.total})`])
        } else if (data.type === 'applied') {
          setApplyResults(prev => [...prev, data])
          setApplyLogs(prev => [...prev, `> ${data.success ? 'Applied' : 'Failed'}: ${data.job_title}`])
        } else if (data.type === 'done') {
          setApplyStatus('done')
          setApplySummary(data)
          setApplyLogs(prev => [...prev, `> Done! Applied: ${data.total_applied}, Failed: ${data.total_failed}`])
          eventSource.close()
        } else if (data.type === 'error') {
          setApplyLogs(prev => [...prev, `> Error: ${data.message}`])
          if (data.severity === 'error') {
            setApplyStatus('done')
            eventSource.close()
          }
        }
      } catch (e) {
        console.error("SSE parse error:", e)
      }
    }

    eventSource.onerror = () => {
      setApplyLogs(prev => [...prev, '> Connection lost.'])
      setApplyStatus('done')
      eventSource.close()
    }
  }

  const toggleJobApproval = (jobId) => {
    setSelectedForApply(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
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
              status === 'analyzing' ? 'bg-purple-100 text-purple-700 animate-pulse' :
              status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {status === 'running' ? 'Agent Active' :
               status === 'analyzing' ? `Analyzing ${analysisProgress?.current || 0}/${analysisProgress?.total || 0}` :
               status === 'completed' ? 'Task Complete' : 'Ready'}
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
              {/* Company Multi-Select Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Companies</label>
                <div ref={companyDropdownRef} className="relative">
                  {/* Selected company chips */}
                  {selectedCompanies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedCompanies.map(company => (
                        <span
                          key={company}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                        >
                          {company}
                          <button
                            onClick={() => removeCompany(company)}
                            className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={selectedCompanies.length > 0 ? "Add more companies..." : "Search or type a company..."}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      onFocus={() => setCompanyDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (filteredCompanies.length === 1 && !alreadySelected) {
                            toggleCompany(filteredCompanies[0])
                            setCompanySearch('')
                          } else if (showAddCustom) {
                            addCustomCompany()
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${companyDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Dropdown list */}
                  {companyDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredCompanies.map(company => {
                        const isSelected = selectedCompanies.includes(company)
                        return (
                          <button
                            key={company}
                            onClick={() => toggleCompany(company)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${
                              isSelected ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}>
                              {company}
                            </span>
                            <span className="ml-auto text-xs text-gray-400">
                              {COMPANIES[company].length} offices
                            </span>
                          </button>
                        )
                      })}
                      {showAddCustom && (
                        <button
                          onClick={addCustomCompany}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-blue-50 transition-colors border-t border-gray-100"
                        >
                          <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-600 text-xs font-bold">+</span>
                          </div>
                          <span className="text-blue-700 font-medium">
                            Add "{companySearchTrimmed}"
                          </span>
                        </button>
                      )}
                      {filteredCompanies.length === 0 && !showAddCustom && (
                        <div className="px-4 py-3 text-sm text-gray-500">Type a company name to add it</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Location Multi-Select Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Locations</label>
                <div ref={locationDropdownRef} className="relative">
                  {/* Selected location chips */}
                  {selectedLocations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedLocations.map(loc => (
                        <span
                          key={loc}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium"
                        >
                          {loc}
                          <button
                            onClick={() => removeLocation(loc)}
                            className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <button
                      onClick={() => selectedCompanies.length > 0 && setLocationDropdownOpen(!locationDropdownOpen)}
                      disabled={selectedCompanies.length === 0}
                      className={`w-full pl-10 pr-10 py-2 border rounded-lg text-left text-sm transition-all ${
                        selectedCompanies.length === 0
                          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'border-gray-300 bg-white hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      }`}
                    >
                      {selectedCompanies.length === 0
                        ? 'Select companies first'
                        : selectedLocations.length === 0
                          ? 'All locations'
                          : `${selectedLocations.length} location${selectedLocations.length !== 1 ? 's' : ''} selected`}
                    </button>
                    <ChevronDown className={`w-4 h-4 text-gray-400 absolute right-3 top-2.5 transition-transform ${locationDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {locationDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {availableLocations.map(loc => {
                        const isSelected = selectedLocations.includes(loc)
                        return (
                          <button
                            key={loc}
                            onClick={() => toggleLocation(loc)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${
                              isSelected ? 'bg-green-50' : ''
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={isSelected ? 'text-green-700 font-medium' : 'text-gray-700'}>
                              {loc}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder={scrapeTarget === 'recruiters'
                      ? "e.g. Recruiter, Talent Acquisition (default if empty)"
                      : "e.g. Software Engineer, Recruiter"
                    }
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                  />
                </div>
              </div>

              {/* University Filter (recruiter mode only) */}
              {scrapeTarget === 'recruiters' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">University Filter (optional)</label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. MIT, Stanford, Carnegie Mellon"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Time Filter Input (jobs mode only) */}
              {scrapeTarget === 'jobs' && (
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Posted Within (Minutes)</label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    placeholder="e.g. 30 (Leave empty for any time)"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={timePosted}
                    onChange={(e) => setTimePosted(e.target.value)}
                  />
                </div>
              </div>
              )}

            </div>
          </div>

          {/* Resume Upload Card (jobs mode only) */}
          {scrapeTarget === 'jobs' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-500" />
              Resume for AI Analysis
            </h2>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleResumeUpload}
              className="hidden"
            />

            {resumeStatus === 'none' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
              >
                <div className="flex flex-col items-center gap-2 text-gray-500 group-hover:text-blue-600">
                  <Upload className="w-8 h-8" />
                  <span className="text-sm font-medium">Upload Resume</span>
                  <span className="text-xs text-gray-400">.pdf or .docx (max 10MB)</span>
                </div>
              </button>
            )}

            {resumeStatus === 'uploading' && (
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 bg-blue-50/50">
                <div className="flex flex-col items-center gap-2 text-blue-600">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Uploading...</span>
                </div>
              </div>
            )}

            {resumeStatus === 'uploaded' && resumeInfo && (
              <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800">{resumeInfo.filename}</p>
                      <p className="text-xs text-green-600">{resumeInfo.text_length.toLocaleString()} characters extracted</p>
                    </div>
                  </div>
                  <button
                    onClick={clearResume}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-green-700">
                  <Sparkles className="w-3 h-3" />
                  <span>AI job fit analysis will run after scraping</span>
                </div>
              </div>
            )}

            {resumeStatus === 'error' && (
              <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50/50">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">Upload failed</p>
                    <p className="text-xs text-red-600 mt-1">{resumeError}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setResumeStatus('none')
                    setResumeError('')
                  }}
                  className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
          )}

          {/* Mode Selector */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <div className="grid grid-cols-3 gap-1">
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
              <button
                onClick={() => { setScrapeTarget('apply'); setApplyMode(true); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scrapeTarget === 'apply'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                Apply Wizard
              </button>
            </div>
          </div>

          {/* Browser Mode Toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  {useCDP ? 'Use My Chrome' : 'Launch New Browser'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {useCDP
                    ? 'Connects to your open Chrome (port 9222). No login needed.'
                    : 'Opens a fresh browser. Manual login required.'}
                </p>
              </div>
              <button
                onClick={() => setUseCDP(!useCDP)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  useCDP ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  useCDP ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>

          {/* Auto-Connect Card (recruiter mode only) */}
          {scrapeTarget === 'recruiters' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Auto-Connect</p>
                    <p className="text-xs text-gray-400">Send requests to 2nd/3rd degree</p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoConnect(!autoConnect)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    autoConnect ? 'bg-purple-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    autoConnect ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {autoConnect && (
                <>
                  {/* Connection limit */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Connection Limit</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={connectionLimit}
                      onChange={(e) => setConnectionLimit(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    <p className="text-xs text-amber-600 mt-1">~100/week LinkedIn limit. Recommend 10/session.</p>
                  </div>

                  {/* Add note toggle */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">Add a personal note</p>
                    <button
                      onClick={() => setUseConnectionNote(!useConnectionNote)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                        useConnectionNote ? 'bg-purple-500' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm ${
                        useConnectionNote ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {useConnectionNote && (
                    <div>
                      <textarea
                        placeholder="Hi, I'd love to connect about opportunities at your company..."
                        maxLength={300}
                        value={connectionNote}
                        onChange={(e) => setConnectionNote(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none h-20"
                      />
                      <p className={`text-xs mt-1 text-right ${connectionNote.length >= 280 ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                        {connectionNote.length}/300
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Launch Button */}
          <button
            onClick={handleLaunch}
            disabled={status === 'running' || status === 'analyzing' || selectedCompanies.length === 0}
            className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
              status === 'running' || status === 'analyzing'
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : selectedCompanies.length === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : scrapeTarget === 'recruiters'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {status === 'running' ? (
              scrapeTarget === 'recruiters' ? <>Finding Recruiters...</> : <>Running Agent...</>
            ) : status === 'analyzing' ? (
              <>Analyzing Jobs...</>
            ) : (
              scrapeTarget === 'recruiters'
                ? <>Find Recruiters <Users className="w-5 h-5" /></>
                : <>Launch Campaign <Rocket className="w-5 h-5" /></>
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
                <div key={i} className={`break-words animate-in fade-in slide-in-from-bottom-1 ${
                  log.includes('Analyzing') ? 'text-purple-400' : 'text-green-400'
                }`}>
                  {log}
                </div>
              ))}
              <div id="log-end" />
            </div>
          </div>
        </div>

        {/* Right Content - Results */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* Apply Wizard Panel */}
          {scrapeTarget === 'apply' && (
            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
              {/* Threshold control */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Relevance Threshold</h3>
                  <span className="text-sm text-gray-500">{relevanceThreshold}/10 minimum</span>
                </div>
                <input
                  type="range" min="1" max="10" value={relevanceThreshold}
                  onChange={e => setRelevanceThreshold(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1 (All jobs)</span><span>10 (Perfect match only)</span>
                </div>
              </div>

              {/* Resume requirement */}
              {resumeStatus !== 'uploaded' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">Upload a resume first to enable the Apply Wizard.</p>
                </div>
              )}

              {/* Launch button */}
              <button
                onClick={handleStartApplyWizard}
                disabled={selectedCompanies.length === 0 || resumeStatus !== 'uploaded' || applyStatus === 'scraping' || applyStatus === 'applying'}
                className="w-full py-3 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {applyStatus === 'scraping' ? 'Scraping & Analyzing...' : applyStatus === 'applying' ? 'Applying...' : 'Start Apply Wizard'}
              </button>

              {/* Previews */}
              {applyPreviews.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Job Previews ({applyPreviews.length})</h3>
                    <span className="text-sm text-gray-500">{selectedForApply.size} selected for apply</span>
                  </div>
                  {applyPreviews.map(preview => (
                    <div key={preview.job_id} className={`bg-white rounded-lg border p-4 ${selectedForApply.has(preview.job_id) ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedForApply.has(preview.job_id)}
                            onChange={() => toggleJobApproval(preview.job_id)}
                            className="mt-1 w-4 h-4 text-green-600"
                          />
                          <div>
                            <h4 className="font-medium text-gray-900">{preview.job_title}</h4>
                            <p className="text-sm text-gray-600">{preview.company} - {preview.location}</p>
                            {preview.analysis_summary && <p className="text-xs text-gray-500 mt-1">{preview.analysis_summary}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            preview.relevance_score >= 8 ? 'bg-green-100 text-green-700' :
                            preview.relevance_score >= 6 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {preview.relevance_score}/10
                          </span>
                          <button
                            onClick={() => setExpandedPreview(expandedPreview === preview.job_id ? null : preview.job_id)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {expandedPreview === preview.job_id ? 'Hide' : 'Details'}
                          </button>
                        </div>
                      </div>
                      {expandedPreview === preview.job_id && (
                        <div className="mt-3 space-y-3 border-t pt-3">
                          <div>
                            <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Customized Resume</h5>
                            <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">{preview.tuned_resume?.slice(0, 1000)}...</pre>
                          </div>
                          {preview.cover_letter && (
                            <div>
                              <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Cover Letter</h5>
                              <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">{preview.cover_letter}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Apply button */}
                  {(applyStatus === 'previewing' || (applyStatus === 'done' && applySummary?.mode === 'preview')) && (
                    <button
                      onClick={handleApplyToSelected}
                      disabled={selectedForApply.size === 0}
                      className="w-full py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Apply to {selectedForApply.size} Selected Jobs
                    </button>
                  )}
                </div>
              )}

              {/* Apply Results */}
              {applyResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">Application Results</h3>
                  {applyResults.map((result, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <span className="font-medium">{result.job_title} at {result.company}</span>
                      <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                        {result.success ? 'Applied' : 'Failed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {applySummary && applySummary.mode !== 'preview' && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Summary</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-green-700">{applySummary.total_applied}</div>
                      <div className="text-xs text-green-600">Applied</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-red-700">{applySummary.total_failed}</div>
                      <div className="text-xs text-red-600">Failed</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-700">{applySummary.total_skipped}</div>
                      <div className="text-xs text-gray-600">Skipped</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Logs */}
              {applyLogs.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-400 font-mono">Pipeline Logs</span>
                  </div>
                  {applyLogs.map((log, i) => (
                    <p key={i} className="text-xs text-green-300 font-mono">{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {scrapeTarget !== 'apply' && (scrapeTarget === 'jobs' ? (
            // JOBS VIEW
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
              {/* Header with count + filter */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-lg flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-blue-600" />
                    Found Jobs
                    {leads.length > 0 && (
                      <span className="bg-blue-100 text-blue-700 text-sm px-2.5 py-0.5 rounded-full font-medium">
                        {filteredLeads.length}{searchFilter && ` / ${leads.length}`}
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2">
                    {hasAnalysisData && (
                      <button
                        onClick={() => setSortByScore(!sortByScore)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          sortByScore
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <ArrowUpDown className="w-4 h-4" />
                        Sort by Score
                      </button>
                    )}
                    {selectedJob !== null && (
                      <button
                        onClick={() => setSelectedJob(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Clear selection
                      </button>
                    )}
                  </div>
                </div>

                {/* Search / Filter bar */}
                {leads.length > 0 && (
                  <div className="relative">
                    <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter by title, company, or location..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Results summary bar */}
              {leads.length > 0 && (
                <div className="px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-blue-700 font-medium">
                      {leads.length} job{leads.length !== 1 ? 's' : ''} scraped
                    </span>
                    {hasAnalysisData && (
                      <>
                        <span className="text-gray-400">|</span>
                        <span className="text-purple-600 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI scores available
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                </div>
              )}

              {/* Analysis progress bar */}
              {analysisProgress && (
                <div className="px-6 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-purple-700 font-medium flex items-center gap-2">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      Analyzing: {analysisProgress.job_title}
                    </span>
                    <span className="text-sm text-purple-600">
                      {analysisProgress.current}/{analysisProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-purple-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                      style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Job cards list */}
              <div className="flex-1 p-6 bg-gray-50/50 overflow-y-auto max-h-[700px]">
                {leads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 py-20">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                      <Briefcase className="w-10 h-10 opacity-30" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-500">No jobs scraped yet</p>
                      <p className="text-sm mt-1">Fill in the parameters and launch the agent to begin.</p>
                    </div>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 py-20">
                    <Filter className="w-10 h-10 opacity-30" />
                    <p className="text-sm">No jobs match your filter "{searchFilter}"</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLeads.map((job, idx) => {
                      const globalIdx = leads.indexOf(job)
                      const isSelected = selectedJob === globalIdx
                      const analysis = job.analysis
                      const scoreColors = getScoreColor(analysis?.score)

                      return (
                        <div
                          key={globalIdx}
                          onClick={() => setSelectedJob(isSelected ? null : globalIdx)}
                          className={`relative bg-white p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                            isSelected
                              ? 'border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/20'
                              : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                          }`}
                        >
                          {/* Score badge (top right) */}
                          {analysis?.score !== null && analysis?.score !== undefined && (
                            <div className={`absolute -top-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${scoreColors.bg} ${scoreColors.text} ${scoreColors.border}`}>
                              {analysis.score}
                            </div>
                          )}

                          {/* Job number badge */}
                          <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-600'
                          } transition-colors`}>
                            {sortByScore ? idx + 1 : globalIdx + 1}
                          </div>

                          <div className="flex justify-between items-start gap-4 ml-4 mr-8">
                            {/* Job info */}
                            <div className="flex-1 min-w-0">
                              <h3 className={`font-semibold truncate ${
                                isSelected ? 'text-blue-700' : 'text-gray-900 group-hover:text-blue-600'
                              } transition-colors`}>
                                {job.title || 'Untitled Position'}
                              </h3>
                              <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-600">
                                <span className="flex items-center gap-1 truncate">
                                  <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  {job.company || 'Unknown Company'}
                                </span>
                                <span className="text-gray-300 flex-shrink-0">|</span>
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  {job.location || 'Location not specified'}
                                </span>
                              </div>

                              {/* Analysis summary */}
                              {analysis?.summary && (
                                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                                  {analysis.summary}
                                </p>
                              )}

                              {/* Expanded details when selected */}
                              {isSelected && (
                                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                                  {job.url && (
                                    <p className="text-xs text-gray-400 truncate">
                                      {job.url}
                                    </p>
                                  )}

                                  {/* Suggestions */}
                                  {analysis?.suggestions && analysis.suggestions.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium text-purple-700 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" />
                                        Suggestions to improve fit:
                                      </p>
                                      <ul className="space-y-1">
                                        {analysis.suggestions.map((suggestion, sIdx) => (
                                          <li key={sIdx} className="text-xs text-gray-600 flex items-start gap-2">
                                            <ChevronRight className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />
                                            <span>{suggestion}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Connect / Apply button */}
                            <div className="flex-shrink-0 flex flex-col items-end gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleConnect(job.url)
                                }}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white'
                                }`}
                              >
                                <ArrowUpRight className="w-4 h-4" />
                                Connect
                              </button>
                              {isSelected && (
                                <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                                  <ChevronRight className="w-3 h-3" /> Selected
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={resultsEndRef} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            // RECRUITERS VIEW
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
              {/* Header with count + filter */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    Found Recruiters
                    {leads.length > 0 && (
                      <span className="bg-purple-100 text-purple-700 text-sm px-2.5 py-0.5 rounded-full font-medium">
                        {filteredLeads.length}{searchFilter && ` / ${leads.length}`}
                      </span>
                    )}
                  </h2>
                </div>

                {/* Search / Filter bar */}
                {leads.length > 0 && (
                  <div className="relative">
                    <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter by name, title, company, or location..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Results summary bar */}
              {leads.length > 0 && (
                <div className="px-6 py-3 bg-gradient-to-r from-purple-50 to-fuchsia-50 border-b border-purple-100 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-purple-700 font-medium">
                      {leads.length} recruiter{leads.length !== 1 ? 's' : ''} found
                    </span>
                  </div>
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                </div>
              )}

              {/* Connect progress banner */}
              {connectProgress && (
                <div className="px-6 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-purple-700 font-medium flex items-center gap-2">
                      <UserPlus className="w-4 h-4 animate-pulse" />
                      Connecting: {connectProgress.current_name || '...'}
                    </span>
                    <span className="text-sm text-purple-600 font-medium">
                      {connectProgress.sent_count}/{connectProgress.limit}
                    </span>
                  </div>
                </div>
              )}

              {/* Recruiter cards list */}
              <div className="flex-1 p-6 bg-gray-50/50 overflow-y-auto max-h-[700px]">
                {leads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 py-20">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                      <Users className="w-10 h-10 opacity-30" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-500">No recruiters found yet</p>
                      <p className="text-sm mt-1">Select companies, then click "Find Recruiters" to search LinkedIn.</p>
                    </div>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 py-20">
                    <Filter className="w-10 h-10 opacity-30" />
                    <p className="text-sm">No recruiters match your filter "{searchFilter}"</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLeads.map((person, idx) => {
                      const degreeColor = person.connection_degree === '1st'
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : person.connection_degree === '2nd'
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-gray-100 text-gray-600 border-gray-300'

                      return (
                        <div
                          key={idx}
                          className="bg-white p-4 rounded-xl border-2 border-gray-200 hover:border-purple-300 hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex items-start gap-4">
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                              {person.profile_image_url ? (
                                <img
                                  src={person.profile_image_url}
                                  alt={person.name}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                                  <UserCircle className="w-8 h-8 text-purple-400" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 truncate">{person.name}</h3>
                              {person.title && (
                                <p className="text-sm text-gray-600 truncate mt-0.5">{person.title}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-gray-400" />
                                  {person.company}
                                </span>
                                {person.location && (
                                  <>
                                    <span className="text-gray-300">|</span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-gray-400" />
                                      {person.location}
                                    </span>
                                  </>
                                )}
                                {person.connection_degree && (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${degreeColor}`}>
                                    {person.connection_degree}
                                  </span>
                                )}
                              </div>
                              {person.mutual_connections > 0 && (
                                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {person.mutual_connections} mutual connection{person.mutual_connections !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>

                            {/* View Profile / Connection Status */}
                            <div className="flex-shrink-0">
                              {connectionStatuses[person.profile_url] === 'sent' ? (
                                <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-green-100 text-green-700 border border-green-300">
                                  <Check className="w-4 h-4" />
                                  Sent
                                </span>
                              ) : connectionStatuses[person.profile_url] === 'error' ? (
                                <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-red-100 text-red-700 border border-red-300">
                                  <AlertCircle className="w-4 h-4" />
                                  Failed
                                </span>
                              ) : (
                                <button
                                  onClick={() => person.profile_url && window.open(person.profile_url, '_blank', 'noopener,noreferrer')}
                                  disabled={!person.profile_url}
                                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                    person.profile_url
                                      ? 'bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white'
                                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  }`}
                                >
                                  <ArrowUpRight className="w-4 h-4" />
                                  View Profile
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={resultsEndRef} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  )
}

export default App
