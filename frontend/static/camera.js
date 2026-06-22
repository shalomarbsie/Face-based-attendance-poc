const video = document.querySelector("#video");
const canvas = document.querySelector("#canvas");
let running = false;
let busy = false;

async function loadCameraInfo() {
  const camera = await request("/api/camera/current");
  document.querySelector("#camera-name").textContent = `${camera.name} (${camera.direction})`;
}

async function startCamera() {
  await loadCameraInfo();
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = stream;
  running = true;
  setStatus("Camera started. Detecting every 2 seconds.");
  setInterval(sendFrame, 2000);
}

async function sendFrame() {
  if (!running || busy || !video.videoWidth) return;
  busy = true;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  const data = new FormData();
  data.append("image", blob, "frame.jpg");
  try {
    const result = await request("/api/camera/detect", { method: "POST", body: data });
    const events = result.events || [result];
    setStatus(events.map((event) => `${event.employee}: ${event.event_type}`).join(" | "));
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    busy = false;
  }
}

startCamera().catch((error) => setStatus(error.message, true));
