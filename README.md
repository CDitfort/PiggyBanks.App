# Piggybanks.app

A children's chore money tracking application that allows parents to manage their children's virtual piggy banks.

## Features

- Parent registration and authentication
- Child account management with PIN-based login
- Chore money tracking and balance management
- Withdrawal and transfer requests with parental approval
- Transaction history for transparency
- Secure authentication via Firebase
- Data storage with MongoDB Atlas

## Project Structure

```
piggybanks-app/
├── index.html        # Landing page
├── login.html        # Login page for both parents and children
├── register.html     # Parent registration page
├── dashboard.html    # Main dashboard (different views for parents and children)
├── css/
│   └── styles.css    # Main stylesheet
├── js/
│   ├── firebase-config.js  # Firebase configuration
│   ├── auth.js            # Authentication logic
│   ├── dashboard.js       # Dashboard functionality
│   └── db.js              # MongoDB connection and operations
└── README.md         # Project documentation
```

## Setup Instructions

1. Configure Firebase project
2. Set up MongoDB Atlas cluster
3. Update configuration files with your credentials
4. Deploy to web server