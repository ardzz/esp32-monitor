import asyncio
import httpx

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .serial_manager import SerialManager

app = FastAPI(title="ESP Serial Web Monitor", version="0.1.0")

# Allow all origins by default (dev-friendly). You can restrict via env in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

serial_mgr = SerialManager()

# Store network control settings
network_settings = {
    "mac_address": "",
    "router_host": "192.168.1.1", 
    "username": "admin",
    "password": "admin",
    "connected": True  # Assume connected initially
}

async def router_login(host: str, username: str, password: str) -> dict:
    """Login to router and return session info"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # This is a generic example - actual implementation depends on router type
            login_data = {
                "username": username,
                "password": password
            }
            response = await client.post(f"http://{host}/login", data=login_data)
            if response.status_code == 200:
                result = response.json()
                if result.get("result") == "success":
                    return {"success": True, "cookies": response.cookies}
            return {"success": False, "error": "Login failed"}
        except Exception as e:
            return {"success": False, "error": str(e)}

async def block_unblock_mac(host: str, mac_address: str, action: str, cookies=None) -> dict:
    """Block or unblock MAC address on router"""
    async with httpx.AsyncClient(timeout=10.0, cookies=cookies) as client:
        try:
            # This is a generic example - actual implementation depends on router type
            data = {
                "mac_address": mac_address,
                "action": action  # "block" or "unblock"
            }
            response = await client.post(f"http://{host}/mac_control", data=data)
            if response.status_code == 200:
                return response.json()
            return {"result": "failed", "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"result": "failed", "error": str(e)}

@app.on_event("startup")
async def startup() -> None:
    # Save the event loop so the serial reader thread can enqueue to client queues
    serial_mgr.set_loop(asyncio.get_event_loop())

class AttachReq(BaseModel):
    port: str
    baudrate: int = Field(default=115200, ge=300, le=921600)

class WriteReq(BaseModel):
    data: str
    newline: bool = True

class NetworkControlReq(BaseModel):
    mac_address: str = Field(..., description="ESP32 MAC address to block/unblock")
    router_host: str = Field(default="192.168.1.1", description="Router IP address")
    username: str = Field(default="admin", description="Router username")
    password: str = Field(default="admin", description="Router password")

@app.get("/ports")
def list_ports():
    return {"ports": serial_mgr.list_ports()}

@app.get("/status")
def status():
    return {
        "attached": serial_mgr.is_attached(),
        "network_connected": network_settings["connected"],
        "mac_address": network_settings["mac_address"]
    }

@app.post("/attach")
def attach(req: AttachReq):
    if serial_mgr.is_attached():
        raise HTTPException(status_code=409, detail="Serial already attached")
    try:
        serial_mgr.attach(port=req.port, baudrate=req.baudrate)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/detach")
def detach():
    serial_mgr.detach()
    return {"ok": True}

@app.post("/write")
def write(req: WriteReq):
    if not serial_mgr.is_attached():
        raise HTTPException(status_code=409, detail="Serial not attached")
    payload = req.data + ("\n" if req.newline else "")
    try:
        serial_mgr.write(payload.encode("utf-8"))
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/network/disconnect")
async def network_disconnect(req: NetworkControlReq):
    """Disconnect ESP32 from network by blocking its MAC address"""
    # Update stored settings
    network_settings.update({
        "mac_address": req.mac_address,
        "router_host": req.router_host,
        "username": req.username,
        "password": req.password
    })
    
    # Try to block MAC address
    result = await block_unblock_mac(req.router_host, req.mac_address, "block")
    
    # If blocking failed, try to login first
    if result.get("result") != "success":
        login_result = await router_login(req.router_host, req.username, req.password)
        if login_result["success"]:
            # Retry blocking with login cookies
            result = await block_unblock_mac(
                req.router_host, req.mac_address, "block", 
                cookies=login_result.get("cookies")
            )
        else:
            raise HTTPException(status_code=401, detail=f"Login failed: {login_result.get('error')}")
    
    if result.get("result") == "success":
        network_settings["connected"] = False
        return {"ok": True, "status": "disconnected", "result": result}
    else:
        raise HTTPException(status_code=400, detail=f"Failed to disconnect: {result.get('error')}")

@app.post("/network/connect")
async def network_connect(req: NetworkControlReq):
    """Connect ESP32 to network by unblocking its MAC address"""
    # Update stored settings
    network_settings.update({
        "mac_address": req.mac_address,
        "router_host": req.router_host,
        "username": req.username,
        "password": req.password
    })
    
    # Try to unblock MAC address
    result = await block_unblock_mac(req.router_host, req.mac_address, "unblock")
    
    # If unblocking failed, try to login first
    if result.get("result") != "success":
        login_result = await router_login(req.router_host, req.username, req.password)
        if login_result["success"]:
            # Retry unblocking with login cookies
            result = await block_unblock_mac(
                req.router_host, req.mac_address, "unblock", 
                cookies=login_result.get("cookies")
            )
        else:
            raise HTTPException(status_code=401, detail=f"Login failed: {login_result.get('error')}")
    
    if result.get("result") == "success":
        network_settings["connected"] = True
        return {"ok": True, "status": "connected", "result": result}
    else:
        raise HTTPException(status_code=400, detail=f"Failed to connect: {result.get('error')}")

@app.websocket("/ws/serial")
async def ws_serial(ws: WebSocket):
    await ws.accept()
    q = serial_mgr.register_client()
    try:
        while True:
            msg = await q.get()
            # send as JSON
            await ws.send_json(msg)
    except WebSocketDisconnect:
        pass
    finally:
        serial_mgr.unregister_client(q)
