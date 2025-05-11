<<<<<<< HEAD
# Botketoanviet02
=======
# Botketoan01

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

## Recent Updates

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
- `+ [amount] [note]` - Add deposit record
- `- [amount] [note]` - Add withdrawal record
- `上课` - Clear current transaction records
- `结束` - Display transaction report

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

### TRC20 Address Recognition
- Enter TRC20 address for formatted display

## Tech Stack

- Node.js
- MongoDB with Mongoose
- Telegram Bot API
- OpenAI API for image processing
>>>>>>> 60ecaaa (Initial commit)
