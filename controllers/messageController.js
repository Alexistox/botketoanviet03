const axios = require('axios');
const { extractBankInfoFromImage } = require('../utils/openai');
const { getDownloadLink, logMessage } = require('../utils/telegramUtils');
const { 
  formatSmart, 
  formatRateValue, 
  isMathExpression, 
  isSingleNumber, 
  isTrc20Address,
  formatTelegramMessage
} = require('../utils/formatter');
const { isUserOwner, isUserAdmin, isUserOperator } = require('../utils/permissions');
const messages = require('../src/messages/vi');

const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const User = require('../models/User');
const Config = require('../models/Config');
const MessageLog = require('../models/MessageLog');

const {
  handleCalculateUsdtCommand,
  handleCalculateVndCommand,
  handleMathExpression,
  handleReportCommand,
  handleHelpCommand,
  handleStartCommand
} = require('./utilCommands');

const {
  handleImageBankInfo,
  handleReplyImageBankInfo
} = require('./imageCommands');

// Hàm xử lý tin nhắn chính
const handleMessage = async (bot, msg, cache) => {
  try {
    // Log message to database
    await logMessage(msg, process.env.TELEGRAM_BOT_TOKEN, MessageLog);
    
    // Log tin nhắn vào console để debug
    console.log('Received message:', JSON.stringify(msg, null, 2));
    
    // Lấy thông tin cơ bản từ tin nhắn
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'unknown';
    const firstName = msg.from.first_name || '';
    const lastName = msg.from.last_name || '';
    const timestamp = new Date();
    const messageText = msg.text || '';
    
    // Nếu người dùng gửi '开始', chuyển thành '/st' để dùng chung logic
    if (messageText === '开始') {
      const modifiedMsg = { ...msg, text: '/st' };
      await handleStartCommand(bot, chatId);
      return;
    }
    
    // Xử lý thành viên mới tham gia nhóm
    if (msg.new_chat_members) {
      const newMembers = msg.new_chat_members;
      for (const member of newMembers) {
        await sendWelcomeMessage(bot, chatId, member);
      }
      return;
    }
    
    // Xử lý các lệnh liên quan đến ảnh
    if (msg.photo) {
      if (msg.caption && msg.caption === ('/c')) {
        await handleImageBankInfo(bot, msg);
        return;
      }
    }
    
    // Xử lý khi người dùng reply một tin nhắn có ảnh
    if (msg.reply_to_message && msg.reply_to_message.photo && msg.text && msg.text === ('/c')) {
      await handleReplyImageBankInfo(bot, msg);
      return;
    }
    
    // Nếu không có văn bản, không xử lý
    if (!msg.text) {
      return;
    }
    
    // Kiểm tra và đăng ký người dùng mới
    await checkAndRegisterUser(userId, username, firstName, lastName);
    
    // Xử lý các lệnh tiếng Trung
    if (messageText === '上课' || messageText === 'start' || messageText === 'Start'|| messageText === 'Bắt đầu') {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        await handleClearCommand(bot, msg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    if (messageText === '结束') {
      // Xử lý "结束" giống như "/report"
      await handleReportCommand(bot, chatId, firstName);
      return;
    }
    
    if (messageText.startsWith('设置费率')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        await handleRateCommand(bot, msg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    if (messageText.startsWith('设置汇率')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        await handleExchangeRateCommand(bot, msg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    if (messageText.startsWith('下发') || messageText.startsWith('%')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        await handlePercentCommand(bot, msg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    // Kiểm tra lệnh 价格 (chỉ khi nó là từ độc lập, không phải một phần của từ khác)
    if (messageText === '价格' || 
        messageText.startsWith('价格 ') || 
        messageText.startsWith('价格/') || 
        messageText.startsWith('价格:')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        // Chuyển đổi tin nhắn để sử dụng lệnh /d
        const modifiedMsg = { ...msg };
        if (messageText === '价格') {
          modifiedMsg.text = '/d';
        } else {
          modifiedMsg.text = '/d' + messageText.substring(2);
        }
        await handleDualRateCommand(bot, modifiedMsg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    // Lệnh 撤销账单 (tương đương /skip)
    if (messageText.startsWith('撤回')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        // Chuyển đổi tin nhắn để sử dụng lệnh /skip
        const modifiedMsg = { ...msg };
        if (messageText === '撤回') {
          bot.sendMessage(chatId, messages.invalidCommand.replace('{format}', '撤回 [ID] 例如: 撤回 3 或 撤回 !2'));
          return;
        } else {
          modifiedMsg.text = '/skip' + messageText.substring(2);
        }
        await handleSkipCommand(bot, modifiedMsg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    // Lệnh quản lý operators
    if (messageText.startsWith('设置操作')) {
      // Kiểm tra quyền Admin
      if (await isUserAdmin(userId)) {
        // Chuyển đổi tin nhắn để sử dụng lệnh /op
        const modifiedMsg = { ...msg };
        const prefixLength = messageText.startsWith('设置操作') ? 4 : 5;
        // Đảm bảo luôn có một dấu cách sau /op
        modifiedMsg.text = '/op ' + messageText.substring(prefixLength).trim();
        await handleAddOperatorInGroupCommand(bot, modifiedMsg);
      } else {
        bot.sendMessage(chatId, messages.adminOnly);
      }
      return;
    }
    
    if (messageText.startsWith('删除操作')) {
      // Kiểm tra quyền Admin
      if (await isUserAdmin(userId)) {
        // Chuyển đổi tin nhắn để sử dụng lệnh /removeop
        const modifiedMsg = { ...msg };
        // Xác định độ dài prefix
        const prefixLength = messageText.startsWith('删除操作') ? 4 : 5;
        // Đảm bảo luôn có một dấu cách sau /removeop
        modifiedMsg.text = '/removeop ' + messageText.substring(prefixLength).trim();
        await handleRemoveOperatorInGroupCommand(bot, modifiedMsg);
      } else {
        bot.sendMessage(chatId, messages.adminOnly);
      }
      return;
    }
    
    // Xử lý các lệnh bắt đầu bằng "/"
    if (messageText.startsWith('/')) {
      if (messageText === '/start') {
        bot.sendMessage(chatId, "Chào mừng bạn đến với bot！");
        return;
      }
      
      if (messageText === '/help') {
        await handleHelpCommand(bot, chatId);
        return;
      }
      
      if (messageText === '/off') {
        bot.sendMessage(chatId, messages.endOfWork);
        return;
      }
      
      // Các lệnh quản lý admin - chỉ owner
      if (messageText.startsWith('/ad ')) {
        await handleAddAdminCommand(bot, msg);
        return;
      }
      
      if (messageText.startsWith('/removead ')) {
        await handleRemoveAdminCommand(bot, msg);
        return;
      }
      
      if (messageText === '/admins') {
        await handleListAdminsCommand(bot, msg);
        return;
      }
      
      // Lệnh liệt kê danh sách nhóm
      if (messageText === '/listgroups') {
        await handleListGroupsCommand(bot, msg);
        return;
      }
      
      // Các lệnh quản lý operator - admin và owner
      if (messageText.startsWith('/op ')) {
        await handleAddOperatorInGroupCommand(bot, msg);
        return;
      }
      
      if (messageText.startsWith('/removeop ')) {
        await handleRemoveOperatorInGroupCommand(bot, msg);
        return;
      }
      
      if (messageText === '/ops') {
        await handleListOperatorsCommand(bot, msg);
        return;
      }
      
      if (messageText.startsWith('/m ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleCurrencyUnitCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      // Lệnh chuyển đổi tiền tệ - tất cả user
      if (messageText.startsWith('/t ')) {
        await handleCalculateUsdtCommand(bot, msg);
        return;
      }
      
      if (messageText.startsWith('/v ')) {
        await handleCalculateVndCommand(bot, msg);
        return;
      }
      
      if (messageText.startsWith('/skip ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleSkipCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText.startsWith('/d ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleDualRateCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText.startsWith('/x ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleHideCardCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText.startsWith('/sx ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleShowCardCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText === '/hiddenCards') {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleListHiddenCardsCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText.startsWith('/delete')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleDeleteCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      // Lệnh quản lý inline buttons
      if (messageText.startsWith('/inline ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleAddInlineCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText.startsWith('/removeinline ')) {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleRemoveInlineCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      if (messageText === '/buttons') {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await displayInlineButtons(bot, chatId);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }
      
      // Lệnh thiết lập địa chỉ USDT - chỉ admin và owner
      if (messageText.startsWith('/usdt ')) {
        if (await isUserAdmin(userId)) {
          await handleSetUsdtAddressCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.adminOnly);
        }
        return;
      }
      
      if (messageText === '/u') {
        await handleGetUsdtAddressCommand(bot, msg);
        return;
      }
      
      if (messageText === '/users') {
        await handleListUsersCommand(bot, msg);
        return;
      }
      
      if (messageText === '/report') {
        await handleReportCommand(bot, chatId, firstName);
        return;
      }
      
      // Lệnh thiết lập owner - chỉ owner
      if (messageText.startsWith('/setowner')) {
        if (await isUserOwner(userId)) {
          await handleSetOwnerCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.adminOnly);
        }
        return;
      }
      
      // Lệnh xóa operator - chỉ owner bảo trì
      if (messageText.startsWith('/remove ')) {
        if (await isUserOwner(userId)) {
          await handleRemoveCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.adminOnly);
        }
        return;
      }
      
      // Lệnh migrate data - chỉ owner bảo trì
      if (messageText === '/migrate') {
        if (await isUserOwner(userId)) {
          await handleMigrateDataCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.adminOnly);
        }
        return;
      }

      // Thêm xử lý cho lệnh /onbut và /offbut
      if (messageText === '/onbut') {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleEnableButtonsCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }

      if (messageText === '/offbut') {
        // Kiểm tra quyền Operator
        if (await isUserOperator(userId, chatId)) {
          await handleDisableButtonsCommand(bot, msg);
        } else {
          bot.sendMessage(chatId, messages.operatorOnly);
        }
        return;
      }

      if (messageText === '/st') {
        await handleStartCommand(bot, chatId);
        return;
      }

      // Xử lý lệnh /chat
      if (messageText.startsWith('/chat')) {
        await handleChatWithButtons2Command(bot, msg);
        return;
      }
    }
    
    // Xử lý lệnh /inline2
    if (messageText.startsWith('/inline2 ')) {
      await handleAddInline2Command(bot, msg);
      return;
    }
    // Xử lý lệnh /removeinline2
    if (messageText.startsWith('/removeinline2 ')) {
      await handleRemoveInline2Command(bot, msg);
      return;
    }
    // Xử lý lệnh /buttons2
    if (messageText === '/buttons2') {
      await handleButtons2Command(bot, msg);
      return;
    }
    
    // Xử lý tin nhắn + và -
    if (messageText.startsWith('+')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        await handlePlusCommand(bot, msg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    if (messageText.startsWith('-')) {
      // Kiểm tra quyền Operator
      if (await isUserOperator(userId, chatId)) {
        await handleMinusCommand(bot, msg);
      } else {
        bot.sendMessage(chatId, messages.operatorOnly);
      }
      return;
    }
    
    // Xử lý biểu thức toán học
    if (isMathExpression(messageText)) {
      if (!isSingleNumber(messageText)) {
        await handleMathExpression(bot, chatId, messageText, firstName);
        return;
      }
    }
    
    // Xử lý địa chỉ TRC20
    if (isTrc20Address(messageText.trim())) {
      // Gửi địa chỉ TRC20 dạng markdown
      bot.sendMessage(chatId, `TRC20地址:\n\`${messageText.trim()}\``, { parse_mode: 'Markdown' });
      return;
    }
    
    // Alias cho lệnh admin/operator tiếng Trung
    if (messageText.startsWith('添加管理员')) {
      // Chuyển thành /ad
      const modifiedMsg = { ...msg };
      const prefixLength = messageText.startsWith('添加管理员') ? 5 : 6;
      
      // Đảm bảo luôn có một dấu cách sau /ad
      modifiedMsg.text = '/ad ' + messageText.substring(prefixLength).trim();
      await handleAddAdminCommand(bot, modifiedMsg);
      return;
    }
    if (messageText.startsWith('删除管理员')) {
      // Chuyển thành /removead
      const modifiedMsg = { ...msg };
      const prefixLength = messageText.startsWith('删除管理员') ? 5 : 6;
      // Đảm bảo luôn có một dấu cách sau /removead
      modifiedMsg.text = '/removead ' + messageText.substring(prefixLength).trim();
      await handleRemoveAdminCommand(bot, modifiedMsg);
      return;
    }
    if (messageText === '操作人') {
      // Chuyển thành /ops
      const modifiedMsg = { ...msg, text: '/ops' };
      await handleListOperatorsCommand(bot, modifiedMsg);
      return;
    }
  } catch (error) {
    console.error('Error in handleMessage:', error);
  }
};

// Hàm kiểm tra và đăng ký người dùng mới
const checkAndRegisterUser = async (userId, username, firstName, lastName) => {
  try {
    let user = await User.findOne({ userId: userId.toString() });
    
    if (!user) {
      // Kiểm tra xem đã có owner chưa
      const ownerExists = await User.findOne({ isOwner: true });
      
      // Nếu chưa có owner, user đầu tiên sẽ là owner và admin
      const isFirstUser = !ownerExists;
      
      user = new User({
        userId: userId.toString(),
        username,
        firstName,
        lastName,
        isOwner: isFirstUser,
        isAdmin: isFirstUser,
        groupPermissions: []
      });
      
      await user.save();
      
      if (isFirstUser) {
        console.log(`User ${username} (ID: ${userId}) is now the bot owner and admin`);
      }
    }
    
    return user;
  } catch (error) {
    console.error('Error in checkAndRegisterUser:', error);
    return null;
  }
};

// Hàm gửi tin nhắn chào mừng
const sendWelcomeMessage = async (bot, chatId, member) => {
  const welcomeName = member.first_name;
  const welcomeMessage = messages.welcome.replace('{name}', welcomeName);
  bot.sendMessage(chatId, welcomeMessage);
};

// Phần còn lại của file sẽ import các controller khác
const { 
  handleClearCommand,
  handleRateCommand,
  handleExchangeRateCommand,
  handleDualRateCommand,
  handleDeleteCommand
} = require('./groupCommands');

const {
  handlePlusCommand,
  handleMinusCommand,
  handlePercentCommand,
  handleSkipCommand
} = require('./transactionCommands');

const {
  handleHideCardCommand,
  handleShowCardCommand,
  handleListHiddenCardsCommand
} = require('./cardCommands');

const {
  handleListUsersCommand,
  handleCurrencyUnitCommand,
  handleSetUsdtAddressCommand,
  handleSetOwnerCommand,
  handleRemoveCommand,
  handleMigrateDataCommand,
  handleAddAdminCommand,
  handleRemoveAdminCommand,
  handleListAdminsCommand,
  handleAddOperatorInGroupCommand,
  handleRemoveOperatorInGroupCommand,
  handleListOperatorsCommand,
  handleListGroupsCommand,
  handleAddInlineCommand,
  handleRemoveInlineCommand,
  displayInlineButtons,
  handleGetUsdtAddressCommand,
  handleEnableButtonsCommand,
  handleDisableButtonsCommand,
  handleAddInline2Command,
  handleRemoveInline2Command,
  handleButtons2Command,
  handleChatWithButtons2Command
} = require('./userCommands');

module.exports = {
  handleMessage
}; 