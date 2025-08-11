const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });
const socketMap = {};

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'register' && data.sessionId) {
        socketMap[data.sessionId] = ws;
      }
    } catch (err) {
      console.error('❌ WS error:', err.message);
    }
  });
});

module.exports = socketMap;
