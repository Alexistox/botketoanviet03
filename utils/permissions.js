const User = require('../models/User');
const Group = require('../models/Group');

/**
 * Kiểm tra quyền hạn owner
 * @param {string} userId - ID người dùng cần kiểm tra
 * @returns {Promise<boolean>} - true nếu là owner, false nếu không phải
 */
const isUserOwner = async (userId) => {
  try {
    const user = await User.findOne({ userId: userId.toString() });
    return user && user.isOwner;
  } catch (error) {
    console.error('Error in isUserOwner:', error);
    return false;
  }
};

/**
 * Kiểm tra quyền hạn admin
 * @param {string} userId - ID người dùng cần kiểm tra
 * @returns {Promise<boolean>} - true nếu là admin hoặc owner, false nếu không phải
 */
const isUserAdmin = async (userId) => {
  try {
    const user = await User.findOne({ userId: userId.toString() });
    return (user && user.isAdmin) || (user && user.isOwner);
  } catch (error) {
    console.error('Error in isUserAdmin:', error);
    return false;
  }
};

/**
 * Kiểm tra quyền hạn operator trong nhóm cụ thể
 * @param {string} userId - ID người dùng cần kiểm tra
 * @param {string} chatId - ID của chat/nhóm
 * @returns {Promise<boolean>} - true nếu là operator, admin hoặc owner, false nếu không phải
 */
const isUserOperator = async (userId, chatId) => {
  try {
    // Owner và Admin có toàn quyền
    if (await isUserAdmin(userId)) {
      return true;
    }

    // Kiểm tra trong danh sách operator của nhóm
    const group = await Group.findOne({ chatId: chatId.toString() });
    if (group && group.operators) {
      return group.operators.some(op => op.userId === userId.toString());
    }

    return false;
  } catch (error) {
    console.error('Error in isUserOperator:', error);
    return false;
  }
};

/**
 * Trích xuất thông tin người dùng từ một chuỗi đầu vào
 * Hỗ trợ cả username (với hoặc không có @) và ID người dùng
 * @param {string} input - Username hoặc ID người dùng
 * @returns {Promise<Object|null>} - Thông tin người dùng hoặc null nếu không tìm thấy
 */
const extractUserFromCommand = async (input) => {
  try {
    let username = input.trim();
    
    // Xóa ký tự @ nếu có
    if (username.startsWith('@')) {
      username = username.substring(1);
    }
    
    // Nếu không có input, không tìm kiếm
    if (!username) {
      return null;
    }
    
    let user;
    
    // Thử tìm theo userId
    user = await User.findOne({ userId: username });
    
    // Nếu không tìm thấy, thử tìm theo username (không phân biệt hoa thường)
    if (!user) {
      user = await User.findOne({ 
        username: { $regex: new RegExp(`^${username}$`, 'i') }
      });
    }
    
    return user;
  } catch (error) {
    console.error('Error in extractUserFromCommand:', error);
    return null;
  }
};

module.exports = {
  isUserOwner,
  isUserAdmin,
  isUserOperator,
  extractUserFromCommand
}; 