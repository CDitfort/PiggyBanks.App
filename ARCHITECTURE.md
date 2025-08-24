# Piggybanks.app - System Architecture

## 1. System Overview

Frontend-only application that connects to external API.

## 2. Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Authentication**: External API
- **Database**: External service
- **Hosting**: Static hosting (Netlify, Vercel, etc.)

## 3. File Structure

```
piggybanks-app/
├── index.html            # Landing page
├── login.html            # Unified login page
├── register.html         # Parent registration
├── dashboard.html        # Dynamic dashboard
├── css/
│   └── styles.css        # Main stylesheet
├── js/
│   ├── config.js         # Configuration
│   ├── auth.js           # Authentication logic
│   └── dashboard.js      # Dashboard functionality
└── README.md
```