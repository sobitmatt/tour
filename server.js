const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// HTTP server for serving static files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'check.html' : req.url);
  const ext = path.extname(filePath);
  if (!ext) filePath += '.html';

  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
  }[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// WebSocket server for WebRTC signaling
const wss = new WebSocket.Server({ server });
const rooms = {};

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    let messageStr = message.toString('utf8');
    let data;
    try {
      data = JSON.parse(messageStr);
    } catch (error) {
      console.error('Invalid JSON message:', messageStr, error);
      return;
    }

    if (data.type === 'join') {
      if (!rooms[data.roomId]) rooms[data.roomId] = new Set();
      rooms[data.roomId].add(data.userId);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'join',
            roomId: data.roomId,
            userId: data.userId
          }));
        }
      });
    } else if (data.type === 'leave') {
      if (rooms[data.roomId]) {
        rooms[data.roomId].delete(data.userId);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'leave',
              roomId: data.roomId,
              userId: data.userId
            }));
          }
        });
      }
    } else {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Use Render's PORT environment variable
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP server running at http://localhost:${PORT}`);
});