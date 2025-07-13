require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

// Import controllers và utils
const { handleMessage } = require('./controllers/messageController');
const { handleInlineButtonCallback } = require('./controllers/userCommands');
const { connectDB } = require('./config/db');
const Group = require('./models/Group');
const Transaction = require('./models/Transaction');

// Khởi tạo cache
const cache = new NodeCache({ stdTTL: 21600 }); // Cache in 6 hours

// Khởi tạo ứng dụng Express
const app = express();
app.use(express.json());

// Kết nối MongoDB
connectDB();

// Khởi tạo Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const messages = require('./src/messages/vi');

// Xử lý tin nhắn
bot.on('message', async (msg) => {
  try {
    await handleMessage(bot, msg, cache);
  } catch (error) {
    console.error('Error handling message:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingMessage);
  }
});

// Xử lý callback query từ inline keyboard
bot.on('callback_query', async (callbackQuery) => {
  try {
    await handleInlineButtonCallback(bot, callbackQuery);
  } catch (error) {
    console.error('Error handling callback query:', error);
  }
});

// Webhook for Telegram
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// API endpoint để lấy thông tin groups
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Group.find({});
    
    const groupsWithInfo = await Promise.all(
      groups.map(async (group) => {
        let groupTitle = "Nhóm không xác định";
        let memberCount = 0;
        try {
          const chatInfo = await bot.getChat(group.chatId);
          groupTitle = chatInfo.title || `Chat ID: ${group.chatId}`;
        } catch (error) {
          groupTitle = `Nhóm không xác định (ID: ${group.chatId})`;
        }
        
        try {
          memberCount = await bot.getChatMemberCount(group.chatId);
        } catch (error) {
          memberCount = 0; // Không lấy được số lượng thành viên
        }
        
        // Đếm số lượng giao dịch trong nhóm
        const transactionCount = await Transaction.countDocuments({ 
          chatId: group.chatId,
          skipped: { $ne: true }
        });
        
        return {
          chatId: group.chatId,
          title: groupTitle,
          totalVND: group.totalVND || 0,
          totalUSDT: group.totalUSDT || 0,
          usdtPaid: group.usdtPaid || 0,
          remainingUSDT: group.remainingUSDT || 0,
          rate: group.rate || 0,
          exchangeRate: group.exchangeRate || 0,
          currency: group.currency || 'USDT',
          lastClearDate: group.lastClearDate,
          transactionCount,
          memberCount,
          operators: group.operators || [],
          createdAt: group.createdAt,
          updatedAt: group.updatedAt
        };
      })
    );
    
    res.json({
      success: true,
      totalGroups: groups.length,
      groups: groupsWithInfo
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin nhóm'
    });
  }
});

// API endpoint để lấy thành viên của một nhóm
app.get('/api/groups/:chatId/members', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Lấy thông tin nhóm
    const group = await Group.findOne({ chatId });
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm'
      });
    }
    
    let groupTitle = "Nhóm không xác định";
    let members = [];
    
    try {
      const chatInfo = await bot.getChat(chatId);
      groupTitle = chatInfo.title || `Chat ID: ${chatId}`;
      
      // Lấy danh sách administrators
      const administrators = await bot.getChatAdministrators(chatId);
      members = administrators.map(admin => ({
        id: admin.user.id,
        username: admin.user.username || 'Không có username',
        firstName: admin.user.first_name || '',
        lastName: admin.user.last_name || '',
        status: admin.status,
        isBot: admin.user.is_bot || false
      }));
      
    } catch (error) {
      console.error('Error fetching members:', error);
      members = [];
    }
    
    res.json({
      success: true,
      chatId,
      groupTitle,
      totalMembers: members.length,
      members,
      operators: group.operators || []
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin thành viên'
    });
  }
});

// API endpoint để lấy giao dịch chi tiết của một nhóm
app.get('/api/groups/:chatId/transactions', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    
    // Lấy thông tin nhóm
    const group = await Group.findOne({ chatId });
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm'
      });
    }
    
    let groupTitle = "Nhóm không xác định";
    try {
      const chatInfo = await bot.getChat(chatId);
      groupTitle = chatInfo.title || `Chat ID: ${chatId}`;
    } catch (error) {
      groupTitle = `Nhóm không xác định (ID: ${chatId})`;
    }
    
    // Tạo filter query
    const filter = { 
      chatId,
      skipped: { $ne: true }
    };
    
    // Lọc theo ngày nếu có
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    
    // Lấy giao dịch với phân trang
    const transactions = await Transaction.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    // Đếm tổng số giao dịch
    const totalTransactions = await Transaction.countDocuments(filter);
    
    // Nhóm giao dịch theo ngày
    const transactionsByDate = {};
    transactions.forEach(transaction => {
      const date = transaction.timestamp.toISOString().split('T')[0];
      if (!transactionsByDate[date]) {
        transactionsByDate[date] = [];
      }
      transactionsByDate[date].push({
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount || 0,
        message: transaction.message,
        senderName: transaction.senderName,
        rate: transaction.rate,
        exchangeRate: transaction.exchangeRate,
        timestamp: transaction.timestamp,
        createdAt: transaction.createdAt
      });
    });
    
    // Lấy thông tin về các lần Start (clear)
    const startTransactions = await Transaction.find({ 
      chatId, 
      type: 'clear' 
    }).sort({ timestamp: -1 });
    
    res.json({
      success: true,
      chatId,
      groupTitle,
      totalTransactions,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalTransactions / limit),
      transactionsByDate,
      startHistory: startTransactions.map(t => ({
        date: t.timestamp.toISOString().split('T')[0],
        time: t.timestamp.toISOString(),
        senderName: t.senderName
      }))
    });
  } catch (error) {
    console.error('Error fetching group transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin giao dịch'
    });
  }
});

// Route trang chủ
app.get('/', (req, res) => {
  res.send('Bot is running');
});

// Route hiển thị trang groups
app.get('/groups', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Danh sách nhóm Bot</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            
            .header h1 {
                font-size: 2.5em;
                margin-bottom: 10px;
                font-weight: 700;
            }
            
            .header p {
                font-size: 1.2em;
                opacity: 0.9;
            }
            
            .stats {
                display: flex;
                justify-content: space-around;
                padding: 20px;
                background: #f8f9fa;
                border-bottom: 1px solid #e9ecef;
            }
            
            .stat-item {
                text-align: center;
                padding: 15px;
            }
            
            .stat-number {
                font-size: 2em;
                font-weight: bold;
                color: #667eea;
                display: block;
            }
            
            .stat-label {
                color: #6c757d;
                font-size: 0.9em;
                margin-top: 5px;
            }
            
            .loading {
                text-align: center;
                padding: 50px;
                color: #667eea;
                font-size: 1.2em;
            }
            
            .groups-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: 20px;
                padding: 30px;
            }
            
            .group-card {
                background: white;
                border-radius: 15px;
                padding: 25px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.08);
                border: 1px solid #e9ecef;
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }
            
            .group-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            }
            
            .group-title {
                font-size: 1.3em;
                font-weight: 600;
                color: #2d3748;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
            }
            
            .group-title::before {
                content: "👥";
                margin-right: 10px;
            }
            
            .group-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .info-item {
                background: #f8f9fa;
                padding: 12px;
                border-radius: 8px;
                text-align: center;
                cursor: pointer;
                transition: background-color 0.3s ease, transform 0.2s ease;
            }
            
            .info-item:hover {
                background: #e9ecef;
                transform: translateY(-2px);
            }
            
            .info-item.clickable {
                background: #e3f2fd;
                border: 2px solid #1976d2;
            }
            
            .info-item.clickable:hover {
                background: #bbdefb;
            }
            
            .info-label {
                font-size: 0.8em;
                color: #6c757d;
                margin-bottom: 5px;
            }
            
            .info-value {
                font-weight: 600;
                color: #2d3748;
                font-size: 1.1em;
            }
            
            .financial-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .financial-item {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px;
                border-radius: 8px;
                text-align: center;
            }
            
            .financial-label {
                font-size: 0.8em;
                opacity: 0.8;
                margin-bottom: 5px;
            }
            
            .financial-value {
                font-weight: 600;
                font-size: 1.1em;
            }
            
            .operators {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #e9ecef;
            }
            
            .operators-title {
                font-size: 0.9em;
                color: #6c757d;
                margin-bottom: 10px;
            }
            
            .operator-tag {
                display: inline-block;
                background: #e3f2fd;
                color: #1976d2;
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 0.8em;
                margin-right: 8px;
                margin-bottom: 5px;
            }
            
            .last-clear {
                text-align: center;
                padding: 10px;
                background: #fff3cd;
                border-radius: 8px;
                font-size: 0.9em;
                color: #856404;
                margin-top: 15px;
            }
            
            .refresh-btn {
                position: fixed;
                bottom: 30px;
                right: 30px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 50px;
                padding: 15px 25px;
                font-size: 1em;
                cursor: pointer;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
            }
            
            .refresh-btn:hover {
                background: #5a67d8;
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.3);
            }
            
            .error {
                text-align: center;
                padding: 50px;
                color: #dc3545;
                font-size: 1.2em;
            }
            
            /* Modal styles */
            .modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.5);
                backdrop-filter: blur(5px);
            }
            
            .modal-content {
                background-color: white;
                margin: 5% auto;
                padding: 0;
                border-radius: 15px;
                width: 90%;
                max-width: 800px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            }
            
            .modal-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 15px 15px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .modal-title {
                font-size: 1.5em;
                font-weight: 600;
            }
            
            .close {
                color: white;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                transition: opacity 0.3s ease;
            }
            
            .close:hover {
                opacity: 0.7;
            }
            
            .modal-body {
                padding: 20px;
            }
            
            .member-item {
                display: flex;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid #e9ecef;
                transition: background-color 0.3s ease;
            }
            
            .member-item:hover {
                background-color: #f8f9fa;
            }
            
            .member-item:last-child {
                border-bottom: none;
            }
            
            .member-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                margin-right: 15px;
            }
            
            .member-info {
                flex: 1;
            }
            
            .member-name {
                font-weight: 600;
                color: #2d3748;
                margin-bottom: 5px;
            }
            
            .member-username {
                color: #6c757d;
                font-size: 0.9em;
            }
            
            .member-status {
                padding: 3px 8px;
                border-radius: 12px;
                font-size: 0.8em;
                font-weight: 500;
            }
            
            .status-creator {
                background: #d4edda;
                color: #155724;
            }
            
            .status-administrator {
                background: #cce5ff;
                color: #0056b3;
            }
            
            .transaction-day {
                margin-bottom: 30px;
                border: 1px solid #e9ecef;
                border-radius: 10px;
                overflow: hidden;
            }
            
            .transaction-day-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 15px;
                font-weight: 600;
            }
            
            .transaction-item {
                padding: 15px;
                border-bottom: 1px solid #e9ecef;
                transition: background-color 0.3s ease;
            }
            
            .transaction-item:hover {
                background-color: #f8f9fa;
            }
            
            .transaction-item:last-child {
                border-bottom: none;
            }
            
            .transaction-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .transaction-type {
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 0.8em;
                font-weight: 500;
            }
            
            .type-plus {
                background: #d4edda;
                color: #155724;
            }
            
            .type-minus {
                background: #f8d7da;
                color: #721c24;
            }
            
            .type-percent {
                background: #fff3cd;
                color: #856404;
            }
            
            .type-clear {
                background: #cce5ff;
                color: #0056b3;
            }
            
            .transaction-amount {
                font-weight: 600;
                font-size: 1.1em;
            }
            
            .transaction-details {
                color: #6c757d;
                font-size: 0.9em;
                margin-top: 5px;
            }
            
            .pagination {
                display: flex;
                justify-content: center;
                align-items: center;
                margin-top: 20px;
                gap: 10px;
            }
            
            .pagination button {
                padding: 8px 16px;
                border: 1px solid #ddd;
                background: white;
                cursor: pointer;
                border-radius: 5px;
                transition: all 0.3s ease;
            }
            
            .pagination button:hover {
                background: #f8f9fa;
            }
            
            .pagination button.active {
                background: #667eea;
                color: white;
                border-color: #667eea;
            }
            
            .pagination button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            @media (max-width: 768px) {
                .groups-grid {
                    grid-template-columns: 1fr;
                    padding: 20px;
                }
                
                .group-info {
                    grid-template-columns: 1fr;
                }
                
                .financial-info {
                    grid-template-columns: 1fr;
                }
                
                .stats {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .modal-content {
                    width: 95%;
                    margin: 10% auto;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Danh sách nhóm Bot</h1>
                <p>Thống kê tổng quan các nhóm mà bot đang tham gia</p>
            </div>
            
            <div class="stats">
                <div class="stat-item">
                    <span class="stat-number" id="totalGroups">-</span>
                    <div class="stat-label">Tổng số nhóm</div>
                </div>
                <div class="stat-item">
                    <span class="stat-number" id="totalTransactions">-</span>
                    <div class="stat-label">Tổng giao dịch</div>
                </div>
                <div class="stat-item">
                    <span class="stat-number" id="totalMembers">-</span>
                    <div class="stat-label">Tổng thành viên</div>
                </div>
            </div>
            
            <div id="content">
                <div class="loading">
                    <div>⏳ Đang tải dữ liệu...</div>
                </div>
            </div>
        </div>
        
        <!-- Modal for Members -->
        <div id="membersModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <span class="modal-title">👥 Thành viên nhóm</span>
                    <span class="close" onclick="closeMembersModal()">&times;</span>
                </div>
                <div class="modal-body" id="membersModalBody">
                    <div class="loading">⏳ Đang tải...</div>
                </div>
            </div>
        </div>
        
        <!-- Modal for Transactions -->
        <div id="transactionsModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <span class="modal-title">💰 Giao dịch chi tiết</span>
                    <span class="close" onclick="closeTransactionsModal()">&times;</span>
                </div>
                <div class="modal-body" id="transactionsModalBody">
                    <div class="loading">⏳ Đang tải...</div>
                </div>
            </div>
        </div>
        
        <button class="refresh-btn" onclick="loadGroups()">🔄 Làm mới</button>
        
        <script>
            let currentTransactionPage = 1;
            let currentChatId = null;
            
            function formatNumber(num) {
                if (num === 0) return '0';
                return new Intl.NumberFormat('vi-VN').format(num);
            }
            
            function formatDate(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleString('vi-VN');
            }
            
            function formatVietnameseDate(dateString) {
                const date = new Date(dateString);
                const options = { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    timeZone: 'Asia/Ho_Chi_Minh'
                };
                return date.toLocaleDateString('vi-VN', options);
            }
            
            async function loadGroups() {
                try {
                    const response = await fetch('/api/groups');
                    const data = await response.json();
                    
                    if (data.success) {
                        displayGroups(data.groups);
                        updateStats(data.groups);
                    } else {
                        document.getElementById('content').innerHTML = 
                            '<div class="error">❌ Không thể tải dữ liệu nhóm</div>';
                    }
                } catch (error) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function updateStats(groups) {
                const totalGroups = groups.length;
                const totalTransactions = groups.reduce((sum, group) => sum + group.transactionCount, 0);
                const totalMembers = groups.reduce((sum, group) => sum + group.memberCount, 0);
                
                document.getElementById('totalGroups').textContent = formatNumber(totalGroups);
                document.getElementById('totalTransactions').textContent = formatNumber(totalTransactions);
                document.getElementById('totalMembers').textContent = formatNumber(totalMembers);
            }
            
            function displayGroups(groups) {
                if (groups.length === 0) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">📭 Không tìm thấy nhóm nào</div>';
                    return;
                }
                
                const groupsHTML = groups.map(group => \`
                    <div class="group-card">
                        <div class="group-title">\${group.title}</div>
                        
                        <div class="group-info">
                            <div class="info-item">
                                <div class="info-label">Chat ID</div>
                                <div class="info-value">\${group.chatId}</div>
                            </div>
                            <div class="info-item clickable" onclick="showMembers('\${group.chatId}')">
                                <div class="info-label">Thành viên</div>
                                <div class="info-value">\${formatNumber(group.memberCount)}</div>
                            </div>
                            <div class="info-item clickable" onclick="showTransactions('\${group.chatId}')">
                                <div class="info-label">Giao dịch</div>
                                <div class="info-value">\${formatNumber(group.transactionCount)}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">Loại tiền</div>
                                <div class="info-value">\${group.currency}</div>
                            </div>
                        </div>
                        
                        <div class="financial-info">
                            <div class="financial-item">
                                <div class="financial-label">Phí (%)</div>
                                <div class="financial-value">\${group.rate}%</div>
                            </div>
                            <div class="financial-item">
                                <div class="financial-label">Tỷ giá</div>
                                <div class="financial-value">\${formatNumber(group.exchangeRate)}</div>
                            </div>
                            <div class="financial-item">
                                <div class="financial-label">Tổng VND</div>
                                <div class="financial-value">\${formatNumber(group.totalVND)}</div>
                            </div>
                            <div class="financial-item">
                                <div class="financial-label">Tổng USDT</div>
                                <div class="financial-value">\${formatNumber(group.totalUSDT)}</div>
                            </div>
                        </div>
                        
                        \${group.operators && group.operators.length > 0 ? \`
                            <div class="operators">
                                <div class="operators-title">👨‍💼 Operators (\${group.operators.length})</div>
                                \${group.operators.map(op => \`
                                    <span class="operator-tag">\${op.username || 'Unknown'}</span>
                                \`).join('')}
                            </div>
                        \` : ''}
                        
                        <div class="last-clear">
                            🧹 Làm sạch lần cuối: \${formatDate(group.lastClearDate)}
                        </div>
                    </div>
                \`).join('');
                
                document.getElementById('content').innerHTML = 
                    '<div class="groups-grid">' + groupsHTML + '</div>';
            }
            
            async function showMembers(chatId) {
                currentChatId = chatId;
                document.getElementById('membersModal').style.display = 'block';
                document.getElementById('membersModalBody').innerHTML = '<div class="loading">⏳ Đang tải...</div>';
                
                try {
                    const response = await fetch(\`/api/groups/\${chatId}/members\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayMembers(data);
                    } else {
                        document.getElementById('membersModalBody').innerHTML = 
                            '<div class="error">❌ Không thể tải thông tin thành viên</div>';
                    }
                } catch (error) {
                    document.getElementById('membersModalBody').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function displayMembers(data) {
                const membersHTML = \`
                    <div style="margin-bottom: 20px;">
                        <h3>📊 Thống kê</h3>
                        <p><strong>Nhóm:</strong> \${data.groupTitle}</p>
                        <p><strong>Tổng thành viên:</strong> \${formatNumber(data.totalMembers)}</p>
                        <p><strong>Operators:</strong> \${data.operators.length}</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h3>👑 Quản trị viên</h3>
                        \${data.members.map(member => \`
                            <div class="member-item">
                                <div class="member-avatar">
                                    \${member.firstName ? member.firstName.charAt(0).toUpperCase() : '👤'}
                                </div>
                                <div class="member-info">
                                    <div class="member-name">
                                        \${member.firstName || 'Không có tên'} \${member.lastName || ''}
                                        \${member.isBot ? '🤖' : ''}
                                    </div>
                                    <div class="member-username">@\${member.username}</div>
                                </div>
                                <div class="member-status \${member.status === 'creator' ? 'status-creator' : 'status-administrator'}">
                                    \${member.status === 'creator' ? 'Chủ nhóm' : 'Quản trị viên'}
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                    
                    \${data.operators.length > 0 ? \`
                        <div>
                            <h3>👨‍💼 Bot Operators</h3>
                            \${data.operators.map(op => \`
                                <div class="member-item">
                                    <div class="member-avatar">
                                        \${op.username ? op.username.charAt(0).toUpperCase() : '👤'}
                                    </div>
                                    <div class="member-info">
                                        <div class="member-name">\${op.username || 'Unknown'}</div>
                                        <div class="member-username">Ngày thêm: \${formatDate(op.dateAdded)}</div>
                                    </div>
                                    <div class="member-status status-administrator">Operator</div>
                                </div>
                            \`).join('')}
                        </div>
                    \` : ''}
                \`;
                
                document.getElementById('membersModalBody').innerHTML = membersHTML;
            }
            
            async function showTransactions(chatId) {
                currentChatId = chatId;
                currentTransactionPage = 1;
                document.getElementById('transactionsModal').style.display = 'block';
                document.getElementById('transactionsModalBody').innerHTML = '<div class="loading">⏳ Đang tải...</div>';
                
                await loadTransactions(chatId, 1);
            }
            
            async function loadTransactions(chatId, page = 1) {
                try {
                    const response = await fetch(\`/api/groups/\${chatId}/transactions?page=\${page}&limit=20\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayTransactions(data);
                    } else {
                        document.getElementById('transactionsModalBody').innerHTML = 
                            '<div class="error">❌ Không thể tải thông tin giao dịch</div>';
                    }
                } catch (error) {
                    document.getElementById('transactionsModalBody').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function displayTransactions(data) {
                const transactionsHTML = \`
                    <div style="margin-bottom: 20px;">
                        <h3>📊 Thống kê giao dịch</h3>
                        <p><strong>Nhóm:</strong> \${data.groupTitle}</p>
                        <p><strong>Tổng giao dịch:</strong> \${formatNumber(data.totalTransactions)}</p>
                        <p><strong>Trang:</strong> \${data.currentPage} / \${data.totalPages}</p>
                    </div>
                    
                    \${data.startHistory.length > 0 ? \`
                        <div style="margin-bottom: 20px;">
                            <h3>🔄 Lịch sử Start</h3>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                \${data.startHistory.slice(0, 5).map(start => \`
                                    <span style="background: #e3f2fd; color: #1976d2; padding: 5px 10px; border-radius: 15px; font-size: 0.8em;">
                                        \${formatVietnameseDate(start.date)} - \${start.senderName}
                                    </span>
                                \`).join('')}
                            </div>
                        </div>
                    \` : ''}
                    
                    <div>
                        <h3>💰 Giao dịch theo ngày</h3>
                        \${Object.keys(data.transactionsByDate).map(date => \`
                            <div class="transaction-day">
                                <div class="transaction-day-header">
                                    📅 \${formatVietnameseDate(date)} (\${data.transactionsByDate[date].length} giao dịch)
                                </div>
                                \${data.transactionsByDate[date].map(transaction => \`
                                    <div class="transaction-item">
                                        <div class="transaction-header">
                                            <span class="transaction-type type-\${transaction.type}">
                                                \${getTransactionTypeText(transaction.type)}
                                            </span>
                                            <span class="transaction-amount">
                                                \${formatNumber(transaction.amount)}
                                            </span>
                                        </div>
                                        <div class="transaction-details">
                                            <div><strong>Người thực hiện:</strong> \${transaction.senderName}</div>
                                            <div><strong>Nội dung:</strong> \${transaction.message}</div>
                                            <div><strong>Thời gian:</strong> \${formatDate(transaction.timestamp)}</div>
                                            \${transaction.rate ? \`<div><strong>Rate:</strong> \${transaction.rate}%</div>\` : ''}
                                            \${transaction.exchangeRate ? \`<div><strong>Tỷ giá:</strong> \${formatNumber(transaction.exchangeRate)}</div>\` : ''}
                                        </div>
                                    </div>
                                \`).join('')}
                            </div>
                        \`).join('')}
                    </div>
                    
                    \${data.totalPages > 1 ? \`
                        <div class="pagination">
                            <button onclick="loadTransactions('\${currentChatId}', \${Math.max(1, data.currentPage - 1)})" 
                                    \${data.currentPage === 1 ? 'disabled' : ''}>
                                ← Trước
                            </button>
                            <span>Trang \${data.currentPage} / \${data.totalPages}</span>
                            <button onclick="loadTransactions('\${currentChatId}', \${Math.min(data.totalPages, data.currentPage + 1)})" 
                                    \${data.currentPage === data.totalPages ? 'disabled' : ''}>
                                Sau →
                            </button>
                        </div>
                    \` : ''}
                \`;
                
                document.getElementById('transactionsModalBody').innerHTML = transactionsHTML;
                currentTransactionPage = data.currentPage;
            }
            
            function getTransactionTypeText(type) {
                switch (type) {
                    case 'plus': return '➕ Nạp tiền';
                    case 'minus': return '➖ Rút tiền';
                    case 'percent': return '💰 Đã trả';
                    case 'clear': return '🧹 Làm sạch';
                    case 'setRate': return '📊 Đặt rate';
                    case 'setExchangeRate': return '💱 Đặt tỷ giá';
                    default: return type;
                }
            }
            
            function closeMembersModal() {
                document.getElementById('membersModal').style.display = 'none';
            }
            
            function closeTransactionsModal() {
                document.getElementById('transactionsModal').style.display = 'none';
            }
            
            // Đóng modal khi click bên ngoài
            window.onclick = function(event) {
                const membersModal = document.getElementById('membersModal');
                const transactionsModal = document.getElementById('transactionsModal');
                
                if (event.target === membersModal) {
                    closeMembersModal();
                }
                if (event.target === transactionsModal) {
                    closeTransactionsModal();
                }
            }
            
            // Tải dữ liệu khi trang được load
            loadGroups();
            
            // Tự động làm mới mỗi 5 phút
            setInterval(loadGroups, 300000);
        </script>
    </body>
    </html>
  `);
});

// Start server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Bot started polling for updates');
});

// Xử lý lỗi không bắt được
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

module.exports = { bot }; 