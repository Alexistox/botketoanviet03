#!/bin/bash

echo "🔄 Updating server with latest code..."

# SSH vào server và thực hiện update
ssh root@159.223.49.204 << 'EOF'
    echo "📍 Current location:"
    pwd
    
    echo "📥 Navigating to project directory..."
    cd /var/www/botketoanviet03
    
    echo "📥 Pulling latest code from GitHub..."
    git pull origin main
    
    echo "📦 Installing any new dependencies..."
    npm install
    
    echo "🔄 Restarting bot with PM2..."
    pm2 restart botketoanviet03 || pm2 start ecosystem.config.js --env production
    
    echo "📊 Checking PM2 status..."
    pm2 status
    
    echo "📋 Showing recent logs..."
    pm2 logs botketoanviet03 --lines 20
    
    echo "✅ Update completed!"
EOF

echo "🎉 Server update finished!" 