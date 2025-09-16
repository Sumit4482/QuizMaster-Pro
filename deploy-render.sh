#!/bin/bash

echo "🚀 QuizMaster-Pro Render Deployment Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Generate secure JWT secrets
generate_secrets() {
    echo -e "${BLUE}Generating secure JWT secrets...${NC}"
    
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    echo -e "${GREEN}✅ JWT secrets generated${NC}"
    echo -e "${YELLOW}Save these secrets for Render environment variables:${NC}"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
    echo ""
}

# Commit changes
commit_changes() {
    echo -e "${BLUE}Committing deployment configurations...${NC}"
    
    git add .
    git commit -m "Add Render deployment configuration"
    git push origin temp
    
    echo -e "${GREEN}✅ Changes pushed to GitHub${NC}"
}

# Display deployment instructions
show_render_instructions() {
    echo -e "${GREEN}"
    echo "🎉 RENDER DEPLOYMENT READY!"
    echo "=========================="
    echo -e "${NC}"
    
    echo -e "${BLUE}📋 Render Deployment Steps (100% FREE):${NC}"
    echo ""
    
    echo -e "${YELLOW}1. CREATE RENDER ACCOUNT:${NC}"
    echo "   • Go to: https://render.com"
    echo "   • Sign up with GitHub (no credit card needed!)"
    echo ""
    
    echo -e "${YELLOW}2. DEPLOY BACKEND:${NC}"
    echo "   • Click 'New' → 'Web Service'"
    echo "   • Connect your GitHub repository"
    echo "   • Settings:"
    echo "     - Name: quizmaster-backend"
    echo "     - Build Command: cd backend && npm install && npm run build"
    echo "     - Start Command: cd backend && npm start"
    echo "     - Environment: Node"
    echo "   • Add Environment Variables:"
    echo "     - NODE_ENV=production"
    echo "     - JWT_SECRET=$JWT_SECRET"
    echo "     - JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
    echo "     - GOOGLE_API_KEY=your-google-api-key"
    echo "     - CORS_ORIGIN=https://your-frontend.onrender.com"
    echo ""
    
    echo -e "${YELLOW}3. ADD POSTGRESQL DATABASE:${NC}"
    echo "   • Click 'New' → 'PostgreSQL'"
    echo "   • Name: quizmaster-db"
    echo "   • Copy the 'External Database URL'"
    echo "   • Add to backend environment variables:"
    echo "     - DATABASE_URL=<your-postgres-url>"
    echo ""
    
    echo -e "${YELLOW}4. ADD REDIS CACHE:${NC}"
    echo "   • Click 'New' → 'Redis'"
    echo "   • Name: quizmaster-redis"
    echo "   • Copy the 'Redis URL'"
    echo "   • Add to backend environment variables:"
    echo "     - REDIS_URL=<your-redis-url>"
    echo ""
    
    echo -e "${YELLOW}5. DEPLOY FRONTEND:${NC}"
    echo "   • Click 'New' → 'Static Site'"
    echo "   • Connect same GitHub repository"
    echo "   • Settings:"
    echo "     - Name: quizmaster-frontend"
    echo "     - Build Command: cd frontend && npm install && npm run build"
    echo "     - Publish Directory: frontend/out"
    echo "   • Add Environment Variables:"
    echo "     - NEXT_PUBLIC_API_URL=https://quizmaster-backend.onrender.com"
    echo "     - NEXT_PUBLIC_WEBSOCKET_URL=wss://quizmaster-backend.onrender.com"
    echo ""
    
    echo -e "${YELLOW}6. UPDATE CORS:${NC}"
    echo "   • After frontend deployment, update backend CORS_ORIGIN"
    echo "   • Set it to your frontend URL"
    echo ""
    
    echo -e "${GREEN}🎯 Expected URLs:${NC}"
    echo "   Frontend: https://quizmaster-frontend.onrender.com"
    echo "   Backend: https://quizmaster-backend.onrender.com"
    echo ""
    
    echo -e "${BLUE}💡 Render Benefits:${NC}"
    echo "   • 750 hours/month free (24/7 hosting)"
    echo "   • Auto-deploy from GitHub"
    echo "   • Free PostgreSQL (500MB)"
    echo "   • Free Redis (25MB)"
    echo "   • HTTPS certificates included"
    echo "   • No credit card required"
    echo ""
}

# Show alternative options
show_alternatives() {
    echo -e "${BLUE}🔄 Alternative Options:${NC}"
    echo ""
    
    echo -e "${YELLOW}Option A: Fly.io (Docker-based)${NC}"
    echo "   • 2GB free storage + 160GB bandwidth"
    echo "   • Deploy with: flyctl deploy"
    echo "   • Install: curl -L https://fly.io/install.sh | sh"
    echo ""
    
    echo -e "${YELLOW}Option B: Vercel + Supabase${NC}"
    echo "   • Frontend: Vercel (unlimited free sites)"
    echo "   • Backend: Vercel serverless functions"
    echo "   • Database: Supabase (500MB free)"
    echo ""
    
    echo -e "${YELLOW}Option C: Netlify + PlanetScale${NC}"
    echo "   • Frontend: Netlify (100GB bandwidth)"
    echo "   • Backend: Netlify functions"
    echo "   • Database: PlanetScale (1GB free)"
    echo ""
}

# Main execution
main() {
    generate_secrets
    commit_changes
    show_render_instructions
    show_alternatives
}

# Run main function
main

echo -e "${GREEN}🚀 Ready for FREE deployment on Render!${NC}"
