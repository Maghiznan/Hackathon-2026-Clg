/* Same-origin FastAPI client. No raw-video URL is exposed to the output player. */
"use strict";
window.BorderWatchAPI = (() => {
  async function request(path, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, {...options, signal: controller.signal});
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try { const data = await response.json(); if (typeof data.detail === "string") message = data.detail; } catch {}
        throw new Error(message);
      }
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Request timed out. The backend may still be working.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  return {
    health: () => request("/api/health", {}, 8000),
    upload: file => {const body = new FormData(); body.append("file", file); return request("/api/videos", {method:"POST", body}, 120000);},
    start: (videoId, polygon) => request("/api/jobs", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({video_id:videoId, polygon})}),
    job: id => request(`/api/jobs/${encodeURIComponent(id)}`)
  };
})();
