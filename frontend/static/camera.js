const video = document.querySelector("#video");
const canvas = document.querySelector("#canvas");
const offlineEl = document.querySelector("#offline-status");

let socket = null;
let cameraId = null;
let targetFps = 15;
let frameInterval = null;
let isOnline = false;

// Load camera info and open Websocket
async function loadCameraInfo() {
  const camera = await request("/api/camera/current");
  document.querySelector("#camera-name").textContent = 
    `${camera.name} (${camera.direction})`;
  cameraId = camera.id;
  targetFps = camera.target_fps || 15;
}

async function startCamera() {
  await loadCameraInfo();
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = stream;
  setStatus("Camera started. Connecting to server...");
  connectWebSocket();
}

// Websocket connection

function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}/ws/camera/${cameraId}/stream`;

  socket = new WebSocket(url);
  socket.binaryType = "blob";

  socket.onopen = () => {
    isOnline = true;
    offlineEl.style.display = "none";
    onReconnected();
    stopOfflineBuffering();

    // Check for unsynced offline frames before resuming live stream
    syncOfflineFrames();
  };

  socket.onmessage = (event) => {
    // Server pushes detection events as JSON
    const data = JSON.parse(event.data);

    if (data.ack) {
      // Acknowledgment for an offline sync frame
      handleSyncAck(data.index);
      return;
    }

    if (data.events && data.events.length > 0) {
      setStatus(
        data.events
          .map((e) => `${e.employee}: ${e.event_type}`)
          .join(" | ")
      );
    }
  };

  socket.onclose = () => {
    isOnline = false;
    stopFrameLoop();
    offlineEl.style.display = "block";
    setStatus("Disconnected — buffering locally.", true);
    startOfflineBuffering(); 
    scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose fires immediately after onerror — no extra handling needed
  };
}

// Live frame loop

function startFrameLoop() {
  stopFrameLoop();
  const intervalMs = Math.round(1000 / targetFps);
  frameInterval = setInterval(sendLiveFrame, intervalMs);
}

function stopFrameLoop() {
  if (frameInterval !== null) {
    clearInterval(frameInterval);
    frameInterval = null;
  }
}

function sendLiveFrame() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!video.videoWidth) return;
  if (socket.bufferedAmount > 0) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  canvas.toBlob(
    (blob) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(blob);
      }
    },
    "image/jpeg",
    0.8
  );
}

let reconnectAttempt = 0;
const MAX_BACKOFF_MS = 30000;

function scheduleReconnect() {
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_BACKOFF_MS);
  reconnectAttempt++;
  setStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`, true);
  setTimeout(() => {
    if (!isOnline) connectWebSocket();
  }, delay);
}

function onReconnected() {
  reconnectAttempt = 0;
}


// IndexedDB offline buffer

const DB_NAME = "attendance_offline";
const STORE_NAME = "frames";
let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore(STORE_NAME, {
        keyPath: "dbKey",
        autoIncrement: true,
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function bufferFrameLocally() {
  if (!video.videoWidth) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });

  if (!db) db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add({
    timestamp: new Date().toISOString(),
    camera_id: cameraId,
    image: base64,
  });
}

let offlineInterval = null;

function startOfflineBuffering() {
  stopOfflineBuffering();
  offlineInterval = setInterval(bufferFrameLocally, 1000);
}

function stopOfflineBuffering() {
  if (offlineInterval !== null) {
    clearInterval(offlineInterval);
    offlineInterval = null;
  }
}

// Offline sync 
// Frames are loaded into memory once, sent one at a time with server ACK, then deleted from IndexedDB all at once at the end.
// No async work happens during the send/ACK cycle

let _syncFrames = [];    // full frame objects loaded from IndexedDB
let _syncIndex = 0;      // which frame we're currently waiting ACK for
let _syncDbKeys = [];    // dbKeys to delete when sync completes

async function syncOfflineFrames() {
  if (!db) db = await openDb();

  // Load all buffered frames into memory in one read
  const frames = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = () => resolve([]);
  });

  if (frames.length === 0) {
    setStatus("Live — streaming frames.");
    startFrameLoop();
    return;
  }

  _syncFrames = frames;
  _syncDbKeys = frames.map((f) => f.dbKey);
  _syncIndex = 0;

  setStatus(`Syncing ${frames.length} offline frame(s)...`);
  sendNextSyncFrame();
}

function sendNextSyncFrame() {
  if (_syncIndex >= _syncFrames.length) {
    // All frames ACK'd — delete them from IndexedDB in one transaction
    if (db && _syncDbKeys.length > 0) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      _syncDbKeys.forEach((key) => store.delete(key));
    }
    _syncFrames = [];
    _syncDbKeys = [];
    _syncIndex = 0;
    setStatus("Sync complete. Resuming live stream.");
    startFrameLoop();
    return;
  }

  const frame = _syncFrames[_syncIndex];
  // Send as JSON text message so server can distinguish from live binary frames
  socket.send(JSON.stringify({
    type: "sync",
    index: _syncIndex,
    timestamp: frame.timestamp,
    camera_id: frame.camera_id,
    image: frame.image,
  }));
}

function handleSyncAck(ackIndex) {
  if (ackIndex !== _syncIndex) return; 
  _syncIndex++;
  sendNextSyncFrame();
}

function getFrame(index) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(index);
    req.onsuccess = (e) => resolve(e.target.result);
  });
}

startCamera().catch((error) => setStatus(error.message, true));
