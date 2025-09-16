#!/bin/bash

echo "🚀 QuizMaster-Pro Deployment Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if required tools are installed
check_tools() {
    echo -e "${BLUE}Checking required tools...${NC}"
    
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git is not installed${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All required tools are installed${NC}"
}

# Generate secure JWT secrets
generate_secrets() {
    echo -e "${BLUE}Generating secure JWT secrets...${NC}"
    
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    echo -e "${GREEN}✅ JWT secrets generated${NC}"
    echo -e "${YELLOW}Save these secrets for your environment variables:${NC}"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
    echo ""
}

# Check if project is ready for deployment
check_project() {
    echo -e "${BLUE}Checking project structure...${NC}"
    
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ package.json not found in root${NC}"
        exit 1
    fi
    
    if [ ! -d "backend" ]; then
        echo -e "${RED}❌ backend directory not found${NC}"
        exit 1
    fi
    
    if [ ! -d "frontend" ]; then
        echo -e "${RED}❌ frontend directory not found${NC}"
        exit 1
    fi
    
    if [ ! -f "backend/Dockerfile.prod" ]; then
        echo -e "${RED}❌ Production Dockerfile not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Project structure is valid${NC}"
}

# Initialize git repository if needed
init_git() {
    if [ ! -d ".git" ]; then
        echo -e "${BLUE}Initializing Git repository...${NC}"
        git init
        git add .
        git commit -m "Initial commit: QuizMaster-Pro application"
        echo -e "${GREEN}✅ Git repository initialized${NC}"
    else
        echo -e "${YELLOW}📝 Git repository already exists${NC}"
        
        # Check if there are uncommitted changes
        if ! git diff-index --quiet HEAD --; then
            echo -e "${YELLOW}⚠️  You have uncommitted changes. Committing them...${NC}"
            git add .
            git commit -m "Pre-deployment commit: $(date)"
        fi
    fi
}

# Display deployment instructions
show_instructions() {
    echo -e "${GREEN}"
    echo "🎉 DEPLOYMENT SETUP COMPLETE!"
    echo "============================="
    echo -e "${NC}"
    
    echo -e "${BLUE}📋 Next Steps:${NC}"
    echo ""
    
    echo -e "${YELLOW}1. DEPLOY BACKEND (Railway):${NC}"
    echo "   • Go to: https://railway.app"
    echo "   • Sign up/Login with GitHub"
    echo "   • Click 'New Project' → 'Deploy from GitHub repo'"
    echo "   • Select your QuizMaster-Pro repository"
    echo "   • Railway will auto-detect the railway.toml config"
    echo "   • Add PostgreSQL plugin: Add → Database → PostgreSQL"
    echo "   • Add Redis plugin: Add → Database → Redis"
    echo ""
    
    echo -e "${YELLOW}2. SET ENVIRONMENT VARIABLES (Railway):${NC}"
    echo "   • Go to your project → Variables"
    echo "   • Add these variables:"
    echo "     - NODE_ENV=production"
    echo "     - PORT=3001"
    echo "     - JWT_SECRET=$JWT_SECRET"
    echo "     - JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
    echo "     - GOOGLE_API_KEY=your-google-api-key"
    echo "     - CORS_ORIGIN=https://your-app.vercel.app"
    echo "   • DATABASE_URL and REDIS_URL will be auto-set by plugins"
    echo ""
    
    echo -e "${YELLOW}3. DEPLOY FRONTEND (Vercel):${NC}"
    echo "   • Go to: https://vercel.com"
    echo "   • Sign up/Login with GitHub"
    echo "   • Click 'New Project'"
    echo "   • Select your QuizMaster-Pro repository"
    echo "   • Set Root Directory to: frontend"
    echo "   • Add environment variables:"
    echo "     - NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app"
    echo "     - NEXT_PUBLIC_WEBSOCKET_URL=wss://your-railway-app.railway.app"
    echo ""
    
    echo -e "${YELLOW}4. UPDATE CORS (Railway):${NC}"
    echo "   • After Vercel deployment, update CORS_ORIGIN variable"
    echo "   • Set it to your Vercel URL: https://your-app.vercel.app"
    echo ""
    
    echo -e "${GREEN}🎯 Your app will be live at:${NC}"
    echo "   Frontend: https://your-app.vercel.app"
    echo "   Backend API: https://your-railway-app.railway.app"
    echo ""
    
    echo -e "${BLUE}💡 Tips:${NC}"
    echo "   • Both platforms offer automatic deployments from GitHub"
    echo "   • Check deployment logs if something fails"
    echo "   • Railway gives you $5 credit monthly (enough for small apps)"
    echo "   • Vercel has generous free tier for frontend hosting"
    echo ""
}

# Main execution
main() {
    check_tools
    generate_secrets
    check_project
    init_git
    show_instructions
}

# Run main function
main

echo -e "${GREEN}🚀 Ready for deployment!${NC}"
