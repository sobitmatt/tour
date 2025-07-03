const express = require('express');
const Pusher = require('pusher');
const cors = require('cors');
const app = express();

// Pusher configuration
const pusher = new Pusher({
  appId: '2017008',
  key: '0746c442e7028eaa0ee8',
  secret: '015d514bd999c3343f64',
  cluster: 'ap3',
  useTLS: true
});

// CORS configuration
app.use(cors({
  origin: 'https://20250704.netlify.app', // Netlify URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Pusher authentication endpoint
app.post('/pusher/auth', (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  try {
    const auth = pusher.authenticate(socketId, channel);
    res.send(auth);
  } catch (error) {
    console.error('Pusher auth error:', error);
    res.status(500).send({ error: 'Authentication failed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Use Render's PORT environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});