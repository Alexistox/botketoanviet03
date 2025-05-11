const User = require('../models/User');
const Group = require('../models/Group');

/**
 * Chuyển đổi dữ liệu từ cấu trúc cũ (User.allowedGroups) sang cấu trúc mới (Group.operators)
 */
const migrateUserGroupsToOperators = async () => {
  try {
    console.log('Bắt đầu chuyển đổi dữ liệu từ allowedGroups sang operators...');
    
    // Tìm tất cả user có quyền trong các nhóm
    const users = await User.find({
      $or: [
        { isAllowed: true },
        { allowedGroups: { $exists: true, $ne: [] } }
      ]
    });
    
    console.log(`Tìm thấy ${users.length} người dùng có quyền truy cập.`);
    
    for (const user of users) {
      // Nếu có quyền toàn cục (isAllowed), cần tìm tất cả các nhóm
      if (user.isAllowed) {
        console.log(`Người dùng ${user.username} có quyền toàn cục.`);
        // Tìm các nhóm mà người dùng này cần được thêm vào
        const groups = await Group.find({});
        
        for (const group of groups) {
          // Kiểm tra xem người dùng đã ở trong operators chưa
          const existingOperator = group.operators.find(op => op.userId === user.userId);
          if (!existingOperator) {
            console.log(`Thêm ${user.username} vào nhóm ${group.chatId}`);
            group.operators.push({
              userId: user.userId,
              username: user.username
            });
            await group.save();
          }
        }
      }
      
      // Xử lý các nhóm cụ thể
      if (user.allowedGroups && user.allowedGroups.length > 0) {
        console.log(`Người dùng ${user.username} có quyền trong ${user.allowedGroups.length} nhóm cụ thể.`);
        
        for (const groupId of user.allowedGroups) {
          // Tìm hoặc tạo nhóm
          let group = await Group.findOne({ chatId: groupId });
          if (!group) {
            group = new Group({ chatId: groupId });
          }
          
          // Kiểm tra xem người dùng đã ở trong operators chưa
          const existingOperator = group.operators.find(op => op.userId === user.userId);
          if (!existingOperator) {
            console.log(`Thêm ${user.username} vào nhóm ${groupId}`);
            group.operators.push({
              userId: user.userId,
              username: user.username
            });
            await group.save();
          }
        }
      }
    }
    
    console.log('Hoàn thành chuyển đổi dữ liệu.');
    return { success: true, message: 'Hoàn thành chuyển đổi dữ liệu.' };
  } catch (error) {
    console.error('Lỗi khi chuyển đổi dữ liệu:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  migrateUserGroupsToOperators
}; 