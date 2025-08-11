const cors = require('cors');
const express = require('express');
const app = express();
const http = require('http');
const apiRouter = require('./routes/api');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;

const server = http.createServer(app); // 👈 combinamos Express + WebSocket
const wss = new WebSocket.Server({ noServer: true }); // 👈 WebSocket sin ruta directa

const socketMap = {}; // sessionId -> WebSocket

// Escuchar conexiones en /ws
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    console.log("🔄 Upgrade request to:", req.url);
  } else {  
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'register' && data.sessionId) {
        socketMap[data.sessionId] = ws;
      }
      console.log("✅ WebSocket connected");

    } catch (err) {
      console.error('❌ WS error:', err.message);
    }
  });
});

// app.use(cors());
app.use(cors({
  origin: 'https://fastymp3.vercel.app',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// 👉 Compartimos el mapa con rutas API
app.use((req, res, next) => {
  req.socketMap = socketMap;
  next();
});


// app.use((req, res, next) => {
//   res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
//   res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//   next();
// });


app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://fastymp3.vercel.app');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});


app.use('/api', apiRouter);

// 🚀 Arrancamos backend + websocket en el mismo puerto
// server.listen(3000, () => {
//   console.log('🚀 Servidor corriendo en http://localhost:3000');
//   console.log('🔌 WebSocket activo en ws://localhost:3000/ws');
// });


server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔌 WebSocket activo en ws://localhost:${PORT}/ws`);
});