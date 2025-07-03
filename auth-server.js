const express = require('express');
const Pusher = require('pusher');
const cors = require('cors');
const app = express();

const pusher = new Pusher({
  appId: '2017008',
  key: '0746c442e7028eaa0ee8',
  secret: '015d514bd999c3343f64',
  cluster: 'ap3',
  useTLS: true
});

app.use(cors({
  origin: 'https://20250704.netlify.app',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));
app.use(express.json());

app.post('/pusher/auth', (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  if (!socketId || !channel) {
    console.error('Missing socket_id or channel_name:', { socketId, channel });
    return res.status(400).send({ error: 'Missing socket_id or channel_name' });
  }
  try {
    const auth = pusher.authenticate(socketId, channel);
    res.send(auth);
  } catch (error) {
    console.error('Pusher auth error:', error);
    res.status(500).send({ error: 'Authentication failed' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});