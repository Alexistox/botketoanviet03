var telegramToken = 'TELEGRAM_BOT_TOKEN';
var telegramUrl = 'https://api.telegram.org/bot' + telegramToken;
var openAiApiKey = 'OPENAI_API_KEY'; // Thay bằng API key của bạn

// WebApp URL do Google Apps Script cung cấp khi Deploy dự án
var webAppUrl = 'YOUR_WEB_APP_URL';

// Hàm định dạng số: không có dấu phẩy phần nghìn, dấu chấm phần thập phân
function formatSmart(num) {
  var floorVal = Math.floor(Math.abs(num));
  var fraction = Math.abs(num) - floorVal;
  
  if (fraction < 1e-9) {
    // Số nguyên: chỉ hiển thị số không có định dạng
    return Math.round(num).toString();
  } else {
    // Số thập phân: hiển thị với 2 chữ số sau dấu chấm
    return num.toFixed(2);
  }
}

function formatRateValue(num) {
  // Đảm bảo num là số
  num = parseFloat(num);
  if (isNaN(num)) {
    return "0.00";
  }
  
  // Luôn hiển thị 2 chữ số thập phân
  return num.toFixed(2);
}

// Hàm để lấy toàn bộ lịch sử lệnh +, - (không tính +0, -0)
function getFullDepositHistory(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return "";
  }
  
  // Tìm dòng lệnh /clear cuối cùng
  var lastClearRow = findLastClearRow(sheet);
  
  // Lấy tất cả giá trị từ cột chi tiết (cột 11) sau lệnh /clear cuối cùng
  var allValues = [];
  if (lastClearRow < lastRow) {
    var values = sheet.getRange(lastClearRow + 1, 11, lastRow - lastClearRow).getValues();
    
    // Lọc các giao dịch không có giá trị và giá trị bằng 0
    allValues = values.flat().filter(value => {
      if (!value) return false; // Loại bỏ chuỗi rỗng
      // Loại bỏ giao dịch có giá trị 0
      if (value.includes(" +0 ") || value.includes(" -0 ") || 
          value.includes(" = 0 ") || value.includes("= 0,00 ")) return false; 
      return true;
    });
    
    // Định dạng lại các giá trị
    allValues = allValues.map(value => {
      return value
        .replace(" = ", "=")
        .replace(" (", "(")
        .replace(") ", ")");
    });
  }
  
  return allValues.join("\n");
}

// Hàm để lấy toàn bộ lịch sử lệnh %
function getFullPaymentHistory(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return "";
  }
  
  // Tìm dòng lệnh /clear cuối cùng
  var lastClearRow = findLastClearRow(sheet);
  
  // Lấy tất cả giá trị từ cột chi tiết thanh toán (cột 12) sau lệnh /clear cuối cùng
  var allValues = [];
  if (lastClearRow < lastRow) {
    var values = sheet.getRange(lastClearRow + 1, 12, lastRow - lastClearRow).getValues();
    
    // Lọc các thanh toán không có giá trị
    allValues = values.flat().filter(value => value);
    
    // Định dạng lại các giá trị
    allValues = allValues.map(value => {
      return value
        .replace(" +", "+")
        .replace(" (", "(")
        .replace(") ", ")");
    });
  }
  
  return allValues.join("\n");
}

// Hàm xử lý lệnh /report
function handleReportCommand(chatId, sheet, username) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sendTelegramMessage(chatId, "暂无任何交易数据可用于生成报告。");
    return;
  }
  
  // Lấy các giá trị hiện tại
  var totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
  var totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
  var usdtPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
  var remain = parseFloat(sheet.getRange(lastRow, 6).getValue()) || 0;
  var xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var yValue = parseFloat(sheet.getRange(lastRow, 14).getValue()) || 0;
  
  // Tính tỷ lệ đã chạy
  var completionRate = 0;
  if (totalUSDT > 0) {
    completionRate = (usdtPaid / totalUSDT) * 100;
  }
  
  // Lấy thông tin các thẻ
  var cardSummary = getCardSummary(sheet);
  
  // Lấy toàn bộ lịch sử giao dịch
  var depositHistory = getFullDepositHistory(sheet);
  var paymentHistory = getFullPaymentHistory(sheet);
  
  // Tạo báo cáo
  var currencyUnit = getCurrencyUnit();
  var todayStr = new Date().toLocaleDateString('vi-VN');
  var currentTime = new Date().toLocaleTimeString('vi-VN');
  
  var report = `*交易报告 (${todayStr})*\n`;
  
  // Phần tổng quan
  report += `*概览*\n`;
  report += `总金额: ${formatSmart(totalVND)}\n`;
  report += `总 ${currencyUnit}: ${formatSmart(totalUSDT)}\n`;
  report += `${currencyUnit} 已支付: ${formatSmart(usdtPaid)}\n`;
  report += `${currencyUnit} 剩余: ${formatSmart(remain)}\n`;
  report += `完成率: ${formatSmart(completionRate)}%\n`;
  report += `费率: ${formatRateValue(xValue)}%| `;
  report += `汇率: ${formatRateValue(yValue)}\n`;
  
  // Phần chi tiết thẻ
  if (cardSummary && cardSummary.length > 0) {
    report += `*今日卡*\n\`\`\`\n${cardSummary.join("\n")}\n\`\`\``;
  }
  
  // Phần lịch sử giao dịch
  if (depositHistory) {
   report += `*今日入款*\n\`\`\`\n${depositHistory}\n\`\`\``;
  }
  
  // Phần lịch sử thanh toán
  if (paymentHistory) {
report += `*今日下发*\n\`\`\`\n${paymentHistory}\n\`\`\``;
  }
  
  // Gửi báo cáo
  sendTelegramMessage(chatId, report, "Markdown");
}

// Function to find the row number of the last /clear command
function findLastClearRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 1; // Return header row if no data
  }
  
  // Get all messages from column 2
  var messages = sheet.getRange(2, 2, lastRow - 1).getValues();
  
  // Start from the last row and go up to find the last /clear command
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i][0] === '/clear') {
      return i + 2; // +2 because i is 0-based and we need to account for the header row
    }
  }
  
  // If no /clear command found, return the first data row
  return 2;
}
/////////////////////////////
// Kiểm tra địa chỉ TRC20
/////////////////////////////
function isTrc20Address(str) {
  var re = /^T[1-9A-Za-z]{33}$/;
  return re.test(str);
}

function handleTrc20Address(chatId, address, username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "Trc20Addresses";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Address", "Username", "Timestamp", "Chat ID"]);
  }
  var now = new Date().toLocaleString("vi-VN");
  sheet.appendRow([address, username, now, chatId]);
  
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var userList = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === address) {
      userList.push(data[i][1]);
    }
  }
  var uniqueUsers = [...new Set(userList)].join(", ");
  var msg = "USDT-TRC20地址:\n\n`" + address + "`\n\n交易前请向多人确认\n点击地址复制!";
  sendTelegramMessage(chatId, msg, "Markdown");
}
// Thêm hàm này vào dưới hàm handleTrc20Address
// Hàm để xử lý ảnh và trích xuất thông tin ngân hàng bằng OpenAI GPT-4 Vision
function extractBankInfoFromImage(photoFileId, chatId) {
  try {
    // Lấy thông tin file từ Telegram
    var fileInfoUrl = telegramUrl + "/getFile?file_id=" + photoFileId;
    var fileInfo = JSON.parse(UrlFetchApp.fetch(fileInfoUrl).getContentText());
    
    if (!fileInfo.ok) {
      sendTelegramMessage(chatId, "无法获取图片文件信息.");
      return null;
    }
    
    var filePath = fileInfo.result.file_path;
    var fileUrl = "https://api.telegram.org/file/bot" + telegramToken + "/" + filePath;
    
    // Tạo base64 URL cho ảnh
    var imageBlob = UrlFetchApp.fetch(fileUrl).getBlob();
    var base64Image = Utilities.base64Encode(imageBlob.getBytes());
    var base64Url = "data:image/jpeg;base64," + base64Image;
    
    // Chuẩn bị yêu cầu gửi đến OpenAI API
    var openAiUrl = "https://api.openai.com/v1/chat/completions";
    var prompt = "Trích xuất thông tin tài khoản ngân hàng từ hình ảnh này. Hãy xác định: tên ngân hàng (ngôn ngữ gốc), tên ngân hàng bằng tiếng Anh, số tài khoản, và tên chủ tài khoản. Trả về kết quả dưới dạng JSON với các trường: bankName, bankNameEnglish, accountNumber, accountName. Nếu không tìm thấy thông tin, hãy trả về trường đó là null.";
    
    var requestBody = {
      "model": "gpt-4o", // Sử dụng GPT-4 Vision
      "messages": [
        {
          "role": "user",
          "content": [
            {"type": "text", "text": prompt},
            {
              "type": "image_url",
              "image_url": {
                "url": base64Url
              }
            }
          ]
        }
      ],
      "max_tokens": 300
    };
    
    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'headers': {
        'Authorization': 'Bearer ' + openAiApiKey
      },
      'payload': JSON.stringify(requestBody)
    };
    
    var response = UrlFetchApp.fetch(openAiUrl, options);
    var data = JSON.parse(response.getContentText());
    
    // Kiểm tra nếu không có phản hồi
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      sendTelegramMessage(chatId, "无法获取图片文件信息.");
      return null;
    }
    
    // Phân tích kết quả trả về từ OpenAI
    var content = data.choices[0].message.content;
    
    try {
      // Tìm đoạn JSON trong phản hồi
      var jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        var jsonStr = jsonMatch[0];
        var bankInfo = JSON.parse(jsonStr);
        return bankInfo;
      } else {
        // Nếu không tìm thấy JSON, tạo đối tượng và trích xuất thông tin bằng cách phân tích văn bản
        var bankInfo = {
          bankName: null,
          bankNameEnglish: null,
          accountNumber: null,
          accountName: null
        };
        
        // Tìm thông tin ngân hàng từ văn bản
        if (content.includes("银行") || content.includes("bank")) {
          var bankMatch = content.match(/(?:ngân hàng|bank)[:\s]+([^\n.,]+)/i);
          if (bankMatch) bankInfo.bankName = bankMatch[1].trim();
        }
        
        // Tìm tên ngân hàng tiếng Anh
        if (content.includes("英文") || content.includes("English")) {
          var bankEnglishMatch = content.match(/(?:tiếng Anh|English)[:\s]+([^\n.,]+)/i);
          if (bankEnglishMatch) bankInfo.bankNameEnglish = bankEnglishMatch[1].trim();
        }
        
        // Tìm số tài khoản
        var accountMatch = content.match(/(?:số tài khoản|số tk|account number|account no)[:\s]+([0-9\s-]+)/i);
        if (accountMatch) bankInfo.accountNumber = accountMatch[1].replace(/\s+/g, '').trim();
        
        // Tìm tên chủ tài khoản
        var nameMatch = content.match(/(?:tên|chủ tài khoản|tên tk|account name|beneficiary)[:\s]+([^\n.,]+)/i);
        if (nameMatch) bankInfo.accountName = nameMatch[1].trim();
        
        return bankInfo;
      }
    } catch (error) {
      console.log("无法获取图片文件信息: " + error.message);
      return null;
    }
    
  } catch (error) {
    sendTelegramMessage(chatId, "解析图片时发生错误: " + error.message);
    return null;
  }
}


function getScriptProps() {
  return PropertiesService.getScriptProperties();
}
// Add these two functions after the getScriptProps function and before the getGlobalUsdtAddress function

// ----------------- Hàm lấy link tải từ Telegram (có cache) -----------------
function getDownloadLink(fileId) {
  var cache = CacheService.getScriptCache();
  var cachedUrl = cache.get(fileId);
  if (cachedUrl) return cachedUrl;
  try {
    var url = telegramUrl + '/getFile?file_id=' + fileId;
    var response = UrlFetchApp.fetch(url);
    var json = JSON.parse(response.getContentText());
    if (json.ok && json.result.file_path) {
      var downloadUrl = 'https://api.telegram.org/file/bot' + telegramToken + '/' + json.result.file_path;
      cache.put(fileId, downloadUrl, 21600); // Cache 6 hours
      return downloadUrl;
    }
  } catch (e) {
    Logger.log("getDownloadLink error: " + e);
  }
  return "";
}

// ----------------- Ghi log tin nhắn vào sheet "MessageLogs" -----------------
function logMessage(contents) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "MessageLogs";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Group Name", "Chat ID", "Sender ID", "Sender Name", "Username", "Timestamp", "Content", "Photo URL", "Video URL", "Voice URL", "Document URL"]);
  }
 
  var message = contents.message;
  if (!message) return;
 
  var chat = message.chat || {};
  var groupName = chat.title || "";
  var chatId = chat.id || "";
  var senderId = (message.from && message.from.id) || "";
  var senderName = (message.from && (message.from.first_name || "")) || "";
  if (message.from && message.from.last_name) {
    senderName += " " + message.from.last_name;
  }
  var username = (message.from && message.from.username) || "";
  var timestamp = message.date ? new Date(message.date * 1000).toLocaleString("vi-VN") : "";
  var content = message.text || "";
 
  var photoURL = "";
  if (message.photo && message.photo.length > 0) {
    var photoFileId = message.photo[message.photo.length - 1].file_id;
    photoURL = getDownloadLink(photoFileId);
  }
 
  var videoURL = (message.video) ? getDownloadLink(message.video.file_id) : "";
  var voiceURL = (message.voice) ? getDownloadLink(message.voice.file_id) : "";
  var documentURL = (message.document) ? getDownloadLink(message.document.file_id) : "";
 
  sheet.appendRow([
    groupName, chatId, senderId, senderName, username,
    timestamp, content, photoURL, videoURL, voiceURL, documentURL
  ]);
}
// Lưu và lấy địa chỉ USDT-TRC20 (chung cho tất cả các nhóm)
function getGlobalUsdtAddress() {
  var address = getScriptProps().getProperty("GLOBAL_USDT_ADDRESS");
  return address || "";
}

function setGlobalUsdtAddress(address) {
  getScriptProps().setProperty("GLOBAL_USDT_ADDRESS", address);
}
function getOwnerId() {
  return getScriptProps().getProperty("BOT_OWNER_ID");
}
function setOwnerId(newId) {
  getScriptProps().setProperty("BOT_OWNER_ID", newId);
}

// Lưu và lấy đơn vị tiền (mặc định là "USDT")
function getCurrencyUnit() {
  var unit = getScriptProps().getProperty("CURRENCY_UNIT");
  return unit ? unit : "USDT";
}
function setCurrencyUnit(newUnit) {
  getScriptProps().setProperty("CURRENCY_UNIT", newUnit);
}

// Quản lý danh sách username được phép (ngoài owner)
function getAllowedUsernames(){
  var raw = getScriptProps().getProperty("ALLOWED_USERNAMES") || "";
  if (!raw) return [];
  return raw.split(",").map(function(u){ return u.trim(); }).filter(String);
}
function setAllowedUsernames(arr){
  var csv = arr.join(",");
  getScriptProps().setProperty("ALLOWED_USERNAMES", csv);
}
function addAllowedUsername(uname){
  uname = uname.toLowerCase();
  var arr = getAllowedUsernames();
  if (arr.indexOf(uname) === -1) {
    arr.push(uname);
    setAllowedUsernames(arr);
  }
}
function isUsernameAllowed(uname){
  uname = (uname || "").toLowerCase();
  var arr = getAllowedUsernames();
  return (arr.indexOf(uname) !== -1);
}
// Quản lý danh sách thẻ đã ẩn
function getHiddenCards() {
  var hiddenCards = getScriptProps().getProperty("HIDDEN_CARDS") || "";
  if (!hiddenCards) return [];
  return hiddenCards.split(",").map(function(c){ return c.trim(); }).filter(String);
}

function setHiddenCards(arr) {
  var csv = arr.join(",");
  getScriptProps().setProperty("HIDDEN_CARDS", csv);
}

function addHiddenCard(cardCode) {
  cardCode = cardCode.toUpperCase();
  var arr = getHiddenCards();
  if (arr.indexOf(cardCode) === -1) {
    arr.push(cardCode);
    setHiddenCards(arr);
  }
}

function removeHiddenCard(cardCode) {
  cardCode = cardCode.toUpperCase();
  var arr = getHiddenCards();
  var index = arr.indexOf(cardCode);
  if (index !== -1) {
    arr.splice(index, 1);
    setHiddenCards(arr);
  }
}

function isCardHidden(cardCode) {
  cardCode = cardCode.toUpperCase();
  var arr = getHiddenCards();
  return (arr.indexOf(cardCode) !== -1);
}



/////////////////////////////
// Lệnh /clear: Reset giao dịch của ngày hôm nay (tổng số về 0), giữ lại Rate và ExchangeRate.
// Phản hồi không hiển thị phần "Chi tiết tiền gửi:" và "Chi tiết tiền trả:".
/////////////////////////////

function handleClearCommand(chatId, sheet, timestamp, senderName) {
  var lastRow = sheet.getLastRow();
  var currentRate = 0, currentExRate = 0;
  if (lastRow >= 2) {
    currentRate = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
    currentExRate = parseFloat(sheet.getRange(lastRow, 14).getValue()) || 0;
  }
 var usdtAddress = "";
  
  sheet.appendRow([
    chatId,
    '/clear',
    0,   // Total VND
    0,   // Total USDT
    0,   // USDT Paid
    0,   // Remaining USDT
    timestamp,
    senderName,
    '',
    '',
    '',
    '',
    currentRate,
    currentExRate,
    '',         // Card Code
    '',         // Limit
  ]);
  
  // Tính giá trị ví dụ: 100.000 VND = ? USDT
  var exampleValue = 0;
  if (currentExRate > 0) {
    exampleValue = (100000 / currentExRate) * (1 - currentRate / 100);
  }
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  
  // Tạo cấu trúc JSON cho response
  var responseData = {
    date: todayStr,
    deposits: "", // Empty after clear
    payments: "", // Empty after clear
    rate: formatRateValue(currentRate) + "%",  // Sử dụng formatRateValue
    exchangeRate: formatRateValue(currentExRate), // Sử dụng formatRateValue
    example: formatSmart(exampleValue), // Vẫn giữ formatSmart cho example
    totalAmount: "0",
    totalUSDT: "0",
    paidUSDT: "0",
    remainingUSDT: "0",
    cards: [] // Empty after clear
  };
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}

function handleDualCommand(chatId, message, sheet, timestamp, username) {
  var param = message.substring(3).trim(); // Loại bỏ "/d " khỏi message
  var parts = param.split('/');
  if(parts.length !== 2) {
    sendTelegramMessage(chatId, "语法无效。例如: /d 2/14600");
    return;
  }
  var newRate = parseFloat(parts[0]);
  var newExRate = parseFloat(parts[1]);
  if(isNaN(newRate) || isNaN(newExRate)) {
    sendTelegramMessage(chatId, "输入的数值无效，请检查后重试。.");
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var totalVND = 0, totalUSDT = 0, usdtPaid = 0, remain = 0;
  if(lastRow >= 2) {
    totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
    totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
    usdtPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
    remain = parseFloat(sheet.getRange(lastRow, 6).getValue()) || 0;
  }
 var usdtAddress = "";  
  sheet.appendRow([
    chatId,
    message,
    totalVND,
    totalUSDT,
    usdtPaid,
    remain,
    timestamp,
    username,
    '',
    '',
    '',
    '',
    newRate,
    newExRate,
    '',         // Card Code
    '',         // Limit
  ]);
  
  // Tính tổng theo từng loại thẻ
  var cardSummary = getCardSummary(sheet);
  
  // Tính giá trị ví dụ: 100.000 VND = ? USDT
  var exampleValue = (100000 / newExRate) * (1 - newRate / 100);
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  
  // Tạo cấu trúc JSON cho response
  var responseData = {
    date: todayStr,
    deposits: getColumnValues(sheet, 11),
    payments: getColumnValues(sheet, 12),
    rate: formatRateValue(newRate) + "%",  // Sử dụng formatRateValue
    exchangeRate: formatRateValue(newExRate), // Sử dụng formatRateValue
    example: formatSmart(exampleValue),
    totalAmount: formatSmart(totalVND),
    totalUSDT: formatSmart(totalUSDT),
    paidUSDT: formatSmart(usdtPaid),
    remainingUSDT: formatSmart(remain),
    cards: cardSummary
  };
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}
/////////////////////////////
// doPost: Xử lý tin nhắn đến từ Telegram
/////////////////////////////
function doPost(e) {
  var contents = JSON.parse(e.postData.contents);
  logMessage(contents);
  // 1. When replying to a message with an image
if (contents.message && contents.message.reply_to_message && 
    contents.message.text && contents.message.text.startsWith('/c')) {
  
  // Kiểm tra nếu tin nhắn được reply có chứa ảnh
  if (contents.message.reply_to_message.photo) {
    var chatId = contents.message.chat.id;
    
    // Thông báo cho người dùng biết đang xử lý
    sendTelegramMessage(chatId, "⏳ 正在获取银行账户信息…");
    
    // Lấy ảnh có độ phân giải cao nhất từ tin nhắn được reply
    var photos = contents.message.reply_to_message.photo;
    var photoFileId = photos[photos.length - 1].file_id;
    
    // Trích xuất thông tin ngân hàng từ ảnh
    var bankInfo = extractBankInfoFromImage(photoFileId, chatId);
    
    if (bankInfo) {
      var currentDate = new Date().toLocaleDateString('vi-VN');
      
      // Tạo mã theo định dạng yêu cầu: 1 chữ cái + 2 số
      var randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
      var randomNumber = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 00-99
      var uniqueCode = randomLetter + randomNumber;
      
      // Removed Markdown formatting (removed triple backticks)
      var formattedMessage = 
        `${uniqueCode} - ${currentDate}\n` +
        `${bankInfo.bankName || "[未找到]"}\n` +
        `${bankInfo.bankNameEnglish || "[未找到]"}\n` +
        `${bankInfo.accountNumber || "[未找到]"}\n` +
        `${bankInfo.accountName || "[未找到]"}`;
      
      // Removed Markdown parse_mode
      sendTelegramMessage(chatId, formattedMessage);
    } else {
      sendTelegramMessage(chatId, "❌ 无法从该图片识别出银行账户信息.");
    }
    
    return;
  }
}
  if (contents.message && contents.message.photo && !contents.message.text) {
    // Nếu chỉ có ảnh mà không có văn bản, thêm text rỗng để tránh lỗi
    contents.message.text = "";
  }
  var chatId = contents.message.chat.id;
  // 2. When sending an image with a /c caption
if (contents.message && contents.message.photo && contents.message.caption && contents.message.caption.startsWith('/c')) {
  var chatId = contents.message.chat.id;
  
  // Thông báo cho người dùng biết đang xử lý
  sendTelegramMessage(chatId, "⏳ 正在获取银行账户信息…");
  
  var photos = contents.message.photo;
  var photoFileId = photos[photos.length - 1].file_id;
  
  // Trích xuất thông tin ngân hàng từ ảnh sử dụng OpenAI
  var bankInfo = extractBankInfoFromImage(photoFileId, chatId);
  
  if (bankInfo) {
    var currentDate = new Date().toLocaleDateString('vi-VN');
    
    // Tạo mã theo định dạng yêu cầu: 1 chữ cái + 2 số
    var randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
    var randomNumber = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 00-99
    var uniqueCode = randomLetter + randomNumber;
    
    // Removed Markdown formatting (removed triple backticks)
    var formattedMessage = 
      `${uniqueCode} - ${currentDate}\n` +
      `${bankInfo.bankName || "[未找到]"}\n` +
      `${bankInfo.bankNameEnglish || "[未找到]"}\n` +
      `${bankInfo.accountNumber || "[未找到]"}\n` +
      `${bankInfo.accountName || "[未找到]"}`;
    
    // Removed Markdown parse_mode
    sendTelegramMessage(chatId, formattedMessage);
  } else {
    // Nếu không tìm thấy thông tin ngân hàng
    sendTelegramMessage(chatId, "❌ 无法从该图片识别出银行账户信息.");
  }
  
  return;
}
  if (contents.message.new_chat_members) {
    var newMembers = contents.message.new_chat_members;
    newMembers.forEach(function(member) {
      sendWelcomeMessage(chatId, member);
    });
    return;
  }
  
  var userId = contents.message.from.id;
  var usernameRaw = contents.message.from.username || contents.message.from.first_name;
  var message = contents.message.text;
  
  var ownerId = getOwnerId();
  if (!ownerId) {
    setOwnerId(userId.toString());
    sendTelegramMessage(chatId, `您 (ID:${userId}) 已成为该机器人的拥有者。`);
  }
  // Thêm xử lý cho các lệnh tiếng Trung ở đây, TRƯỚC khi xử lý các lệnh bắt đầu bằng '/'
  if (message.startsWith('设置费率')) {
    if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
      sendTelegramMessage(chatId, "你没有权限使用！");
      return;
    }
    var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    var senderName = contents.message.from.first_name;
    var sheet = getSheetByChatId(chatId);
    handleRateCommand(chatId, message, sheet, timestamp, senderName);
    return;
  } 
  else if (message.startsWith('设置汇率')) {
    if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
      sendTelegramMessage(chatId, "你没有权限使用！");
      return;
    }
    var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    var senderName = contents.message.from.first_name;
    var sheet = getSheetByChatId(chatId);
    handleExchangeRateCommand(chatId, message, sheet, timestamp, senderName);
    return;
  }
   // Xử lý lệnh "上课" (thay cho /clear)
if (message === '上课') {
  if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
    sendTelegramMessage(chatId, "您无权使用此命令!");
    return;
  }
  var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  var senderName = contents.message.from.first_name;
  var sheet = getSheetByChatId(chatId);
  handleClearCommand(chatId, sheet, timestamp, senderName);
  return;
}
// Xử lý lệnh "报告" (thay cho /report)
if (message === '结束') {
  var sheet = getSheetByChatId(chatId);
  handleReportCommand(chatId, sheet, contents.message.from.first_name);
  return;
}
  // Thêm xử lý cho lệnh "下发" (thay cho %) ở đây
else if (message.startsWith('下发')) {
  if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
    sendTelegramMessage(chatId, "你没有权限使用！");
    return;
  }
  var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  var senderName = contents.message.from.first_name;
  var sheet = getSheetByChatId(chatId);
  handlePercentCommand(chatId, message, sheet, timestamp, username);
  return;
}
// --- Cải tiến lệnh: Thay đổi /set thành 加操作人
if (message.startsWith('加操作人')) {
  if (userId.toString() !== getOwnerId()) {
    sendTelegramMessage(chatId, "你没有权限使用！");
    return;
  }
  
  // Extract the text after "加操作人"
  var inputText = message.substring(3).trim();
  
  if (!inputText) {
    sendTelegramMessage(chatId, "语法无效。例如: 加操作人 @username1 @username2...");
    return;
  }
  
  var parts = inputText.split(' ');
  var added = [];
  
  for (var i = 0; i < parts.length; i++) {
    var newUser = parts[i].replace('@', ''); // Loại bỏ @ nếu có
    if (newUser) {
      addAllowedUsername(newUser);
      added.push('@' + newUser);
    }
  }
  
  if (added.length > 0) {
    sendTelegramMessage(chatId, `成功添加用户: ${added.join(', ')}`);
  } else {
    sendTelegramMessage(chatId, "没有有效的用户名添加。");
  }
  return;
}

// --- Thay đổi: Đổi lệnh /unset thành 移除操作人
if (message.startsWith('移除操作人')) {
  if (userId.toString() !== getOwnerId()) {
    sendTelegramMessage(chatId, "你没有权限使用！");
    return;
  }
  
  // Extract the text after "移除操作人"
  var inputText = message.substring(4).trim();
  
  if (!inputText) {
    sendTelegramMessage(chatId, "语法无效。例如: 移除操作人 @username1 @username2...");
    return;
  }
  
  var parts = inputText.split(' ');
  var removed = [];
  
  for (var i = 0; i < parts.length; i++) {
    var user = parts[i].replace('@', ''); // Loại bỏ @ nếu có
    if (user && removeAllowedUsername(user)) {
      removed.push('@' + user);
    }
  }
  
  if (removed.length > 0) {
    sendTelegramMessage(chatId, `成功移除用户: ${removed.join(', ')}`);
  } else {
    sendTelegramMessage(chatId, "没有找到要移除的用户。");
  }
  return;
}

  if (message.startsWith('/')) {
    // --- Lệnh /off: Kết thúc buổi làm việc
  
  
   if (message.startsWith('/off')) {
      sendTelegramMessage(chatId, "感谢大家的辛勤付出，祝大家发财！ 💰💸🍀");
      return;
    }
     // 3. When sending /c command with an image
if (message && message.startsWith('/c') && contents.message.photo) {
  
  // Thông báo cho người dùng biết đang xử lý
  sendTelegramMessage(chatId, "⏳ 正在获取银行账户信息…");
  
  // Lấy ID file của ảnh có độ phân giải cao nhất (phần tử cuối cùng trong mảng photo)
  var photos = contents.message.photo;
  var photoFileId = photos[photos.length - 1].file_id;
  
  // Trích xuất thông tin ngân hàng từ ảnh bằng OpenAI API
  var bankInfo = extractBankInfoFromImage(photoFileId, chatId);
  
  if (bankInfo) {
    // Lấy ngày hiện tại
    var currentDate = new Date().toLocaleDateString('vi-VN');
    
    // Tạo mã theo định dạng yêu cầu: 1 chữ cái + 2 số
    var randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
    var randomNumber = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 00-99
    var uniqueCode = randomLetter + randomNumber;
    
    // Removed Markdown formatting (removed triple backticks)
    var formattedMessage = 
      `${uniqueCode} - ${currentDate}\n` +
      `${bankInfo.bankName || "[未找到]"}\n` +
      `${bankInfo.bankNameEnglish || "[未找到]"}\n` +
      `${bankInfo.accountNumber || "[未找到]"}\n` +
      `${bankInfo.accountName || "[未找到]"}`;
    
    // Removed Markdown parse_mode
    sendTelegramMessage(chatId, formattedMessage);
  } else {
    // Nếu không tìm thấy thông tin ngân hàng
    sendTelegramMessage(chatId, "❌ 无法从该图片识别出银行账户信息.");
  }
  
  return;
}
    // --- Lệnh /m: Đổi đơn vị tiền
    if (message.startsWith('/m ')) {
      if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
        sendTelegramMessage(chatId, "您无权使用此命令!");
        return;
      }
      var parts = message.trim().split(' ');
      if (parts.length < 2) {
        sendTelegramMessage(chatId, "/m <货币代码>");
        return;
      }
      var newUnit = parts[1].toUpperCase();
      setCurrencyUnit(newUnit);
      sendTelegramMessage(chatId, `已将单位更改为 ${newUnit}.`);
      return;
    }
    
// --- Lệnh /t: Tính số USDT dựa trên số tiền VND nhập vào (ai cũng có thể dùng)
if (message.startsWith('/t ')) {
  var parts = message.trim().split(' ');
  if (parts.length < 2) {
    sendTelegramMessage(chatId, "/t <金额>");
    return;
  }
  
  var amountVND = parseFloat(parts[1]);
  if (isNaN(amountVND)) {
    sendTelegramMessage(chatId, "金额无效.");
    return;
  }
  
  var sheet = getSheetByChatId(chatId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  
  var xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var yValue = parseFloat(sheet.getRange(lastRow, 14).getValue()) || 0;
  
  if (yValue === 0) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  
  var usdtAmount = (amountVND / yValue) * (1 - xValue / 100);
  
  // Định dạng số USDT với 2 chữ số thập phân và dấu phẩy cho dễ copy
  var copyableUsdtAmount = usdtAmount.toFixed(2).replace('.', ',');
  
  // Tạo phản hồi với định dạng markdown để dễ copy
 // Tạo phản hồi với định dạng markdown để dễ copy
var responseMsg = `${formatSmart(amountVND)} = \`${copyableUsdtAmount}\` ${getCurrencyUnit()}`;

// Sử dụng hàm mới với parse_mode
sendTelegramMessage(chatId, responseMsg, "Markdown");
  return;
}
    // --- Lệnh /v: Tính số tiền dựa trên số USDT nhập vào (ai cũng có thể dùng)
if (message.startsWith('/v ')) {
  var parts = message.trim().split(' ');
  if (parts.length < 2) {
    sendTelegramMessage(chatId, "/v <USDT>");
    return;
  }
  
  var amountUSDT = parseFloat(parts[1]);
  if (isNaN(amountUSDT)) {
    sendTelegramMessage(chatId, "Số USDT không hợp lệ.");
    return;
  }
  
  var sheet = getSheetByChatId(chatId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  
  var xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var yValue = parseFloat(sheet.getRange(lastRow, 14).getValue()) || 0;
  
  if (yValue === 0) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  
  var vndAmount = amountUSDT / (1 - xValue / 100) * yValue;
  
  // Định dạng số VND
  var formattedVND = formatSmart(vndAmount);
  
  // Tạo phản hồi với định dạng markdown để dễ copy
  var responseMsg = `${amountUSDT} ${getCurrencyUnit()} = \`${formattedVND}\``;
  
  // Sử dụng hàm với parse_mode
  sendTelegramMessage(chatId, responseMsg, "Markdown");
  return;
}
    
// --- Thêm hàm xóa username khỏi danh sách (thêm vào dưới hàm isUsernameAllowed)
function removeAllowedUsername(uname) {
  uname = (uname || "").toLowerCase();
  var arr = getAllowedUsernames();
  var index = arr.indexOf(uname);
  if (index !== -1) {
    arr.splice(index, 1);
    setAllowedUsernames(arr);
    return true;
  }
  return false;
}

// --- Thêm lệnh /users: Hiển thị danh sách người dùng được phép
if (message.startsWith('/users')) {
  if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
    sendTelegramMessage(chatId, "您没有权限查看用户列表。");
    return;
  }
  
  var users = getAllowedUsernames();
  var ownerInfo = `Owner: ID ${getOwnerId()}`;
  
  if (users.length > 0) {
    var usersList = users.map(u => '@' + u).join(', ');
    sendTelegramMessage(chatId, `${ownerInfo}\n被授权的用户列表: ${usersList}`);
  } else {
    sendTelegramMessage(chatId, `${ownerInfo}\n尚未有用户被添加到列表中。.`);
  }
  return;
}
// --- Lệnh /usdt: Lưu địa chỉ USDT TRC20 toàn cục (chỉ owner mới được sử dụng)
if (message.startsWith('/usdt ')) {
  if (userId.toString() !== getOwnerId()) {
    sendTelegramMessage(chatId, "⛔ 只有机器人所有者才能使用此命令！");
    return;
  }
  
  var parts = message.trim().split(' ');
  if (parts.length < 2) {
    sendTelegramMessage(chatId, "ℹ️  语法: /usdt <TRC20地址>");
    return;
  }
  
  var address = parts[1].trim();
  if (!isTrc20Address(address)) {
    sendTelegramMessage(chatId, "❌ TRC20地址无效！地址必须以字母T开头并且有34个字符。");
    return;
  }
  
  // Kiểm tra xem đã có địa chỉ cũ chưa
  var oldAddress = getGlobalUsdtAddress();
  
  // Lưu địa chỉ mới
  setGlobalUsdtAddress(address);
  
  if (oldAddress) {
    sendTelegramMessage(chatId, "🔄 已更新USDT-TRC20地址:\n`" + address + "`");
  } else {
    sendTelegramMessage(chatId, "✅ 已保存全局USDT-TRC20地址 ");
  }
  return;
}

// --- Lệnh /u: Hiển thị địa chỉ USDT TRC20 toàn cục
if (message === '/u') {
  var address = getGlobalUsdtAddress();
  if (!address) {
    sendTelegramMessage(chatId, "⚠️ 尚未保存全局USDT-TRC20地址！");
    return;
  }
  
  var responseMsg = "💰 *USDT-TRC20地址*💰\n\n" +
                 "`" + address + "`\n\n" +
                 "💵 交易前请向多人确认！ 💱";

  // Sử dụng hàm mới với parse_mode
  sendTelegramMessage(chatId, responseMsg, "Markdown");
  return;
}

    // --- Lệnh /d: Đặt đồng thời Rate và ExchangeRate
    if (message.startsWith('/d ')) {
      if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
        sendTelegramMessage(chatId, "您无权使用此命令!");
        return;
      }
      var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      var senderName = contents.message.from.first_name;
      var sheet = getSheetByChatId(chatId);
      handleDualCommand(chatId, message, sheet, timestamp, senderName);
      return;
    }
    // --- Lệnh /x: Ẩn mã card trong phản hồi
if (message.startsWith('/x ')) {
  if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
    sendTelegramMessage(chatId, "您无权使用此命令!");
    return;
  }
  
  var cardCode = message.substring(3).trim().toUpperCase();
  
  if (cardCode === 'ALL') {
    // Lấy tất cả mã card hiện có và ẩn chúng
    var sheet = getSheetByChatId(chatId);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      sendTelegramMessage(chatId, "暂无任何交易数据.");
      return;
    }
    
    // Find the last /clear command row
    var lastClearRow = findLastClearRow(sheet);
    
    // Lấy dữ liệu từ sau lệnh /clear cuối cùng
    var numRows = lastRow - lastClearRow;
    var cardData = sheet.getRange(lastClearRow + 1, 16, numRows, 1).getValues(); // Column 16 (Card Code)
    
    var uniqueCards = [];
    for (var i = 0; i < cardData.length; i++) {
      var card = cardData[i][0];
      if (card && uniqueCards.indexOf(card) === -1) {
        uniqueCards.push(card);
        addHiddenCard(card);
      }
    }
    
    if (uniqueCards.length > 0) {
      sendTelegramMessage(chatId, `已隐藏所有卡密 ${uniqueCards.length} : ${uniqueCards.join(', ')}`);
    } else {
      sendTelegramMessage(chatId, "Không tìm thấy mã card nào để ẩn.");
    }
    
    return;
  } else {
    // Ẩn một mã card cụ thể
    addHiddenCard(cardCode);
    sendTelegramMessage(chatId, `已隐藏卡密: ${cardCode}`);
    return;
  }
}

// --- Lệnh /sx: Hiển thị lại mã card đã ẩn
if (message.startsWith('/sx ')) {
  if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
    sendTelegramMessage(chatId, "您无权使用此命令!");
    return;
  }
  
  var cardCode = message.substring(4).trim().toUpperCase();
  
  if (cardCode === 'ALL') {
    // Hiển thị lại tất cả mã card
    setHiddenCards([]);
    sendTelegramMessage(chatId, "已重新显示所有卡密.");
    return;
  } else {
    // Hiển thị lại một mã card cụ thể
    if (isCardHidden(cardCode)) {
      removeHiddenCard(cardCode);
      sendTelegramMessage(chatId, `已重新显示卡密: ${cardCode}`);
    } else {
      sendTelegramMessage(chatId, `card ${cardCode} .`);
    }
    return;
  }
}

// --- Lệnh /hiddenCards: Hiển thị danh sách mã card đã ẩn
if (message === '/hiddenCards') {
  if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
    sendTelegramMessage(chatId, "您无权使用此命令!");
    return;
  }
  
  var hiddenCards = getHiddenCards();
  if (hiddenCards.length > 0) {
    sendTelegramMessage(chatId, `Danh sách mã card đang bị ẩn: ${hiddenCards.join(', ')}`);
  } else {
    sendTelegramMessage(chatId, "Không có mã card nào đang bị ẩn.");
  }
  return;
}
    // Các lệnh còn lại: /r, /er, /delete, +, -, %
    if (userId.toString() !== getOwnerId() && !isUsernameAllowed(usernameRaw)) {
      sendTelegramMessage(chatId, "你没有权限使用！");
      return;
    }
    var username = contents.message.from.first_name;
    var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    var sheet = getSheetByChatId(chatId);
    
 if (message.startsWith('/delete')) {
      handleDeleteCommand(chatId, sheet);
    } else if (message.startsWith('+')) {
      handlePlusCommand(chatId, message, sheet, timestamp, username);
    } else if (message.startsWith('-')) {
      handleMinusCommand(chatId, message, sheet, timestamp, username);
    }
  } else {
    if (message.startsWith('+') || message.startsWith('-')) {
      var ownerId = getOwnerId();
      if (!ownerId) {
        setOwnerId(userId.toString());
        sendTelegramMessage(chatId, `你 (ID:${userId}) 已成为机器人所有者.`);
      } else {
        if (userId.toString() !== ownerId && !isUsernameAllowed(usernameRaw)) {
          sendTelegramMessage(chatId, "您没有权限使用此机器人。");
          return;
        }
      }
      var username = contents.message.from.first_name;
      var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      var sheet = getSheetByChatId(chatId);
      if (message.startsWith('+')) {
        handlePlusCommand(chatId, message, sheet, timestamp, username);
      } else if (message.startsWith('-')) {
        handleMinusCommand(chatId, message, sheet, timestamp, username);
      } else {
        handlePercentCommand(chatId, message, sheet, timestamp, username);
      }
    } else {
      if (isMathExpression(message)) {
        if (!isSingleNumber(message)) {
          var username = contents.message.from.first_name;
          handleExpression(chatId, message, username);
        }
      } else if (isTrc20Address(message.trim())) {
        var username = contents.message.from.first_name;
        handleTrc20Address(chatId, message.trim(), username);
      }
    }
  }
}

function sendWelcomeMessage(chatId, member) {
  var welcomeName = member.first_name;
  var welcomeMessage = `欢迎 ${welcomeName} 加入群组！! 🎉`;
  sendTelegramMessage(chatId, welcomeMessage);
}

function sendTelegramMessage(chatId, text, parseMode) {
  var url = telegramUrl + "/sendMessage?chat_id=" + chatId + "&text=" + encodeURIComponent(text);
  
  // Thêm parse_mode nếu được cung cấp
  if (parseMode) {
    url += "&parse_mode=" + parseMode;
  }
  
  UrlFetchApp.fetch(url);
}

function setWebhook() {
  var response = UrlFetchApp.fetch(telegramUrl + "/setWebhook?url=" + webAppUrl);
  Logger.log(response.getContentText());
}

/////////////////////////////////////////////////////////////
// Tạo/Truy cập sheet theo chatId
/////////////////////////////////////////////////////////////
function getSheetByChatId(chatId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "Group_" + chatId;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      'Chat ID',        // col 1
      'Message',        // col 2
      'Total VND',      // col 3
      'Total USDT',     // col 4
      'USDT Paid',      // col 5
      'Remaining USDT', // col 6
      'Timestamp',      // col 7
      'Username',       // col 8
      'Raw Amount',     // col 9
      'Raw USDT Paid',  // col 10
      'Details',        // col 11
      'Payment Details',// col 12
      'Rate (X)',       // col 13
      'ExchangeRate (Y)',// col 14
      'Card Code',      // col 16
      'Limit',          // col 17
      'USDT Address'    // col 18 (mới thêm)
    ]);
  } else {
    // Kiểm tra nếu sheet cũ chưa có cột USDT Address thì thêm vào
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('USDT Address') === -1) {
      sheet.getRange(1, 18).setValue('USDT Address');
    }
  }
  return sheet;
}

// The handleRateCommand function needs to be updated to handle the new command syntax
function handleRateCommand(chatId, message, sheet, timestamp, username) {
  // Extract the text after "设置费率"
  var inputText = message.substring(4).trim();
  
  // Check if any input was provided
  if (!inputText) {
    sendTelegramMessage(chatId, "语法无效。例如: 设置费率2 (对应2%)");
    return;
  }
  
  // Try to parse the input as a number
  var xValue = parseFloat(inputText);
  if (isNaN(xValue)) {
    sendTelegramMessage(chatId, "输入值无效。");
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var totalVND = 0, totalUSDT = 0, usdtPaid = 0, remain = 0, yValue = 1;
  if (lastRow >= 2) {
    totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
    totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
    usdtPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
    remain = parseFloat(sheet.getRange(lastRow, 6).getValue()) || 0;
    yValue = parseFloat(sheet.getRange(lastRow, 14).getValue()) || 1;
  }
  // Lấy địa chỉ USDT hiện tại
  var usdtAddress = "";  
  sheet.appendRow([
    chatId,
    message,
    totalVND,
    totalUSDT,
    usdtPaid,
    remain,
    timestamp,
    username,
    '',
    '',
    '',
    '',
    xValue,
    yValue,
    '',         // Card Code
    '',         // Limit
  ]);
  // Tính ví dụ
  var exampleValue = 0;
  if (yValue > 0) {
    exampleValue = (100000 / yValue) * (1 - xValue / 100);
  }
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  var responseData = {
    date: todayStr,
    deposits: getColumnValues(sheet, 11),
    payments: getColumnValues(sheet, 12),
    rate: formatRateValue(xValue) + "%",  // Sử dụng formatRateValue thay vì formatSmart
    exchangeRate: formatRateValue(yValue), // Sử dụng formatRateValue thay vì formatSmart
    example: formatSmart(exampleValue),    // Vẫn giữ formatSmart cho example
    totalAmount: formatSmart(totalVND),
    totalUSDT: formatSmart(totalUSDT),
    paidUSDT: formatSmart(usdtPaid),
    remainingUSDT: formatSmart(remain)
  };
  
  // Tính tổng theo từng loại thẻ
  var cardSummary = getCardSummary(sheet);
  if (cardSummary && cardSummary.length > 0) {
    responseData.cards = cardSummary;
  }
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}

// Update the handleExchangeRateCommand function
function handleExchangeRateCommand(chatId, message, sheet, timestamp, username) {
  // Extract the text after "设置汇率"
  var inputText = message.substring(4).trim();
  
  // Check if any input was provided
  if (!inputText) {
    sendTelegramMessage(chatId, "语法无效。例如: 设置汇率23000");
    return;
  }
  
  // Try to parse the input as a number
  var yValue = parseFloat(inputText);
  if (isNaN(yValue)) {
    sendTelegramMessage(chatId, "输入值无效。");
    return;
  }
  var lastRow = sheet.getLastRow();
  var totalVND = 0, totalUSDT = 0, usdtPaid = 0, remain = 0, xValue = 0;
  if (lastRow >= 2) {
    totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
    totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
    usdtPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
    remain = parseFloat(sheet.getRange(lastRow, 6).getValue()) || 0;
    xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  }
  // Lấy địa chỉ USDT hiện tại
  var usdtAddress = "";  
  sheet.appendRow([
    chatId,
    message,
    totalVND,
    totalUSDT,
    usdtPaid,
    remain,
    timestamp,
    username,
    '',
    '',
    '',
    '',
    xValue,
    yValue,
    '',         // Card Code
    '',         // Limit
  ]);
  
  // Tính ví dụ
  var exampleValue = 0;
  if (yValue > 0) {
    exampleValue = (100000 / yValue) * (1 - xValue / 100);
  }
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  var responseData = {
    date: todayStr,
    deposits: getColumnValues(sheet, 11),
    payments: getColumnValues(sheet, 12),
    rate: formatRateValue(xValue) + "%",  // Sử dụng formatRateValue
    exchangeRate: formatRateValue(yValue), // Sử dụng formatRateValue
    example: formatSmart(exampleValue),
    totalAmount: formatSmart(totalVND),
    totalUSDT: formatSmart(totalUSDT),
    paidUSDT: formatSmart(usdtPaid),
    remainingUSDT: formatSmart(remain)
  };
  
  // Tính tổng theo từng loại thẻ
  var cardSummary = getCardSummary(sheet);
  if (cardSummary && cardSummary.length > 0) {
    responseData.cards = cardSummary;
  }
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}
// Hàm chuyển dữ liệu thành cấu trúc JSON
function responseToJson(data) {
  return {
    date: data.date || new Date().toLocaleDateString('vi-VN'),
    deposits: data.deposits || "",
    payments: data.payments || "",
    rate: data.rate || "0%",
    exchangeRate: data.exchangeRate || "0",
    totalAmount: data.totalAmount || "0",
    totalUSDT: data.totalUSDT || "0",
    paidUSDT: data.paidUSDT || "0",
    remainingUSDT: data.remainingUSDT || "0",
    cards: data.cards || []
  };
}


// Hàm tạo tin nhắn Telegram với định dạng văn bản đơn giản
// Hàm tạo tin nhắn Telegram với Markdown
formatTelegramMessage// Hàm tạo tin nhắn Telegram với Markdown
function formatTelegramMessage(jsonData) {
  var currencyUnit = getCurrencyUnit();
  
  let output = '';
  
  // Date header (bold)
  output += `*🧧今日是 ${jsonData.date} 🧧*\n`;
  
  if (jsonData.deposits && jsonData.deposits.trim() !== '') {
    output += "今日入款:\n";
    output += `\`\`\`\n${jsonData.deposits}\n\`\`\``;
  } else {
    output += "今日入款: 没有\n\n";
  }
  
   // Payments section - đặt trong code block không có backticks
  if (jsonData.payments && jsonData.payments.trim() !== '') {
    output += "今日下发:\n";
    output += `\`\`\`\n${jsonData.payments}\n\`\`\``;
  } else {
    output += "今日下发: 没有\n\n";
  }
  
  
  /// Rate information - đặt trong code block
  var rateInfo = `费率=${jsonData.rate}|💱入款汇率=${jsonData.exchangeRate}`;
  
  // Thêm ví dụ nếu có
  if (jsonData.example) {
    rateInfo += `\n例子: 100.000=${jsonData.example} ${currencyUnit}`;
  }
  
  output += `\`\`\`\n${rateInfo}\n\`\`\``;
  
  // Summary section (bold)
  output += `*今日入款合计 💰: ${jsonData.totalAmount}*\n`;
  output += `*入款 ${currencyUnit} 合计: ${jsonData.totalUSDT}*\n`;
  output += `*出款 ${currencyUnit} 合计: ${jsonData.paidUSDT}*\n`;
  output += `*当前${currencyUnit} 剩余合计: ${jsonData.remainingUSDT}*💎`;
  
 // Cards section (if present) - cũng đặt trong code block
  if (jsonData.cards && jsonData.cards.length > 0) {
    output += `\n 卡额度 💳:\n\`\`\`\n${jsonData.cards.join("\n")}\`\`\``;
  }
  
  return output;
}
/////////////////////////////////////////////////////////////
// +số => Tính tiền gửi
// Mới: +số [mã 3 ký tự] [hạn mức] => Lưu thêm mã thẻ và hạn mức
/////////////////////////////////////////////////////////////
function handlePlusCommand(chatId, message, sheet, timestamp, senderName) {
  var parts = message.split('+');
  if (parts.length !== 2) {
    sendTelegramMessage(chatId, "指令无效。格式为：+数字 或 +数字 [卡号] [额度]");
    return;
  }
  
  var inputParts = parts[1].trim().split(' ');
  var expr = inputParts[0];
  var cardCode = inputParts.length > 1 ? inputParts[1].toUpperCase() : '';
  var cardLimit = inputParts.length > 2 ? parseFloat(inputParts[2]) : '';
  
  var amountVND;
  if (!isSingleNumber(expr)) {
    try {
      amountVND = eval(expr);
    } catch(err) {
      sendTelegramMessage(chatId, "表达式无效，请重试。");
      return;
    }
  } else {
    amountVND = parseFloat(expr);
  }
  if (isNaN(amountVND)) {
    sendTelegramMessage(chatId, "Số tiền không hợp lệ.");
    return;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  var yCell = sheet.getRange(lastRow, 14).getValue();
  if (yCell === "" || yCell === null || isNaN(yCell)) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  var totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
  var totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
  var usdtPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
  var xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var yValue = parseFloat(yCell);
  var newUSDT = (amountVND / yValue) * (1 - xValue / 100);
  totalVND += amountVND;
  totalUSDT += newUSDT;
  var remain = totalUSDT - usdtPaid;
  
  var details;
  if (cardCode) {
    details = `${timestamp} +${formatSmart(amountVND)} (${cardCode}) = ${formatSmart(newUSDT)} ${getCurrencyUnit()}`;
  } else {
    details = `${timestamp} +${formatSmart(amountVND)} = ${formatSmart(newUSDT)} ${getCurrencyUnit()}`;
  }
  
 var usdtAddress = "";  
  sheet.appendRow([
    chatId,
    message,
    totalVND,
    totalUSDT,
    usdtPaid,
    remain,
    timestamp,
    senderName,
    amountVND,
    '',
    details,
    '',
    xValue,
    yValue,
    cardCode,     // Card Code
    cardLimit,    // Limit
  ]);
  
  clearOldEntries(sheet, 11);
  
  // Tính tổng theo từng loại thẻ
  var cardSummary = getCardSummary(sheet);
  
  // Thêm ví dụ nếu là +0 hoặc gần 0
  var exampleValue = null;
  if (Math.abs(amountVND) < 1) {
    exampleValue = (100000 / yValue) * (1 - xValue / 100);
  }
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  
  // Tạo cấu trúc JSON cho response
  var responseData = {
    date: todayStr,
    deposits: getColumnValues(sheet, 11),
    payments: getColumnValues(sheet, 12),
    rate: formatRateValue(xValue) + "%",  // Sử dụng formatRateValue
    exchangeRate: formatRateValue(yValue), // Sử dụng formatRateValue
    totalAmount: formatSmart(totalVND),
    totalUSDT: formatSmart(totalUSDT),
    paidUSDT: formatSmart(usdtPaid),
    remainingUSDT: formatSmart(remain),
    cards: cardSummary
  };
  
  // Thêm ví dụ nếu cần
  if (exampleValue !== null) {
    responseData.example = formatSmart(exampleValue);
  }
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}
/////////////////////////////////////////////////////////////
// -số => Tính tiền rút bớt
/////////////////////////////////////////////////////////////
function handleMinusCommand(chatId, message, sheet, timestamp, senderName) {
  var parts = message.split('-');
  if (parts.length !== 2) {
    sendTelegramMessage(chatId, "指令无效。格式为：-数字 或 -数字 [卡号]");
    return;
  }
  
  var inputParts = parts[1].trim().split(' ');
  var expr = inputParts[0];
  var cardCode = inputParts.length > 1 ? inputParts[1].toUpperCase() : '';
  
  var amountVND;
  if (!isSingleNumber(expr)) {
    try {
      amountVND = eval(expr);
    } catch(err) {
      sendTelegramMessage(chatId, "表达式无效，请重试。");
      return;
    }
  } else {
    amountVND = parseFloat(expr);
  }
  if (isNaN(amountVND)) {
    sendTelegramMessage(chatId, "金额无效");
    return;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  var yCell = sheet.getRange(lastRow, 14).getValue();
  if (yCell === "" || yCell === null || isNaN(yCell)) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  var totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
  var totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
  var usdtPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
  var xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var yValue = parseFloat(yCell);
  var minusUSDT = (amountVND / yValue) * (1 - xValue / 100);
  totalVND -= amountVND;
  totalUSDT -= minusUSDT;
  var newRemain = totalUSDT - usdtPaid;
  
  var details;
  if (cardCode) {
    details = `${timestamp} -${formatSmart(amountVND)} (${cardCode}) = -${formatSmart(minusUSDT)} ${getCurrencyUnit()}`;
  } else {
    details = `${timestamp} -${formatSmart(amountVND)} = -${formatSmart(minusUSDT)} ${getCurrencyUnit()}`;
  }
  // Lấy địa chỉ USDT hiện tại
 var usdtAddress = "";  
  sheet.appendRow([
    chatId,
    message,
    totalVND,
    totalUSDT,
    usdtPaid,
    newRemain,
    timestamp,
    senderName,
    -amountVND,
    '',
    details,
    '',
    xValue,
    yValue,
    cardCode,     // Card Code
    '',           // Limit (empty for minus command)
  ]);
  
  clearOldEntries(sheet, 11);
  
  // Tính tổng theo từng loại thẻ
  var cardSummary = getCardSummary(sheet);
  
  // Thêm ví dụ nếu là -0 hoặc gần 0
  var exampleValue = null;
  if (Math.abs(amountVND) < 1) {
    exampleValue = (100000 / yValue) * (1 - xValue / 100);
  }
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  
  // Tạo cấu trúc JSON cho response - SỬA Ở ĐÂY: Thay remain -> newRemain
  var responseData = {
    date: todayStr,
    deposits: getColumnValues(sheet, 11),
    payments: getColumnValues(sheet, 12),
    rate: formatSmart(xValue) + "%",
    exchangeRate: formatSmart(yValue),
    totalAmount: formatSmart(totalVND),
    totalUSDT: formatSmart(totalUSDT),
    paidUSDT: formatSmart(usdtPaid),
    remainingUSDT: formatSmart(newRemain), // Thay remain thành newRemain
    cards: cardSummary
  };
  
  // Thêm ví dụ nếu cần
  if (exampleValue !== null) {
    responseData.example = formatSmart(exampleValue);
  }
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}

/////////////////////////////////////////////////////////////
// %số => Ghi nhận USDT đã trả
/////////////////////////////////////////////////////////////
function handlePercentCommand(chatId, message, sheet, timestamp, senderName) {
  var parts = message.split('下发');
  if (parts.length !== 2) {
    sendTelegramMessage(chatId, "指令无效。格式为：下发数字 (" + getCurrencyUnit() + ") 或 下发数字 [卡号]");
    return;
  }
  
  var inputParts = parts[1].trim().split(' ');
  var expr = inputParts[0];
  var cardCode = inputParts.length > 1 ? inputParts[1].toUpperCase() : '';
  
  var payUSDT;
  if (!isSingleNumber(expr)) {
    try {
      payUSDT = eval(expr);
    } catch(err) {
      sendTelegramMessage(chatId, "表达式无效，请重试。");
      return;
    }
  } else {
    payUSDT = parseFloat(expr);
  }
  if (isNaN(payUSDT)) {
    sendTelegramMessage(chatId, "Số " + getCurrencyUnit() + " không hợp lệ.");
    return;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  var yCell = sheet.getRange(lastRow, 14).getValue();
  if (yCell === "" || yCell === null || isNaN(yCell)) {
    sendTelegramMessage(chatId, "请设置汇率，费率");
    return;
  }
  var totalVND = parseFloat(sheet.getRange(lastRow, 3).getValue()) || 0;
  var totalUSDT = parseFloat(sheet.getRange(lastRow, 4).getValue()) || 0;
  var oldPaid = parseFloat(sheet.getRange(lastRow, 5).getValue()) || 0;
  var oldRemain = parseFloat(sheet.getRange(lastRow, 6).getValue()) || 0;
  var xValue = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var yValue = parseFloat(yCell);
  var newPaid = oldPaid + payUSDT;
  var newRemain = totalUSDT - newPaid;
  
  var paymentDetails;
  if (cardCode) {
    paymentDetails = `${timestamp} +${formatSmart(payUSDT)} ${getCurrencyUnit()} (${cardCode})`;
  } else {
    paymentDetails = `${timestamp} +${formatSmart(payUSDT)} ${getCurrencyUnit()}`;
  }
  
 // Lấy địa chỉ USDT hiện tại
 var usdtAddress = "";  
  sheet.appendRow([
    chatId,
    message,
    totalVND,
    totalUSDT,
    newPaid,
    newRemain,
    timestamp,
    senderName,
    '',
    payUSDT,
    '',
    paymentDetails,
    xValue,
    yValue,
    cardCode,     // Card Code
    '',           // Limit (empty for percent command)
  ]);
  
  clearOldEntries(sheet, 12); // Thay đổi cột từ 11 -> 12 vì đây là chi tiết thanh toán
  
  // Tính tổng theo từng loại thẻ
  var cardSummary = getCardSummary(sheet);
  
  // Thêm ví dụ nếu là %0 hoặc gần 0
  var exampleValue = null;
  if (Math.abs(payUSDT) < 0.1) { // Sửa lại biến từ amountVND thành payUSDT
    exampleValue = (100000 / yValue) * (1 - xValue / 100);
  }
  
  var todayStr = new Date().toLocaleDateString('vi-VN');
  
  // Tạo cấu trúc JSON cho response - SỬA Ở ĐÂY: Thay remain -> newRemain và usdtPaid -> newPaid
  var responseData = {
    date: todayStr,
    deposits: getColumnValues(sheet, 11),
    payments: getColumnValues(sheet, 12),
    rate: formatSmart(xValue) + "%",
    exchangeRate: formatSmart(yValue),
    totalAmount: formatSmart(totalVND),
    totalUSDT: formatSmart(totalUSDT),
    paidUSDT: formatSmart(newPaid), // Thay usdtPaid thành newPaid
    remainingUSDT: formatSmart(newRemain), // Thay remain thành newRemain
    cards: cardSummary
  };
  
  // Thêm ví dụ nếu cần
  if (exampleValue !== null) {
    responseData.example = formatSmart(exampleValue);
  }
  
  // Định dạng tin nhắn phản hồi với Markdown
  var response = formatTelegramMessage(responseData);
  
  sendTelegramMessage(chatId, response, "Markdown");
}
/////////////////////////////////////////////////////////////
function handleDeleteCommand(chatId, sheet) {
  // Xóa nội dung nhưng giữ lại các header
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  // Kiểm tra nếu header đã có cột USDT Address
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var hasUsdtAddressColumn = headers.indexOf('USDT Address') !== -1;
  
  // Nếu không có cột USDT Address, thêm vào
  if (!hasUsdtAddressColumn) {
    sheet.getRange(1, 18).setValue('USDT Address');
  }
  
  // Tạo một dòng mới với các giá trị ban đầu
  var timestamp = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  sheet.appendRow([
    chatId,
    '/delete',
    0,   // Total VND
    0,   // Total USDT
    0,   // USDT Paid
    0,   // Remaining USDT
    timestamp,
    'System',
    '',
    '',
    '',
    '',
    0,   // Rate (X)
    0,   // ExchangeRate (Y)
    1,   // Tx ID
    '',  // Card Code
    '',  // Limit
    ''   // USDT Address - để trống
  ]);
  
  sendTelegramMessage(chatId, "Dữ liệu đã được xóa.");
}

function getColumnValues(sheet, colIndex) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return "";
  }
  
  // Find the last /clear command row
  var lastClearRow = findLastClearRow(sheet);
  
  // If colIndex is 11 (details for + and -), show only 5 most recent entries
  // If colIndex is 12 (details for %), show only 3 most recent entries
  var maxEntries = (colIndex === 11) ? 5 : 3;
  
  // Get all values from the column starting after the last clear command
  var allValues = [];
  if (lastClearRow < lastRow) {
    var values = sheet.getRange(lastClearRow + 1, colIndex, lastRow - lastClearRow).getValues();
    // Filter out zero-value transactions and empty strings
    allValues = values.flat().filter(value => {
      if (!value) return false; // Remove empty strings
      // Remove zero transactions
      if (value.includes(" +0 ") || value.includes(" -0 ") || 
          value.includes(" = 0 ") || value.includes("= 0,00 ")) return false; 
      return true;
    });
    
    // Format the values by removing spaces around = and ()
    allValues = allValues.map(value => {
      return value
        .replace(" = ", "=")
        .replace(" (", "(")
        .replace(") ", ")");
    });
  }
  
  // Return only the most recent entries based on the column
  return allValues.slice(-maxEntries).join("\n");
}
function clearOldEntries(sheet, colIndex) {
  // This function is now a no-op as we filter entries in getColumnValues
  // No need to clear anything
}

function getCardSummary(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  
  // Find the last /clear command row
  var lastClearRow = findLastClearRow(sheet);
  
  // If there's no data after the last clear, return empty array
  if (lastClearRow >= lastRow) {
    return [];
  }
  
  // Get current Rate and ExchangeRate values
  var currentRate = parseFloat(sheet.getRange(lastRow, 13).getValue()) || 0;
  var currentExRate = parseFloat(sheet.getRange(lastRow, 14).getValue()) || 0;
  var showRemaining = (currentRate === 0 && currentExRate === 1);
  
  // Get data only after the last /clear command
  var numRows = lastRow - lastClearRow;
  var data = sheet.getRange(lastClearRow + 1, 9, numRows, 8).getValues(); // columns 9-17
  
  // Structure to store card data: {cardCode: {total: 0, paid: 0, limit: 0}}
  var cards = {};
  
  // Process each row of data
  for (var i = 0; i < data.length; i++) {
    var amount = parseFloat(data[i][0]) || 0;      // Raw Amount (col 9)
    var paid = parseFloat(data[i][1]) || 0;        // Raw USDT Paid (col 10)
    var cardCode = data[i][6] || '';               // Card Code (col 16)
    var limit = parseFloat(data[i][7]) || 0;       // Limit (col 17)
    
    if (cardCode) {
      if (!cards[cardCode]) {
        cards[cardCode] = {
          total: 0,
          paid: 0,
          limit: limit > 0 ? limit : 0
        };
      }
      
      // Update card data
      cards[cardCode].total += amount;
      cards[cardCode].paid += paid;
      
      // Update limit if a new value is provided
      if (limit > 0 && cards[cardCode].limit !== limit) {
        cards[cardCode].limit = limit;
      }
    }
  }
  
  // Create list of cards to display (exclude hidden cards)
  var summary = [];
  for (var code in cards) {
    if (cards.hasOwnProperty(code) && !isCardHidden(code)) {
      var card = cards[code];
      var cardLimit = card.limit;
      var remaining = cardLimit - card.total;
      
      // Format with markdown: cardCode:amount|CL:limit
      var cardInfo = code + '=' + formatSmart(card.total);
      
      // Add limit information if available
      if (cardLimit > 0) {
        cardInfo += '|剩余额度:' + formatSmart(remaining);
      }
      
      // Add remaining payment if rate=0 and exchange rate=1
      if (showRemaining) {
        var remainingPayment = card.total - card.paid;
        cardInfo += '|剩余余额:' + formatSmart(remainingPayment);
      }
      
      summary.push(cardInfo);
    }
  }
  
  return summary;
}
/////////////////////////////
// Xử lý biểu thức toán học
/////////////////////////////
function isMathExpression(msg) {
  var mathRegex = /^[0-9+\-*/().\s]+$/;
  return mathRegex.test(msg);
}

function handleExpression(chatId, message, username) {
  try {
    var expression = message.trim();
    var result = eval(expression);
    
    // Định dạng kết quả theo yêu cầu
    var formattedResult;
    
    // Kiểm tra xem kết quả có phần thập phân không
    if (Math.abs(result - Math.floor(result)) < 1e-9) {
      // Số nguyên: chỉ hiển thị số không có định dạng
      formattedResult = Math.round(result).toString();
    } else {
      // Số thập phân: hiển thị với 2 chữ số sau dấu chấm
      formattedResult = result.toFixed(2);
    }

    // Simple response without markdown
    var responseMessage = `${expression} = ${formattedResult}`;
    
    // Don't use markdown here
    sendTelegramMessage(chatId, responseMessage);
  } catch (err) {
    // Handle error silently
  }
}
// Hàm kiểm tra nếu chuỗi là số đơn (số nguyên hoặc số thập phân)
function isSingleNumber(msg) {
  var numberRegex = /^-?\d+(\.\d+)?$/;
  return numberRegex.test(msg.trim());
}

