import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 5000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://ai-vr-warwick-castle.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

app.post('/api/ask', async (req, res) => {
  try {
    const { question, image } = req.body;

    if (!question || !image) {
      return res.status(400).json({ error: 'Question and image are required.' });
    }

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for a VR dissertation prototype. The captured scene is Warwick Castle, specifically the Great Hall environment. Always answer using that location context. If the user asks what the room is, describe it as part of Warwick Castle. Do not describe it as a random generic room unless the image clearly contradicts the context.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      max_tokens: 300
    });

    const answer = response.choices?.[0]?.message?.content || 'No answer returned.';
    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze image.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});