const express = require("express");
const router = express.Router();
const contentDisposition = require("content-disposition");
const { fork, spawn } = require("child_process");
const path = require("path");
const { canDownload, registerDownload, unregisterDownload } = require("./limitTracker");

const MAX_CONCURRENT = 2;
const MAX_PER_USER = 2;

const queue = [];
let activeCount = 0;
const userActiveMap = {}; // sessionId -> count
const userUrlMap = {};    // sessionId -> Set of active URLs

function processQueue() {
  if (activeCount >= MAX_CONCURRENT || queue.length === 0) return;

  for (let i = 0; i < queue.length; i++) {
    const { reqData, res } = queue[i];
    const { id: sessionId, fp: fingerprint, ip, url: videoUrl } = reqData;
    const userCount = userActiveMap[sessionId] || 0;
    const activeUrls = userUrlMap[sessionId] || new Set();

    if (
      userCount < MAX_PER_USER &&
      canDownload({ ip, fingerprint }) &&
      !activeUrls.has(videoUrl)
    ) {
      queue.splice(i, 1);
      activeCount++;
      userActiveMap[sessionId] = userCount + 1;
      activeUrls.add(videoUrl);
      userUrlMap[sessionId] = activeUrls;
      registerDownload({ ip, fingerprint });

      handleDownload(reqData, res).finally(() => {
        activeCount--;
        userActiveMap[sessionId]--;
        activeUrls.delete(videoUrl);
        unregisterDownload({ ip, fingerprint });
        processQueue();
      });
      break;
    }
  }
}

router.get("/descargar", (req, res) => {
  const videoUrl = req.query.url;
  const sessionId = req.query.id;
  const fingerprint = req.query.fp;
  const ip = req.ip;
  const ws = req.socketMap?.[sessionId];

  if (!videoUrl || !sessionId || !ws) {
    return res.status(400).send("❌ Falta la URL o el ID de sesión.");
  }

  const userCount = userActiveMap[sessionId] || 0;
  const activeUrls = userUrlMap[sessionId] || new Set();

  if (userCount >= MAX_PER_USER) {
    ws.send(JSON.stringify({ type: "limit_reached" }));
    return res.status(429).send("❌ Límite de descargas simultáneas alcanzado.");
  }

  if (!canDownload({ ip, fingerprint })) {
    ws.send(JSON.stringify({ type: "ip_limit_reached" }));
    return res.status(429).send("❌ Límite por IP o dispositivo alcanzado.");
  }

  if (activeUrls.has(videoUrl)) {
    ws.send(JSON.stringify({ type: "already_downloading" }));
    return res.status(429).send("❌ Esta canción ya se está descargando.");
  }

  const reqData = { url: videoUrl, id: sessionId, fp: fingerprint, ip, socketMap: req.socketMap };

  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    userActiveMap[sessionId] = userCount + 1;
    activeUrls.add(videoUrl);
    userUrlMap[sessionId] = activeUrls;
    registerDownload({ ip, fingerprint });

    handleDownload(reqData, res).finally(() => {
      activeCount--;
      userActiveMap[sessionId]--;
      activeUrls.delete(videoUrl);
      unregisterDownload({ ip, fingerprint });
      processQueue();
    });
  } else {
    ws.send(JSON.stringify({ type: "queued" }));
    queue.push({ reqData, res });
  }
});


const fetch = require("node-fetch");

async function handleDownload(reqData, res) {
  const { url: videoUrl, id: sessionId, socketMap } = reqData;
  const ws = socketMap?.[sessionId];

  ws?.send(JSON.stringify({ type: "preparing_audio" }));

  const workerUrl = `https://ytmp3-worker.onrender.com/convert?url=${encodeURIComponent(videoUrl)}&format=140`;

  try {
    const response = await fetch(workerUrl);

    if (!response.ok || !response.body) {
      ws?.send(JSON.stringify({ type: "conversion_failed" }));
      return res.status(500).send("❌ Error en el worker externo.");
    }

    let conversionNotified = false;
    let downloadNotified = false;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `inline; filename=${sessionId}.mp3`);

    response.body.on("data", (chunk) => {
      if (!conversionNotified) {
        conversionNotified = true;
        ws?.send(JSON.stringify({ type: "conversion_started" }));
      }
      if (!downloadNotified) {
        downloadNotified = true;
        ws?.send(JSON.stringify({ type: "download_started" }));
      }
      res.write(chunk);
    });

    response.body.on("end", () => {
      res.end();
    });

    res.on("close", () => {
      console.log(`⚠️ Descarga cancelada por el usuario: ${sessionId}`);
      response.body.destroy(); // corta el stream del worker
    });

  } catch (err) {
    console.error("❌ Error al conectar con el worker:", err.message);
    ws?.send(JSON.stringify({ type: "conversion_failed" }));
    res.status(500).send("❌ Falló la conexión con el worker.");
  }
}


// async function handleDownload(reqData, res) {
//   const { url: videoUrl, id: sessionId, socketMap } = reqData;
//   const ws = socketMap?.[sessionId];

//   ws?.send(JSON.stringify({ type: "preparing_audio" }));

//   let metadata;

//   try {
//     metadata = await new Promise((resolve, reject) => {
//       const dump = spawn("yt-dlp", ["--dump-json", videoUrl]);
//       let json = "";

//       dump.stdout.on("data", (chunk) => {
//         json += chunk.toString();
//       });

//       dump.on("close", () => {
//         try {
//           resolve(JSON.parse(json));
//         } catch (err) {
//           reject(err);
//         }
//       });

//       dump.on("error", reject);
//     });
//   } catch (err) {
//     console.error("❌ Error al obtener metadata:", err.message);
//     return res.status(500).send("❌ No se pudo obtener metadata.");
//   }

//   const audioFormat =
//     metadata.formats.find((f) => f.format_id === "140") ||
//     metadata.formats.find((f) => f.acodec !== "none" && !f.fragment_base_url);
//   if (!audioFormat) {
//     return res.status(500).send("❌ No se encontró formato de audio compatible.");
//   }

//   const title = metadata.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
//   const filename = `${title || sessionId}.mp3`;

//   res.setHeader("Content-Type", "audio/mpeg");
//   res.setHeader("Content-Disposition", contentDisposition(filename));

//   let conversionNotified = false;
//   let downloadNotified = false;

//   // const worker = fork(
//   //   path.join(__dirname, "..", "workers", "audioWorker.js"),
//   //   [videoUrl, audioFormat.format_id],
//   //   { stdio: ["pipe", "pipe", "pipe", "ipc"] }
//   // );


//   res.on("close", () => {
//     console.log(`⚠️ Descarga cancelada por el usuario: ${sessionId}`);
//     worker.kill();
//   });

//   worker.stdout.on("data", (chunk) => {
//     if (!downloadNotified) {
//       downloadNotified = true;
//       ws?.send(JSON.stringify({ type: "download_started" }));
//     }
//     res.write(chunk);
//   });

//   worker.stderr.on("data", (data) => {
//     const output = data.toString();
//     if (!conversionNotified && output.includes("[download]")) {
//       conversionNotified = true;
//       ws?.send(JSON.stringify({ type: "conversion_started" }));
//     }
//     console.error("[worker]", output);
//   });

//   worker.on("close", () => {
//     res.end();
//   });
// }

module.exports = router;
