const User = require('../models/User');
const Group = require('../models/Group');
const Config = require('../models/Config');
const { isTrc20Address } = require('../utils/formatter');
const { migrateUserGroupsToOperators } = require('../utils/dataConverter');
const { isUserOwner, isUserAdmin, isUserOperator, extractUserFromCommand } = require('../utils/permissions');
const Transaction = require('../models/Transaction');
const fs = require('fs');
const path = require('path');
const BUTTONS2_PATH = path.join(__dirname, '../config/inline_buttons2.json');
const messages = require('../src/messages/vi');

function readButtons2() {
  if (!fs.existsSync(BUTTONS2_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(BUTTONS2_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeButtons2(buttons) {
  fs.writeFileSync(BUTTONS2_PATH, JSON.stringify(buttons, null, 2), 'utf8');
}

/**
 * Xử lý lệnh thêm admin (/ad) - Chỉ Owner
 */
const handleAddAdminCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;
    
    // Chỉ Owner mới có quyền thêm Admin
    if (!await isUserOwner(userId)) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu bot mới có quyền thêm quản trị viên!");
      return;
    }
    
    // Phân tích tin nhắn
    const parts = messageText.split('/ad ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /ad @username1 @username2 @username3");
      return;
    }
    
    // Tách các username
    const usernames = parts[1].trim().split(' ').filter(u => u.startsWith('@'));
    if (usernames.length === 0) {
      bot.sendMessage(chatId, "/ad || Thêm quản trị viên. Ví dụ: /ad @username1 @username2");
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let message = '';

    // Xử lý từng username
    for (const username of usernames) {
      const targetUser = await extractUserFromCommand(username);
      if (!targetUser) {
        failCount++;
        continue;
      }
      
      // Kiểm tra nếu đã là admin
      if (targetUser.isAdmin) {
        message += `⚠️ Người dùng @${targetUser.username} (ID: ${targetUser.userId}) đã là quản trị viên.\n`;
        failCount++;
        continue;
      }
      
      // Cập nhật quyền Admin
      targetUser.isAdmin = true;
      await targetUser.save();
      message += `✅ Người dùng @${targetUser.username} (ID: ${targetUser.userId}) đã được đặt làm quản trị viên\n`;
      successCount++;
    }

    // Thêm thống kê vào cuối tin nhắn
    message += `\n📊 Thống kê: Thành công ${successCount}, Thất bại ${failCount}`;
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error in handleAddAdminCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thêm quản trị viên bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh xóa admin (/removead) - Chỉ Owner
 */
const handleRemoveAdminCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;
    
    // Chỉ Owner mới có quyền xóa Admin
    if (!await isUserOwner(userId)) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu bot mới có quyền xóa quản trị viên!");
      return;
    }
    
    // Phân tích tin nhắn
    const parts = messageText.split('/removead ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /removead @username1 @username2 @username3");
      return;
    }
    
    // Tách các username
    const usernames = parts[1].trim().split(' ').filter(u => u.startsWith('@'));
    if (usernames.length === 0) {
      bot.sendMessage(chatId, "/removead || Xóa quản trị viên. Ví dụ: /removead @username1 @username2");
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let message = '';

    // Xử lý từng username
    for (const username of usernames) {
      const targetUser = await extractUserFromCommand(username);
      if (!targetUser) {
        failCount++;
        continue;
      }
      
      // Kiểm tra nếu là owner
      if (targetUser.isOwner) {
        message += `⛔ Không thể xóa quyền quản trị viên của chủ sở hữu bot!\n`;
        failCount++;
        continue;
      }
      
      // Kiểm tra nếu không phải admin
      if (!targetUser.isAdmin) {
        message += `⚠️ Người dùng @${targetUser.username} (ID: ${targetUser.userId}) không phải là quản trị viên.\n`;
        failCount++;
        continue;
      }
      
      // Cập nhật quyền Admin
      targetUser.isAdmin = false;
      await targetUser.save();
      message += `✅ Đã xóa quyền quản trị viên của người dùng @${targetUser.username} (ID: ${targetUser.userId})\n`;
      successCount++;
    }

    // Thêm thống kê vào cuối tin nhắn
    message += `\n📊 Thống kê: Thành công ${successCount}, Thất bại ${failCount}`;
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error in handleRemoveAdminCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh xóa quản trị viên bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh liệt kê tất cả admin (/admins) - Chỉ Owner
 */
const handleListAdminsCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Chỉ Owner mới có quyền xem danh sách Admin
    if (!await isUserOwner(userId)) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu bot mới có quyền xem danh sách quản trị viên!");
      return;
    }
    
    // Tìm tất cả admin và owner
    const admins = await User.find({ 
      $or: [{ isAdmin: true }, { isOwner: true }]
    }).sort({ isOwner: -1 }); // Owner hiển thị trước
    
    if (admins.length === 0) {
      bot.sendMessage(chatId, "⚠️ Chưa thiết lập quản trị viên hoặc chủ sở hữu nào.");
      return;
    }
    
    // Tạo danh sách hiển thị
    let message = '👑 Danh sách quản trị viên:\n\n';
    
    admins.forEach(admin => {
      const role = admin.isOwner ? '👑 Chủ sở hữu' : '🔰 Quản trị viên';
      message += `${role}: @${admin.username} (ID: ${admin.userId})\n`;
    });
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error in handleListAdminsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh xem danh sách quản trị viên bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh thêm operator (/op) - Admin và Owner
 */
const handleAddOperatorInGroupCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const senderName = msg.from.username || msg.from.first_name || 'unknown';
    const messageText = msg.text;
    
    // Chỉ Admin và Owner có quyền thêm Operator
    if (!await isUserAdmin(userId)) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu và quản trị viên mới có quyền thêm điều hành viên!");
      return;
    }
    
    // Phân tích tin nhắn
    const parts = messageText.split('/op ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /op @username1 @username2 @username3");
      return;
    }
    
    // Tách các username
    const usernames = parts[1].trim().split(' ').filter(u => u.startsWith('@'));
    if (usernames.length === 0) {
      bot.sendMessage(chatId, "/op || Thiết lập điều hành viên. Ví dụ: /op @username1 @username2");
      return;
    }

    // Tìm hoặc tạo nhóm
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({
        chatId: chatId.toString(),
        operators: []
      });
    }

    let successCount = 0;
    let failCount = 0;
    let message = '';

    // Xử lý từng username
    for (const username of usernames) {
      const targetUser = await extractUserFromCommand(username);
      if (!targetUser) {
        failCount++;
        continue;
      }
      
      // Kiểm tra xem đã là operator chưa
      const existingOperator = group.operators.find(op => op.userId === targetUser.userId);
      if (existingOperator) {
        message += `⚠️ Người dùng @${targetUser.username} (ID: ${targetUser.userId}) đã là điều hành viên của nhóm này.\n`;
        failCount++;
        continue;
      }
      
      // Thêm vào danh sách operators
      group.operators.push({
        userId: targetUser.userId,
        username: targetUser.username,
        dateAdded: new Date()
      });
      
      // Cập nhật groupPermissions trong User document
      const groupPerm = targetUser.groupPermissions.find(p => p.chatId === chatId.toString());
      if (groupPerm) {
        groupPerm.isOperator = true;
      } else {
        targetUser.groupPermissions.push({
          chatId: chatId.toString(),
          isOperator: true
        });
      }
      
      await targetUser.save();
      message += `✅ Người dùng @${targetUser.username} (ID: ${targetUser.userId}) đã được thêm làm điều hành viên của nhóm này\n`;
      successCount++;
    }

    // Lưu thay đổi vào group
    await group.save();

    // Thêm thống kê vào cuối tin nhắn
    message += `\n📊 Thống kê: Thành công ${successCount}, Thất bại ${failCount}`;
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error in handleAddOperatorInGroupCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thêm điều hành viên bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh xóa operator (/removeop) - Admin và Owner
 */
const handleRemoveOperatorInGroupCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;
    
    // Chỉ Admin và Owner có quyền xóa Operator
    if (!await isUserAdmin(userId)) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu và quản trị viên mới có quyền xóa điều hành viên!");
      return;
    }
    
    // Phân tích tin nhắn
    const parts = messageText.split('/removeop ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /removeop @username1 @username2 @username3");
      return;
    }
    
    // Tách các username
    const usernames = parts[1].trim().split(' ').filter(u => u.startsWith('@'));
    if (usernames.length === 0) {
      bot.sendMessage(chatId, "Sử dụng /removeop || Xóa điều hành viên. Ví dụ: /removeop @username1 @username2");
      return;
    }

    // Tìm thông tin nhóm
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group || !group.operators || group.operators.length === 0) {
      bot.sendMessage(chatId, `⚠️ Nhóm này chưa thiết lập điều hành viên nào.`);
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let message = '';

    // Xử lý từng username
    for (const username of usernames) {
      const targetUser = await extractUserFromCommand(username);
      if (!targetUser) {
        failCount++;
        continue;
      }
      
      // Kiểm tra xem có trong danh sách không
      const operatorIndex = group.operators.findIndex(op => op.userId === targetUser.userId);
      if (operatorIndex === -1) {
        message += `⚠️ Người dùng @${targetUser.username} (ID: ${targetUser.userId}) không phải là điều hành viên của nhóm này.\n`;
        failCount++;
        continue;
      }
      
      // Kiểm tra nếu là owner/admin
      if (targetUser.isOwner || targetUser.isAdmin) {
        message += `⛔ Không thể xóa quyền điều hành viên của chủ sở hữu hoặc quản trị viên!\n`;
        failCount++;
        continue;
      }
      
      // Xóa khỏi danh sách operators
      group.operators.splice(operatorIndex, 1);
      
      // Cập nhật groupPermissions trong User document
      const groupPermIndex = targetUser.groupPermissions.findIndex(p => p.chatId === chatId.toString());
      if (groupPermIndex !== -1) {
        targetUser.groupPermissions.splice(groupPermIndex, 1);
        await targetUser.save();
      }
      
      message += `✅ Đã xóa quyền điều hành viên của người dùng @${targetUser.username} (ID: ${targetUser.userId})\n`;
      successCount++;
    }

    // Lưu thay đổi vào group
    await group.save();

    // Thêm thống kê vào cuối tin nhắn
    message += `\n📊 Thống kê: Thành công ${successCount}, Thất bại ${failCount}`;
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error in handleRemoveOperatorInGroupCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh xóa điều hành viên bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh liệt kê operators (/ops) - Tất cả
 */
const handleListOperatorsCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Tìm thông tin nhóm
    const group = await Group.findOne({ chatId: chatId.toString() });
    
    if (!group || !group.operators || group.operators.length === 0) {
      bot.sendMessage(chatId, `⚠️ Nhóm này chưa thiết lập điều hành viên nào.`);
      return;
    }
    
    // Sắp xếp theo thời gian thêm vào, mới nhất lên đầu
    const sortedOperators = [...group.operators].sort((a, b) => 
      new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)
    );
    
    // Tạo danh sách hiển thị
    let message = '👥 Danh sách điều hành viên của nhóm này:\n\n';
    
    for (const op of sortedOperators) {
      const user = await User.findOne({ userId: op.userId });
      let roleBadge = '';
      
      if (user) {
        if (user.isOwner) {
          roleBadge = '👑';
        } else if (user.isAdmin) {
          roleBadge = '🔰';
        } else {
          roleBadge = '🔹';
        }
      } else {
        roleBadge = '🔹';
      }
      
      message += `${roleBadge} @${op.username} (ID: ${op.userId})\n`;
    }
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error in handleListOperatorsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh xem danh sách điều hành viên bị lỗi. Vui lòng thử lại sau.");
  }
};


const handleListUsersCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Tìm tất cả owner
    const owners = await User.find({ isOwner: true });
    let ownersList = '';
    if (owners.length > 0) {
      ownersList = '🔑 Danh sách chủ sở hữu:\n' + owners.map(o => `@${o.username}: ${o.userId}`).join('\n');
    } else {
      ownersList = '🔑 Chưa thiết lập chủ sở hữu bot';
    }
    
    // Tìm thông tin nhóm và danh sách operators
    const group = await Group.findOne({ chatId: chatId.toString() });
    
    let operatorsList = '';
    if (group && group.operators && group.operators.length > 0) {
      // Sắp xếp theo thời gian thêm vào, mới nhất lên đầu
      const sortedOperators = [...group.operators].sort((a, b) => 
        new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)
      );
      
      operatorsList = '👥 Danh sách điều hành viên của nhóm này:\n' + sortedOperators.map(op => `@${op.username}: ${op.userId}`).join('\n');
    } else {
      operatorsList = '👥 Nhóm này chưa có điều hành viên';
    }
    
    // Send both lists
    bot.sendMessage(chatId, `${ownersList}\n\n${operatorsList}`);
  } catch (error) {
    console.error('Error in handleListUsersCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh liệt kê người dùng bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh thiết lập đơn vị tiền tệ (/m)
 */
const handleCurrencyUnitCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    
    // Phân tích tin nhắn
    const parts = messageText.split('/m ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: /m tên tiền tệ");
      return;
    }
    
    const currencyUnit = parts[1].trim().toUpperCase();
    if (!currencyUnit) {
      bot.sendMessage(chatId, "Vui lòng chỉ định tên tiền tệ.");
      return;
    }
    
    // Tìm nhóm hoặc tạo mới nếu chưa tồn tại
    let group = await Group.findOne({ chatId: chatId.toString() });
    
    if (!group) {
      group = new Group({
        chatId: chatId.toString(),
        currency: currencyUnit
      });
    } else {
      group.currency = currencyUnit;
    }
    
    await group.save();
    bot.sendMessage(chatId, `✅ Đã thiết lập tiền tệ cho nhóm này là ${currencyUnit}`);
  } catch (error) {
    console.error('Error in handleCurrencyUnitCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thiết lập tiền tệ bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh thiết lập địa chỉ USDT (/usdt)
 */
const handleSetUsdtAddressCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    // Cho phép nhận địa chỉ qua caption của ảnh/video/gif
    const messageText = msg.text || msg.caption || '';
    
    // Phân tích tin nhắn
    const parts = messageText.split('/usdt ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "ℹ️ Cú pháp: /usdt <địa chỉ TRC20>");
      return;
    }
    
    const address = parts[1].trim();
    if (!isTrc20Address(address)) {
      bot.sendMessage(chatId, "❌ Địa chỉ TRC20 không hợp lệ! Địa chỉ phải bắt đầu bằng chữ T và có 34 ký tự.");
      return;
    }
    
    // Tìm config đã tồn tại hoặc tạo mới
    let config = await Config.findOne({ key: 'USDT_ADDRESS' });
    const oldAddress = config ? config.value : null;
    
    if (!config) {
      config = new Config({
        key: 'USDT_ADDRESS',
        value: address
      });
    } else {
      config.value = address;
    }

    // Lưu kèm file_id nếu có media
    // Ưu tiên: photo > video > animation (gif)
    if (msg.photo && msg.photo.length > 0) {
      // Lấy size lớn nhất (phần tử cuối)
      const largest = msg.photo[msg.photo.length - 1];
      config.description = JSON.stringify({ mediaType: 'photo', fileId: largest.file_id });
    } else if (msg.video) {
      config.description = JSON.stringify({ mediaType: 'video', fileId: msg.video.file_id });
    } else if (msg.animation) { // gif
      config.description = JSON.stringify({ mediaType: 'animation', fileId: msg.animation.file_id });
    } else {
      // Không có media kèm theo
      config.description = '';
    }
    
    await config.save();
    
    if (oldAddress) {
      bot.sendMessage(chatId, "🔄 Đã cập nhật địa chỉ USDT-TRC20:\n`" + address + "`", { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, "✅ Đã lưu địa chỉ USDT-TRC20 toàn cục:\n`" + address + "`", { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error in handleSetUsdtAddressCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thiết lập địa chỉ USDT bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh lấy địa chỉ USDT (/u)
 */
const handleGetUsdtAddressCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Tìm địa chỉ USDT
    const config = await Config.findOne({ key: 'USDT_ADDRESS' });
    
    if (!config || !config.value) {
      bot.sendMessage(chatId, "⚠️ Chưa thiết lập địa chỉ USDT-TRC20. Vui lòng sử dụng lệnh /usdt để thiết lập.");
      return;
    }
    
    const responseMsg = "`" + config.value + "`" ;
    // Nếu có media lưu trong description, gửi kèm media với caption là địa chỉ
    let mediaInfo = null;
    if (config.description) {
      try {
        mediaInfo = JSON.parse(config.description);
      } catch (_) {
        mediaInfo = null;
      }
    }
    
    if (mediaInfo && mediaInfo.mediaType === 'photo' && mediaInfo.fileId) {
      await bot.sendPhoto(chatId, mediaInfo.fileId, { caption: responseMsg, parse_mode: 'Markdown' });
    } else if (mediaInfo && mediaInfo.mediaType === 'video' && mediaInfo.fileId) {
      await bot.sendVideo(chatId, mediaInfo.fileId, { caption: responseMsg, parse_mode: 'Markdown' });
    } else if (mediaInfo && mediaInfo.mediaType === 'animation' && mediaInfo.fileId) {
      await bot.sendAnimation(chatId, mediaInfo.fileId, { caption: responseMsg, parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error in handleGetUsdtAddressCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh lấy địa chỉ USDT bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh thiết lập người sở hữu (/setowner)
 */
const handleSetOwnerCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const senderId = msg.from.id;
    
    // Chỉ cho phép owner hiện tại thêm owner khác
    const isCurrentUserOwner = await isUserOwner(senderId.toString());
    if (!isCurrentUserOwner) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu bot mới có quyền sử dụng lệnh này!");
      return;
    }
    
    // Phân tích tin nhắn
    const parts = messageText.split('/setowner ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: /setowner @username");
      return;
    }
    
    // Lấy username
    const usernameText = parts[1].trim();
    const username = usernameText.replace('@', '');
    
    if (!username) {
      bot.sendMessage(chatId, "Vui lòng chỉ định tên người dùng.");
      return;
    }
    
    // Tìm người dùng theo username
    let user = await User.findOne({ username });
    
    if (!user) {
      // Tạo người dùng mới nếu không tồn tại
      const uniqueUserId = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      user = new User({
        userId: uniqueUserId,
        username,
        isOwner: true,
        isAllowed: true
      });
      await user.save();
      bot.sendMessage(chatId, `✅ Đã đặt người dùng mới @${username} làm chủ sở hữu bot.`);
    } else if (user.isOwner) {
      bot.sendMessage(chatId, `⚠️ Người dùng @${username} đã là chủ sở hữu bot.`);
    } else {
      user.isOwner = true;
      user.isAllowed = true;
      await user.save();
      bot.sendMessage(chatId, `✅ Đã đặt người dùng @${username} làm chủ sở hữu bot.`);
    }
  } catch (error) {
    console.error('Error in handleSetOwnerCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thiết lập chủ sở hữu bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh chuyển đổi dữ liệu (/migrate)
 */
const handleMigrateDataCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Chỉ cho phép owner thực hiện việc chuyển đổi dữ liệu
    const isCurrentUserOwner = await isUserOwner(userId.toString());
    if (!isCurrentUserOwner) {
      bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu bot mới có quyền sử dụng lệnh này!");
      return;
    }
    
    bot.sendMessage(chatId, "🔄 Đang bắt đầu chuyển đổi dữ liệu, vui lòng đợi...");
    
    const result = await migrateUserGroupsToOperators();
    
    if (result.success) {
      bot.sendMessage(chatId, "✅ Chuyển đổi dữ liệu thành công! Quyền người dùng đã được chuyển từ cấu trúc cũ sang cấu trúc mới.");
    } else {
      bot.sendMessage(chatId, `❌ Chuyển đổi dữ liệu thất bại: ${result.error}`);
    }
  } catch (error) {
    console.error('Error in handleMigrateDataCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh chuyển đổi dữ liệu bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh hiển thị danh sách nhóm
 */
const handleListGroupsCommand = async (bot, msg) => {
  try {
    const userId = msg.from.id;
    
    // Chỉ cho phép owner hoặc admin sử dụng lệnh này
    if (!(await isUserAdmin(userId))) {
      bot.sendMessage(msg.chat.id, "⛔ Chỉ chủ sở hữu và quản trị viên mới có quyền sử dụng lệnh này!");
      return;
    }
    
    // Lấy tất cả các nhóm từ database
    const groups = await Group.find({});
    
    if (groups.length === 0) {
      bot.sendMessage(msg.chat.id, "Bot chưa tham gia nhóm nào.");
      return;
    }
    
    // Format danh sách nhóm
    let message = "*🔄 Danh sách các nhóm bot đã tham gia:*\n\n";
    
    for (const group of groups) {
      // Lấy thông tin tên nhóm nếu có
      let groupTitle = "Nhóm không xác định";
      try {
        const chatInfo = await bot.getChat(group.chatId);
        groupTitle = chatInfo.title || `Chat ID: ${group.chatId}`;
      } catch (error) {
        // Không lấy được thông tin chat, có thể bot đã bị đá khỏi nhóm
        groupTitle = `Nhóm không xác định (ID: ${group.chatId})`;
      }
      
      // Đếm số lượng giao dịch trong nhóm
      const transactionCount = await Transaction.countDocuments({ 
        chatId: group.chatId,
        skipped: { $ne: true }
      });
      
      // Thêm vào message
      message += `*${groupTitle}*\n`;
      message += `Chat ID: \`${group.chatId}\`\n`;
      message += `Rate: ${group.rate}% | Exchange Rate: ${group.exchangeRate}\n`;
      message += `Transactions: ${transactionCount}\n`;
      message += `Last Clear: ${group.lastClearDate ? group.lastClearDate.toLocaleString() : 'Never'}\n\n`;
    }
    
    message += `Total Groups: ${groups.length}`;
    
    // Gửi tin nhắn
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in handleListGroupsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh liệt kê nhóm bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh gửi link website hiển thị danh sách nhóm
 */
const handleGroupsCommand = async (bot, msg) => {
  try {
    const userId = msg.from.id;
    
    // Chỉ cho phép owner hoặc admin sử dụng lệnh này
    if (!(await isUserAdmin(userId))) {
      bot.sendMessage(msg.chat.id, "⛔ Chỉ chủ sở hữu và quản trị viên mới có quyền sử dụng lệnh này!");
      return;
    }
    
    // Tạo URL website
    const serverUrl = process.env.SERVER_URL || 'https://your-server.com';
    const websiteUrl = `${serverUrl}/groups`;
    
    // Tạo message với link
    const message = `
📊 *Danh sách nhóm Bot*

🔗 Xem tất cả thông tin các nhóm tại:
${websiteUrl}

📱 Website này hiển thị:
• Tổng quan thống kê
• Thông tin chi tiết từng nhóm
• Số lượng thành viên và giao dịch
• Rate và tỷ giá hiện tại
• Danh sách operators
• Lịch sử làm sạch

🔄 Dữ liệu được cập nhật tự động mỗi 5 phút
    `;
    
    // Gửi tin nhắn
    bot.sendMessage(msg.chat.id, message.trim(), { 
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
    
  } catch (error) {
    console.error('Error in handleGroupsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh gửi link website bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh /messagelogs - gửi link trang web xem message logs
 */
const handleMessageLogsCommand = async (bot, msg) => {
  try {
    const userId = msg.from.id;
    
    // Chỉ cho phép owner hoặc admin sử dụng lệnh này
    if (!(await isUserAdmin(userId))) {
      bot.sendMessage(msg.chat.id, "⛔ Chỉ chủ sở hữu và quản trị viên mới có quyền sử dụng lệnh này!");
      return;
    }
    
    // Tạo URL website
    const serverUrl = process.env.SERVER_URL || 'https://your-server.com';
    const websiteUrl = `${serverUrl}/messagelogs`;
    
    // Tạo message với link
    const message = `
💬 *Message Logs - Nhật ký tin nhắn*

🔗 Xem tất cả message logs các nhóm tại:
${websiteUrl}

📱 Website này hiển thị:
• Thống kê tin nhắn của các nhóm
• Chi tiết tin nhắn từng nhóm
• Thời gian, người gửi, nội dung
• Lọc theo ngày, người gửi
• Tìm kiếm trong nội dung
• Phân trang và sắp xếp

🔄 Dữ liệu được cập nhật tự động
    `;
    
    // Gửi tin nhắn
    bot.sendMessage(msg.chat.id, message.trim(), { 
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
    
  } catch (error) {
    console.error('Error in handleMessageLogsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh gửi link message logs bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh thêm nút inline keyboard
 */
const handleAddInlineCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này! Cần quyền điều hành viên.");
      return;
    }
    
    // Phân tích cú pháp tin nhắn
    const parts = messageText.split('/inline ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: /inline nội dung nút|lệnh");
      return;
    }
    
    const inputParts = parts[1].split('|');
    if (inputParts.length !== 2) {
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: /inline nội dung nút|lệnh");
      return;
    }
    
    const buttonText = inputParts[0].trim();
    const commandText = inputParts[1].trim();
    
    if (!buttonText || !commandText) {
      bot.sendMessage(chatId, "Nội dung nút và lệnh không được để trống.");
      return;
    }
    
    // Tìm hoặc tạo Config cho inline buttons
    let inlineConfig = await Config.findOne({ key: 'INLINE_BUTTONS_GLOBAL' });
    
    let buttons = [];
    if (inlineConfig) {
      try {
        buttons = JSON.parse(inlineConfig.value);
      } catch (error) {
        buttons = [];
      }
    } else {
      inlineConfig = new Config({
        key: 'INLINE_BUTTONS_GLOBAL',
        value: JSON.stringify([])
      });
    }
    
    // Kiểm tra xem nút đã tồn tại chưa
    const existingButtonIndex = buttons.findIndex(b => b.text === buttonText);
    
    if (existingButtonIndex >= 0) {
      // Cập nhật nút hiện có
      buttons[existingButtonIndex] = { text: buttonText, command: commandText };
      bot.sendMessage(chatId, `✅ Đã cập nhật nút "${buttonText}"`);
    } else {
      // Thêm nút mới
      buttons.push({ text: buttonText, command: commandText });
      bot.sendMessage(chatId, `✅ Đã thêm nút mới "${buttonText}"`);
    }
    
    // Lưu cấu hình
    inlineConfig.value = JSON.stringify(buttons);
    await inlineConfig.save();
    
    // Hiển thị danh sách các nút hiện tại
    await displayInlineButtons(bot, chatId);
    
  } catch (error) {
    console.error('Error in handleAddInlineCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thêm nút bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh xóa nút inline keyboard
 */
const handleRemoveInlineCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này! Cần quyền điều hành viên.");
      return;
    }
    
    // Phân tích cú pháp tin nhắn
    const parts = messageText.split('/removeinline ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: /removeinline nội dung nút");
      return;
    }
    
    const buttonText = parts[1].trim();
    
    if (!buttonText) {
      bot.sendMessage(chatId, "Nội dung nút không được để trống.");
      return;
    }
    
    // Tìm cấu hình inline buttons
    const inlineConfig = await Config.findOne({ key: 'INLINE_BUTTONS_GLOBAL' });
    
    if (!inlineConfig) {
      bot.sendMessage(chatId, "Chưa thiết lập nút nào.");
      return;
    }
    
    let buttons = [];
    try {
      buttons = JSON.parse(inlineConfig.value);
    } catch (error) {
      bot.sendMessage(chatId, "Cấu hình nút không hợp lệ.");
      return;
    }
    
    // Tìm và xóa nút
    const initialLength = buttons.length;
    buttons = buttons.filter(b => b.text !== buttonText);
    
    if (buttons.length < initialLength) {
      // Lưu cấu hình mới
      inlineConfig.value = JSON.stringify(buttons);
      await inlineConfig.save();
      bot.sendMessage(chatId, `✅ Đã xóa nút "${buttonText}"`);
    } else {
      bot.sendMessage(chatId, `❌ Không tìm thấy nút "${buttonText}"`);
    }
    
    // Hiển thị danh sách các nút hiện tại
    await displayInlineButtons(bot, chatId);
    
  } catch (error) {
    console.error('Error in handleRemoveInlineCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh xóa nút bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Hiển thị danh sách các nút inline hiện tại
 */
const displayInlineButtons = async (bot, chatId) => {
  try {
    // Tìm cấu hình inline buttons
    const inlineConfig = await Config.findOne({ key: 'INLINE_BUTTONS_GLOBAL' });
    
    if (!inlineConfig) {
      bot.sendMessage(chatId, "Chưa thiết lập nút nào.");
      return;
    }
    
    let buttons = [];
    try {
      buttons = JSON.parse(inlineConfig.value);
    } catch (error) {
      bot.sendMessage(chatId, "Cấu hình nút không hợp lệ.");
      return;
    }
    
    if (buttons.length === 0) {
      bot.sendMessage(chatId, "Chưa thiết lập nút nào.");
      return;
    }
    
    // Hiển thị danh sách nút
    let message = "*Danh sách nút hiện tại:*\n\n";
    
    buttons.forEach((button, index) => {
      message += `${index + 1}. Nội dung: *${button.text}*\n`;
      message += `   Lệnh: \`${button.command}\`\n\n`;
    });
    
    // Tạo keyboard inline
    const inlineKeyboard = {
      inline_keyboard: buttons.map(button => [
        { text: button.text, callback_data: button.command }
      ])
    };
    
    // Gửi tin nhắn với keyboard
    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    });
    
  } catch (error) {
    console.error('Error in displayInlineButtons:', error);
    bot.sendMessage(chatId, "Hiển thị danh sách nút bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý callback từ nút inline
 */
const handleInlineButtonCallback = async (bot, callbackQuery) => {
  try {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const command = callbackQuery.data;
    
    // Acknowledge the callback query to remove the loading indicator
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Kiểm tra quyền người dùng
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng chức năng này! Cần quyền điều hành viên.");
      return;
    }
    
    // Tạo một tin nhắn mới với nội dung của nút
    const msg = {
      chat: { id: chatId },
      from: callbackQuery.from,
      text: command,
      message_id: callbackQuery.message.message_id
    };
    
    // Gửi tin nhắn đến hàm xử lý tin nhắn
    // Đây là một kỹ thuật để tái sử dụng logic xử lý lệnh
    const { handleMessage } = require('./messageController');
    await handleMessage(bot, msg);
    
  } catch (error) {
    console.error('Error in handleInlineButtonCallback:', error);
  }
};

/**
 * Xử lý lệnh bật hiển thị buttons (/onbut)
 */
const handleEnableButtonsCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này! Cần quyền điều hành viên.");
      return;
    }
    
    // Tìm hoặc tạo Config cho trạng thái buttons
    let buttonsConfig = await Config.findOne({ key: `SHOW_BUTTONS_${chatId}` });
    
    if (!buttonsConfig) {
      buttonsConfig = new Config({
        key: `SHOW_BUTTONS_${chatId}`,
        value: 'true'
      });
    } else {
      buttonsConfig.value = 'true';
    }
    
    await buttonsConfig.save();
    bot.sendMessage(chatId, "✅ Đã bật hiển thị nút cho tất cả tin nhắn");
    
  } catch (error) {
    console.error('Error in handleEnableButtonsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh tắt hiển thị buttons (/offbut)
 */
const handleDisableButtonsCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này! Cần quyền điều hành viên.");
      return;
    }
    
    // Tìm hoặc tạo Config cho trạng thái buttons
    let buttonsConfig = await Config.findOne({ key: `SHOW_BUTTONS_${chatId}` });
    
    if (!buttonsConfig) {
      buttonsConfig = new Config({
        key: `SHOW_BUTTONS_${chatId}`,
        value: 'false'
      });
    } else {
      buttonsConfig.value = 'false';
    }
    
    await buttonsConfig.save();
    bot.sendMessage(chatId, "✅ Đã tắt hiển thị nút cho tất cả tin nhắn");
    
  } catch (error) {
    console.error('Error in handleDisableButtonsCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Lấy trạng thái hiển thị buttons
 */
const getButtonsStatus = async (chatId) => {
  try {
    const buttonsConfig = await Config.findOne({ key: `SHOW_BUTTONS_${chatId}` });
    return buttonsConfig ? buttonsConfig.value === 'true' : true; // Mặc định là true
  } catch (error) {
    console.error('Error in getButtonsStatus:', error);
    return true;
  }
};

/**
 * Lấy inline keyboard từ cấu hình
 */
const getInlineKeyboard = async (chatId) => {
  try {
    const inlineConfig = await Config.findOne({ key: 'INLINE_BUTTONS_GLOBAL' });
    if (!inlineConfig) return null;
    
    let buttons = [];
    try {
      buttons = JSON.parse(inlineConfig.value);
    } catch (error) {
      return null;
    }
    
    if (buttons.length === 0) return null;
    
    // Sắp xếp các buttons theo hàng ngang, mỗi hàng tối đa 3 buttons
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 3) {
      const row = buttons.slice(i, i + 3).map(button => {
        // Kiểm tra nếu command là URL
        if (button.command.startsWith('http://') || button.command.startsWith('https://')) {
          return {
            text: button.text,
            url: button.command
          };
        }
        return {
          text: button.text,
          callback_data: button.command
        };
      });
      keyboard.push(row);
    }
    
    return {
      inline_keyboard: keyboard
    };
  } catch (error) {
    console.error('Error in getInlineKeyboard:', error);
    return null;
  }
};

// Thêm button vào bộ 2
const handleAddInline2Command = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!(await isUserOperator(userId, chatId))) {
    bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này! Cần quyền điều hành viên.");
    return;
  }
  const args = msg.text.split(' ');
  if (args.length < 3) {
    bot.sendMessage(chatId, 'Cú pháp: /inline2 [Tên nút] [Link]');
    return;
  }
  const text = args[1];
  const command = args.slice(2).join(' ');
  let buttons = readButtons2();
  if (buttons.find(b => b.text === text)) {
    bot.sendMessage(chatId, 'Tên nút đã tồn tại!');
    return;
  }
  buttons.push({ text, command });
  writeButtons2(buttons);
  bot.sendMessage(chatId, `Đã thêm button: ${text}`);
};

// Xóa button khỏi bộ 2
const handleRemoveInline2Command = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!(await isUserOperator(userId, chatId))) {
    bot.sendMessage(chatId, "⛔ Bạn không có quyền sử dụng lệnh này! Cần quyền điều hành viên.");
    return;
  }
  const args = msg.text.split(' ');
  if (args.length < 2) {
    bot.sendMessage(chatId, 'Cú pháp: /removeinline2 [Tên nút]');
    return;
  }
  const text = args[1];
  let buttons = readButtons2();
  const newButtons = buttons.filter(b => b.text !== text);
  if (newButtons.length === buttons.length) {
    bot.sendMessage(chatId, 'Không tìm thấy button này!');
    return;
  }
  writeButtons2(newButtons);
  bot.sendMessage(chatId, `Đã xóa button: ${text}`);
};

// Hiển thị danh sách button bộ 2
const handleButtons2Command = async (bot, msg) => {
  const chatId = msg.chat.id;
  const buttons = readButtons2();
  if (!buttons.length) {
    bot.sendMessage(chatId, 'Chưa có button nào!');
    return;
  }
  // Sắp xếp hàng ngang, mỗi hàng 3 nút
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 3) {
    const row = buttons.slice(i, i + 3).map(b => {
      if (b.command.startsWith('http://') || b.command.startsWith('https://')) {
        return { text: b.text, url: b.command };
      }
      return { text: b.text, callback_data: b.command };
    });
    keyboard.push(row);
  }
  bot.sendMessage(chatId, 'Danh sách button:', {
    reply_markup: { inline_keyboard: keyboard }
  });
};

const handleChatWithButtons2Command = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!(await isUserOperator(userId, chatId))) {
    bot.sendMessage(chatId, "");
    return;
  }
  const buttons = readButtons2();
  // Sắp xếp hàng ngang, mỗi hàng 3 nút
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 3) {
    const row = buttons.slice(i, i + 3).map(b => {
      if (b.command.startsWith('http://') || b.command.startsWith('https://')) {
        return { text: b.text, url: b.command };
      }
      return { text: b.text, callback_data: b.command };
    });
    keyboard.push(row);
  }
  const reply_markup = { inline_keyboard: keyboard };

  // Nếu là reply vào tin nhắn có media
  if (msg.reply_to_message) {
    const r = msg.reply_to_message;
    if (r.photo) {
      // Ảnh
      const fileId = r.photo[r.photo.length - 1].file_id;
      await bot.sendPhoto(chatId, fileId, { caption: r.caption || '', reply_markup });
      return;
    }
    if (r.video) {
      await bot.sendVideo(chatId, r.video.file_id, { caption: r.caption || '', reply_markup });
      return;
    }
    if (r.document) {
      await bot.sendDocument(chatId, r.document.file_id, { caption: r.caption || '', reply_markup });
      return;
    }
    if (r.animation) {
      await bot.sendAnimation(chatId, r.animation.file_id, { caption: r.caption || '', reply_markup });
      return;
    }
    if (r.text) {
      await bot.sendMessage(chatId, r.text, { reply_markup });
      return;
    }
    // Nếu không có gì phù hợp
    bot.sendMessage(chatId, 'Không hỗ trợ loại tin nhắn này!');
    return;
  }
  // Nếu không phải reply, lấy nội dung sau /chat
  const args = msg.text.split(' ');
  if (args.length < 2) {
    bot.sendMessage(chatId, 'Cú pháp: /chat [nội dung hoặc reply vào tin nhắn]');
    return;
  }
  const content = msg.text.substring(6).trim();
  if (!content) {
    bot.sendMessage(chatId, 'Cú pháp: /chat [nội dung hoặc reply vào tin nhắn]');
    return;
  }
  await bot.sendMessage(chatId, content, { reply_markup });
};

// Add missing handleRemoveCommand function
const handleRemoveCommand = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!(await isUserOwner(userId))) {
    bot.sendMessage(chatId, "⛔ Chỉ owner mới có thể sử dụng lệnh này!");
    return;
  }
  
  const args = msg.text.split(' ');
  if (args.length < 2) {
    bot.sendMessage(chatId, 'Cú pháp: /remove [userID]');
    return;
  }
  
  const targetUserId = args[1];
  
  try {
    // Remove user from User collection
    const result = await User.findOneAndDelete({ userId: targetUserId });
    
    if (result) {
      bot.sendMessage(chatId, `✅ Đã xóa người dùng ${result.username || targetUserId} khỏi hệ thống`);
    } else {
      bot.sendMessage(chatId, `❌ Không tìm thấy người dùng với ID: ${targetUserId}`);
    }
  } catch (error) {
    console.error('Error in handleRemoveCommand:', error);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi xóa người dùng');
  }
};

/**
 * Xử lý lệnh bật QR code (/qr on)
 */
const handleQROnCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "");
      return;
    }
    
    // Tìm hoặc tạo Group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({ chatId: chatId.toString() });
    }
    
    // Bật QR
    group.qrEnabled = true;
    await group.save();
    
    bot.sendMessage(
      chatId,
      `✅ *Đã bật tính năng QR code tự động!*

📋 Trong nhóm, khi tin nhắn có đủ *số tài khoản*, *tên chủ tài khoản*, *tên ngân hàng* và *số tiền*, bot sẽ tự gửi ảnh *QR VietQR* để quét chuyển khoản.


*Ví dụ:*
\`\`\`
0123456789
NGUYEN VAN A
VietinBank
798.000 vnd
Ghi Chú (Tùy chọn)
\`\`\``,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Error in handleQROnCommand:', error);
    bot.sendMessage(chatId, "❌ Có lỗi xảy ra khi bật QR code!");
  }
};

/**
 * Xử lý lệnh tắt QR code (/qr off)
 */
const handleQROffCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, "");
      return;
    }
    
    // Tìm Group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({ chatId: chatId.toString() });
    }
    
    // Tắt QR
    group.qrEnabled = false;
    await group.save();
    
    bot.sendMessage(chatId, "❌ Đã tắt tính năng QR code tự động!");
    
  } catch (error) {
    console.error('Error in handleQROffCommand:', error);
    bot.sendMessage(chatId, "❌ Có lỗi xảy ra khi tắt QR code!");
  }
};

/**
 * Xử lý lệnh /pic on - bật chế độ xử lý ảnh bill
 */
const handlePicOnCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, messages.operatorOnly);
      return;
    }
    
    // Lưu trạng thái pic mode vào Config
    await Config.findOneAndUpdate(
      { key: `pic_mode_${chatId}` },
      { 
        key: `pic_mode_${chatId}`,
        value: true,
        description: 'Picture bill processing mode',
        updatedBy: userId.toString()
      },
      { upsert: true }
    );
    
    bot.sendMessage(chatId, "✅ Đã bật chế độ xử lý ảnh bill!\n\n📋 Hướng dẫn:\n• Reply \"1\" vào ảnh bill → Tự động thực hiện lệnh +[số tiền]\n• Reply \"2\" vào ảnh bill → Tự động thực hiện lệnh %[số tiền]\n• Reply \"3\" vào ảnh bill → Tự động thực hiện lệnh -[số tiền]\n\nSử dụng /pic off để tắt chế độ này.", { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in handlePicOnCommand:', error);
    bot.sendMessage(chatId, "");
  }
};

/**
 * Xử lý lệnh /pic off - tắt chế độ xử lý ảnh bill
 */
const handlePicOffCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Kiểm tra quyền Operator
    if (!(await isUserOperator(userId, chatId))) {
      bot.sendMessage(chatId, messages.operatorOnly);
      return;
    }
    
    // Xóa trạng thái pic mode
    await Config.findOneAndDelete({ key: `pic_mode_${chatId}` });
    
    bot.sendMessage(chatId, "❌ Đã tắt chế độ xử lý ảnh bill!");
    
  } catch (error) {
    console.error('Error in handlePicOffCommand:', error);
    bot.sendMessage(chatId, "");
  }
};

module.exports = {
  handleListUsersCommand,
  handleCurrencyUnitCommand,
  handleSetUsdtAddressCommand,
  handleGetUsdtAddressCommand,
  handleSetOwnerCommand,
  handleMigrateDataCommand,
  handleAddAdminCommand,
  handleRemoveAdminCommand,
  handleListAdminsCommand,
  handleAddOperatorInGroupCommand,
  handleRemoveOperatorInGroupCommand,
  handleListOperatorsCommand,
  handleListGroupsCommand,
  handleGroupsCommand,
  handleMessageLogsCommand,
  handleAddInlineCommand,
  handleRemoveInlineCommand,
  displayInlineButtons,
  handleInlineButtonCallback,
  handleEnableButtonsCommand,
  handleDisableButtonsCommand,
  getButtonsStatus,
  getInlineKeyboard,
  handleAddInline2Command,
  handleRemoveInline2Command,
  handleButtons2Command,
  handleChatWithButtons2Command,
  handleRemoveCommand,
  handleQROnCommand,
  handleQROffCommand,
  handlePicOnCommand,
  handlePicOffCommand
}; 