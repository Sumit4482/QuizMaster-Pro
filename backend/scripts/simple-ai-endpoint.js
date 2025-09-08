/**
 * SIMPLE AI ENDPOINT - QuizMaster Pro
 * Bypasses complex AI service for immediate testing
 */

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Enable CORS for frontend requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use(express.json());

const GOOGLE_API_KEY = 'AIzaSyB7O_pCoXdzsMAytdUssXNuK0ApF-3PIXg';
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// Simple AI question generation endpoint
app.post('/api/ai/simple/generate', async (req, res) => {
  try {
    const { topic, difficulty, count = 3, questionType = 'MULTIPLE_CHOICE' } = req.body;
    
    console.log(`🤖 Generating ${count} questions about: ${topic}`);
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `Generate ${count} quiz questions about "${topic}" with difficulty level ${difficulty} (1=easy, 2=medium, 3=hard).

Format each question as JSON with this exact structure:
{
  "questionText": "What is...",
  "questionType": "${questionType}",
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": "option1",
  "explanation": "Brief explanation why this answer is correct...",
  "difficulty": ${difficulty}
}

Requirements:
- Return only valid JSON array
- Make sure correctAnswer exactly matches one of the options
- Create engaging, educational questions
- Vary the position of correct answers

Return ONLY the JSON array, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // Clean up response
    text = text.replace(/```json\n?|```\n?/g, '').trim();
    
    const questions = JSON.parse(text);
    
    res.json({
      success: true,
      questions: questions,
      totalGenerated: questions.length,
      validQuestions: questions.length,
      cost: { totalCost: 0, currency: 'FREE' },
      model: 'gemini-1.5-flash',
      provider: 'google'
    });
    
    console.log(`✅ Generated ${questions.length} questions successfully`);
    
  } catch (error) {
    console.error('❌ Error generating questions:', error.message);
    
    res.status(500).json({
      success: false,
      error: {
        code: 'AI_GENERATION_FAILED',
        message: 'Failed to generate questions',
        details: error.message
      }
    });
  }
});

// Health check
app.get('/api/ai/simple/health', (req, res) => {
  res.json({
    success: true,
    service: 'Simple AI Endpoint',
    model: 'gemini-1.5-flash',
    provider: 'google',
    status: 'operational'
  });
});

// Start server
const PORT = 3002;
app.listen(PORT, () => {
  console.log('🚀 SIMPLE AI SERVICE STARTED!');
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log('🤖 Gemini AI Ready for question generation');
  console.log('');
  console.log('TEST ENDPOINTS:');
  console.log(`GET  http://localhost:${PORT}/api/ai/simple/health`);
  console.log(`POST http://localhost:${PORT}/api/ai/simple/generate`);
  console.log('');
  console.log('EXAMPLE REQUEST:');
  console.log(`curl -X POST http://localhost:${PORT}/api/ai/simple/generate \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"topic":"JavaScript","difficulty":2,"count":3}'`);
});

module.exports = app;
