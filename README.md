# JanSetu - Real-time Disease Surveillance & AI-Driven Supply Chain Optimization

## Problem Statement
In rural India, disease surveillance is often fragmented, leading to delayed outbreak detection and inefficient medical supply chain management. Healthcare professionals struggle with inadequate data and slow responsiveness to emerging health threats.

## Solution
JanSetu addresses these challenges by enabling real-time ASHA (Agniveer Health and Safety Ambassadors) field data collection, comprehensive analysis of medical shop operations, and the correlation between disease outbreaks and demand for medical supplies. Our predictive supply chain optimization ensures that resources are allocated efficiently, enhancing the overall healthcare response.

## Key Features
- **Demand Forecasting:** Leverage historical data to accurately predict future medical supply needs.
- **Price Anomaly Detection:** Identify and alert stakeholders about fluctuations in medicine prices to safeguard affordability.
- **Outbreak Prediction:** Use AI-driven models to forecast potential disease outbreaks based on current data trends.

## System Architecture
A single Next.js application backed by MongoDB. Two independent witnesses feed it: what ASHA
workers report from the field, and what medicine actually moved off shop shelves. The
correlation between them drives the map, the risk scoring, and the supply recommendations —
and it specifically catches under-reporting, where medicine is selling but nobody has filed
a report.

See [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) for the API map, data model, and the
guards that keep the signal honest.

## Technology Stack
- App: Next.js (App Router, route handlers)
- Database: MongoDB (Mongoose)
- Auth: NextAuth, with one role/route table in `frontend/app/lib/auth/role-home.js`
- Maps: Leaflet (Mapbox tiles when configured, OpenStreetMap otherwise)
- AI: Gemini for chat, prescription reading and embeddings — optional; every safety rule
  is rule-based and works without a key
- Outbreak scoring: rule engine in `frontend/app/lib/outbreak-rules.js`, correlation and
  validation in `frontend/app/lib/correlation/`
- Language: English and Hinglish throughout, written side by side at the point of use

## Quick Start Guide
1. Clone the repository and install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Create `frontend/.env` with `MONGO_URI`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
   `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
3. Start the application:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.