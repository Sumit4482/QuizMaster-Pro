# 🚀 QuizMaster-Pro Deployment Guide

Deploy your QuizMaster-Pro application for **FREE** using Railway (backend) + Vercel (frontend).

## 📋 Quick Start

1. **Run the deployment script:**
   ```bash
   ./deploy.sh
   ```

2. **Follow the generated instructions** to deploy on Railway and Vercel

## 🏗️ Architecture

```
Internet
   ↓
Vercel (Frontend) ←→ Railway (Backend + PostgreSQL + Redis)
```

- **Frontend**: Next.js app hosted on Vercel
- **Backend**: Node.js API hosted on Railway
- **Database**: PostgreSQL on Railway
- **Cache**: Redis on Railway

## 🔧 Manual Deployment Steps

### Backend Deployment (Railway)

1. **Create Railway Account**
   - Visit [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Deploy Backend**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your QuizMaster-Pro repository
   - Railway auto-detects `railway.toml` configuration

3. **Add Database Services**
   - Click "Add" → "Database" → "PostgreSQL"
   - Click "Add" → "Database" → "Redis"

4. **Set Environment Variables**
   ```env
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=your-generated-secret
   JWT_REFRESH_SECRET=your-generated-refresh-secret
   GOOGLE_API_KEY=your-google-api-key
   CORS_ORIGIN=https://your-app.vercel.app
   ```
   
   > 📝 `DATABASE_URL` and `REDIS_URL` are automatically set by Railway plugins

### Frontend Deployment (Vercel)

1. **Create Vercel Account**
   - Visit [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Deploy Frontend**
   - Click "New Project"
   - Select your QuizMaster-Pro repository
   - **Set Root Directory to:** `frontend`
   - Vercel auto-detects Next.js configuration

3. **Set Environment Variables**
   ```env
   NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
   NEXT_PUBLIC_WEBSOCKET_URL=wss://your-railway-app.railway.app
   ```

4. **Update Backend CORS**
   - After Vercel deployment, update Railway's `CORS_ORIGIN`
   - Set it to your Vercel URL: `https://your-app.vercel.app`

## 🔑 Required API Keys

### Google AI (Required)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable "Generative Language API"
4. Create API key in "APIs & Services" → "Credentials"
5. Add to Railway environment variables

### Optional AI Providers
- **OpenAI**: [platform.openai.com](https://platform.openai.com)
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
- **Hugging Face**: [huggingface.co](https://huggingface.co)

## 🎯 Expected Costs

### Railway (Backend)
- **Free Tier**: $5 credit per month
- **Usage**: ~$3-4/month for small apps
- **Includes**: PostgreSQL, Redis, hosting

### Vercel (Frontend)
- **Free Tier**: 100GB bandwidth
- **Usage**: Completely free for small apps
- **Includes**: Global CDN, auto-scaling

### Total: **$0-1/month** 🎉

## 🔧 Configuration Files

- `railway.toml` - Railway deployment config
- `frontend/vercel.json` - Vercel deployment config
- `backend/Dockerfile.prod` - Production Docker image
- `env.example` - Environment variables template

## 🚨 Troubleshooting

### Backend Issues
```bash
# Check Railway logs
railway logs

# Test health endpoint
curl https://your-app.railway.app/health
```

### Frontend Issues
```bash
# Check Vercel logs in dashboard
# Test API connection
curl https://your-app.vercel.app/api/health
```

### Database Issues
```bash
# Run migrations on Railway
railway run npx prisma migrate deploy

# Seed database
railway run npm run db:seed
```

## 📊 Monitoring

### Railway Dashboard
- CPU/Memory usage
- Database connections
- Deployment logs
- Environment variables

### Vercel Dashboard
- Bandwidth usage
- Function execution
- Build logs
- Performance analytics

## 🔄 Auto-Deployment

Both platforms automatically redeploy when you push to GitHub:

1. **Push changes** to your repository
2. **Railway** rebuilds backend automatically
3. **Vercel** rebuilds frontend automatically
4. **Zero downtime** deployments

## 🛡️ Security Features

### Backend (Railway)
- ✅ Environment variables encryption
- ✅ Private database access
- ✅ HTTPS/TLS termination
- ✅ Security headers (Helmet.js)

### Frontend (Vercel)
- ✅ HTTPS by default
- ✅ DDoS protection
- ✅ Global CDN
- ✅ Security headers

## 📈 Scaling

### Railway
- Automatic vertical scaling
- Upgrade to paid plans for more resources
- Add more database storage as needed

### Vercel
- Automatic edge scaling
- Global CDN distribution
- Serverless function scaling

---

🎉 **Your QuizMaster-Pro app is now ready for the world!** 

Need help? Check the logs, review this guide, or create an issue in the repository.
