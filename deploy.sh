#!/bin/bash

echo "🚀 Starting deployment to Digital Ocean..."

# Kiểm tra xem đã ở trong thư mục project chưa
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Make sure you're in the project directory."
    exit 1
fi

# Commit và push code mới nhất
echo "📝 Committing and pushing latest changes..."
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main

# SSH vào server và deploy
echo "🔄 Deploying to server..."
ssh root@159.223.49.204 << 'EOF'
    cd /var/www/botketoanviet03
    
    echo "📥 Pulling latest code..."
    git pull origin main
    
    echo "📦 Installing dependencies..."
    npm install
    
    echo "📁 Creating logs directory..."
    mkdir -p logs
    
    echo "🔄 Restarting application with PM2..."
    pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
    
    echo "📊 PM2 status:"
    pm2 status
    
    echo "✅ Deployment completed!"
EOF

echo "🎉 Deployment finished! Check your bot at http://159.223.49.204:3000" 