import asyncio

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

@app.get("/ports")
def list_ports():
    return {"ports": serial_mgr.list_ports()}

@app.get("/status")
def status():
    return {"attached": serial_mgr.is_attached()}

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
