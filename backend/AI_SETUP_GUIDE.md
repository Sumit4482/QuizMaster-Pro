# 🚀 AI SERVICE SETUP GUIDE - QuizMaster Pro

## 🔑 STEP 1: ADD YOUR API KEYS

### Option A: Using Environment Variables (RECOMMENDED)

Add these to your system environment or create a `.env.local` file:

```bash
# ===========================================
# FREE AI API KEYS (Choose at least one)
# ===========================================

# HuggingFace (100% FREE) - Get from: https://huggingface.co/settings/tokens
HUGGINGFACE_API_KEY=hf_your_token_here

# Google Gemini (FREE) - Get from: https://makersuite.google.com/app/apikey  
GOOGLE_API_KEY=AIza_your_key_here

# OpenAI (Paid with $5 credit) - Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your_key_here

# Anthropic Claude (Paid) - Get from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-your_key_here

# ===========================================
# RECOMMENDED SETTINGS FOR FREE USAGE
# ===========================================

AI_DEFAULT_MODEL=gemini-pro
AI_FALLBACK_MODEL=microsoft/DialoGPT-medium
AI_DAILY_USAGE_LIMIT=100
AI_MONTHLY_BUDGET_LIMIT=5.0
AI_MAX_QUESTIONS_PER_BATCH=5
AI_MIN_QUALITY_SCORE=0.6
AI_RATE_LIMIT_RPM=30
```

### Option B: Docker Environment (if using docker-compose)

Add to your `docker-compose.yml` under backend service:

```yaml
backend:
  environment:
    - HUGGINGFACE_API_KEY=hf_your_token_here
    - GOOGLE_API_KEY=AIza_your_key_here  
    - OPENAI_API_KEY=sk-your_key_here
    - AI_DEFAULT_MODEL=gemini-pro
```

## 🛠️ STEP 2: ENABLE AI SERVICE

The AI service is currently disabled. To enable it:

1. Edit `backend/src/app.ts` 
2. Uncomment the AI routes
3. Restart the backend

## 🧪 STEP 3: TEST AI FUNCTIONALITY

Once configured, you can test AI in several ways:

### A) Frontend UI (Easiest)
- Go to Admin Panel → Questions
- Click "Generate with AI"
- Select topic, difficulty, and quantity

### B) Direct API Test (Advanced)
```bash
curl -X POST http://localhost:3001/api/ai/generate/questions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "JavaScript Programming", 
    "difficulty": 2,
    "questionType": "MULTIPLE_CHOICE",
    "count": 3
  }'
```

### C) Built-in AI Test (Recommended)
Use the AI test endpoint:
```bash
curl -X GET http://localhost:3001/api/ai/test/providers
```

## 🆓 FREE TIER RECOMMENDATIONS

### Start with Google Gemini (Best Free Option):
- ✅ 60 requests/minute FREE
- ✅ High-quality responses  
- ✅ Easy setup
- ✅ Perfect for testing

### HuggingFace Backup:
- ✅ 1000 requests/month FREE
- ✅ Many open-source models
- ✅ Good for development

## 🚨 IMPORTANT NOTES

1. **Start Small**: Test with 1-3 questions first
2. **Monitor Usage**: Check your API usage dashboards  
3. **Set Limits**: Use AI_DAILY_USAGE_LIMIT to avoid overage
4. **Cache Results**: Enable caching to reduce API calls
5. **Use Free Models**: Gemini-Pro and HuggingFace are free!

## 🎯 EXPECTED RESULTS

Once configured, AI will generate questions like:

```json
{
  "success": true,
  "questions": [
    {
      "questionText": "What is the correct syntax for declaring a variable in JavaScript?",
      "questionType": "MULTIPLE_CHOICE", 
      "options": ["var x;", "variable x;", "v x;", "declare x;"],
      "correctAnswer": "var x;",
      "explanation": "Variables in JavaScript are declared using var, let, or const keywords.",
      "difficulty": 2,
      "qualityScore": 0.89
    }
  ],
  "cost": { "totalCost": 0.002 },
  "validQuestions": 1
}
```

## 🔧 TROUBLESHOOTING

- **"Invalid API Key"**: Double-check your key format and validity
- **"Rate Limit Exceeded"**: Reduce AI_RATE_LIMIT_RPM setting  
- **"Budget Exceeded"**: Increase AI_MONTHLY_BUDGET_LIMIT
- **"Poor Quality"**: Lower AI_MIN_QUALITY_SCORE setting

Need help? The AI service has built-in error handling and fallback mechanisms!
