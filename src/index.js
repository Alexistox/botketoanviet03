require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');
const { handleTransaction } = require('./handlers/transactionHandlers');
const { handleMessage } = require('./handlers/messageLogHandler');
const { handleBankImage } = require('./handlers/imageHandler');
const { handleTrc20Address, isTrc20Address } = require('./handlers/trc20Handler');
const { handleReportCommand, handleClearCommand, handleDualCommand, handleCalculateCommand } = require('./handlers/reportHandler');
const { handleUserManagement, handleCardManagement, isUsernameAllowed } = require('./handlers/userHandler');
const Settings = require('./models/Settings');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Create bot instance
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "Chào mừng sử dụng bot giao dịch!");
});

// Handle addition command
bot.onText(/^\+/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleTransaction(msg, bot);
  } catch (error) {
    console.error('Error handling addition command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh, vui lòng thử lại.");
  }
});

// Handle subtraction command
bot.onText(/^-/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleTransaction(msg, bot);
  } catch (error) {
    console.error('Error handling subtraction command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh, vui lòng thử lại.");
  }
});

// Handle USDT payment command
bot.onText(/^下发/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleTransaction(msg, bot);
  } catch (error) {
    console.error('Error handling USDT payment command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh thanh toán USDT, vui lòng thử lại.");
  }
});

// Handle TRC20 address
bot.onText(/^T[1-9A-Za-z]{33}$/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleTrc20Address(msg, bot);
  } catch (error) {
    console.error('Error handling TRC20 address:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý địa chỉ TRC20, vui lòng thử lại.");
  }
});

// Handle bank image
bot.onText(/\/c/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    if (msg.photo) {
      await handleBankImage(msg, bot);
    }
  } catch (error) {
    console.error('Error handling bank image:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý hình ảnh, vui lòng thử lại.");
  }
});

// Handle photo with /c caption
bot.on('photo', async (msg) => {
  try {
    if (msg.caption && msg.caption.startsWith('/c')) {
      const chatId = msg.chat.id;
      const username = msg.from.username;
      
      if (!await isUsernameAllowed(username)) {
        await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
        return;
      }

      await handleBankImage(msg, bot);
    }
  } catch (error) {
    console.error('Error handling photo with caption:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý hình ảnh, vui lòng thử lại.");
  }
});

// Handle report command
bot.onText(/\/report/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleReportCommand(chatId, bot);
  } catch (error) {
    console.error('Error handling report command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi tạo báo cáo, vui lòng thử lại.");
  }
});

// Handle clear command
bot.onText(/\/clear/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleClearCommand(chatId, username, bot);
  } catch (error) {
    console.error('Error handling clear command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh xóa, vui lòng thử lại.");
  }
});

// Handle dual command (rate and exchange rate)
bot.onText(/^\/d/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleDualCommand(chatId, msg.text, username, bot);
  } catch (error) {
    console.error('Error handling dual command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh kép, vui lòng thử lại.");
  }
});

// Handle calculate commands
bot.onText(/^\/[tv]/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleCalculateCommand(chatId, msg.text, bot);
  } catch (error) {
    console.error('Error handling calculate command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi tính toán, vui lòng thử lại.");
  }
});

// Handle user management commands
bot.onText(/^(加操作人|移除操作人|\/users)$/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleUserManagement(chatId, msg.text, bot);
  } catch (error) {
    console.error('Error handling user management:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi quản lý người dùng, vui lòng thử lại.");
  }
});

// Handle card management commands
bot.onText(/^(\/x|\/sx|\/hiddenCards)/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await handleCardManagement(chatId, msg.text, bot);
  } catch (error) {
    console.error('Error handling card management:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi quản lý thẻ, vui lòng thử lại.");
  }
});

// Handle currency unit change
bot.onText(/^\/m/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    const newUnit = msg.text.substring(3).trim();
    if (!newUnit) {
      await bot.sendMessage(chatId, "Vui lòng chỉ định đơn vị tiền tệ mới.");
      return;
    }

    await Settings.findOneAndUpdate(
      { key: 'CURRENCY_UNIT' },
      { value: newUnit },
      { upsert: true }
    );

    await bot.sendMessage(chatId, `Đơn vị tiền tệ đã được thay đổi thành: ${newUnit}`);
  } catch (error) {
    console.error('Error handling currency unit change:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi thay đổi đơn vị tiền tệ, vui lòng thử lại.");
  }
});

// Handle end session command
bot.onText(/^\/off/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    if (!await isUsernameAllowed(username)) {
      await bot.sendMessage(chatId, "Bạn không có quyền sử dụng lệnh này.");
      return;
    }

    await bot.sendMessage(chatId, "Tạm biệt!");
  } catch (error) {
    console.error('Error handling end session command:', error);
    await bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi kết thúc phiên, vui lòng thử lại.");
  }
});

// Handle all messages for logging
bot.on('message', async (msg) => {
  try {
    await handleMessage(msg);
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Error handling for polling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Start Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 