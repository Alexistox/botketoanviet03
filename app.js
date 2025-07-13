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
                font-family: Arial, sans-serif;
                background: #f5f5f5;
                padding: 20px;
                color: #333;
            }
            
            .container {
                max-width: 1000px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            
            .header {
                background: #2c3e50;
                color: white;
                padding: 20px;
                text-align: center;
            }
            
            .header h1 {
                font-size: 1.8em;
                margin-bottom: 5px;
            }
            
            .stats {
                display: flex;
                justify-content: space-around;
                padding: 15px;
                background: #ecf0f1;
                border-bottom: 1px solid #ddd;
            }
            
            .stat-item {
                text-align: center;
            }
            
            .stat-number {
                font-size: 1.5em;
                font-weight: bold;
                color: #2c3e50;
            }
            
            .stat-label {
                font-size: 0.9em;
                color: #7f8c8d;
                margin-top: 5px;
            }
            
            .loading {
                text-align: center;
                padding: 40px;
                color: #7f8c8d;
            }
            
            .groups-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            .groups-table th,
            .groups-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            
            .groups-table th {
                background: #34495e;
                color: white;
                font-weight: normal;
            }
            
            .groups-table tr:hover {
                background: #f8f9fa;
            }
            
            .detail-btn {
                background: #3498db;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
            }
            
            .detail-btn:hover {
                background: #2980b9;
            }
            
            .refresh-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #2c3e50;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 12px 16px;
                cursor: pointer;
            }
            
            .refresh-btn:hover {
                background: #34495e;
            }
            
            .error {
                text-align: center;
                padding: 40px;
                color: #e74c3c;
            }
            
            @media (max-width: 768px) {
                .stats {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .groups-table {
                    font-size: 0.9em;
                }
                
                .groups-table th,
                .groups-table td {
                    padding: 8px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Danh sách nhóm Bot</h1>
                <p>Thống kê tổng quan các nhóm</p>
            </div>
            
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number" id="totalGroups">-</div>
                    <div class="stat-label">Tổng số nhóm</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="totalTransactions">-</div>
                    <div class="stat-label">Tổng giao dịch</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="totalMembers">-</div>
                    <div class="stat-label">Tổng thành viên</div>
                </div>
            </div>
            
            <div id="content">
                <div class="loading">
                    <div>⏳ Đang tải dữ liệu...</div>
                </div>
            </div>
        </div>
        
        <button class="refresh-btn" onclick="loadGroups()">🔄 Làm mới</button>
        
        <script>
            function formatNumber(num) {
                if (num === 0) return '0';
                return new Intl.NumberFormat('vi-VN').format(num);
            }
            
            function formatDate(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleDateString('vi-VN');
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
                
                const tableHTML = \`
                    <table class="groups-table">
                        <thead>
                            <tr>
                                <th>Tên nhóm</th>
                                <th>Thành viên</th>
                                <th>Giao dịch</th>
                                <th>Rate</th>
                                <th>Tỷ giá</th>
                                <th>Tổng VND</th>
                                <th>Tổng USDT</th>
                                <th>Chi tiết</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${groups.map(group => \`
                                <tr>
                                    <td>\${group.title}</td>
                                    <td>\${formatNumber(group.memberCount)}</td>
                                    <td>\${formatNumber(group.transactionCount)}</td>
                                    <td>\${group.rate}%</td>
                                    <td>\${formatNumber(group.exchangeRate)}</td>
                                    <td>\${formatNumber(group.totalVND)}</td>
                                    <td>\${formatNumber(group.totalUSDT)}</td>
                                    <td>
                                        <button class="detail-btn" onclick="viewDetails('\${group.chatId}')">
                                            Chi tiết
                                        </button>
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
                
                document.getElementById('content').innerHTML = tableHTML;
            }
            
            function viewDetails(chatId) {
                window.location.href = \`/groups/\${chatId}\`;
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

// Route hiển thị chi tiết một nhóm
app.get('/groups/:chatId', async (req, res) => {
  const { chatId } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chi tiết nhóm</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: Arial, sans-serif;
                background: #f5f5f5;
                padding: 20px;
                color: #333;
            }
            
            .container {
                max-width: 1000px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            
            .header {
                background: #2c3e50;
                color: white;
                padding: 20px;
                text-align: center;
            }
            
            .header h1 {
                font-size: 1.8em;
                margin-bottom: 5px;
            }
            
            .back-btn {
                background: #34495e;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-bottom: 15px;
            }
            
            .back-btn:hover {
                background: #2c3e50;
            }
            
            .info-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                padding: 20px;
            }
            
            .info-card {
                background: #ecf0f1;
                padding: 15px;
                border-radius: 6px;
                border-left: 4px solid #3498db;
            }
            
            .info-card h3 {
                color: #2c3e50;
                margin-bottom: 10px;
                font-size: 1.1em;
            }
            
            .info-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #ddd;
            }
            
            .info-item:last-child {
                border-bottom: none;
            }
            
            .info-label {
                font-weight: 500;
                color: #7f8c8d;
            }
            
            .info-value {
                color: #2c3e50;
                font-weight: bold;
            }
            
            .section {
                margin: 20px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 6px;
            }
            
            .section h2 {
                color: #2c3e50;
                margin-bottom: 15px;
                font-size: 1.3em;
            }
            
            .members-list {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 10px;
            }
            
            .member-item {
                background: white;
                padding: 10px;
                border-radius: 4px;
                border-left: 3px solid #3498db;
            }
            
            .member-name {
                font-weight: bold;
                color: #2c3e50;
            }
            
            .member-role {
                font-size: 0.9em;
                color: #7f8c8d;
            }
            
            .transactions-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            
            .transactions-table th,
            .transactions-table td {
                padding: 10px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            
            .transactions-table th {
                background: #34495e;
                color: white;
            }
            
            .transactions-table tr:hover {
                background: #f8f9fa;
            }
            
            .transaction-date {
                background: #2c3e50;
                color: white;
                padding: 10px;
                margin: 20px 0 10px 0;
                border-radius: 4px;
            }
            
            .pagination {
                text-align: center;
                margin: 20px 0;
            }
            
            .pagination button {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 16px;
                margin: 0 5px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .pagination button:hover {
                background: #2980b9;
            }
            
            .pagination button:disabled {
                background: #bdc3c7;
                cursor: not-allowed;
            }
            
            .loading {
                text-align: center;
                padding: 40px;
                color: #7f8c8d;
            }
            
            .error {
                text-align: center;
                padding: 40px;
                color: #e74c3c;
            }
            
            @media (max-width: 768px) {
                .info-grid {
                    grid-template-columns: 1fr;
                }
                
                .members-list {
                    grid-template-columns: 1fr;
                }
                
                .transactions-table {
                    font-size: 0.9em;
                }
                
                .transactions-table th,
                .transactions-table td {
                    padding: 6px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <button class="back-btn" onclick="window.location.href='/groups'">← Quay lại</button>
                <h1 id="groupTitle">Chi tiết nhóm</h1>
            </div>
            
            <div id="content">
                <div class="loading">
                    <div>⏳ Đang tải dữ liệu...</div>
                </div>
            </div>
        </div>
        
        <script>
            const chatId = '${chatId}';
            let currentPage = 1;
            
            function formatNumber(num) {
                if (num === 0) return '0';
                return new Intl.NumberFormat('vi-VN').format(num);
            }
            
            function formatDate(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleDateString('vi-VN');
            }
            
            function formatDateTime(dateString) {
                return new Date(dateString).toLocaleString('vi-VN');
            }
            
            async function loadGroupDetails() {
                try {
                    // Load group info
                    const groupResponse = await fetch('/api/groups');
                    const groupData = await groupResponse.json();
                    
                    if (groupData.success) {
                        const group = groupData.groups.find(g => g.chatId === chatId);
                        if (group) {
                            displayGroupInfo(group);
                        }
                    }
                    
                    // Load members
                    const membersResponse = await fetch(\`/api/groups/\${chatId}/members\`);
                    const membersData = await membersResponse.json();
                    
                    if (membersData.success) {
                        displayMembers(membersData);
                    }
                    
                    // Load transactions
                    await loadTransactions(1);
                    
                } catch (error) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function displayGroupInfo(group) {
                document.getElementById('groupTitle').textContent = group.title;
                
                const infoHTML = \`
                    <div class="info-grid">
                        <div class="info-card">
                            <h3>📊 Thông tin cơ bản</h3>
                            <div class="info-item">
                                <span class="info-label">Chat ID:</span>
                                <span class="info-value">\${group.chatId}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Thành viên:</span>
                                <span class="info-value">\${formatNumber(group.memberCount)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Giao dịch:</span>
                                <span class="info-value">\${formatNumber(group.transactionCount)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Loại tiền:</span>
                                <span class="info-value">\${group.currency}</span>
                            </div>
                        </div>
                        
                        <div class="info-card">
                            <h3>💰 Thông tin tài chính</h3>
                            <div class="info-item">
                                <span class="info-label">Rate:</span>
                                <span class="info-value">\${group.rate}%</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Tỷ giá:</span>
                                <span class="info-value">\${formatNumber(group.exchangeRate)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Tổng VND:</span>
                                <span class="info-value">\${formatNumber(group.totalVND)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Tổng USDT:</span>
                                <span class="info-value">\${formatNumber(group.totalUSDT)}</span>
                            </div>
                        </div>
                    </div>
                \`;
                
                document.getElementById('content').innerHTML = infoHTML;
            }
            
            function displayMembers(data) {
                const membersHTML = \`
                    <div class="section">
                        <h2>👥 Thành viên nhóm</h2>
                        <div class="members-list">
                            \${data.members.map(member => \`
                                <div class="member-item">
                                    <div class="member-name">\${member.firstName || 'Không có tên'} \${member.lastName || ''}</div>
                                    <div class="member-role">@\${member.username} - \${member.status === 'creator' ? 'Chủ nhóm' : 'Quản trị viên'}</div>
                                </div>
                            \`).join('')}
                        </div>
                        
                        \${data.operators.length > 0 ? \`
                            <h3 style="margin-top: 20px;">👨‍💼 Bot Operators</h3>
                            <div class="members-list">
                                \${data.operators.map(op => \`
                                    <div class="member-item">
                                        <div class="member-name">\${op.username || 'Unknown'}</div>
                                        <div class="member-role">Operator - \${formatDate(op.dateAdded)}</div>
                                    </div>
                                \`).join('')}
                            </div>
                        \` : ''}
                    </div>
                \`;
                
                document.getElementById('content').innerHTML += membersHTML;
            }
            
            async function loadTransactions(page = 1) {
                try {
                    const response = await fetch(\`/api/groups/\${chatId}/transactions?page=\${page}&limit=50\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayTransactions(data);
                        currentPage = page;
                    }
                } catch (error) {
                    console.error('Error loading transactions:', error);
                }
            }
            
            function displayTransactions(data) {
                const transactionsHTML = \`
                    <div class="section">
                        <h2>💰 Giao dịch chi tiết</h2>
                        <p>Tổng: \${formatNumber(data.totalTransactions)} giao dịch (Trang \${data.currentPage}/\${data.totalPages})</p>
                        
                        \${Object.keys(data.transactionsByDate).map(date => \`
                            <div class="transaction-date">
                                📅 \${formatDate(date)} (\${data.transactionsByDate[date].length} giao dịch)
                            </div>
                            <table class="transactions-table">
                                <thead>
                                    <tr>
                                        <th>Loại</th>
                                        <th>Số tiền</th>
                                        <th>Người thực hiện</th>
                                        <th>Nội dung</th>
                                        <th>Thời gian</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${data.transactionsByDate[date].map(transaction => \`
                                        <tr>
                                            <td>\${getTransactionType(transaction.type)}</td>
                                            <td>\${formatNumber(transaction.amount)}</td>
                                            <td>\${transaction.senderName}</td>
                                            <td>\${transaction.message}</td>
                                            <td>\${formatDateTime(transaction.timestamp)}</td>
                                        </tr>
                                    \`).join('')}
                                </tbody>
                            </table>
                        \`).join('')}
                        
                        \${data.totalPages > 1 ? \`
                            <div class="pagination">
                                <button onclick="loadTransactions(\${Math.max(1, data.currentPage - 1)})" 
                                        \${data.currentPage === 1 ? 'disabled' : ''}>
                                    ← Trước
                                </button>
                                <span>Trang \${data.currentPage} / \${data.totalPages}</span>
                                <button onclick="loadTransactions(\${Math.min(data.totalPages, data.currentPage + 1)})" 
                                        \${data.currentPage === data.totalPages ? 'disabled' : ''}>
                                    Sau →
                                </button>
                            </div>
                        \` : ''}
                    </div>
                \`;
                
                // Replace only the transactions section
                const existingTransactionSection = document.querySelector('.section:last-child');
                if (existingTransactionSection && existingTransactionSection.innerHTML.includes('💰 Giao dịch chi tiết')) {
                    existingTransactionSection.outerHTML = transactionsHTML;
                } else {
                    document.getElementById('content').innerHTML += transactionsHTML;
                }
            }
            
            function getTransactionType(type) {
                switch (type) {
                    case 'plus': return '➕ Nạp';
                    case 'minus': return '➖ Rút';
                    case 'percent': return '💰 Trả';
                    case 'clear': return '🧹 Clear';
                    default: return type;
                }
            }
            
            // Load data when page loads
            loadGroupDetails();
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