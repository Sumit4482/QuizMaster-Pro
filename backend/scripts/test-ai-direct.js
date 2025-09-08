/**
 * DIRECT AI TEST SCRIPT - QuizMaster Pro
 * Tests your Gemini API key directly without the complex AI service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const GOOGLE_API_KEY = 'AIzaSyB7O_pCoXdzsMAytdUssXNuK0ApF-3PIXg';

async function testGeminiAPI() {
  console.log('🤖 TESTING GOOGLE GEMINI API DIRECTLY...\n');
  
  try {
    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    console.log('✅ Gemini API initialized successfully');
    console.log('🔑 API Key: ' + GOOGLE_API_KEY.substring(0, 20) + '...');
    console.log('📡 Testing question generation...\n');

    // Test prompt for question generation
    const prompt = `Generate 2 quiz questions about JavaScript programming.
    
Format each question as JSON with this structure:
{
  "questionText": "What is...",
  "questionType": "MULTIPLE_CHOICE", 
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": "option1",
  "explanation": "Brief explanation...",
  "difficulty": 2
}

Return only valid JSON array with 2 questions.`;

    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('🎯 RAW GEMINI RESPONSE:');
    console.log('=' .repeat(50));
    console.log(text);
    console.log('=' .repeat(50));

    // Try to parse as JSON
    try {
      const questions = JSON.parse(text.replace(/```json\n?|```\n?/g, ''));
      console.log('\n✅ SUCCESSFULLY PARSED QUESTIONS:');
      console.log(JSON.stringify(questions, null, 2));
      
      console.log('\n🎉 AI TEST SUCCESS!');
      console.log('✅ Your Gemini API key works perfectly!');
      console.log(`✅ Generated ${questions.length} questions`);
      console.log('✅ Ready for integration with QuizMaster Pro');
      
    } catch (parseError) {
      console.log('\n⚠️  Response generated but needs format tweaking');
      console.log('✅ Your Gemini API key works!');
      console.log('❗ Response format needs adjustment for JSON parsing');
    }

  } catch (error) {
    console.log('❌ ERROR TESTING GEMINI API:');
    console.log(error.message);
    
    if (error.message.includes('API_KEY_INVALID')) {
      console.log('\n🔑 API KEY ISSUE:');
      console.log('- Double-check your Gemini API key');
      console.log('- Make sure it\'s activated at: https://makersuite.google.com/');
    } else if (error.message.includes('quota')) {
      console.log('\n💰 QUOTA ISSUE:');
      console.log('- You may have exceeded free tier limits');
      console.log('- Check usage at: https://console.cloud.google.com/');
    } else {
      console.log('\n🌐 CONNECTION ISSUE:');
      console.log('- Check your internet connection');
      console.log('- Gemini API might be temporarily down');
    }
  }
}

// Run the test
console.log('🧪 DIRECT GEMINI AI TEST - QuizMaster Pro');
console.log('================================================\n');

testGeminiAPI()
  .then(() => {
    console.log('\n✨ Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
