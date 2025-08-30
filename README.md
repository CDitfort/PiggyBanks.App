# Piggybanks.app

A children's chore money tracking application that allows parents to manage their children's virtual piggy banks.

## Live Demo

[https://piggybanks.app](https://piggybanks.app)

## Features

- Parent registration and authentication
- Child account management with PIN-based login
- Chore money tracking and balance management
- Withdrawal and transfer requests with parental approval
- Transaction history for transparency
- Secure authentication via Netlify Functions
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
│   ├── config.js  # App configuration
│   ├── auth.js            # Authentication logic
│   ├── dashboard.js       # Dashboard functionality
│   └── db.js              # MongoDB connection and operations
└── README.md         # Project documentation
```

## Setup Instructions

1. Configure Netlify site and functions
2. Set up MongoDB Atlas cluster
3. Update configuration files with your credentials
4. Deploy to Netlify