const { GoogleGenerativeAI } = require('@google/generative-ai');

const GOOGLE_API_KEY = 'AIzaSyB7O_pCoXdzsMAytdUssXNuK0ApF-3PIXg';
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

async function testAIGeneration() {
  try {
    console.log('🤖 Testing AI generation...');
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const topic = 'Python Programming';
    const difficulty = 3;
    const count = 2;
    
    const prompt = `Generate ${count} quiz questions about "${topic}" with difficulty level ${difficulty} (1=easy, 2=medium, 3=hard, 4=difficult, 5=expert).

Format each question as JSON with this exact structure:
{
  "questionText": "What is...",
  "questionType": "MULTIPLE_CHOICE",
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": "option1",
  "explanation": "Brief explanation why this answer is correct...",
  "difficulty": ${difficulty}
}

Requirements:
- Return only valid JSON array
- Make sure correctAnswer exactly matches one of the options
- Create engaging, educational questions about ${topic}
- Vary the position of correct answers

Return ONLY the JSON array, nothing else.`;

    console.log('📝 Sending prompt to AI...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    console.log('📋 Raw AI Response:', text);
    
    // Clean up response
    text = text.replace(/\`\`\`json\n?|\`\`\`\n?/g, '').trim();
    
    console.log('🧹 Cleaned Response:', text);
    
    const questions = JSON.parse(text);
    console.log('✅ Parsed Questions:', JSON.stringify(questions, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAIGeneration();
