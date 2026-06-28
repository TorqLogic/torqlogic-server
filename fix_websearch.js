const fs = require('fs');

const newServerCode = `require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
const diagnoseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Too many requests - please wait a moment before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let totalSearchesToday = 0;
let totalRequestsToday = 0;
let lastResetDate = new Date().toDateString();

function resetDailyCountersIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    totalSearchesToday = 0;
    totalRequestsToday = 0;
    lastResetDate = today;
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'TorqLogic Server Running' });
});
app.get('/ping', (req, res) => {
  res.json({ status: 'alive' });
});
app.get('/usage', (req, res) => {
  resetDailyCountersIfNeeded();
  res.json({ date: lastResetDate, totalRequestsToday, totalSearchesToday });
});
app.post('/diagnose', diagnoseLimiter, async (req, res) => {
  try {
    resetDailyCountersIfNeeded();
    const { messages, system } = req.body;
    totalRequestsToday++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: system,
      messages: messages,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
    });

    const searchCount = response.content.filter(block => block.type === 'server_tool_use' && block.name === 'web_search').length;
    totalSearchesToday += searchCount;

    res.json({ content: response.content, searchesUsed: searchCount });
  } catch (error) {
    console.error('Diagnose error:', error.message);
    if (error.status === 429) {
      res.status(429).json({ error: 'Server is busy right now - please try again in a moment.' });
    } else if (error.status === 401) {
      res.status(500).json({ error: 'Server configuration error - please contact support.' });
    } else if (error.message && error.message.includes('timeout')) {
      res.status(504).json({ error: 'Request timed out - check your connection and try again.' });
    } else {
      res.status(500).json({ error: 'Something went wrong - please try again.' });
    }
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('TorqLogic server running on port ' + PORT);
});
`;

fs.writeFileSync('index.js', newServerCode);
console.log('Done!');