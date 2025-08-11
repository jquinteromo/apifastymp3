module.exports = function notifyConversionStarted(ffmpegProcess, sessionId, socketMap) {
  ffmpegProcess.stdout.once('data', () => {
    const ws = socketMap[sessionId];
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'conversion_started' }));
    }
  });
};