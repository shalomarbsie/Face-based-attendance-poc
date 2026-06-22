const samples = [];
const video = document.querySelector("#video");
const canvas = document.querySelector("#canvas");
const sampleCount = document.querySelector("#sample-count");

async function startCamera() {
  await requireSession();
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = stream;
}

function updateCount() {
  sampleCount.textContent = `${samples.length}/5 samples captured`;
}

async function captureSample() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  samples.push(blob);
  updateCount();
  setStatus("Sample captured. Capture at least 5 before submitting.");
}

document.querySelector("#capture").addEventListener("click", captureSample);
document.querySelector("#clear").addEventListener("click", () => {
  samples.length = 0;
  updateCount();
  setStatus("Samples cleared.");
});

document.querySelector("#employee-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (samples.length < 5) {
    setStatus("Capture at least 5 samples before registering.", true);
    return;
  }
  const data = new FormData(event.target);
  samples.forEach((sample, index) => data.append("images", sample, `sample-${index}.jpg`));
  try {
    const result = await request("/api/employees/register", { method: "POST", body: data });
    samples.length = 0;
    updateCount();
    event.target.reset();
    setStatus(`Registered ${result.full_name} with ${result.samples} valid samples.`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

updateCount();
startCamera().catch((error) => setStatus(error.message, true));
