# ESP Serial Web Monitor (Dockerable, Full-Stack, Tailwind)

Web-based serial monitor for your ESP (ESP32/ESP8266/etc) running locally.  
**Backend:** FastAPI (Python) + pyserial (WebSocket streaming)  
**Frontend:** React + Vite + TailwindCSS (static via Nginx)  
**Attach/Detach:** REST endpoints to attach/detach from a serial port and a WebSocket to stream logs.  
**Send:** simple "write" endpoint to send a line to your device.

---

## Features

- List serial ports (`GET /ports`)
- Attach to a selected port (`POST /attach {port, baudrate}`)
- Detach (`POST /detach`)
- Stream logs in real-time via `WS /ws/serial` (JSON with `ts` and `line`)
- Send lines to the serial (`POST /write {data, newline}`)
- **Network control**: Connect/disconnect ESP32 by blocking/unblocking MAC address
- Tailwind UI with autoscroll, clear, download logs, send box
- Dockerized backend & frontend

---

## Quick Start (Linux/macOS)

1. **Connect your ESP** and identify the serial device:
   - Linux: `/dev/ttyUSB0` or `/dev/ttyACM0`
   - macOS: `ls /dev/tty.*` e.g. `/dev/tty.usbserial-1234`

2. **Edit** `docker-compose.yml` and update the `devices:` mapping for your OS.

3. **Build & run**:
   ```bash
   docker compose up -d --build
   ```

4. **Open the UI** at http://localhost:5173  
   Then select a port and click **Attach**. You should see your ESP logs streaming.

> If you see permission errors for the serial port on Linux, try:
> - add your user to `dialout` (then re-login): `sudo usermod -aG dialout $USER`
> - or run the backend container in privileged mode (not recommended long-term).

---

## Windows Notes

Docker Desktop on Windows **does not** pass COM ports into Linux containers directly. You have options:

- **Option A (Recommended):** Use **WSL2 + usbipd-win** to attach your USB device into WSL. Then map the WSL serial path (e.g., `/dev/ttyS*`) to the backend container. See: https://github.com/dorssel/usbipd-win
- **Option B:** Run the **backend natively** (without Docker) and only run the frontend via Docker. Then set `VITE_API_BASE` in the frontend to your native backend URL (e.g., `http://localhost:8000`).

To run backend natively:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then in another terminal for the frontend:
```bash
cd frontend
npm i
VITE_API_BASE=http://localhost:8000 npm run dev
```

---

## API Overview

- `GET /ports` → `{ ports: [{ device, description, ... }] }`
- `GET /status` → `{ attached: bool, network_connected: bool, mac_address: string }`
- `POST /attach` → body `{ "port": "/dev/ttyUSB0", "baudrate": 115200 }`
- `POST /detach` → `{ ok: true }`
- `POST /write` → body `{ "data": "AT+GMR", "newline": true }`
- `POST /network/connect` → body `{ "mac_address": "AA:BB:CC:DD:EE:FF", "router_host": "192.168.1.1", "username": "admin", "password": "admin" }`
- `POST /network/disconnect` → body `{ "mac_address": "AA:BB:CC:DD:EE:FF", "router_host": "192.168.1.1", "username": "admin", "password": "admin" }`
- `WS /ws/serial` → JSON messages `{ "ts": <unix seconds>, "line": "..." }`

---

## Network Control

The application includes network connectivity simulation through router-based MAC address blocking/unblocking:

### Usage
1. **Enter ESP32 MAC Address**: Input your ESP32's MAC address (e.g., `AA:BB:CC:DD:EE:FF`)
2. **Configure Router Settings**: Set your router's IP address, username, and password
3. **Control Network Access**:
   - **Disconnect**: Blocks the ESP32's MAC address on the router (simulates network offline)
   - **Connect**: Unblocks the ESP32's MAC address on the router (simulates network online)

### How it Works
- The system calls your router's API to block/unblock MAC addresses
- If the direct API call fails, it automatically attempts to login first and retry
- Success is determined by the router responding with `{"result":"success"}`
- Network status is displayed in the header and tracked in the `/status` endpoint

### Router Compatibility
The current implementation uses generic HTTP endpoints. You may need to adapt the `router_login()` and `block_unblock_mac()` functions in `backend/app/main.py` to match your specific router's API format.

---

## Dev Tips

- CORS is open in the backend; you can restrict origins later.
- Tailwind is prewired; tweak `frontend/src/App.jsx` as needed.
- Log buffer is capped at ~5000 lines in the UI for memory safety.
- To change ports in production, rebuild `frontend` and redeploy.

---

## License

MIT (do whatever you want, no warranty).
