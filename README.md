# Smart Mart & Smart Fashions - Cash Management System

A comprehensive cash management system for retail stores with multiple counters, daily cash tracking, and admin oversight.

## Features

### For Counter Users
- **Daily Workflow**: Step-by-step process from payments to closing cash
- **Payment Tracking**: Record all money going out throughout the day
- **Sales Entry**: Separate tracking for Smart Mart and Smart Fashion sales
- **Denomination Counter**: Physical cash count with notes and coins
- **Auto Calculation**: Automatic expected cash vs actual cash reconciliation
- **Read-Only After Submit**: Ensures data integrity once day is submitted

### For Admin
- **Multi-Counter Dashboard**: View all counters at once with summary statistics
- **Date Selection**: Review any past or present date
- **Cash Confirmation**: Review and confirm counter submissions
- **Unlock/Edit**: Override and correct any entry when needed
- **Password Management**: Change passwords for all users
- **Detailed View**: See complete breakdown of payments, sales, and cash

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root directory:

\`\`\`bash
MONGODB_URI=your_mongodb_connection_string
\`\`\`

### 2. Install Dependencies

The system will automatically install all required packages on first run.

### 3. Initial Users

The system automatically creates these users on first login:

**Counter Users** (Default password: `1234`):
- Username: `mart1` - Smart Mart Counter 1
- Username: `mart2` - Smart Mart Counter 2
- Username: `martfancy` - Smart Mart Fancy
- Username: `fashion` - Smart Fashion (Both)

**Admin** (Default password: `admin`):
- Username: `admin` - Full system access

### 4. Change Passwords

After first login, admin should immediately change all passwords:
1. Login as admin
2. Click "Passwords" button in admin dashboard
3. Select each user and set new passwords

## Daily Workflow

### Counter User Process

1. **Add Payments**: Record tea, auto, courier, and other expenses throughout the day
2. **Opening Cash**: System automatically loads from previous day's closing
3. **Sales Entry**: At end of day, copy totals from billing software
4. **Expected Cash**: System calculates how much cash should be present
5. **Physical Count**: Count actual cash using denomination interface
6. **Submit**: Lock the day and send to admin for confirmation

### Admin Process

1. **Review Submissions**: Check all counters for the day
2. **View Details**: Open detailed view to see all transactions
3. **Verify Cash**: Confirm physical cash collection matches system
4. **Confirm or Unlock**: Either confirm to finalize or unlock to allow corrections
5. **Password Management**: Change user passwords as needed

## Technical Details

- **Framework**: Next.js 16 with App Router
- **Database**: MongoDB with native driver (no ORM)
- **Authentication**: Custom bcrypt-based auth with secure sessions
- **Session Storage**: HTTP-only cookies for security
- **Styling**: Tailwind CSS v4 with custom design tokens

## Security Features

- Password hashing with bcrypt
- HTTP-only cookies prevent XSS attacks
- Role-based access control
- Automatic opening cash from confirmed previous day
- Read-only mode after submission
- Admin override capabilities with logging

## Business Logic

### Cash Calculation Formula
\`\`\`
Expected Cash = Opening Cash + Cash Sales - Payments
Shortage/Excess = Expected Cash - Actual Cash
\`\`\`

### Smart Fashion (Both) Counter
This counter handles both shops and requires separate tracking:
- Smart Mart: Cash, Card/UPI, Credit
- Smart Fashion: Cash, Card/UPI, Credit
- Single cash drawer shared between both

### Status Flow
1. **Open**: Counter can edit
2. **Submitted**: Counter cannot edit, awaiting admin
3. **Confirmed**: Finalized by admin, becomes next day's opening cash

## Support

For technical issues or feature requests, contact the development team.
