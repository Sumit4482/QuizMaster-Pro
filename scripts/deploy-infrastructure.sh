#!/bin/bash

# QuizMaster Pro - Infrastructure Deployment Script
# This script deploys the complete microservices infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="quizmaster"
DEPLOYMENT_MODE=${1:-"docker"} # docker, k8s, or dev

echo -e "${BLUE}🚀 QuizMaster Pro Infrastructure Deployment${NC}"
echo -e "${BLUE}Deployment Mode: ${DEPLOYMENT_MODE}${NC}"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local health_endpoint=$2
    local max_attempts=30
    local attempt=1

    echo -e "${YELLOW}Waiting for ${service_name} to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$health_endpoint" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ ${service_name} is ready!${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}Attempt ${attempt}/${max_attempts} - ${service_name} not ready yet...${NC}"
        sleep 10
        ((attempt++))
    done
    
    echo -e "${RED}❌ ${service_name} failed to start within timeout${NC}"
    return 1
}

# Function to deploy with Docker Compose
deploy_docker() {
    echo -e "${BLUE}🐳 Deploying with Docker Compose...${NC}"
    
    # Check if Docker and Docker Compose are installed
    if ! command_exists docker; then
        echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
        exit 1
    fi
    
    # Create necessary directories
    echo -e "${YELLOW}📁 Creating necessary directories...${NC}"
    mkdir -p logs/{nginx,api-gateway,user-service,question-service,game-service,ai-service,analytics-service,notification-service,file-service}
    mkdir -p certs
    mkdir -p config/{nginx/conf.d,postgresql/{primary,replica},prometheus,grafana/provisioning}
    
    # Generate self-signed certificates if not exists
    if [ ! -f "certs/quizmaster.dev.crt" ]; then
        echo -e "${YELLOW}🔒 Generating self-signed SSL certificates...${NC}"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout certs/quizmaster.dev.key \
            -out certs/quizmaster.dev.crt \
            -subj "/C=US/ST=State/L=City/O=QuizMaster/CN=quizmaster.dev"
        
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout certs/api.quizmaster.dev.key \
            -out certs/api.quizmaster.dev.crt \
            -subj "/C=US/ST=State/L=City/O=QuizMaster/CN=api.quizmaster.dev"
    fi
    
    # Create environment file if not exists
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}📝 Creating environment file...${NC}"
        cat > .env << EOF
# Database Configuration
DATABASE_NAME=quizmaster
DATABASE_USER=quizmaster
DATABASE_PASSWORD=quizmaster123
REPLICATION_USER=replicator
REPLICATION_PASSWORD=replicator123

# Redis Configuration
REDIS_PASSWORD=redis123

# Application Configuration
NODE_ENV=production
JWT_SECRET=your_super_secret_jwt_key_that_should_be_at_least_32_characters_long
CORS_ORIGINS=http://localhost:3000,https://quizmaster.dev

# AI Configuration (Replace with your actual API keys)
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# External Services (Replace with your actual API keys)
EMAIL_SERVICE_API_KEY=your_email_api_key_here
SMS_SERVICE_API_KEY=your_sms_api_key_here
PUSH_SERVICE_API_KEY=your_push_api_key_here

# CDN Configuration
CDN_BASE_URL=http://localhost:3007

# Monitoring Configuration
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
EOF
        echo -e "${GREEN}✅ Environment file created. Please update with your actual API keys.${NC}"
    fi
    
    # Stop existing services
    echo -e "${YELLOW}🛑 Stopping existing services...${NC}"
    docker-compose -f docker-compose.infrastructure.yml down
    
    # Pull latest images
    echo -e "${YELLOW}📥 Pulling latest images...${NC}"
    docker-compose -f docker-compose.infrastructure.yml pull
    
    # Start infrastructure services
    echo -e "${YELLOW}🏗️ Starting infrastructure services...${NC}"
    docker-compose -f docker-compose.infrastructure.yml up -d redis postgres-primary postgres-replica
    
    # Wait for database to be ready
    wait_for_service "PostgreSQL Primary" "http://localhost:5432"
    wait_for_service "Redis" "http://localhost:6379"
    
    # Start application services
    echo -e "${YELLOW}🚀 Starting application services...${NC}"
    docker-compose -f docker-compose.infrastructure.yml up -d
    
    # Wait for services to be ready
    sleep 30
    wait_for_service "API Gateway" "http://localhost:3000/health"
    wait_for_service "User Service" "http://localhost:3001/health"
    wait_for_service "Question Service" "http://localhost:3002/health"
    wait_for_service "Game Service" "http://localhost:3003/health"
    wait_for_service "AI Service" "http://localhost:3004/health"
    wait_for_service "Analytics Service" "http://localhost:3005/health"
    wait_for_service "Notification Service" "http://localhost:3006/health"
    wait_for_service "File Service" "http://localhost:3007/health"
    
    echo -e "${GREEN}🎉 Docker deployment completed successfully!${NC}"
    echo -e "${GREEN}📋 Service URLs:${NC}"
    echo -e "  🌐 Main Application: http://localhost (redirects to HTTPS)"
    echo -e "  🔗 API Gateway: http://localhost:3000"
    echo -e "  👥 User Service: http://localhost:3001"
    echo -e "  ❓ Question Service: http://localhost:3002"
    echo -e "  🎮 Game Service: http://localhost:3003"
    echo -e "  🤖 AI Service: http://localhost:3004"
    echo -e "  📊 Analytics Service: http://localhost:3005"
    echo -e "  📱 Notification Service: http://localhost:3006"
    echo -e "  📁 File Service: http://localhost:3007"
    echo -e "  📈 Prometheus: http://localhost:9090"
    echo -e "  📊 Grafana: http://localhost:3030 (admin/admin)"
    echo -e "  🔍 Kibana: http://localhost:5601"
}

# Function to deploy with Kubernetes
deploy_k8s() {
    echo -e "${BLUE}☸️ Deploying with Kubernetes...${NC}"
    
    # Check if kubectl is installed
    if ! command_exists kubectl; then
        echo -e "${RED}❌ kubectl is not installed. Please install kubectl first.${NC}"
        exit 1
    fi
    
    # Check if cluster is accessible
    if ! kubectl cluster-info > /dev/null 2>&1; then
        echo -e "${RED}❌ Cannot connect to Kubernetes cluster. Please check your kubeconfig.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}📝 Creating namespace...${NC}"
    kubectl apply -f k8s/secrets.yaml
    
    echo -e "${YELLOW}🔐 Applying secrets...${NC}"
    kubectl apply -f k8s/secrets.yaml
    
    echo -e "${YELLOW}🚀 Deploying microservices...${NC}"
    kubectl apply -f k8s/quizmaster-microservices.yaml
    
    echo -e "${YELLOW}⏳ Waiting for deployments to be ready...${NC}"
    kubectl wait --for=condition=available --timeout=600s deployment --all -n $NAMESPACE
    
    echo -e "${GREEN}🎉 Kubernetes deployment completed successfully!${NC}"
    
    # Get service information
    echo -e "${GREEN}📋 Service Information:${NC}"
    kubectl get services -n $NAMESPACE
    
    # Get ingress information
    echo -e "${GREEN}🌐 Ingress Information:${NC}"
    kubectl get ingress -n $NAMESPACE
}

# Function to deploy development environment
deploy_dev() {
    echo -e "${BLUE}🛠️ Setting up development environment...${NC}"
    
    # Install dependencies
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    cd backend && npm install && cd ..
    
    # Start Redis and PostgreSQL only
    echo -e "${YELLOW}🗄️ Starting development databases...${NC}"
    docker-compose -f docker-compose.infrastructure.yml up -d redis postgres-primary
    
    # Wait for databases
    wait_for_service "Redis" "redis://localhost:6379"
    wait_for_service "PostgreSQL" "postgresql://localhost:5432"
    
    # Run database migrations
    echo -e "${YELLOW}🔄 Running database migrations...${NC}"
    cd backend && npx prisma migrate deploy && cd ..
    
    echo -e "${GREEN}🎉 Development environment ready!${NC}"
    echo -e "${GREEN}💡 To start services in development mode:${NC}"
    echo -e "  cd backend && npm run dev"
}

# Function to check deployment status
check_status() {
    echo -e "${BLUE}🔍 Checking deployment status...${NC}"
    
    if [ "$DEPLOYMENT_MODE" = "k8s" ]; then
        kubectl get pods -n $NAMESPACE
        kubectl get services -n $NAMESPACE
    else
        docker-compose -f docker-compose.infrastructure.yml ps
    fi
}

# Function to show logs
show_logs() {
    local service=${1:-"all"}
    
    if [ "$DEPLOYMENT_MODE" = "k8s" ]; then
        if [ "$service" = "all" ]; then
            kubectl logs -f -l app=quizmaster -n $NAMESPACE --max-log-requests=10
        else
            kubectl logs -f deployment/$service -n $NAMESPACE
        fi
    else
        if [ "$service" = "all" ]; then
            docker-compose -f docker-compose.infrastructure.yml logs -f
        else
            docker-compose -f docker-compose.infrastructure.yml logs -f $service
        fi
    fi
}

# Function to cleanup deployment
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up deployment...${NC}"
    
    if [ "$DEPLOYMENT_MODE" = "k8s" ]; then
        kubectl delete -f k8s/quizmaster-microservices.yaml
        kubectl delete -f k8s/secrets.yaml
    else
        docker-compose -f docker-compose.infrastructure.yml down -v
        docker system prune -f
    fi
    
    echo -e "${GREEN}✅ Cleanup completed!${NC}"
}

# Main deployment logic
case "$DEPLOYMENT_MODE" in
    "docker")
        deploy_docker
        ;;
    "k8s")
        deploy_k8s
        ;;
    "dev")
        deploy_dev
        ;;
    "status")
        check_status
        ;;
    "logs")
        show_logs $2
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo -e "${RED}❌ Invalid deployment mode: $DEPLOYMENT_MODE${NC}"
        echo -e "${YELLOW}Usage: $0 [docker|k8s|dev|status|logs|cleanup] [service_name]${NC}"
        echo -e "${YELLOW}Examples:${NC}"
        echo -e "  $0 docker          # Deploy with Docker Compose"
        echo -e "  $0 k8s             # Deploy with Kubernetes"
        echo -e "  $0 dev             # Setup development environment"
        echo -e "  $0 status          # Check deployment status"
        echo -e "  $0 logs            # Show all logs"
        echo -e "  $0 logs api-gateway # Show specific service logs"
        echo -e "  $0 cleanup         # Clean up deployment"
        exit 1
        ;;
esac

echo -e "${GREEN}🏁 Deployment script completed!${NC}"

