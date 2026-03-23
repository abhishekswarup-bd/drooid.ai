// Quick test to verify Gemini API connection
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  console.log('Testing Gemini 2.5 Flash connection...');
  console.log('Primary API Key:', process.env.GEMINI_API_KEY?.substring(0, 10) + '...');
  console.log('Fallback API Key:', process.env.GEMINI_API_KEY_FALLBACK?.substring(0, 10) + '...');
  console.log('');

  let success = false;

  // Test primary key
  try {
    console.log('Testing PRIMARY key...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent('Say "Drooid Sales Engine is online!" and nothing else.');
    console.log('Response:', result.response.text());
    console.log('✓ PRIMARY Gemini connection successful!');
    success = true;
  } catch (err) {
    console.error('✗ PRIMARY Gemini connection failed:', err.message);

    // Try fallback key
    if (process.env.GEMINI_API_KEY_FALLBACK) {
      console.log('');
      console.log('Testing FALLBACK key...');
      try {
        const genAI2 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_FALLBACK);
        const model2 = genAI2.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result2 = await model2.generateContent('Say "Drooid Sales Engine is online via fallback!" and nothing else.');
        console.log('Response:', result2.response.text());
        console.log('✓ FALLBACK Gemini connection successful!');
        success = true;
      } catch (err2) {
        console.error('✗ FALLBACK also failed:', err2.message);
      }
    }
  }

  console.log('');
  if (success) {
    console.log('TEST PASSED: At least one Gemini API key is working!');
    process.exit(0);
  } else {
    console.log('TEST FAILED: No working Gemini API keys found.');
    console.log('Please verify your API keys at https://aistudio.google.com/apikey');
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
