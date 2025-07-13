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
            
            .message-btn {
                background: #27ae60;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                margin-left: 5px;
            }
            
            .message-btn:hover {
                background: #229954;
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
            }
            
            .modal-content {
                background-color: white;
                margin: 2% auto;
                padding: 0;
                border-radius: 8px;
                width: 90%;
                max-width: 1000px;
                height: 85vh;
                display: flex;
                flex-direction: column;
            }
            
            .modal-header {
                background: #2c3e50;
                color: white;
                padding: 20px;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .modal-header h2 {
                margin: 0;
                font-size: 1.5em;
            }
            
            .close {
                color: white;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                line-height: 1;
            }
            
            .close:hover {
                color: #bdc3c7;
            }
            
            .modal-body {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
            }
            
            .messages-search {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 20px;
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .messages-search input {
                flex: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 0.9em;
            }
            
            .messages-search button {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .message-date {
                background: #2c3e50;
                color: white;
                padding: 10px;
                margin: 20px 0 10px 0;
                border-radius: 4px;
                font-weight: bold;
            }
            
            .message-item {
                background: white;
                border: 1px solid #ddd;
                border-radius: 6px;
                margin-bottom: 10px;
                padding: 15px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .message-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #eee;
            }
            
            .message-sender {
                font-weight: bold;
                color: #2c3e50;
            }
            
            .message-time {
                color: #7f8c8d;
                font-size: 0.9em;
            }
            
            .message-content {
                color: #333;
                line-height: 1.5;
                word-wrap: break-word;
            }
            
            .message-media {
                margin-top: 10px;
            }
            
            .message-media img {
                max-width: 300px;
                border-radius: 4px;
            }
            
            .message-media a {
                color: #3498db;
                text-decoration: none;
                margin-right: 10px;
            }
            
            .modal-pagination {
                text-align: center;
                padding: 15px;
                border-top: 1px solid #ddd;
                background: #f8f9fa;
            }
            
            .modal-pagination button {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 16px;
                margin: 0 5px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .modal-pagination button:hover {
                background: #2980b9;
            }
            
            .modal-pagination button:disabled {
                background: #bdc3c7;
                cursor: not-allowed;
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
            
            function formatDateTime(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleString('vi-VN');
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
                                <th>Thao tác</th>
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
                                        <button class="message-btn" onclick="viewMessages('\${group.chatId}')">
                                            Tin nhắn
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
            
            function viewMessages(chatId) {
                // Open the modal
                document.getElementById('modal').style.display = 'block';
                // Load messages for the selected group
                loadMessages(chatId);
            }
            
            let currentMessagesPage = 1;
            let currentChatId = '';
            
            async function loadMessages(chatId, page = 1, search = '') {
                currentChatId = chatId;
                currentMessagesPage = page;
                
                try {
                    const params = new URLSearchParams({
                        page: page.toString(),
                        limit: '20'
                    });
                    
                    if (search) {
                        params.append('search', search);
                    }
                    
                    const response = await fetch(\`/api/groups/\${chatId}/messages?\${params}\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        displayMessages(data);
                        updatePagination(data.currentPage, data.totalPages);
                    } else {
                        document.getElementById('messagesContainer').innerHTML = 
                            '<div class="error">❌ Không thể tải tin nhắn</div>';
                    }
                } catch (error) {
                    document.getElementById('messagesContainer').innerHTML = 
                        '<div class="error">❌ Lỗi kết nối: ' + error.message + '</div>';
                }
            }
            
            function displayMessages(data) {
                if (data.totalMessages === 0) {
                    document.getElementById('messagesContainer').innerHTML = 
                        '<div class="error">📭 Không tìm thấy tin nhắn nào</div>';
                    return;
                }
                
                const messagesHTML = \`
                    <div class="messages-summary">
                        <p>Tổng: \${formatNumber(data.totalMessages)} tin nhắn (Trang \${data.currentPage}/\${data.totalPages})</p>
                    </div>
                    
                    \${Object.keys(data.messagesByDate).map(date => \`
                        <div class="message-date">
                            📅 \${formatDate(date)} (\${data.messagesByDate[date].length} tin nhắn)
                        </div>
                        \${data.messagesByDate[date].map(message => \`
                            <div class="message-item">
                                <div class="message-header">
                                    <span class="message-sender">\${message.senderName}</span>
                                    <span class="message-time">\${formatDateTime(message.timestamp)}</span>
                                </div>
                                <div class="message-content">
                                    \${message.content || '<em>Tin nhắn không có nội dung</em>'}
                                </div>
                                \${message.photoUrl || message.videoUrl || message.voiceUrl || message.documentUrl ? \`
                                    <div class="message-media">
                                        \${message.photoUrl ? \`<a href="\${message.photoUrl}" target="_blank">📷 Ảnh</a>\` : ''}
                                        \${message.videoUrl ? \`<a href="\${message.videoUrl}" target="_blank">🎥 Video</a>\` : ''}
                                        \${message.voiceUrl ? \`<a href="\${message.voiceUrl}" target="_blank">🎤 Voice</a>\` : ''}
                                        \${message.documentUrl ? \`<a href="\${message.documentUrl}" target="_blank">📄 File</a>\` : ''}
                                    </div>
                                \` : ''}
                            </div>
                        \`).join('')}
                    \`).join('')}
                \`;
                
                document.getElementById('messagesContainer').innerHTML = messagesHTML;
            }
            
            function updatePagination(current, total) {
                document.getElementById('currentPage').textContent = current;
                document.getElementById('totalPages').textContent = total;
                
                const prevBtn = document.querySelector('.modal-pagination button:first-child');
                const nextBtn = document.querySelector('.modal-pagination button:last-child');
                
                prevBtn.disabled = current === 1;
                nextBtn.disabled = current === total;
            }
            
            function previousPage() {
                if (currentMessagesPage > 1) {
                    const search = document.getElementById('searchInput').value;
                    loadMessages(currentChatId, currentMessagesPage - 1, search);
                }
            }
            
            function nextPage() {
                const totalPages = parseInt(document.getElementById('totalPages').textContent);
                if (currentMessagesPage < totalPages) {
                    const search = document.getElementById('searchInput').value;
                    loadMessages(currentChatId, currentMessagesPage + 1, search);
                }
            }
            
            function searchMessages() {
                const search = document.getElementById('searchInput').value;
                loadMessages(currentChatId, 1, search);
            }
            
            function closeModal() {
                document.getElementById('modal').style.display = 'none';
            }
            
            // Close modal when clicking outside of it
            window.onclick = function(event) {
                const modal = document.getElementById('modal');
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            }
            
            // Handle enter key in search input
            document.addEventListener('DOMContentLoaded', function() {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.addEventListener('keyup', function(event) {
                        if (event.key === 'Enter') {
                            searchMessages();
                        }
                    });
                }
            });
            
            // Tải dữ liệu khi trang được load
            loadGroups();
            
            // Tự động làm mới mỗi 5 phút
            setInterval(loadGroups, 300000);
        </script>
        
        <!-- Modal -->
        <div id="modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Tin nhắn</h2>
                    <span class="close" onclick="closeModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="messages-search">
                        <input type="text" id="searchInput" placeholder="Tìm kiếm tin nhắn...">
                        <button onclick="searchMessages()">Tìm</button>
                    </div>
                    <div id="messagesContainer"></div>
                    <div class="modal-pagination">
                        <button onclick="previousPage()" disabled>Trước</button>
                        <span id="currentPage">1</span> / <span id="totalPages">1</span>
                        <button onclick="nextPage()">Sau</button>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            const chatId = '${chatId}';
            let currentPage = 1;
            let totalPages = 1;
            let messages = [];
            
            function formatNumber(num) {
                if (num === 0) return '0';
                return new Intl.NumberFormat('vi-VN').format(num);
            }
            
            function formatDate(dateString) {
                if (!dateString) return 'Chưa có';
                return new Date(dateString).toLocaleDateString('vi-VN');
            }
            
            function formatDateTime(dateString) {
                if (!dateString) return 'Chưa có';
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
                        totalPages = Math.ceil(data.totalTransactions / 50);
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

// API endpoint để lấy tin nhắn của một nhóm
app.get('/api/groups/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 20, search } = req.query;
    
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
    const filter = { chatId };

    // Tìm kiếm trong nội dung tin nhắn hoặc tên người gửi
    if (search) {
      filter.$or = [
        { content: { $regex: search, $options: 'i' } },
        { senderName: { $regex: search, $options: 'i' } }
      ];
    }

    // Lấy tin nhắn với phân trang
    const messages = await MessageLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Đếm tổng số tin nhắn
    const totalMessages = await MessageLog.countDocuments(filter);

    // Lấy danh sách người gửi unique
    const uniqueSenders = await MessageLog.distinct('senderName', { chatId });

    // Nhóm tin nhắn theo ngày
    const messagesByDate = {};
    messages.forEach(message => {
      const date = message.timestamp.toISOString().split('T')[0];
      if (!messagesByDate[date]) {
        messagesByDate[date] = [];
      }
      messagesByDate[date].push({
        id: message._id,
        senderId: message.senderId,
        senderName: message.senderName,
        username: message.username,
        content: message.content,
        photoUrl: message.photoUrl,
        videoUrl: message.videoUrl,
        voiceUrl: message.voiceUrl,
        documentUrl: message.documentUrl,
        timestamp: message.timestamp,
        createdAt: message.createdAt
      });
    });

    res.json({
      success: true,
      chatId,
      groupTitle,
      totalMessages,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalMessages / limit),
      messagesByDate,
      uniqueSenders,
      filters: {
        search: search || ''
      }
    });
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy tin nhắn'
    });
  }
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