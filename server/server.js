import express from 'express';
import sqlite3 from 'sqlite3';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import morgan from 'morgan'; // Logging middleware

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const SERVER_URL = "https://server.filmutunnel.site";

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Uploads directory created');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use(morgan('dev')); // Logs all HTTP requests in development format

// SQLite setup
const db = new sqlite3.Database(':memory:');
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT)', (err) => {
    if (err) console.error('Error creating rooms table:', err.message);
    else console.log('Rooms table created successfully');
  });

  db.run('CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, name TEXT, path TEXT, roomId TEXT)', (err) => {
    if (err) console.error('Error creating files table:', err.message);
    else console.log('Files table created successfully');
  });

  db.run('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, roomId TEXT, sender TEXT, message TEXT, timestamp TEXT)', (err) => {
    if (err) console.error('Error creating messages table:', err.message);
    else console.log('Messages table created successfully');
  });
});

// File upload setup
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const fileName = Date.now() + '-' + file.originalname;
    console.log(`Uploading file: ${fileName}`);
    cb(null, fileName);
  },
});
const upload = multer({ storage });

// Real-time users tracking
let onlineUsers = new Set();

// Routes
app.post('/rooms', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  db.get('SELECT * FROM rooms WHERE id = ?', [roomId], (err, row) => {
    if (err) {
      console.error('Error querying room:', err.message);
      return res.status(500).send(err.message);
    }
    if (row) {
      console.log(`Room with ID ${roomId} already exists`);
      return res.json({ message: 'Room exists', room: row });
    }

    db.run('INSERT INTO rooms (id) VALUES (?)', [roomId], (err) => {
      if (err) {
        console.error('Error creating room:', err.message);
        return res.status(500).send(err.message);
      }
      console.log(`Room with ID ${roomId} created successfully`);
      res.json({ message: 'Room created', room: { id: roomId } });
    });
  });
});

app.post('/upload', upload.single('file'), (req, res) => {
  const { roomId } = req.body;
  if (!roomId) {
    console.warn('Upload failed: Room ID not provided');
    return res.status(400).send('Room ID is required');
  }

  if (!req.file) {
    console.warn('Upload failed: No file uploaded');
    return res.status(400).send('No file uploaded');
  }

  const fileMessage = {
    roomId,
    message: `File shared: <a href="${SERVER_URL}/uploads/${req.file.filename}" target="_blank" style="color:blue; text-decoration:underline;">${req.file.originalname}</a>`,
    sender: 'System',
    timestamp: new Date().toLocaleTimeString(),
  };

  io.to(roomId).emit('file-uploaded', fileMessage);

  db.run(
    'INSERT INTO files (name, path, roomId) VALUES (?, ?, ?)',
    [req.file.originalname, `/uploads/${req.file.filename}`, roomId],
    (err) => {
      if (err) {
        console.error('Error saving file info to database:', err.message);
        return res.status(500).send(err.message);
      }
      res.json({ filePath: `${SERVER_URL}/uploads/${req.file.filename}`, fileName: req.file.originalname });
    }
  );
});


// Real-time chat and user management
io.on('connection', (socket) => {

  console.log(`User connected: ${socket.id}`);
  onlineUsers.add(socket.id);
  const updateGlobalUsers = () => {
    const globalUserCount = io.engine.clientsCount;
    io.emit("update-global-users", globalUserCount);
  };

  updateGlobalUsers();

  socket.on('send-message', ({ roomId, message, sender, timestamp }) => {
    db.run(
      'INSERT INTO messages (roomId, sender, message, timestamp) VALUES (?, ?, ?, ?)',
      [roomId, sender, message, timestamp],
      (err) => {
        if (err) console.error('Error saving message:', err.message);
      }
    );
    io.to(roomId).emit('receive-message', { sender, message, timestamp });
  });

  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
  
    db.all(
      'SELECT sender, message, timestamp FROM messages WHERE roomId = ? ORDER BY id ASC',
      [roomId],
      (err, rows) => {
        if (err) console.error('Error retrieving messages:', err.message);
        else socket.emit('previous-messages', rows);
      }
    );
  
    // Notify all users in the room
    io.to(roomId).emit('receive-message', {
      sender: 'System',
      message: `${username} joined the room.`,
      timestamp: new Date().toLocaleTimeString(),
    });
  
    // Update user list
    const roomUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
      (id) => io.sockets.sockets.get(id).username
    );
    io.to(roomId).emit('update-users', roomUsers);
  });
  
  // Handle user disconnect
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    updateGlobalUsers(); // Upda
    const { roomId, username } = socket;
    if (roomId) {
      io.to(roomId).emit('receive-message', {
        sender: 'System',
        message: `${username} left the room.`,
        timestamp: new Date().toLocaleTimeString(),
      });
  
      // Update user list
      const roomUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (id) => io.sockets.sockets.get(id).username
      );
      io.to(roomId).emit('update-users', roomUsers);
    }
  });
  
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running at ${SERVER_URL}`));
