\
import asyncio
import json
import threading
import time
from typing import Optional, Set, List
from serial import Serial, SerialException
from serial.tools import list_ports

class SerialManager:
    """
    Manages a single serial connection and fans out lines to connected WebSocket clients.
    """
    def __init__(self) -> None:
        self._ser: Optional[Serial] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._running = False
        self._clients: Set[asyncio.Queue] = set()
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._port: Optional[str] = None
        self._baudrate: Optional[int] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def list_ports(self) -> List[dict]:
        ports = []
        for p in list_ports.comports():
            ports.append({
                "device": p.device,
                "name": p.name,
                "description": p.description,
                "hwid": p.hwid,
                "vid": p.vid,
                "pid": p.pid,
                "serial_number": p.serial_number,
                "location": p.location,
                "manufacturer": p.manufacturer,
                "product": p.product,
                "interface": getattr(p, "interface", None),
            })
        return ports

    def is_attached(self) -> bool:
        return self._ser is not None and self._ser.is_open

    def attach(self, port: str, baudrate: int = 115200, timeout: float = 0.2) -> None:
        with self._lock:
            if self.is_attached():
                raise RuntimeError("Serial already attached")
            try:
                self._ser = Serial(port=port, baudrate=baudrate, timeout=timeout)
                self._port = port
                self._baudrate = baudrate
            except SerialException as e:
                self._ser = None
                raise RuntimeError(f"Failed to open serial port {port}: {e}")

            self._running = True
            self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self._reader_thread.start()

    def detach(self) -> None:
        with self._lock:
            self._running = False
            if self._reader_thread is not None:
                self._reader_thread.join(timeout=1.0)
                self._reader_thread = None
            if self._ser is not None:
                try:
                    self._ser.close()
                except Exception:
                    pass
                self._ser = None
            self._port = None
            self._baudrate = None

    def write(self, data: bytes) -> None:
        with self._lock:
            if not self.is_attached():
                raise RuntimeError("Serial is not attached")
            try:
                self._ser.write(data)
            except SerialException as e:
                raise RuntimeError(f"Failed to write to serial: {e}")

    def register_client(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        self._clients.add(q)
        return q

    def unregister_client(self, q: asyncio.Queue) -> None:
        try:
            self._clients.remove(q)
        except KeyError:
            pass

    def _broadcast(self, payload: dict) -> None:
        if self._loop is None:
            return
        # deliver to all client queues; drop if queue is full to avoid blocking
        for q in list(self._clients):
            try:
                asyncio.run_coroutine_threadsafe(q.put(payload), self._loop)
            except Exception:
                # client disappeared or loop closed
                try:
                    self._clients.remove(q)
                except KeyError:
                    pass

    def _reader_loop(self) -> None:
        # reads bytes from serial, packages as JSON-ish dict, and broadcasts
        while self._running:
            try:
                if self._ser is None or not self._ser.is_open:
                    time.sleep(0.2)
                    continue
                # readline stops at \n or timeout
                raw = self._ser.readline()
                if not raw:
                    continue
                try:
                    line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                except Exception:
                    line = repr(raw)
                msg = {
                    "ts": time.time(),
                    "line": line,
                }
                self._broadcast(msg)
            except SerialException as e:
                # broadcast error event & stop
                self._broadcast({"ts": time.time(), "line": f"[serial error] {e}"})
                break
            except Exception as e:
                # unexpected error; keep loop running
                self._broadcast({"ts": time.time(), "line": f"[reader error] {e}"})
                time.sleep(0.2)
        # cleanup if loop exits
        try:
            if self._ser and self._ser.is_open:
                self._ser.close()
        except Exception:
            pass
        self._ser = None
        self._port = None
        self._baudrate = None
        self._running = False
