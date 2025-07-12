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
- **NEW: Number format with abbreviated units (k, tr, m), combined formats, mixed units and comma-separated numbers**

## Recent Updates

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

### Transaction Recording
- `+ [amount] [note]` - Add deposit record (supports abbreviated, combined, mixed units, and comma-separated formats)
- `- [amount] [note]` - Add withdrawal record (supports abbreviated, combined, mixed units, and comma-separated formats)
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
- `/delete [ID]` - Delete transaction record

### Currency Conversion
- `/t [amount]` - Convert VND to USDT
- `/v [amount]` - Convert USDT to VND
- `/d [rate] [exchange rate]` - Set temporary rate and exchange rate
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

## Tech Stack

- Node.js
- MongoDB with Mongoose
- Telegram Bot API
- OpenAI API for image processing
