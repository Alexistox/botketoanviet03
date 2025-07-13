require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');
const ExcelJS = require('exceljs');

// Import controllers và utils
const { handleMessage } = require('./controllers/messageController');
const { handleInlineButtonCallback } = require('./controllers/userCommands');
const { connectDB } = require('./config/db');
const Group = require('./models/Group');
const Transaction = require('./models/Transaction');
const User = require('./models/User');
const Card = require('./models/Card');
const MessageLog = require('./models/MessageLog');

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

// API endpoint để lấy thông tin message logs của các nhóm
app.get('/api/messagelogs', async (req, res) => {
  try {
    // Lấy danh sách các chatId có message logs
    const messageLogs = await MessageLog.aggregate([
      {
        $group: {
          _id: '$chatId',
          groupName: { $first: '$groupName' },
          messageCount: { $sum: 1 },
          lastMessage: { $max: '$timestamp' },
          firstMessage: { $min: '$timestamp' }
        }
      }
    ]);
    
    const groupsWithMessageLogs = await Promise.all(
      messageLogs.map(async (logGroup) => {
        let groupTitle = logGroup.groupName || "Nhóm không xác định";
        let memberCount = 0;
        
        try {
          const chatInfo = await bot.getChat(logGroup._id);
          groupTitle = chatInfo.title || `Chat ID: ${logGroup._id}`;
        } catch (error) {
          groupTitle = logGroup.groupName || `Nhóm không xác định (ID: ${logGroup._id})`;
        }
        
        try {
          memberCount = await bot.getChatMemberCount(logGroup._id);
        } catch (error) {
          memberCount = 0;
        }
        
        return {
          chatId: logGroup._id,
          title: groupTitle,
          messageCount: logGroup.messageCount,
          memberCount,
          lastMessage: logGroup.lastMessage,
          firstMessage: logGroup.firstMessage
        };
      })
    );
    
    res.json({
      success: true,
      totalGroups: groupsWithMessageLogs.length,
      groups: groupsWithMessageLogs
    });
  } catch (error) {
    console.error('Error fetching message logs:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin message logs'
    });
  }
});

// API endpoint để lấy chi tiết message logs của một nhóm
app.get('/api/messagelogs/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { 
      page = 1, 
      limit = 50, 
      startDate, 
      endDate, 
      sender, 
      search,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;
    
    // Tạo filter query
    const filter = { chatId };
    
    // Filter theo thời gian
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    
    // Filter theo người gửi
    if (sender) {
      filter.senderName = { $regex: sender, $options: 'i' };
    }
    
    // Search trong nội dung tin nhắn
    if (search) {
      filter.content = { $regex: search, $options: 'i' };
    }
    
    // Setup pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Setup sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Lấy message logs và total count
    const [messageLogs, totalCount] = await Promise.all([
      MessageLog.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      MessageLog.countDocuments(filter)
    ]);
    
    // Lấy thông tin nhóm
    let groupTitle = "Nhóm không xác định";
    try {
      const chatInfo = await bot.getChat(chatId);
      groupTitle = chatInfo.title || `Chat ID: ${chatId}`;
    } catch (error) {
      const firstLog = await MessageLog.findOne({ chatId }).lean();
      groupTitle = firstLog?.groupName || `Nhóm không xác định (ID: ${chatId})`;
    }
    
    // Lấy danh sách sender để filter
    const senders = await MessageLog.distinct('senderName', { chatId });
    
    res.json({
      success: true,
      groupInfo: {
        chatId,
        title: groupTitle
      },
      messageLogs,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        totalCount,
        limit: limitNumber
      },
      filters: {
        senders: senders.filter(s => s) // Loại bỏ giá trị rỗng
      }
    });
  } catch (error) {
    console.error('Error fetching message logs for group:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy message logs của nhóm'
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
        fullName: `${admin.user.first_name || ''} ${admin.user.last_name || ''}`.trim() || 'Không có tên',
        telegramLink: admin.user.username ? `https://t.me/${admin.user.username}` : null,
        status: admin.status,
        statusText: admin.status === 'creator' ? 'Chủ nhóm' : 'Quản trị viên',
        isBot: admin.user.is_bot || false
      }));
      
    } catch (error) {
      console.error('Error fetching members:', error);
      members = [];
    }

    // Thêm thông tin operators với link Telegram
    const operators = group.operators.map(op => ({
      ...op,
      telegramLink: op.username ? `https://t.me/${op.username}` : null,
      statusText: 'Bot Operator',
      fullName: op.username || 'Unknown'
    }));

    res.json({
      success: true,
      chatId,
      groupTitle,
      totalMembers: members.length,
      totalOperators: operators.length,
      members,
      operators
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
    const { 
      page = 1, 
      limit = 50, 
      startDate, 
      endDate, 
      type, 
      senderName, 
      search 
    } = req.query;
    
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
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // Cuối ngày
        filter.timestamp.$lte = endDateTime;
      }
    }

    // Lọc theo loại giao dịch
    if (type && type !== 'all') {
      filter.type = type;
    }

    // Lọc theo tên người gửi
    if (senderName && senderName !== 'all') {
      filter.senderName = { $regex: senderName, $options: 'i' };
    }

    // Tìm kiếm trong nội dung
    if (search) {
      filter.$or = [
        { message: { $regex: search, $options: 'i' } },
        { senderName: { $regex: search, $options: 'i' } }
      ];
    }

    // Lấy giao dịch với phân trang
    const transactions = await Transaction.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Đếm tổng số giao dịch
    const totalTransactions = await Transaction.countDocuments(filter);

    // Lấy danh sách các loại giao dịch và tên người gửi unique
    const uniqueTypes = await Transaction.distinct('type', { chatId });
    const uniqueSenders = await Transaction.distinct('senderName', { chatId });

    // Tính tổng tiền đã trả (các giao dịch payment)
    const totalPaid = await Transaction.aggregate([
      { $match: { chatId, type: 'payment', skipped: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$usdtAmount' } } }
    ]);
    const totalPaidAmount = totalPaid.length > 0 ? totalPaid[0].total : 0;

    // Tính tổng tiền còn lại
    const remainingAmount = group.totalUSDT - totalPaidAmount;

    // Nhóm giao dịch theo ngày với thông tin tiền đã trả và còn lại
    const transactionsByDate = {};
    let runningPaid = 0;
    
    // Sắp xếp giao dịch theo thời gian tăng dần để tính running total
    const sortedTransactions = transactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    sortedTransactions.forEach(transaction => {
      const date = transaction.timestamp.toISOString().split('T')[0];
      if (!transactionsByDate[date]) {
        transactionsByDate[date] = [];
      }
      
      // Tính tiền đã trả tại thời điểm này
      if (transaction.type === 'payment') {
        runningPaid += transaction.usdtAmount || 0;
      }
      
      transactionsByDate[date].push({
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount || 0,
        usdtAmount: transaction.usdtAmount || 0,
        message: transaction.message,
        senderName: transaction.senderName,
        rate: transaction.rate,
        exchangeRate: transaction.exchangeRate,
        timestamp: transaction.timestamp,
        createdAt: transaction.createdAt,
        paidAmount: runningPaid,
        remainingAmount: group.totalUSDT - runningPaid
      });
    });

    // Sắp xếp lại theo thứ tự giảm dần để hiển thị
    Object.keys(transactionsByDate).forEach(date => {
      transactionsByDate[date].reverse();
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
      uniqueTypes,
      uniqueSenders,
      summary: {
        totalVND: group.totalVND || 0,
        totalUSDT: group.totalUSDT || 0,
        totalPaid: totalPaidAmount,
        remaining: remainingAmount,
        rate: group.rate || 0,
        exchangeRate: group.exchangeRate || 0
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        type: type || 'all',
        senderName: senderName || 'all',
        search: search || ''
      },
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

// API endpoint mới để lấy tổng kết theo ngày
app.get('/api/groups/:chatId/daily-summary', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Lấy thông tin nhóm
    const group = await Group.findOne({ chatId });
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm'
      });
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
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = endDateTime;
      }
    }

    // Aggregate dữ liệu theo ngày
    const dailyData = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            type: '$type'
          },
          totalAmount: { $sum: '$amount' },
          totalUsdtAmount: { $sum: '$usdtAmount' },
          count: { $sum: 1 },
          avgRate: { $avg: '$rate' },
          avgExchangeRate: { $avg: '$exchangeRate' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Tổ chức dữ liệu theo ngày
    const summary = {};
    let totalSumVND = 0;
    let totalSumUSDT = 0;
    let totalSumPaid = 0;

    dailyData.forEach(item => {
      const date = item._id.date;
      const type = item._id.type;
      
      if (!summary[date]) {
        summary[date] = {
          date,
          deposits: { amount: 0, usdtAmount: 0, count: 0 },
          withdraws: { amount: 0, usdtAmount: 0, count: 0 },
          payments: { amount: 0, usdtAmount: 0, count: 0 },
          totalVND: 0,
          totalUSDT: 0,
          totalPaid: 0,
          avgRate: 0,
          avgExchangeRate: 0,
          transactionCount: 0
        };
      }

      if (type === 'deposit') {
        summary[date].deposits = {
          amount: item.totalAmount,
          usdtAmount: item.totalUsdtAmount,
          count: item.count
        };
      } else if (type === 'withdraw') {
        summary[date].withdraws = {
          amount: Math.abs(item.totalAmount),
          usdtAmount: Math.abs(item.totalUsdtAmount),
          count: item.count
        };
      } else if (type === 'payment') {
        summary[date].payments = {
          amount: item.totalAmount,
          usdtAmount: item.totalUsdtAmount,
          count: item.count
        };
      }

      summary[date].avgRate = item.avgRate || 0;
      summary[date].avgExchangeRate = item.avgExchangeRate || 0;
      summary[date].transactionCount += item.count;
    });

    // Tính tổng cho mỗi ngày
    Object.keys(summary).forEach(date => {
      const day = summary[date];
      day.totalVND = day.deposits.amount - day.withdraws.amount;
      day.totalUSDT = day.deposits.usdtAmount - day.withdraws.usdtAmount;
      day.totalPaid = day.payments.usdtAmount;
      day.remaining = day.totalUSDT - day.totalPaid;
      
      // Cộng vào tổng
      totalSumVND += day.totalVND;
      totalSumUSDT += day.totalUSDT;
      totalSumPaid += day.totalPaid;
    });

    // Sắp xếp theo ngày
    const sortedSummary = Object.values(summary).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      chatId,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      dailySummary: sortedSummary,
      grandTotal: {
        totalVND: totalSumVND,
        totalUSDT: totalSumUSDT,
        totalPaid: totalSumPaid,
        remaining: totalSumUSDT - totalSumPaid,
        avgRate: group.rate || 0,
        avgExchangeRate: group.exchangeRate || 0
      }
    });
  } catch (error) {
    console.error('Error fetching daily summary:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy tổng kết theo ngày'
    });
  }
});

// API endpoint để export giao dịch ra Excel
app.get('/api/groups/:chatId/export-excel', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { 
      startDate, 
      endDate, 
      type, 
      senderName, 
      search 
    } = req.query;
    
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

    // Áp dụng filters
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = endDateTime;
      }
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (senderName && senderName !== 'all') {
      filter.senderName = { $regex: senderName, $options: 'i' };
    }

    if (search) {
      filter.$or = [
        { message: { $regex: search, $options: 'i' } },
        { senderName: { $regex: search, $options: 'i' } }
      ];
    }

    // Lấy tất cả giao dịch theo filter (không phân trang)
    const transactions = await Transaction.find(filter)
      .sort({ timestamp: -1 })
      .exec();

    // Tính tổng tiền đã trả
    const totalPaid = await Transaction.aggregate([
      { $match: { chatId, type: 'payment', skipped: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$usdtAmount' } } }
    ]);
    const totalPaidAmount = totalPaid.length > 0 ? totalPaid[0].total : 0;

    // Tính running total cho từng giao dịch
    let runningPaid = 0;
    const processedTransactions = transactions.reverse().map(transaction => {
      if (transaction.type === 'payment') {
        runningPaid += transaction.usdtAmount || 0;
      }
      return {
        ...transaction.toObject(),
        paidAmount: runningPaid,
        remainingAmount: group.totalUSDT - runningPaid
      };
    }).reverse();

    // Tạo workbook Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Giao dịch chi tiết');

    // Thêm tiêu đề
    worksheet.mergeCells('A1:I1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `GIAO DỊCH CHI TIẾT - ${groupTitle}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Thêm thông tin filter
    let filterInfo = 'Bộ lọc: ';
    if (startDate) filterInfo += `Từ ${startDate} `;
    if (endDate) filterInfo += `Đến ${endDate} `;
    if (type && type !== 'all') filterInfo += `Loại: ${type} `;
    if (senderName && senderName !== 'all') filterInfo += `Người: ${senderName} `;
    if (search) filterInfo += `Tìm: "${search}" `;
    
    worksheet.mergeCells('A2:I2');
    const filterCell = worksheet.getCell('A2');
    filterCell.value = filterInfo;
    filterCell.font = { italic: true };

    // Thêm thông tin tổng kết
    worksheet.mergeCells('A3:I3');
    const summaryCell = worksheet.getCell('A3');
    summaryCell.value = `Tổng VND: ${group.totalVND || 0} | Tổng USDT: ${group.totalUSDT || 0} | Đã trả: ${totalPaidAmount} | Còn lại: ${group.totalUSDT - totalPaidAmount}`;
    summaryCell.font = { bold: true };

    // Thêm header cho bảng
    const headers = [
      'STT',
      'Loại giao dịch',
      'Số tiền (VND)',
      'Số tiền (USDT)',
      'Người thực hiện',
      'Nội dung',
      'Đã trả (USDT)',
      'Còn lại (USDT)',
      'Thời gian'
    ];

    const headerRow = worksheet.getRow(5);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3498DB' }
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Thêm dữ liệu
    processedTransactions.forEach((transaction, index) => {
      const row = worksheet.getRow(index + 6);
      
      // Mapping loại giao dịch
      let transactionType = '';
      switch (transaction.type) {
        case 'deposit':
        case 'plus':
          transactionType = 'Nạp';
          break;
        case 'withdraw':
        case 'minus':
          transactionType = 'Rút';
          break;
        case 'payment':
        case 'percent':
          transactionType = 'Trả';
          break;
        case 'clear':
          transactionType = 'Clear';
          break;
        default:
          transactionType = transaction.type;
      }

      row.getCell(1).value = index + 1;
      row.getCell(2).value = transactionType;
      row.getCell(3).value = transaction.amount || 0;
      row.getCell(4).value = transaction.usdtAmount || 0;
      row.getCell(5).value = transaction.senderName;
      row.getCell(6).value = transaction.message;
      row.getCell(7).value = transaction.paidAmount;
      row.getCell(8).value = transaction.remainingAmount;
      row.getCell(9).value = transaction.timestamp;

      // Định dạng số
      row.getCell(3).numFmt = '#,##0';
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).numFmt = 'dd/mm/yyyy hh:mm:ss';

      // Màu sắc theo loại giao dịch
      if (transaction.type === 'deposit' || transaction.type === 'plus') {
        row.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF27AE60' }
        };
      } else if (transaction.type === 'withdraw' || transaction.type === 'minus') {
        row.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE74C3C' }
        };
      } else if (transaction.type === 'payment' || transaction.type === 'percent') {
        row.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF39C12' }
        };
      }
    });

    // Tự động điều chỉnh độ rộng cột
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    // Tạo filename
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `giao-dich-${chatId}-${dateStr}.xlsx`;

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Ghi file Excel vào response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất file Excel'
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
            
            /* Mobile-first responsive design */
            .mobile-card {
                display: none;
            }
            
            .table-wrapper {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
            
            @media (max-width: 768px) {
                body {
                    padding: 10px;
                }
                
                .container {
                    margin: 0;
                    border-radius: 0;
                }
                
                .header {
                    padding: 15px;
                }
                
                .header h1 {
                    font-size: 1.4em;
                }
                
                .stats {
                    flex-direction: column;
                    gap: 15px;
                    padding: 20px 15px;
                }
                
                .stat-item {
                    background: white;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .stat-number {
                    font-size: 1.8em;
                }
                
                .stat-label {
                    font-size: 1em;
                    margin-top: 8px;
                }
                
                /* Hide table, show cards on mobile */
                .groups-table {
                    display: none;
                }
                
                .mobile-card {
                    display: block;
                }
                
                .group-card {
                    background: white;
                    margin: 10px 0;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    border-left: 4px solid #3498db;
                }
                
                .group-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 15px;
                }
                
                .group-title {
                    font-size: 1.1em;
                    font-weight: bold;
                    color: #2c3e50;
                    margin: 0;
                    flex: 1;
                    margin-right: 10px;
                }
                
                .group-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-bottom: 15px;
                }
                
                .group-stat {
                    text-align: center;
                    padding: 10px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                
                .group-stat-value {
                    font-size: 1.2em;
                    font-weight: bold;
                    color: #2c3e50;
                }
                
                .group-stat-label {
                    font-size: 0.8em;
                    color: #7f8c8d;
                    margin-top: 5px;
                }
                
                .detail-btn {
                    width: 100%;
                    padding: 12px;
                    font-size: 1em;
                    border-radius: 8px;
                    font-weight: bold;
                }
                
                .refresh-btn {
                    bottom: 15px;
                    right: 15px;
                    padding: 15px;
                    border-radius: 50px;
                    font-size: 1.1em;
                }
                
                .loading, .error {
                    padding: 20px;
                    margin: 15px;
                }
            }
            
            @media (max-width: 480px) {
                .group-stats {
                    grid-template-columns: 1fr;
                    gap: 10px;
                }
                
                .group-card {
                    padding: 15px;
                    margin: 8px 0;
                }
                
                .stat-number {
                    font-size: 1.5em;
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
                
                // Desktop table
                const tableHTML = \`
                    <div class="table-wrapper">
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
                    </div>
                \`;
                
                // Mobile cards
                const mobileHTML = \`
                    <div class="mobile-card">
                        \${groups.map(group => \`
                            <div class="group-card">
                                <div class="group-card-header">
                                    <h3 class="group-title">\${group.title}</h3>
                                </div>
                                <div class="group-stats">
                                    <div class="group-stat">
                                        <div class="group-stat-value">\${formatNumber(group.memberCount)}</div>
                                        <div class="group-stat-label">Thành viên</div>
                                    </div>
                                    <div class="group-stat">
                                        <div class="group-stat-value">\${formatNumber(group.transactionCount)}</div>
                                        <div class="group-stat-label">Giao dịch</div>
                                    </div>
                                    <div class="group-stat">
                                        <div class="group-stat-value">\${group.rate}%</div>
                                        <div class="group-stat-label">Rate</div>
                                    </div>
                                    <div class="group-stat">
                                        <div class="group-stat-value">\${formatNumber(group.exchangeRate)}</div>
                                        <div class="group-stat-label">Tỷ giá</div>
                                    </div>
                                    <div class="group-stat">
                                        <div class="group-stat-value">\${formatNumber(group.totalVND)}</div>
                                        <div class="group-stat-label">VND</div>
                                    </div>
                                    <div class="group-stat">
                                        <div class="group-stat-value">\${formatNumber(group.totalUSDT)}</div>
                                        <div class="group-stat-label">USDT</div>
                                    </div>
                                </div>
                                <button class="detail-btn" onclick="viewDetails('\${group.chatId}')">
                                    📊 Xem chi tiết
                                </button>
                            </div>
                        \`).join('')}
                    </div>
                \`;
                
                document.getElementById('content').innerHTML = tableHTML + mobileHTML;
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
            
            .table-container {
                overflow-x: auto;
                margin-top: 15px;
            }
            
            .members-table,
            .transactions-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
                background: white;
                border-radius: 6px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .members-table th,
            .members-table td,
            .transactions-table th,
            .transactions-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            
            .members-table th,
            .transactions-table th {
                background: #34495e;
                color: white;
                font-weight: normal;
                cursor: pointer;
                user-select: none;
            }
            
            .members-table th:hover,
            .transactions-table th:hover {
                background: #2c3e50;
            }
            
            .members-table tr:hover,
            .transactions-table tr:hover {
                background: #f8f9fa;
            }
            
            .telegram-link {
                color: #3498db;
                text-decoration: none;
                font-weight: 500;
                padding: 4px 8px;
                border-radius: 4px;
                border: 1px solid #3498db;
                transition: all 0.3s ease;
            }
            
            .telegram-link:hover {
                background: #3498db;
                color: white;
            }
            
            .no-link {
                color: #7f8c8d;
                font-style: italic;
            }
            
            .role-badge {
                background: #3498db;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: 500;
            }
            
            .role-badge.operator {
                background: #e67e22;
            }
            
            .filters-container {
                background: white;
                padding: 20px;
                border-radius: 6px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .filter-row {
                display: flex;
                gap: 15px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .filter-row:last-child {
                margin-bottom: 0;
            }
            
            .filter-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
                min-width: 150px;
            }
            
            .filter-group.search-group {
                min-width: 300px;
                flex: 1;
            }
            
            .filter-group label {
                font-weight: 500;
                color: #2c3e50;
                font-size: 0.9em;
            }
            
            .filter-group input,
            .filter-group select {
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 0.9em;
            }
            
            .filter-group input:focus,
            .filter-group select:focus {
                outline: none;
                border-color: #3498db;
                box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
            }
            
            .search-group {
                display: flex;
                flex-direction: column;
            }
            
            .search-input-container {
                display: flex;
                gap: 5px;
                align-items: center;
            }
            
            .search-input-container input {
                flex: 1;
            }
            
            .search-btn,
            .clear-btn {
                padding: 8px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                transition: all 0.3s ease;
            }
            
            .search-btn {
                background: #3498db;
                color: white;
            }
            
            .search-btn:hover {
                background: #2980b9;
            }
            
            .clear-btn {
                background: #e74c3c;
                color: white;
            }
            
            .clear-btn:hover {
                background: #c0392b;
            }
            
            .export-btn {
                background: #2ecc71;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                transition: all 0.3s ease;
            }
            
            .export-btn:hover {
                background: #27ae60;
            }
            
            .export-btn:active {
                transform: translateY(1px);
            }
            
            .transaction-summary {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 10px;
            }
            
            .sort-icon {
                font-size: 0.8em;
                margin-left: 5px;
                opacity: 0.7;
            }
            
            .transaction-type {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: 500;
            }
            
            .transaction-type.plus,
            .transaction-type.deposit {
                background: #2ecc71;
                color: white;
            }
            
            .transaction-type.minus,
            .transaction-type.withdraw {
                background: #e74c3c;
                color: white;
            }
            
            .transaction-type.percent,
            .transaction-type.payment {
                background: #f39c12;
                color: white;
            }
            
            .transaction-type.clear {
                background: #95a5a6;
                color: white;
            }
            
            .amount {
                font-weight: bold;
                color: #2c3e50;
            }
            
            .amount.positive {
                color: #27ae60;
            }
            
            .amount.negative {
                color: #e74c3c;
            }
            
            .amount.paid {
                color: #f39c12;
            }
            
            .amount.remaining {
                color: #3498db;
            }
            
            .summary-section {
                margin: 20px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 6px;
                border: 2px solid #3498db;
            }
            
            .summary-section h3 {
                color: #2c3e50;
                margin-bottom: 15px;
                font-size: 1.2em;
            }
            
            .summary-filters {
                display: flex;
                gap: 15px;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }
            
            .summary-table {
                width: 100%;
                border-collapse: collapse;
                background: white;
                border-radius: 6px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .summary-table th {
                background: #3498db;
                color: white;
                padding: 12px;
                text-align: left;
                font-weight: normal;
            }
            
            .summary-table td {
                padding: 10px 12px;
                border-bottom: 1px solid #ddd;
            }
            
            .summary-table tr:hover {
                background: #f8f9fa;
            }
            
            .summary-table .total-row {
                background: #ecf0f1;
                font-weight: bold;
                border-top: 2px solid #3498db;
            }
            
            .summary-table .total-row:hover {
                background: #d5dbdb;
            }
            
            .transaction-count {
                text-align: center;
                color: #7f8c8d;
                font-weight: 500;
            }
            
            .transaction-summary-info {
                display: flex;
                justify-content: space-around;
                background: white;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                flex-wrap: wrap;
            }
            
            .summary-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
            }
            
            .summary-item .label {
                font-size: 0.9em;
                color: #7f8c8d;
                font-weight: 500;
            }
            
            .summary-item .value {
                font-size: 1.2em;
                font-weight: bold;
                color: #2c3e50;
            }
            
            .summary-item .value.paid {
                color: #f39c12;
            }
            
            .summary-item .value.remaining {
                color: #3498db;
            }
            
            .message {
                max-width: 300px;
                word-wrap: break-word;
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
                
                .filter-row {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .filter-group {
                    min-width: auto;
                }
                
                .filter-group.search-group {
                    min-width: auto;
                }
                
                .search-input-container {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .members-table,
                .transactions-table,
                .summary-table {
                    font-size: 0.9em;
                }
                
                .members-table th,
                .members-table td,
                .transactions-table th,
                .transactions-table td,
                .summary-table th,
                .summary-table td {
                    padding: 6px;
                }
                
                .message {
                    max-width: 150px;
                }
                
                .telegram-link {
                    font-size: 0.8em;
                    padding: 3px 6px;
                }
                
                .filters-container {
                    padding: 15px;
                }
                
                .summary-section {
                    margin: 10px;
                    padding: 15px;
                }
                
                .summary-filters {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .transaction-summary-info {
                    flex-direction: column;
                    gap: 10px;
                    padding: 10px;
                }
                
                .summary-item {
                    flex-direction: row;
                    justify-content: space-between;
                    padding: 8px;
                    background: #f8f9fa;
                    border-radius: 4px;
                }
                
                .summary-item .value {
                    font-size: 1em;
                }
                
                .summary-table {
                    display: block;
                    overflow-x: auto;
                    white-space: nowrap;
                }
                
                .summary-table th,
                .summary-table td {
                    min-width: 80px;
                    padding: 4px;
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
                        <h2>👥 Thành viên nhóm (\${data.totalMembers + data.totalOperators})</h2>
                        
                        <div class="table-container">
                            <table class="members-table">
                                <thead>
                                    <tr>
                                        <th>Tên</th>
                                        <th>Username</th>
                                        <th>Link Telegram</th>
                                        <th>Vai trò</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${data.members.map(member => \`
                                        <tr>
                                            <td>\${member.fullName}</td>
                                            <td>@\${member.username}</td>
                                            <td>
                                                \${member.telegramLink 
                                                    ? \`<a href="\${member.telegramLink}" target="_blank" class="telegram-link">Mở Telegram</a>\`
                                                    : '<span class="no-link">Không có link</span>'
                                                }
                                            </td>
                                            <td><span class="role-badge">\${member.statusText}</span></td>
                                        </tr>
                                    \`).join('')}
                                    \${data.operators.map(op => \`
                                        <tr>
                                            <td>\${op.fullName}</td>
                                            <td>@\${op.username || 'Không có'}</td>
                                            <td>
                                                \${op.telegramLink 
                                                    ? \`<a href="\${op.telegramLink}" target="_blank" class="telegram-link">Mở Telegram</a>\`
                                                    : '<span class="no-link">Không có link</span>'
                                                }
                                            </td>
                                            <td><span class="role-badge operator">\${op.statusText}</span></td>
                                        </tr>
                                    \`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                \`;
                
                document.getElementById('content').innerHTML += membersHTML;
            }
            
            async function loadTransactions(page = 1, filters = {}) {
                try {
                    const params = new URLSearchParams({
                        page: page.toString(),
                        limit: '50',
                        ...filters
                    });
                    
                    const response = await fetch(\`/api/groups/\${chatId}/transactions?\${params}\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayTransactions(data);
                        await loadDailySummary(filters);
                        currentPage = page;
                        currentFilters = filters;
                    }
                } catch (error) {
                    console.error('Error loading transactions:', error);
                }
            }

            async function loadDailySummary(filters = {}) {
                try {
                    const params = new URLSearchParams({
                        ...filters
                    });
                    
                    const response = await fetch(\`/api/groups/\${chatId}/daily-summary?\${params}\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayDailySummary(data);
                    }
                } catch (error) {
                    console.error('Error loading daily summary:', error);
                }
            }

            function displayDailySummary(data) {
                const summaryHTML = \`
                    <div class="summary-section">
                        <h3>📊 Tổng kết theo ngày</h3>
                        
                        <div class="summary-filters">
                            <div class="filter-group">
                                <label>Từ ngày:</label>
                                <input type="date" id="summaryStartDate" value="\${data.filters.startDate || ''}" 
                                       onchange="applySummaryFilters()">
                            </div>
                            <div class="filter-group">
                                <label>Đến ngày:</label>
                                <input type="date" id="summaryEndDate" value="\${data.filters.endDate || ''}" 
                                       onchange="applySummaryFilters()">
                            </div>
                            <div class="filter-group">
                                <button onclick="clearSummaryFilters()" class="clear-btn">🧹 Xóa</button>
                            </div>
                        </div>
                        
                        <div class="table-container">
                            <table class="summary-table">
                                <thead>
                                    <tr>
                                        <th>Ngày</th>
                                        <th>Nạp (VND)</th>
                                        <th>Rút (VND)</th>
                                        <th>Nạp (USDT)</th>
                                        <th>Rút (USDT)</th>
                                        <th>Đã trả (USDT)</th>
                                        <th>Còn lại (USDT)</th>
                                        <th>Rate (%)</th>
                                        <th>Tỷ giá</th>
                                        <th>Giao dịch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${data.dailySummary.map(day => \`
                                        <tr>
                                            <td><strong>\${formatDate(day.date)}</strong></td>
                                            <td class="amount positive">\${formatNumber(day.deposits.amount)}</td>
                                            <td class="amount negative">\${formatNumber(day.withdraws.amount)}</td>
                                            <td class="amount positive">\${formatNumber(day.deposits.usdtAmount)}</td>
                                            <td class="amount negative">\${formatNumber(day.withdraws.usdtAmount)}</td>
                                            <td class="amount paid">\${formatNumber(day.totalPaid)}</td>
                                            <td class="amount remaining">\${formatNumber(day.remaining)}</td>
                                            <td>\${day.avgRate.toFixed(2)}%</td>
                                            <td>\${formatNumber(day.avgExchangeRate)}</td>
                                            <td class="transaction-count">\${day.transactionCount}</td>
                                        </tr>
                                    \`).join('')}
                                </tbody>
                                <tfoot>
                                    <tr class="total-row">
                                        <td><strong>TỔNG CỘNG</strong></td>
                                        <td class="amount positive"><strong>\${formatNumber(data.grandTotal.totalVND)}</strong></td>
                                        <td class="amount">-</td>
                                        <td class="amount positive"><strong>\${formatNumber(data.grandTotal.totalUSDT)}</strong></td>
                                        <td class="amount">-</td>
                                        <td class="amount paid"><strong>\${formatNumber(data.grandTotal.totalPaid)}</strong></td>
                                        <td class="amount remaining"><strong>\${formatNumber(data.grandTotal.remaining)}</strong></td>
                                        <td><strong>\${data.grandTotal.avgRate.toFixed(2)}%</strong></td>
                                        <td><strong>\${formatNumber(data.grandTotal.avgExchangeRate)}</strong></td>
                                        <td class="transaction-count"><strong>\${data.dailySummary.reduce((sum, day) => sum + day.transactionCount, 0)}</strong></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                \`;
                
                // Insert summary before transactions
                const existingSummary = document.querySelector('.summary-section');
                if (existingSummary) {
                    existingSummary.outerHTML = summaryHTML;
                } else {
                    const transactionSection = document.querySelector('.section:last-child');
                    if (transactionSection) {
                        transactionSection.insertAdjacentHTML('beforebegin', summaryHTML);
                    }
                }
            }
            
            let currentFilters = {};
            
            function displayTransactions(data) {
                const transactionsHTML = \`
                    <div class="section">
                        <h2>💰 Giao dịch chi tiết</h2>
                        
                        <!-- Summary Info -->
                        <div class="transaction-summary-info">
                            <div class="summary-item">
                                <span class="label">Tổng VND:</span>
                                <span class="value">\${formatNumber(data.summary.totalVND)}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">Tổng USDT:</span>
                                <span class="value">\${formatNumber(data.summary.totalUSDT)}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">Đã trả:</span>
                                <span class="value paid">\${formatNumber(data.summary.totalPaid)}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">Còn lại:</span>
                                <span class="value remaining">\${formatNumber(data.summary.remaining)}</span>
                            </div>
                        </div>
                        
                        <!-- Filters -->
                        <div class="filters-container">
                            <div class="filter-row">
                                <div class="filter-group">
                                    <label>Từ ngày:</label>
                                    <input type="date" id="startDate" value="\${data.filters.startDate || ''}" 
                                           onchange="applyFilters()">
                                </div>
                                <div class="filter-group">
                                    <label>Đến ngày:</label>
                                    <input type="date" id="endDate" value="\${data.filters.endDate || ''}" 
                                           onchange="applyFilters()">
                                </div>
                                <div class="filter-group">
                                    <label>Loại giao dịch:</label>
                                    <select id="typeFilter" onchange="applyFilters()">
                                        <option value="all">Tất cả</option>
                                        \${data.uniqueTypes.map(type => \`
                                            <option value="\${type}" \${data.filters.type === type ? 'selected' : ''}>
                                                \${getTransactionType(type)}
                                            </option>
                                        \`).join('')}
                                    </select>
                                </div>
                                <div class="filter-group">
                                    <label>Người thực hiện:</label>
                                    <select id="senderFilter" onchange="applyFilters()">
                                        <option value="all">Tất cả</option>
                                        \${data.uniqueSenders.map(sender => \`
                                            <option value="\${sender}" \${data.filters.senderName === sender ? 'selected' : ''}>
                                                \${sender}
                                            </option>
                                        \`).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="filter-row">
                                <div class="filter-group search-group">
                                    <label>Tìm kiếm:</label>
                                    <div class="search-input-container">
                                        <input type="text" id="searchInput" placeholder="Tìm trong nội dung hoặc tên người gửi..."
                                               value="\${data.filters.search || ''}" onkeyup="handleSearch(event)">
                                        <button onclick="applyFilters()" class="search-btn">🔍</button>
                                    </div>
                                </div>
                                <div class="filter-group">
                                    <button onclick="clearFilters()" class="clear-btn">🧹 Xóa bộ lọc</button>
                                </div>
                                <div class="filter-group">
                                    <button onclick="exportToExcel()" class="export-btn">📊 Xuất Excel</button>
                                </div>
                            </div>
                        </div>
                        
                        <p class="transaction-summary">
                            Tổng: \${formatNumber(data.totalTransactions)} giao dịch (Trang \${data.currentPage}/\${data.totalPages})
                        </p>
                        
                        <div class="table-container">
                            \${Object.keys(data.transactionsByDate).map(date => \`
                                <div class="transaction-date">
                                    📅 \${formatDate(date)} (\${data.transactionsByDate[date].length} giao dịch)
                                </div>
                                <table class="transactions-table">
                                    <thead>
                                        <tr>
                                            <th onclick="sortTable(0, this)">Loại <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(1, this)">Số tiền <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(2, this)">USDT <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(3, this)">Người thực hiện <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(4, this)">Nội dung <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(5, this)">Đã trả <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(6, this)">Còn lại <span class="sort-icon">⇅</span></th>
                                            <th onclick="sortTable(7, this)">Thời gian <span class="sort-icon">⇅</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        \${data.transactionsByDate[date].map(transaction => \`
                                            <tr>
                                                <td><span class="transaction-type \${transaction.type}">\${getTransactionType(transaction.type)}</span></td>
                                                <td class="amount">\${formatNumber(transaction.amount)}</td>
                                                <td class="amount">\${formatNumber(transaction.usdtAmount)}</td>
                                                <td>\${transaction.senderName}</td>
                                                <td class="message">\${transaction.message}</td>
                                                <td class="amount paid">\${formatNumber(transaction.paidAmount)}</td>
                                                <td class="amount remaining">\${formatNumber(transaction.remainingAmount)}</td>
                                                <td>\${formatDateTime(transaction.timestamp)}</td>
                                            </tr>
                                        \`).join('')}
                                    </tbody>
                                </table>
                            \`).join('')}
                        </div>
                        
                        \${data.totalPages > 1 ? \`
                            <div class="pagination">
                                <button onclick="loadTransactions(\${Math.max(1, data.currentPage - 1)}, currentFilters)" 
                                        \${data.currentPage === 1 ? 'disabled' : ''}>
                                    ← Trước
                                </button>
                                <span>Trang \${data.currentPage} / \${data.totalPages}</span>
                                <button onclick="loadTransactions(\${Math.min(data.totalPages, data.currentPage + 1)}, currentFilters)" 
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
            
            function applySummaryFilters() {
                const filters = {
                    startDate: document.getElementById('summaryStartDate').value,
                    endDate: document.getElementById('summaryEndDate').value
                };
                
                // Remove empty filters
                Object.keys(filters).forEach(key => {
                    if (!filters[key]) {
                        delete filters[key];
                    }
                });
                
                loadDailySummary(filters);
            }
            
            function clearSummaryFilters() {
                document.getElementById('summaryStartDate').value = '';
                document.getElementById('summaryEndDate').value = '';
                loadDailySummary({});
            }
            
            function applyFilters() {
                const filters = {
                    startDate: document.getElementById('startDate').value,
                    endDate: document.getElementById('endDate').value,
                    type: document.getElementById('typeFilter').value,
                    senderName: document.getElementById('senderFilter').value,
                    search: document.getElementById('searchInput').value
                };
                
                // Remove empty filters
                Object.keys(filters).forEach(key => {
                    if (!filters[key] || filters[key] === 'all') {
                        delete filters[key];
                    }
                });
                
                loadTransactions(1, filters);
            }
            
            function clearFilters() {
                document.getElementById('startDate').value = '';
                document.getElementById('endDate').value = '';
                document.getElementById('typeFilter').value = 'all';
                document.getElementById('senderFilter').value = 'all';
                document.getElementById('searchInput').value = '';
                loadTransactions(1, {});
            }
            
            function exportToExcel() {
                const filters = {
                    startDate: document.getElementById('startDate').value,
                    endDate: document.getElementById('endDate').value,
                    type: document.getElementById('typeFilter').value,
                    senderName: document.getElementById('senderFilter').value,
                    search: document.getElementById('searchInput').value
                };
                
                // Remove empty filters
                Object.keys(filters).forEach(key => {
                    if (!filters[key] || filters[key] === 'all') {
                        delete filters[key];
                    }
                });
                
                // Tạo URL với query parameters
                const params = new URLSearchParams(filters);
                const exportUrl = \`/api/groups/\${chatId}/export-excel?\${params}\`;
                
                // Tạo link download và click
                const link = document.createElement('a');
                link.href = exportUrl;
                link.download = \`giao-dich-\${chatId}-\${new Date().toISOString().slice(0, 10)}.xlsx\`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            function handleSearch(event) {
                if (event.key === 'Enter') {
                    applyFilters();
                }
            }
            
            function sortTable(columnIndex, headerElement) {
                const table = headerElement.closest('table');
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                
                const isAscending = headerElement.dataset.sortDir !== 'asc';
                headerElement.dataset.sortDir = isAscending ? 'asc' : 'desc';
                
                // Update sort icon
                table.querySelectorAll('.sort-icon').forEach(icon => icon.textContent = '⇅');
                headerElement.querySelector('.sort-icon').textContent = isAscending ? '↑' : '↓';
                
                rows.sort((a, b) => {
                    const aValue = a.cells[columnIndex].textContent.trim();
                    const bValue = b.cells[columnIndex].textContent.trim();
                    
                    let result = 0;
                    if ([1, 2, 5, 6].includes(columnIndex)) { // Amount columns
                        result = parseFloat(aValue.replace(/[^\d.-]/g, '')) - parseFloat(bValue.replace(/[^\d.-]/g, ''));
                    } else if (columnIndex === 7) { // Date column
                        result = new Date(aValue) - new Date(bValue);
                    } else {
                        result = aValue.localeCompare(bValue);
                    }
                    
                    return isAscending ? result : -result;
                });
                
                tbody.innerHTML = '';
                rows.forEach(row => tbody.appendChild(row));
            }
            
            function getTransactionType(type) {
                switch (type) {
                    case 'plus':
                    case 'deposit': return '➕ Nạp';
                    case 'minus':
                    case 'withdraw': return '➖ Rút';
                    case 'percent':
                    case 'payment': return '💰 Trả';
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

// Route hiển thị trang message logs
app.get('/messagelogs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Message Logs - Nhật ký tin nhắn</title>
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
                background: #8e44ad;
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
                color: #8e44ad;
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
                background: #9b59b6;
                color: white;
                font-weight: normal;
            }
            
            .groups-table tr:hover {
                background: #f8f9fa;
            }
            
            .detail-btn {
                background: #e67e22;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
            }
            
            .detail-btn:hover {
                background: #d35400;
            }
            
            .refresh-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #8e44ad;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 12px 16px;
                cursor: pointer;
            }
            
            .refresh-btn:hover {
                background: #9b59b6;
            }
            
            .error {
                text-align: center;
                padding: 40px;
                color: #e74c3c;
            }
            
            /* Mobile-first responsive design for messagelogs */
            .mobile-card {
                display: none;
            }
            
            .table-wrapper {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
            
            @media (max-width: 768px) {
                body {
                    padding: 10px;
                }
                
                .container {
                    margin: 0;
                    border-radius: 0;
                }
                
                .header {
                    padding: 15px;
                }
                
                .header h1 {
                    font-size: 1.4em;
                }
                
                .stats {
                    flex-direction: column;
                    gap: 15px;
                    padding: 20px 15px;
                }
                
                .stat-item {
                    background: white;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .stat-number {
                    font-size: 1.8em;
                }
                
                .stat-label {
                    font-size: 1em;
                    margin-top: 8px;
                }
                
                /* Hide table, show cards on mobile */
                .groups-table {
                    display: none;
                }
                
                .mobile-card {
                    display: block;
                }
                
                .message-card {
                    background: white;
                    margin: 10px 0;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    border-left: 4px solid #8e44ad;
                }
                
                .message-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 15px;
                }
                
                .message-title {
                    font-size: 1.1em;
                    font-weight: bold;
                    color: #8e44ad;
                    margin: 0;
                    flex: 1;
                    margin-right: 10px;
                }
                
                .message-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-bottom: 15px;
                }
                
                .message-stat {
                    text-align: center;
                    padding: 10px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                
                .message-stat-value {
                    font-size: 1.2em;
                    font-weight: bold;
                    color: #8e44ad;
                }
                
                .message-stat-label {
                    font-size: 0.8em;
                    color: #7f8c8d;
                    margin-top: 5px;
                }
                
                .detail-btn {
                    width: 100%;
                    padding: 12px;
                    font-size: 1em;
                    border-radius: 8px;
                    font-weight: bold;
                }
                
                .refresh-btn {
                    bottom: 15px;
                    right: 15px;
                    padding: 15px;
                    border-radius: 50px;
                    font-size: 1.1em;
                }
                
                .loading, .error {
                    padding: 20px;
                    margin: 15px;
                }
            }
            
            @media (max-width: 480px) {
                .message-stats {
                    grid-template-columns: 1fr;
                    gap: 10px;
                }
                
                .message-card {
                    padding: 15px;
                    margin: 8px 0;
                }
                
                .stat-number {
                    font-size: 1.5em;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💬 Message Logs - Nhật ký tin nhắn</h1>
                <p>Thống kê tin nhắn các nhóm</p>
            </div>
            
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number" id="totalGroups">-</div>
                    <div class="stat-label">Tổng số nhóm</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="totalMessages">-</div>
                    <div class="stat-label">Tổng tin nhắn</div>
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
        
        <button class="refresh-btn" onclick="loadMessageLogs()">🔄 Làm mới</button>
        
        <script>
            function formatNumber(num) {
                if (num === 0) return '0';
                return new Intl.NumberFormat('vi-VN').format(num);
            }
            
            function formatDate(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleDateString('vi-VN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            
            async function loadMessageLogs() {
                try {
                    const response = await fetch('/api/messagelogs');
                    const data = await response.json();
                    
                    if (data.success) {
                        displayGroups(data.groups);
                        updateStats(data.groups);
                    } else {
                        document.getElementById('content').innerHTML = 
                            '<div class="error">❌ Không thể tải dữ liệu message logs</div>';
                    }
                } catch (error) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function updateStats(groups) {
                const totalGroups = groups.length;
                const totalMessages = groups.reduce((sum, group) => sum + group.messageCount, 0);
                const totalMembers = groups.reduce((sum, group) => sum + group.memberCount, 0);
                
                document.getElementById('totalGroups').textContent = formatNumber(totalGroups);
                document.getElementById('totalMessages').textContent = formatNumber(totalMessages);
                document.getElementById('totalMembers').textContent = formatNumber(totalMembers);
            }
            
            function displayGroups(groups) {
                if (groups.length === 0) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">📭 Không tìm thấy nhóm nào có message logs</div>';
                    return;
                }
                
                // Desktop table
                const tableHTML = \`
                    <div class="table-wrapper">
                        <table class="groups-table">
                            <thead>
                                <tr>
                                    <th>Tên nhóm</th>
                                    <th>Thành viên</th>
                                    <th>Tin nhắn</th>
                                    <th>Tin nhắn đầu</th>
                                    <th>Tin nhắn cuối</th>
                                    <th>Chi tiết</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${groups.map(group => \`
                                    <tr>
                                        <td>\${group.title}</td>
                                        <td>\${formatNumber(group.memberCount)}</td>
                                        <td>\${formatNumber(group.messageCount)}</td>
                                        <td>\${formatDate(group.firstMessage)}</td>
                                        <td>\${formatDate(group.lastMessage)}</td>
                                        <td>
                                            <button class="detail-btn" onclick="viewDetails('\${group.chatId}')">
                                                Xem tin nhắn
                                            </button>
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    </div>
                \`;
                
                // Mobile cards
                const mobileHTML = \`
                    <div class="mobile-card">
                        \${groups.map(group => \`
                            <div class="message-card">
                                <div class="message-card-header">
                                    <h3 class="message-title">\${group.title}</h3>
                                </div>
                                <div class="message-stats">
                                    <div class="message-stat">
                                        <div class="message-stat-value">\${formatNumber(group.memberCount)}</div>
                                        <div class="message-stat-label">Thành viên</div>
                                    </div>
                                    <div class="message-stat">
                                        <div class="message-stat-value">\${formatNumber(group.messageCount)}</div>
                                        <div class="message-stat-label">Tin nhắn</div>
                                    </div>
                                    <div class="message-stat">
                                        <div class="message-stat-value">\${formatDate(group.firstMessage)}</div>
                                        <div class="message-stat-label">Tin nhắn đầu</div>
                                    </div>
                                    <div class="message-stat">
                                        <div class="message-stat-value">\${formatDate(group.lastMessage)}</div>
                                        <div class="message-stat-label">Tin nhắn cuối</div>
                                    </div>
                                </div>
                                <button class="detail-btn" onclick="viewDetails('\${group.chatId}')">
                                    💬 Xem tin nhắn
                                </button>
                            </div>
                        \`).join('')}
                    </div>
                \`;
                
                document.getElementById('content').innerHTML = tableHTML + mobileHTML;
            }
            
            function viewDetails(chatId) {
                window.location.href = \`/messagelogs/\${chatId}\`;
            }
            
            // Tải dữ liệu khi trang được load
            loadMessageLogs();
            
            // Tự động làm mới mỗi 5 phút
            setInterval(loadMessageLogs, 300000);
        </script>
    </body>
    </html>
  `);
});

// Route hiển thị chi tiết message logs của một nhóm
app.get('/messagelogs/:chatId', async (req, res) => {
  const { chatId } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chi tiết Message Logs</title>
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
                line-height: 1.6;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            
            .header {
                background: #8e44ad;
                color: white;
                padding: 20px;
                text-align: center;
            }
            
            .header h1 {
                font-size: 1.8em;
                margin-bottom: 5px;
            }
            
            .back-btn {
                position: absolute;
                left: 20px;
                top: 20px;
                background: rgba(255,255,255,0.2);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
            }
            
            .back-btn:hover {
                background: rgba(255,255,255,0.3);
            }
            
            .filters {
                padding: 20px;
                background: #ecf0f1;
                border-bottom: 1px solid #ddd;
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                align-items: center;
            }
            
            .filter-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            .filter-group label {
                font-size: 0.9em;
                color: #7f8c8d;
                font-weight: bold;
            }
            
            .filter-group input,
            .filter-group select {
                padding: 8px 12px;
                border: 1px solid #bdc3c7;
                border-radius: 4px;
                font-size: 0.9em;
            }
            
            .filter-btn,
            .clear-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
            }
            
            .filter-btn {
                background: #8e44ad;
                color: white;
            }
            
            .filter-btn:hover {
                background: #9b59b6;
            }
            
            .clear-btn {
                background: #95a5a6;
                color: white;
            }
            
            .clear-btn:hover {
                background: #7f8c8d;
            }
            
            .stats {
                display: flex;
                justify-content: space-around;
                padding: 15px;
                background: #f8f9fa;
                border-bottom: 1px solid #ddd;
            }
            
            .stat-item {
                text-align: center;
            }
            
            .stat-number {
                font-size: 1.3em;
                font-weight: bold;
                color: #8e44ad;
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
            
            .messages-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            .messages-table th,
            .messages-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ddd;
                vertical-align: top;
            }
            
            .messages-table th {
                background: #9b59b6;
                color: white;
                font-weight: normal;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            .messages-table tr:hover {
                background: #f8f9fa;
            }
            
            .message-content {
                max-width: 300px;
                word-wrap: break-word;
                white-space: pre-wrap;
            }
            
            .message-media {
                color: #e67e22;
                font-style: italic;
            }
            
            .pagination {
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
                gap: 10px;
            }
            
            .pagination button {
                padding: 8px 12px;
                border: 1px solid #bdc3c7;
                background: white;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .pagination button:hover:not(:disabled) {
                background: #ecf0f1;
            }
            
            .pagination button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .pagination .current-page {
                background: #8e44ad;
                color: white;
                border-color: #8e44ad;
            }
            
            .error {
                text-align: center;
                padding: 40px;
                color: #e74c3c;
            }
            
            /* Mobile cards for messages detail */
            .mobile-message-card {
                display: none;
            }
            
            @media (max-width: 768px) {
                body {
                    padding: 10px;
                }
                
                .container {
                    margin: 0;
                    border-radius: 0;
                }
                
                .header {
                    padding: 15px;
                    position: relative;
                }
                
                .header h1 {
                    font-size: 1.3em;
                    margin: 30px 0 10px 0;
                }
                
                .back-btn {
                    position: absolute;
                    left: 15px;
                    top: 15px;
                    font-size: 0.9em;
                    padding: 6px 12px;
                }
                
                .filters {
                    padding: 15px;
                    flex-direction: column;
                    align-items: stretch;
                    gap: 12px;
                }
                
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    align-items: stretch;
                    gap: 5px;
                }
                
                .filter-group label {
                    font-size: 0.9em;
                    font-weight: bold;
                }
                
                .filter-group input,
                .filter-group select {
                    padding: 10px;
                    font-size: 1em;
                    border-radius: 6px;
                }
                
                .filter-btn,
                .clear-btn {
                    padding: 12px 16px;
                    font-size: 1em;
                    border-radius: 6px;
                    margin-top: 5px;
                }
                
                .stats {
                    padding: 15px;
                    flex-direction: row;
                    justify-content: space-around;
                }
                
                .stat-item {
                    flex: 1;
                    margin: 0 5px;
                }
                
                .stat-number {
                    font-size: 1.2em;
                }
                
                .stat-label {
                    font-size: 0.8em;
                }
                
                /* Hide table, show cards on mobile */
                .messages-table {
                    display: none;
                }
                
                .mobile-message-card {
                    display: block;
                    padding: 15px;
                }
                
                .message-item {
                    background: white;
                    margin: 10px 0;
                    padding: 15px;
                    border-radius: 10px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                    border-left: 3px solid #8e44ad;
                }
                
                .message-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    font-size: 0.9em;
                    color: #7f8c8d;
                }
                
                .message-sender {
                    font-weight: bold;
                    color: #8e44ad;
                }
                
                .message-time {
                    font-size: 0.8em;
                    color: #95a5a6;
                }
                
                .message-content-mobile {
                    line-height: 1.4;
                    color: #2c3e50;
                    margin-bottom: 8px;
                }
                
                .message-media-mobile {
                    color: #e67e22;
                    font-style: italic;
                    font-size: 0.9em;
                }
                
                .pagination {
                    flex-wrap: wrap;
                    padding: 15px;
                }
                
                .pagination button {
                    margin: 2px;
                    padding: 10px 12px;
                    font-size: 0.9em;
                }
                
                .loading, .error {
                    padding: 20px;
                    margin: 15px;
                }
            }
            
            @media (max-width: 480px) {
                .header h1 {
                    font-size: 1.1em;
                }
                
                .stats {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .stat-item {
                    margin: 0;
                    background: white;
                    padding: 10px;
                    border-radius: 6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .message-item {
                    padding: 12px;
                    margin: 8px 0;
                }
                
                .message-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 5px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header" style="position: relative;">
                <button class="back-btn" onclick="window.location.href='/messagelogs'">← Quay lại</button>
                <h1>💬 Chi tiết Message Logs</h1>
                <p id="groupTitle">Đang tải...</p>
            </div>
            
            <div class="filters">
                <div class="filter-group">
                    <label>Từ ngày:</label>
                    <input type="date" id="startDate">
                </div>
                <div class="filter-group">
                    <label>Đến ngày:</label>
                    <input type="date" id="endDate">
                </div>
                <div class="filter-group">
                    <label>Người gửi:</label>
                    <select id="senderFilter">
                        <option value="">Tất cả</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Tìm kiếm:</label>
                    <input type="text" id="searchInput" placeholder="Tìm trong nội dung...">
                </div>
                <div class="filter-group">
                    <button class="filter-btn" onclick="applyFilters()">🔍 Lọc</button>
                    <button class="clear-btn" onclick="clearFilters()">🗑️ Xóa</button>
                </div>
            </div>
            
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number" id="totalMessages">-</div>
                    <div class="stat-label">Tổng tin nhắn</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="currentPage">-</div>
                    <div class="stat-label">Trang hiện tại</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="totalPages">-</div>
                    <div class="stat-label">Tổng số trang</div>
                </div>
            </div>
            
            <div id="content">
                <div class="loading">
                    <div>⏳ Đang tải dữ liệu...</div>
                </div>
            </div>
            
            <div id="pagination" class="pagination" style="display: none;"></div>
        </div>
        
        <script>
            const chatId = '${chatId}';
            let currentFilters = {
                page: 1,
                limit: 50,
                startDate: '',
                endDate: '',
                sender: '',
                search: '',
                sortBy: 'timestamp',
                sortOrder: 'desc'
            };
            
            function formatNumber(num) {
                if (num === 0) return '0';
                return new Intl.NumberFormat('vi-VN').format(num);
            }
            
            function formatDateTime(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleDateString('vi-VN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }
            
            async function loadMessageLogs() {
                try {
                    const params = new URLSearchParams();
                    Object.keys(currentFilters).forEach(key => {
                        if (currentFilters[key]) {
                            params.append(key, currentFilters[key]);
                        }
                    });
                    
                    const response = await fetch(\`/api/messagelogs/\${chatId}?\${params}\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayMessageLogs(data.messageLogs);
                        updateStats(data.pagination);
                        updatePagination(data.pagination);
                        updateGroupTitle(data.groupInfo);
                        updateFilters(data.filters);
                    } else {
                        document.getElementById('content').innerHTML = 
                            '<div class="error">❌ Không thể tải dữ liệu message logs</div>';
                    }
                } catch (error) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function updateGroupTitle(groupInfo) {
                document.getElementById('groupTitle').textContent = groupInfo.title;
                document.title = \`Message Logs - \${groupInfo.title}\`;
            }
            
            function updateStats(pagination) {
                document.getElementById('totalMessages').textContent = formatNumber(pagination.totalCount);
                document.getElementById('currentPage').textContent = formatNumber(pagination.currentPage);
                document.getElementById('totalPages').textContent = formatNumber(pagination.totalPages);
            }
            
            function updateFilters(filters) {
                const senderSelect = document.getElementById('senderFilter');
                senderSelect.innerHTML = '<option value="">Tất cả</option>';
                filters.senders.forEach(sender => {
                    const option = document.createElement('option');
                    option.value = sender;
                    option.textContent = sender;
                    if (sender === currentFilters.sender) {
                        option.selected = true;
                    }
                    senderSelect.appendChild(option);
                });
            }
            
            function displayMessageLogs(messages) {
                if (messages.length === 0) {
                    document.getElementById('content').innerHTML = 
                        '<div class="error">📭 Không tìm thấy tin nhắn nào</div>';
                    return;
                }
                
                // Desktop table
                const tableHTML = \`
                    <div class="table-wrapper">
                        <table class="messages-table">
                            <thead>
                                <tr>
                                    <th>Thời gian</th>
                                    <th>Người gửi</th>
                                    <th>Username</th>
                                    <th>Nội dung</th>
                                    <th>Media</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${messages.map(message => {
                                    let content = message.content || '';
                                    if (content.length > 200) {
                                        content = content.substring(0, 200) + '...';
                                    }
                                    
                                    let mediaInfo = '';
                                    if (message.photoUrl) mediaInfo += '📷 Ảnh ';
                                    if (message.videoUrl) mediaInfo += '🎥 Video ';
                                    if (message.voiceUrl) mediaInfo += '🎵 Voice ';
                                    if (message.documentUrl) mediaInfo += '📄 File ';
                                    
                                    return \`
                                        <tr>
                                            <td>\${formatDateTime(message.timestamp)}</td>
                                            <td>\${message.senderName || 'Không xác định'}</td>
                                            <td>@\${message.username || 'N/A'}</td>
                                            <td class="message-content">\${content}</td>
                                            <td class="message-media">\${mediaInfo}</td>
                                        </tr>
                                    \`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                \`;
                
                // Mobile cards
                const mobileHTML = \`
                    <div class="mobile-message-card">
                        \${messages.map(message => {
                            let content = message.content || '';
                            if (content.length > 150) {
                                content = content.substring(0, 150) + '...';
                            }
                            
                            let mediaInfo = '';
                            if (message.photoUrl) mediaInfo += '📷 Ảnh ';
                            if (message.videoUrl) mediaInfo += '🎥 Video ';
                            if (message.voiceUrl) mediaInfo += '🎵 Voice ';
                            if (message.documentUrl) mediaInfo += '📄 File ';
                            
                            return \`
                                <div class="message-item">
                                    <div class="message-header">
                                        <div>
                                            <span class="message-sender">\${message.senderName || 'Không xác định'}</span>
                                            <span style="color: #bdc3c7; margin: 0 8px;">•</span>
                                            <span>@\${message.username || 'N/A'}</span>
                                        </div>
                                        <div class="message-time">\${formatDateTime(message.timestamp)}</div>
                                    </div>
                                    \${content ? \`<div class="message-content-mobile">\${content}</div>\` : ''}
                                    \${mediaInfo ? \`<div class="message-media-mobile">\${mediaInfo}</div>\` : ''}
                                </div>
                            \`;
                        }).join('')}
                    </div>
                \`;
                
                document.getElementById('content').innerHTML = tableHTML + mobileHTML;
            }
            
            function updatePagination(pagination) {
                const paginationDiv = document.getElementById('pagination');
                
                if (pagination.totalPages <= 1) {
                    paginationDiv.style.display = 'none';
                    return;
                }
                
                paginationDiv.style.display = 'flex';
                
                let paginationHTML = '';
                
                // Previous button
                paginationHTML += \`
                    <button onclick="goToPage(\${pagination.currentPage - 1})" 
                            \${pagination.currentPage <= 1 ? 'disabled' : ''}>
                        ← Trước
                    </button>
                \`;
                
                // Page numbers
                for (let i = Math.max(1, pagination.currentPage - 2); 
                     i <= Math.min(pagination.totalPages, pagination.currentPage + 2); 
                     i++) {
                    paginationHTML += \`
                        <button onclick="goToPage(\${i})" 
                                class="\${i === pagination.currentPage ? 'current-page' : ''}">
                            \${i}
                        </button>
                    \`;
                }
                
                // Next button
                paginationHTML += \`
                    <button onclick="goToPage(\${pagination.currentPage + 1})" 
                            \${pagination.currentPage >= pagination.totalPages ? 'disabled' : ''}>
                        Sau →
                    </button>
                \`;
                
                paginationDiv.innerHTML = paginationHTML;
            }
            
            function goToPage(page) {
                currentFilters.page = page;
                loadMessageLogs();
            }
            
            function applyFilters() {
                currentFilters.page = 1;
                currentFilters.startDate = document.getElementById('startDate').value;
                currentFilters.endDate = document.getElementById('endDate').value;
                currentFilters.sender = document.getElementById('senderFilter').value;
                currentFilters.search = document.getElementById('searchInput').value;
                loadMessageLogs();
            }
            
            function clearFilters() {
                document.getElementById('startDate').value = '';
                document.getElementById('endDate').value = '';
                document.getElementById('senderFilter').value = '';
                document.getElementById('searchInput').value = '';
                
                currentFilters = {
                    page: 1,
                    limit: 50,
                    startDate: '',
                    endDate: '',
                    sender: '',
                    search: '',
                    sortBy: 'timestamp',
                    sortOrder: 'desc'
                };
                
                loadMessageLogs();
            }
            
            // Tải dữ liệu khi trang được load
            loadMessageLogs();
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