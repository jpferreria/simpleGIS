require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('./auth');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
const featureRoutes = require('./routes/features');
const llmRoutes = require('./routes/llm');

// Auth Routes
app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }));

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('http://localhost:5173/'); // Redirect to frontend
  });

// API Routes
app.use('/api/features', featureRoutes);
app.use('/api/llm', llmRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LiteGIS Backend is running', user: req.user || null });
});

app.post('/api/elevation', async (req, res) => {
  try {
    const { locations } = req.body;
    const response = await fetch('https://api.opentopodata.org/v1/srtm90m', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Elevation proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch elevation data' });
  }
});

// Start the server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
