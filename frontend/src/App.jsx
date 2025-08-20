import React, { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from './components/ui/alert'
import DataChart from './components/data-chart'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.168.0.171:8000'

export default function App() {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState('')
  const [baud, setBaud] = useState(9600)
  const [attached, setAttached] = useState(false)
  const [log, setLog] = useState([])
  const [sending, setSending] = useState('')
  const wsRef = useRef(null)
  const [labels, setLabels] = useState([])
  const [series1, setSeries1] = useState([])
  const [series2, setSeries2] = useState([])
  
  // Network control state
  const [networkConnected, setNetworkConnected] = useState(true)
  const [macAddress, setMacAddress] = useState('1C:69:20:31:6C:10')
  const [routerHost, setRouterHost] = useState('192.168.0.1')
  const [routerUsername, setRouterUsername] = useState('admin')
  const [routerPassword, setRouterPassword] = useState('admin')
  const [networkLoading, setNetworkLoading] = useState(false)
  const [projectPath, setProjectPath] = useState('C:\\Users\\Naufal Reky Ardhana\\CLionProjects\\diawan-iot-boilerplate')
  const [flashLoading, setFlashLoading] = useState(false)
  const [flashOutput, setFlashOutput] = useState('')
  const [alert, setAlert] = useState(null)

  const showAlert = (message, type = 'info') => setAlert({ message, type })

  useEffect(() => {
    if (!alert) return
    const t = setTimeout(() => setAlert(null), 5000)
    return () => clearTimeout(t)
  }, [alert])

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
    }, 10000)
    return () => clearInterval(t)
  }, [])


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
        const tsDate = new Date(data.ts * 1000)
        const ts = tsDate.toLocaleString()
        const line = data.line
        setLog(prev => {
          const arr = [...prev, `[${ts}] ${line}`]
          if (arr.length > 5000) arr.shift()
          return arr
        })
        if (line.includes('Payload:')) {
          const jsonStr = line.split('Payload:')[1].trim()
          try {
            const payload = JSON.parse(jsonStr)
            if (Array.isArray(payload.data)) {
              setLabels(prev => {
                const arr = [...prev, tsDate.toLocaleTimeString()]
                if (arr.length > 50) arr.shift()
                return arr
              })
              setSeries1(prev => {
                const arr = [...prev, payload.data[0]]
                if (arr.length > 50) arr.shift()
                return arr
              })
              setSeries2(prev => {
                const arr = [...prev, payload.data[1]]
                if (arr.length > 50) arr.shift()
                return arr
              })
            }
          } catch {
            /* ignore */
          }
        }
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
        showAlert(`Network disconnect failed: ${err.detail || res.status} ${res.ok}`, 'error')
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

  const flashFirmware = async () => {
    if (!projectPath.trim()) {
      showAlert('Please enter project path', 'error')
      return
    }
    setFlashLoading(true)
    setFlashOutput('')
    try {
      const res = await fetch(`${API_BASE}/flash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showAlert(`Flash failed: ${data.detail || res.status}`, 'error')
        setFlashOutput(data.detail || '')
        return
      }

      if (!res.body) {
        showAlert('Flash failed: no response body', 'error')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setFlashOutput(prev => prev + chunk)
      }

      showAlert('Flash complete', 'success')
    } catch (error) {
      showAlert(`Flash error: ${error.message}`, 'error')
      setFlashOutput(error.message)
    } finally {
      setFlashLoading(false)
    }
  }

  const sortedPorts = React.useMemo(() => {
    const re = /USB[\s-]*SERIAL/i;
    return [...ports].sort((a, b) => {
      const aMatch = re.test(a.description ?? "");
      const bMatch = re.test(b.description ?? "");
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      const aLabel = (a.description || a.device);
      const bLabel = (b.description || b.device);
      return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
    });
  }, [ports]);


  return (
    <div className="min-h-full w-full bg-gray-50 text-gray-900">
      {alert && (
        <Alert
          variant={alert.type === 'error' ? 'destructive' : 'default'}
          className="fixed top-4 right-4 z-50 w-auto pr-8"
        >
          <AlertDescription>{alert.message}</AlertDescription>
          <button
            onClick={() => setAlert(null)}
            className="absolute top-2 right-2 text-sm opacity-70 hover:opacity-100"
            aria-label="Close"
          >
            &times;
          </button>
        </Alert>
      )}
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
        {/* Flash Firmware Section */}
        <section className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-4">Flash Firmware</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium mb-1">Project Path</label>
              <input
                type="text"
                className="w-full rounded-xl border-gray-300"
                value={projectPath}
                onChange={e => setProjectPath(e.target.value)}
                placeholder="Path to PlatformIO project"
              />
            </div>
            <div>
              <button
                className="w-full rounded-xl bg-purple-600 text-white px-4 py-2 font-medium shadow hover:bg-purple-700 disabled:opacity-50"
                onClick={flashFirmware}
                disabled={flashLoading}
              >
                {flashLoading ? 'Flashing...' : 'Flash'}
              </button>
            </div>
          </div>
          {flashOutput && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-1">PlatformIO Output</h3>
              <pre className="bg-gray-100 p-2 rounded-xl text-xs overflow-auto max-h-48 whitespace-pre-wrap">{flashOutput}</pre>
            </div>
          )}
        </section>

        {/* Network Control Section */}
        <section className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-4">Network Control : MiFi Advan</h2>
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
                {sortedPorts.map((p) => (
                  <option key={p.device} value={p.device}>
                    {p.device} {p.description ? `- ${p.description}` : ""}
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

        {/* MQTT Data Chart */}
        <section className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-4">MQTT Payload Data</h2>
          <DataChart labels={labels} data1={series1} data2={series2} />
        </section>

        <section className="bg-white p-4 rounded-2xl shadow">
          <div className="h-[50vh] overflow-auto font-mono text-sm whitespace-pre-wrap border rounded-xl p-3 bg-gray-50">
            {log.map((l, i) => <div key={i}>{l}</div>)}
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
