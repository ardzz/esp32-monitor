import React, { useEffect, useRef, useState } from 'react'
import Alert from './components/Alert'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function App() {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState('')
  const [baud, setBaud] = useState(9600)
  const [attached, setAttached] = useState(false)
  const [log, setLog] = useState([])
  const [sending, setSending] = useState('')
  const wsRef = useRef(null)
  const logEndRef = useRef(null)
  
  // Network control state
  const [networkConnected, setNetworkConnected] = useState(true)
  const [macAddress, setMacAddress] = useState('1C:69:20:31:6C:10')
  const [routerHost, setRouterHost] = useState('192.168.0.1')
  const [routerUsername, setRouterUsername] = useState('admin')
  const [routerPassword, setRouterPassword] = useState('admin')
  const [networkLoading, setNetworkLoading] = useState(false)
  const [alert, setAlert] = useState(null)

  const showAlert = (message, type = 'info') => setAlert({ message, type })

  const fetchPorts = async () => {
    const res = await fetch(`${API_BASE}/ports`)
    const data = await res.json()
    setPorts(data.ports || [])
    if ((data.ports || []).length > 0 && !selectedPort) {
      setSelectedPort(data.ports[0].device)
    }
  }

  const fetchStatus = async () => {
    const res = await fetch(`${API_BASE}/status`)
    const data = await res.json()
    setAttached(!!data.attached)
    setNetworkConnected(!!data.network_connected)
    if (data.mac_address) {
      setMacAddress(data.mac_address)
    }
  }

  useEffect(() => {
    fetchPorts()
    fetchStatus()
    const t = setInterval(() => {
      fetchPorts()
    }, 3000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [log])

  const connect = async () => {
    if (!selectedPort) return
    const res = await fetch(`${API_BASE}/attach`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ port: selectedPort, baudrate: Number(baud) })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      showAlert(`Attach failed: ${err.detail || res.status}`, 'error')
      return
    }
    setAttached(true)
    openWS()
  }

  const openWS = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    const url = API_BASE.replace('http', 'ws') + '/ws/serial'
    const ws = new WebSocket(url)
    ws.onopen = () => {
      // console.log('ws open')
    }
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const ts = new Date(data.ts * 1000).toLocaleString()
        const line = data.line
        setLog(prev => {
          const arr = [...prev, `[${ts}] ${line}`]
          if (arr.length > 5000) arr.shift()
          return arr
        })
      } catch {
        setLog(prev => {
          const arr = [...prev, e.data]
          if (arr.length > 5000) arr.shift()
          return arr
        })
      }
    }
    ws.onclose = () => {
      // console.log('ws closed')
    }
    ws.onerror = () => {
      // console.log('ws error')
    }
    wsRef.current = ws
  }

  const disconnect = async () => {
    await fetch(`${API_BASE}/detach`, { method: 'POST' })
    setAttached(false)
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  const clearLog = () => setLog([])

  const downloadLog = () => {
    const blob = new Blob([log.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `serial-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sendLine = async () => {
    if (!sending.trim()) return
    await fetch(`${API_BASE}/write`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ data: sending, newline: true })
    }).catch(() => {})
    setSending('')
  }

  const networkDisconnect = async () => {
    if (!macAddress.trim()) {
      showAlert('Please enter MAC address', 'error')
      return
    }
    
    setNetworkLoading(true)
    try {
      const res = await fetch(`${API_BASE}/network/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac_address: macAddress,
          router_host: routerHost,
          username: routerUsername,
          password: routerPassword
        })
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showAlert(`Network disconnect failed: ${err.detail || res.status}`, 'error')
        return
      }
      
      const result = await res.json()
      setNetworkConnected(false)
      showAlert('ESP32 network disconnected successfully', 'success')
    } catch (error) {
      showAlert(`Network disconnect error: ${error.message}`, 'error')
    } finally {
      setNetworkLoading(false)
    }
  }

  const networkConnect = async () => {
    if (!macAddress.trim()) {
      showAlert('Please enter MAC address', 'error')
      return
    }
    
    setNetworkLoading(true)
    try {
      const res = await fetch(`${API_BASE}/network/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac_address: macAddress,
          router_host: routerHost,
          username: routerUsername,
          password: routerPassword
        })
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showAlert(`Network connect failed: ${err.detail || res.status}`, 'error')
        return
      }
      
      const result = await res.json()
      setNetworkConnected(true)
      showAlert('ESP32 network connected successfully', 'success')
    } catch (error) {
      showAlert(`Network connect error: ${error.message}`, 'error')
    } finally {
      setNetworkLoading(false)
    }
  }

  return (
    <div className="min-h-full w-full bg-gray-50 text-gray-900">
      <Alert message={alert?.message} type={alert?.type} onClose={() => setAlert(null)} />
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">ESP Serial Web Monitor</h1>
          <div className="text-sm space-x-4">
            <span>Serial: {attached ? <span className="text-green-600 font-semibold">ATTACHED</span> : <span className="text-red-600 font-semibold">DETACHED</span>}</span>
            <span>Network: {networkConnected ? <span className="text-green-600 font-semibold">CONNECTED</span> : <span className="text-red-600 font-semibold">DISCONNECTED</span>}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Network Control Section */}
        <section className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-4">Network Control</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">ESP32 MAC Address</label>
              <input
                type="text"
                className="w-full rounded-xl border-gray-300"
                value={macAddress}
                onChange={e => setMacAddress(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Router Host</label>
              <input
                type="text"
                className="w-full rounded-xl border-gray-300"
                value={routerHost}
                onChange={e => setRouterHost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                type="text"
                className="w-full rounded-xl border-gray-300"
                value={routerUsername}
                onChange={e => setRouterUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                className="w-full rounded-xl border-gray-300"
                value={routerPassword}
                onChange={e => setRouterPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {networkConnected ? (
                <button
                  className="flex-1 rounded-xl bg-red-600 text-white px-4 py-2 font-medium shadow hover:bg-red-700 disabled:opacity-50"
                  onClick={networkDisconnect}
                  disabled={networkLoading}
                >
                  {networkLoading ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : (
                <button
                  className="flex-1 rounded-xl bg-green-600 text-white px-4 py-2 font-medium shadow hover:bg-green-700 disabled:opacity-50"
                  onClick={networkConnect}
                  disabled={networkLoading}
                >
                  {networkLoading ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Serial Control Section */}
        <section className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-4">Serial Control</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Serial Port</label>
              <select
                className="w-full rounded-xl border-gray-300"
                value={selectedPort}
                onChange={e => setSelectedPort(e.target.value)}
                disabled={attached}
              >
                {ports.map((p) => (
                  <option key={p.device} value={p.device}>
                    {p.device} {p.description ? `- ${p.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Baudrate</label>
              <input
                type="number"
                className="w-full rounded-xl border-gray-300"
                value={baud}
                min="300"
                max="921600"
                step="300"
                onChange={e => setBaud(e.target.value)}
                disabled={attached}
              />
            </div>
            <div className="flex gap-2">
              {!attached ? (
                <button
                  className="flex-1 rounded-xl bg-blue-600 text-white px-4 py-2 font-medium shadow hover:bg-blue-700"
                  onClick={connect}
                >
                  Attach
                </button>
              ) : (
                <button
                  className="flex-1 rounded-xl bg-gray-600 text-white px-4 py-2 font-medium shadow hover:bg-gray-700"
                  onClick={disconnect}
                >
                  Detach
                </button>
              )}
              <button
                className="rounded-xl border px-3 py-2 shadow-sm"
                onClick={fetchPorts}
                disabled={attached}
              >
                Refresh Ports
              </button>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="rounded-xl border px-3 py-2 shadow-sm" onClick={clearLog}>Clear</button>
              <button className="rounded-xl border px-3 py-2 shadow-sm" onClick={downloadLog}>Download</button>
            </div>
          </div>
        </section>

        <section className="bg-white p-4 rounded-2xl shadow">
          <div className="h-[50vh] overflow-auto font-mono text-sm whitespace-pre-wrap border rounded-xl p-3 bg-gray-50">
            {log.map((l, i) => <div key={i}>{l}</div>)}
            <div ref={logEndRef} />
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-xl border-gray-300"
              placeholder="Type a line to send..."
              value={sending}
              onChange={e => setSending(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendLine() }}
            />
            <button
              className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-medium shadow hover:bg-emerald-700"
              onClick={sendLine}
              disabled={!attached}
            >
              Send
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
