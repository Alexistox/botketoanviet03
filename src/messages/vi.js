module.exports = {
  // Thông báo chung
  welcome: "Chào mừng {name} tham gia nhóm! 🎉",
  error: "Đã xảy ra lỗi. Vui lòng thử lại sau.",
  processing: "⏳ Đang xử lý...",
  noPermission: "",
  ownerOnly: "",
  adminOnly: "",
  operatorOnly: "",

  // Thông báo lỗi
  errorProcessingMessage: "Xử lý tin nhắn bị lỗi",
  errorProcessingImage: "Xử lý hình ảnh bị lỗi",
  errorProcessingRate: "Xử lý lệnh tỷ lệ bị lỗi",
  errorProcessingExchangeRate: "Xử lý lệnh tỷ giá bị lỗi",
  errorProcessingDualRate: "Xử lý lệnh tỷ lệ kép bị lỗi",
  errorDisplayHelp: "Hiển thị thông tin trợ giúp bị lỗi",

  // Thông báo ngân hàng
  bankInfoNotFound: "❌ Không thể nhận dạng thông tin tài khoản ngân hàng từ hình ảnh này.",
  bankInfoProcessing: "⏳ Đang lấy thông tin tài khoản ngân hàng...",

  // Thông báo lệnh
  invalidCommand: "Lệnh không hợp lệ. Định dạng: {format}",
  commandSyntax: "Cú pháp: {command} [nội dung hoặc reply vào tin nhắn]",
  endOfWork: "Cảm ơn mọi người đã làm việc chăm chỉ, chúc mọi người phát tài! 💰💸🍀",

  // Thông báo quyền
  permissionMessages: {
    owner: "",
    admin: "",
    operator: ""
  },

  // Subscription USDT
  subscriptionExpired:
    '⛔ *Gói subscription đã hết hạn*\n\n' +
    'Bot kế toán yêu cầu gói còn hạn để sử dụng.\n' +
    '• Op được cấp qua `/op` dùng theo gói của người cấp — hết gói người cấp thì op cũng tạm dừng.\n' +
    '• Xem gói: `/plan` hoặc `/goi`\n' +
    '• Đăng ký: `/subscribe day|month|year`\n' +
    '• Trạng thái: `/mysub`',
  subscriptionNoPlans: 'Chưa có gói subscription. Admin cần cấu hình trước.',
  subscriptionSubscribeUsage: 'Cú pháp: `/subscribe day|month|year`\nVí dụ: `/subscribe month`',
  subscriptionSetplanUsage: 'Cú pháp: `/setplan day|month|year <usdt>`\nVí dụ: `/setplan month 30`',
  subscriptionGrantsubUsage: 'Cú pháp: `/grantsub @username day|month|year`',
  subscriptionAdminBypass: '✅ Bạn là Owner/Admin — không cần gói subscription.',
  subscriptionIntro:
    '👋 *Chào mừng đến Bot Kế Toán!*\n\n' +
    '🧮 *Miễn phí:* máy tính (`3+5`), `/t`, `/v` — dùng ngay không cần gói.\n\n' +
    '📒 *Cần gói subscription* để dùng sổ kế toán nhóm: ghi nợ `+`, rút `-`, phát hành `%`, thiết lập tỷ giá `/d`, …\n\n' +
    '💳 Thanh toán USDT (TRC20), tự xác nhận trong ~1–2 phút.\n' +
    '👇 Chọn gói bên dưới:',
  subscriptionPlanMenu:
    '📦 *Gói subscription USDT (TRC20)*\n\n' +
    'Chọn gói bên dưới để đăng ký.\n' +
    'Máy tính (`/t`, `/v`, biểu thức) vẫn dùng miễn phí.',
  subscriptionBtnDay: '📅 Ngày',
  subscriptionBtnMonth: '📆 Tháng',
  subscriptionBtnYear: '🗓 Năm',
  subscriptionBtnMysub: '📋 Gói của tôi',
  subscriptionReplyMenuHint: '👇 Menu nhanh — bấm nút bên dưới:',
  subscriptionReplyPlan: '📦 Gói USDT',
  subscriptionReplyMysub: '📋 Gói của tôi',
  subscriptionReplyHelp: '❓ Trợ giúp',
  subscriptionReplyCalcBtn: '🧮 Máy tính',
  subscriptionReplyCalcHint:
    '🧮 *Máy tính miễn phí*\n\n' +
    '• Biểu thức: `1000+500`, `3*25`\n' +
    '• VND → USDT: `/t 1000000`\n' +
    '• USDT → VND: `/v 100`',
  subscriptionReplyHide: '⌨️ Ẩn menu',
  subscriptionPaymentFeeNote:
    '⚠️ *Lưu ý phí chuyển USDT (TRC20):*\n' +
    '• *Bên chuyển* tự chịu phí mạng / phí sàn (TRX hoặc phí rút).\n' +
    '• *Ví bot (bên nhận)* phải nhận *đúng* số tiền ghi bên trên.\n' +
    '• Nhận thiếu hoặc thừa → bot *không* tự kích hoạt gói.\n' +
    '• Chuyển đúng số tiền → bot tự cộng gói trong ~1–2 phút.'
}; 