const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  isOwner: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  allowedGroups: {
    type: [String],
    default: []
  },
  firstName: {
    type: String,
    default: ''
  },
  lastName: {
    type: String,
    default: ''
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  subscriptionIntroSent: {
    type: Boolean,
    default: false
  },
  groupPermissions: [{
    chatId: String,
    isOperator: { type: Boolean, default: false }
  }]
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

module.exports = User;

// Kiểm tra quyền Owner
const isUserOwner = async (userId) => {
  const user = await User.findOne({ userId: userId.toString() });
  return user && user.isOwner;
};

// Kiểm tra quyền Admin
const isUserAdmin = async (userId) => {
  const user = await User.findOne({ userId: userId.toString() });
  return (user && user.isAdmin) || (user && user.isOwner);
};

// Kiểm tra quyền Operator trong nhóm cụ thể
const isUserOperator = async (userId, chatId) => {
  // Kiểm tra Owner và Admin (có quyền toàn hệ thống)
  if (await isUserAdmin(userId)) return true;
  
  // Kiểm tra Operator trong nhóm
  const group = await Group.findOne({ chatId: chatId.toString() });
  if (group && group.operators) {
    return group.operators.some(op => op.userId === userId.toString());
  }
  
  return false;
};

// Hàm kiểm tra phân quyền tổng quát
const checkPermission = async (userId, chatId, permissionLevel) => {
  switch(permissionLevel) {
    case 'owner':
      return await isUserOwner(userId);
    case 'admin':
      return await isUserAdmin(userId);
    case 'operator':
      return await isUserOperator(userId, chatId);
    case 'user':
      return true; // Tất cả đều là user
    default:
      return false;
  }
};

// Thêm Admin (chỉ Owner có quyền)
const handleAddAdminCommand = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageText = msg.text;
  
  // Chỉ Owner mới có quyền thêm Admin
  if (!await isUserOwner(userId)) {
    bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu bot mới có thể thêm quản trị viên");
    return;
  }
  
  // Phân tích username hoặc ID người dùng
  const parts = messageText.split('/addadmin ');
  if (parts.length !== 2) {
    bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /addadmin @username hoặc /addadmin 123456789");
    return;
  }
  
  const targetUser = await extractUserFromCommand(parts[1]);
  if (!targetUser) {
    bot.sendMessage(chatId, "Không tìm thấy người dùng. Vui lòng đảm bảo tên người dùng hoặc ID chính xác.");
    return;
  }
  
  // Cập nhật quyền Admin
  targetUser.isAdmin = true;
  await targetUser.save();
  
  bot.sendMessage(chatId, `✅ Người dùng ${targetUser.username || targetUser.userId} đã được đặt làm quản trị viên`);
};

// Thêm Operator (Owner và Admin có quyền)
const handleAddOperatorCommand = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  const messageText = msg.text;
  
  // Chỉ Owner và Admin có quyền thêm Operator
  if (!await isUserAdmin(userId)) {
    bot.sendMessage(chatId, "⛔ Chỉ chủ sở hữu và quản trị viên mới có thể thêm người điều hành");
    return;
  }
  
  // Phân tích username hoặc ID người dùng
  const parts = messageText.split('加操作人 ');
  if (parts.length !== 2) {
    bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: 加操作人 @username hoặc 加操作人 123456789");
    return;
  }
  
  const targetUser = await extractUserFromCommand(parts[1]);
  if (!targetUser) {
    bot.sendMessage(chatId, "Không tìm thấy người dùng. Vui lòng đảm bảo tên người dùng hoặc ID chính xác.");
    return;
  }
  
  // Tìm nhóm hiện tại
  let group = await Group.findOne({ chatId: chatId.toString() });
  if (!group) {
    group = new Group({
      chatId: chatId.toString(),
      operators: []
    });
  }
  
  // Kiểm tra người dùng đã là operator chưa
  const existingOperator = group.operators.find(op => op.userId === targetUser.userId);
  if (existingOperator) {
    bot.sendMessage(chatId, `Người dùng ${targetUser.username || targetUser.userId} đã là người điều hành`);
    return;
  }
  
  // Thêm người dùng vào danh sách operator
  group.operators.push({
    userId: targetUser.userId,
    username: targetUser.username || targetUser.firstName,
    addedBy: username,
    addedAt: new Date()
  });
  
  await group.save();
  
  // Cập nhật quyền trong user document
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
  
  bot.sendMessage(chatId, `✅ Người dùng ${targetUser.username || targetUser.userId} đã được thêm làm người điều hành cho nhóm này`);
};

const checkAndRegisterUser = async (userId, username, firstName, lastName) => {
  try {
    let user = await User.findOne({ userId: userId.toString() });
    
    if (!user) {
      // Kiểm tra xem đã có owner chưa
      const ownerExists = await User.findOne({ isOwner: true });
      
      // Nếu chưa có owner, user đầu tiên sẽ là owner
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
        console.log(`User ${username} (ID: ${userId}) is now the bot owner`);
      }
    }
    
    return user;
  } catch (error) {
    console.error('Error in checkAndRegisterUser:', error);
    return null;
  }
};

// Phân loại các lệnh theo cấp độ quyền
const commandPermissions = {
  // Owner commands
  '/setowner': 'owner',
  '/addadmin': 'owner',
  '/removeadmin': 'owner',
  
  // Admin commands
  '/usdt': 'admin',
  '/usdt2': 'owner',
  '/migrate': 'admin',
  '/setplan': 'admin',
  '/grantsub': 'admin',

  // Operator commands
  '设置费率': 'operator',
  '设置汇率': 'operator',
  '下发': 'operator',
  '上课': 'operator',
  '+': 'operator',
  '-': 'operator',
  '/x': 'operator',
  '/sx': 'operator',
  '/delete': 'operator',
  '/d': 'operator',
  '/d2': 'operator',
  '/hiddenCards': 'operator',
  '/m': 'operator',
  
  // User commands - anyone can use
  '/t': 'user',
  '/v': 'user',
  '/u': 'user',
  '/help': 'user',
  '/start': 'user',
  '/st': 'user',
  '/plan': 'user',
  '/goi': 'user',
  '/subscribe': 'user',
  '/mysub': 'user',
  '/off': 'user',
  '/report': 'user',
  '结束': 'user'
};

// REMOVED: handleMessage function should not be in model files
// This function has been moved to controllers/messageController.js

// Liệt kê admins
const handleListAdminsCommand = async (bot, msg) => {
  const chatId = msg.chat.id;
  
  const admins = await User.find({ isAdmin: true });
  if (!admins || admins.length === 0) {
    bot.sendMessage(chatId, "没有管理员");
    return;
  }
  
  let message = "📊 *管理员列表*\n\n";
  admins.forEach((admin, index) => {
    message += `${index + 1}. ${admin.username || admin.firstName}: ${admin.userId}${admin.isOwner ? ' (所有者)' : ''}\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
};

// Liệt kê operators trong nhóm
const handleListOperatorsCommand = async (bot, msg) => {
  const chatId = msg.chat.id;
  
  const group = await Group.findOne({ chatId: chatId.toString() });
  if (!group || !group.operators || group.operators.length === 0) {
    bot.sendMessage(chatId, "此群组没有操作员");
    return;
  }
  
  let message = "📊 *此群组的操作员列表*\n\n";
  group.operators.forEach((operator, index) => {
    message += `${index + 1}. ${operator.username}: ${operator.userId}\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}; 