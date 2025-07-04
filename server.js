const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { initializeDatabase, Post, Comment, Reaction, Message } = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Initialize database
initializeDatabase();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // For parsing application/json

// --- Bulletin Board API ---

// Get all posts
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.findAll({
      include: [
        { model: Comment, as: 'Comments' },
        { model: Reaction, as: 'Reactions' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(posts);
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Create a new post
app.post('/api/posts', async (req, res) => {
  const { title, content } = req.body;
  try {
    const newPost = await Post.create({ title, content });
    io.emit('newPost', newPost); // Notify all connected clients about the new post
    res.status(201).json(newPost);
  } catch (error) {
    console.error('Failed to create post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Add a comment to a post
app.post('/api/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  const { username, content } = req.body;
  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const newComment = await Comment.create({ username, content, PostId: postId });
    io.emit('newComment', { postId, comment: newComment }); // Notify clients
    res.status(201).json(newComment);
  } catch (error) {
    console.error('Failed to add comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Add a reaction to a post
app.post('/api/posts/:postId/reactions', async (req, res) => {
  const { postId } = req.params;
  const { username, emoji } = req.body;
  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const newReaction = await Reaction.create({ username, emoji, PostId: postId });
    io.emit('newReaction', { postId, reaction: newReaction }); // Notify clients
    res.status(201).json(newReaction);
  } catch (error) {
    console.error('Failed to add reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});


// --- Chat API (Socket.IO) ---

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send existing messages to the newly connected user
  Message.findAll({ order: [['timestamp', 'ASC']], limit: 50 })
    .then(messages => {
      socket.emit('history', messages);
    })
    .catch(error => {
      console.error('Error fetching message history:', error);
    });

  socket.on('chatMessage', async (msg) => {
    console.log('message: ' + msg.username + ': ' + msg.content);
    try {
      const newMessage = await Message.create({ username: msg.username, content: msg.content });
      io.emit('chatMessage', newMessage); // Broadcast the message to all connected clients
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
