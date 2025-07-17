# Botketoanviet02

A Telegram bot for transaction management, built with Node.js and MongoDB.

## Features

- Transaction tracking with + and - commands
- Group management and rate settings
- Card management functionality
- Bank information extraction from images with OpenAI integration
- Message logging
- Multi-language support (including Chinese commands)
- Currency conversion utilities
- Mathematical expressions evaluation
- TRC20 address formatting
- **NEW: Groups Dashboard Website** - View all groups information in a beautiful web interface
- **NEW: Number format with abbreviated units (k, tr, m), combined formats, mixed units and comma-separated numbers**

## Recent Updates

- **🆕 LATEST: Picture Bill Processing**: NEW automated bill processing feature! Use `/pic on` to enable, then reply "1" to bill images for automatic `+[amount]` command, "2" for `%[amount]` command, or "3" for `-[amount]` command. Uses GPT-4o to extract amounts from various bill formats (bank transfers, receipts, invoices) with Vietnamese number format support. Operator permission required.
- **🆕 LATEST: Enhanced QR Code Generation**: Improved QR code generation with support for Vietnamese number formats (2.612.800), flexible message formats (3-line and 4-line with any order), field prefixes (名字：, Tên:, Name: for names; 银行：, Ngân hàng: for banks), and 70+ Vietnamese banks. Bot now sends QR code images directly instead of links. Supports all common Vietnamese number writing styles and flexible field ordering.
- **🆕 LATEST: Groups Dashboard Website**: Use `/groups` command to get a link to a beautiful web dashboard showing all bot groups information with statistics, financial data, and operators list.
- **🆕 LATEST: Auto Bank Transfer Processing**: Reply "1" to bank transfer notification messages to automatically execute `+[amount]` command! Bot intelligently parses bank notifications and extracts amounts automatically.
- **Added support for abbreviated number formats in mathematical expressions**: Now you can use expressions like `2k+500`, `1tr*2`, `3m/2+4k`, etc. All number formats (k, tr, m, comma-separated) are supported in math calculations.
- **Added support for mixed unit formats**: 4m2k = 4,002,000, 5tr3k = 5,003,000, 1m500k = 1,500,000, etc.
- **Added support for combined number formats**: 3tr4 = 3,400,000, 2tr238 = 2,238,000, 3k12 = 3,120, etc.
- **Added support for comma-separated numbers**: 7,834,351 = 7834351, 1,000,000 = 1000000, etc.
- **Added support for abbreviated number formats**: 1tr = 1,000,000, 2k = 2,000, 2tr543k = 2,543,000, etc.
- Removed permission restrictions - all users can now use bot commands
- Maintained owner privileges for system maintenance commands
- Added `/help` command for user assistance
- Improved formatting for user lists and transaction reports

## Commands

### Basic Commands
- `/start` - Start the bot
- `/help` - Display help information
- `/off` - End session message
- `/pic on` - Enable automatic bill processing from images (operator only)
- `/pic off` - Disable automatic bill processing from images (operator only)

### Group Management
- `/groups` - Get link to web dashboard with all groups information (admin only)
- `/listgroups` - List all groups in text format (admin only)

### Transaction Recording
- `+ [amount] [note]` - Add deposit record (supports abbreviated, combined, mixed units, and comma-separated formats)
- `- [amount] [note]` - Add withdrawal record (requires /d2 setup first, uses wrate/wexchangeRate)
- `% [amount] [note]` - Mark paid USDT amount (supports abbreviated, combined, mixed units, and comma-separated formats)
- `上课` - Clear current transaction records
- `结束` - Display transaction report

### Number Format Support
The bot now supports multiple number formats:

**Abbreviated formats:**
- `k` = 1,000 (thousand) - Example: `2k` = 2,000
- `tr` = 1,000,000 (million) - Example: `1tr` = 1,000,000
- `m` = 1,000,000 (million) - Example: `500m` = 500,000,000
- Combined formats: `2tr543k` = 2,543,000

**Combined number formats:**
- `3tr4` = 3,400,000 (3 million + 400 thousand)
- `2tr238` = 2,238,000 (2 million + 238 thousand)
- `3k12` = 3,120 (3 thousand + 12 tens)
- `7k123` = 7,123 (7 thousand + 123 units)

**Mixed unit formats:**
- `4m2k` = 4,002,000 (4 million + 2 thousand)
- `5tr3k` = 5,003,000 (5 million + 3 thousand)
- `1m500k` = 1,500,000 (1 million + 500 thousand)
- `2tr100k` = 2,100,000 (2 million + 100 thousand)

**Comma-separated formats:**
- Standard comma notation: `7,834,351` = 7,834,351
- With decimals: `123,456.78` = 123,456.78
- Valid formats: `1,000`, `50,000`, `1,000,000`

### Setting Commands
- `设置费率 [value]` - Set rate percentage
- `设置汇率 [value]` - Set exchange rate
- `下发 [value]` - Mark paid USDT amount

### Card Management
- `/x [card number]` - Hide bank card
- `/sx [card number]` - Show bank card
- `/hiddenCards` - List all hidden cards

### QR Code Generation
- `/qr on` - Enable automatic QR code generation for transfer messages (operator only)
- `/qr off` - Disable automatic QR code generation (operator only)

### Picture Bill Processing
- `/pic on` - Enable automatic bill processing from images (operator only)
- `/pic off` - Disable automatic bill processing from images (operator only)

When picture bill processing is enabled, the bot will automatically extract amounts from bill images when you reply to them:

**How to use:**
1. Enable the feature: `/pic on`
2. When you see a bill/receipt image, reply with:
   - **"1"** → Automatically executes `+[amount]` command (add deposit)
   - **"2"** → Automatically executes `%[amount]` command (mark paid USDT)
   - **"3"** → Automatically executes `-[amount]` command (add withdrawal)
3. The bot will use GPT-4o to extract the amount from the image and execute the corresponding command
4. Disable when done: `/pic off`

**Features:**
- ✅ Uses GPT-4o for accurate amount extraction
- ✅ Supports various bill formats (bank transfers, receipts, invoices)
- ✅ Automatic number format detection (Vietnamese comma/dot separators)
- ✅ Operator permission required
- ✅ Configurable per group

When QR code generation is enabled, the bot will automatically detect messages with bank transfer information. The bot supports flexible formats:

**4-line format (flexible order):**
```
[Account Number/Name/Bank in any order]
[Amount - always last line]
```

**3-line format (flexible order):**
```
[Account Number/Name/Bank in any order]
[Amount - always last line]
```

**Supported field formats:**
- **Bank name**: Plain (`Vietcombank`, `MB Bank`), with prefix (`银行：Vietcombank`, `Ngân hàng: Techcombank`), abbreviated (`VCB`, `MB`)
- **Account holder name**: Plain (`Phạm Văn Giáo`), with prefix (`名字：Phạm Văn Giáo`, `Tên: Nguyễn Văn A`, `Name: John Doe`)

**Supported amount formats:**
- Vietnamese dot separator: `2.612.800` (most common)
- Comma separator: `2,612,800`
- Units: `2tr6` (2.6 million), `500k` (500 thousand)
- Plain numbers: `2612800`
- With currency: `2.612.800 VNĐ`

Examples:
```
452242005
Trang Kim Bình
MB Bank
2.612.800
```

```
Phạm Văn Giáo
银行：Vietcombank
1024088941
2.614.800
```

```
名字：Phạm Văn Giáo
银行：Vcb
1024088941
2.614.800
```

The bot will automatically generate and send a VietQR code image for easy bank transfers with support for 70+ Vietnamese banks.
- `/delete [ID]` - Delete transaction record

### Currency Conversion
- `/t [amount]` - Convert VND to USDT
- `/v [amount]` - Convert USDT to VND
- `/d [rate] [exchange rate]` - Set temporary rate and exchange rate
- `/d2 [wrate] [wexchange rate]` - Set withdrawal rate and exchange rate (enables advanced mode)
- `/d2 off` - Turn off advanced mode and return to basic display
- `/m [unit]` - Set currency unit

### USDT Address Management
- `/usdt [address]` - Set USDT address (admin only)
- `/u` - Display current USDT address

### Other Features
- `/c` - Extract bank information from image
- `/report` - Display transaction report
- `/users` - List users

### Math Calculations
- Enter math expressions like `2+2` for calculation
- **NEW: Full support for abbreviated number formats in expressions**:
  - `2k+500` = 2,500 (2,000 + 500)
  - `1tr*2` = 2,000,000 (1,000,000 * 2)
  - `3m/2+4k` = 1,504,000 (3,000,000 / 2 + 4,000)
  - `100,000+50k` = 150,000 (100,000 + 50,000)
  - `2tr543k-1m` = 1,543,000 (2,543,000 - 1,000,000)
  - All number formats (k, tr, m, comma-separated, combined, mixed units) work in calculations

### 🌐 Groups Dashboard Website
**NEW FEATURE**: Beautiful web interface to view all groups information!

**How to use:**
1. Use `/groups` command (admin only)
2. Bot will send you a link to the web dashboard
3. Click the link to view:
   - 📊 **Overview Statistics**: Total groups, transactions, and members
   - 👥 **Group Details**: Individual group information cards
   - 💰 **Financial Data**: VND/USDT totals, rates, and exchange rates
   - 👨‍💼 **Operators**: List of operators in each group
   - 📅 **Activity**: Last clear date and transaction counts
   - 🔄 **Auto-refresh**: Data updates every 5 minutes

**Features:**
- ✅ Responsive design for mobile and desktop
- ✅ Real-time data from MongoDB
- ✅ Beautiful gradient design
- ✅ Easy-to-read cards layout
- ✅ Manual refresh button
- ✅ Automatic data updates

### 🏦 Auto Bank Transfer Processing
**NEW FEATURE**: Automatically process bank transfer notifications!

**How it works:**
1. When you receive a bank transfer notification message like this:
   ```
   - Tiền vào: +7,834,351 đ
   - Tài khoản: 20991331 tại ACB TRAN VAN DUONG
   - Lúc: 2025-07-12 12:57:48
   - Nội dung CK: ACB;20991331;NGUYEN MINH TAM chuyen tien GD 477795-071225 12:57:48
   ```

2. Simply **reply "1"** to that message

3. Bot will automatically:
   - ✅ Parse the amount from the notification
   - ✅ Execute `+7,834,351` command automatically
   - ✅ Record the transaction with full details
   - ✅ Update group totals and generate report

**Supported bank notification formats:**
- `Tiền vào: [amount] đ` - Vietnamese format
- `Số tiền: [amount] VND` - Amount format  
- `Amount: [amount] đ` - English format
- All number formats supported: `1tr`, `500k`, `2,500,000`, etc.

**Requirements:**
- Must have Operator permissions
- Message must contain bank-related keywords (tiền vào, tài khoản, chuyển tiền, etc.)
- Must contain valid amount with Vietnamese currency notation

### TRC20 Address Recognition
- Enter TRC20 address for formatted display

## Setup

### Environment Variables
Create a `.env` file in the root directory with:

```env
# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Server URL for website links (required for /groups command)
SERVER_URL=https://your-server-domain.com
# For local development: SERVER_URL=http://localhost:3003

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/your_database_name

# Port for Express server (default: 3003)
PORT=3003

# OpenAI API Key (for image processing)
OPENAI_API_KEY=your_openai_api_key_here
```

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env` file
4. Start the bot: `npm start`

### Important Notes
- The `SERVER_URL` environment variable is required for the `/groups` command to work properly
- Make sure your server is accessible from the internet if you want to use the groups dashboard
- For local development, use `http://localhost:3003` as SERVER_URL
- For production, use your actual domain name (e.g., `https://yourbot.herokuapp.com`)

## Tech Stack

- Node.js
- MongoDB with Mongoose
- Telegram Bot API
- OpenAI API for image processing
- Express.js for web dashboard
