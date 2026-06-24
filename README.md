# 🚀 E-Commerce Intelligence Command Center

A high-performance decision intelligence system designed to help e-commerce stakeholders analyze revenue trends, identify profit leakages, segments customers (via RFM), track cohorts retention, audit data quality (Excel QA simulation), and execute raw SQL queries inside an interactive web-based BI dashboard.

---

## 📂 Project Architecture

The system is constructed with a lightweight, zero-dependency, local-first architecture:

```
[Python Data Generator] ──> [SQLite: ecommerce.db] ──> [Zero-Dep Python Server] ──> [Glassmorphism BI UI]
        │                                                                                     │
        └───> [Raw/Clean CSV Exports]                                                         └───> [SQL Sandbox IDE]
```

1. **Synthetic Data Engine (`generate_data.py`)**:
   * Generates 2 years of synthetic orders, customer interactions, product price lists, and shipping durations.
   * Injects specific operational anomalies (product profit leakages, regional shipping delays leading to churn, discount sensitivity).
   * Introduces data quality issues (duplicates, null values, orphans, outliers).
   * Audits the raw data, logs issues to `public/qa_audit_results.json`, cleans the anomalies, and exports CSV lists to `/data/`.

2. **SQL Analytics Engine (`schema.sql` & `ecommerce.db`)**:
   * Builds the database structure (`customers`, `products`, `orders`, `order_items`).
   * Precomputes views for:
     * **RFM Segmentation** (`view_customer_rfm`): Recency, Frequency, and Monetary scores mapped to Champions, Loyal, At-Risk, or Lost segments.
     * **Monthly Cohorts Retention** (`view_cohort_retention`): MoM customer retention matrices.
     * **Churn Risk Predictor** (`view_churn_prediction`): Probability scores based on orders frequency standard deviations.
     * **Sales Forecast** (`view_sales_forecast`): 30-day moving average baseline.

3. **Backend Service Layer (`server.py`)**:
   * Uses Python's built-in `http.server` and `sqlite3` to ensure zero compilation overhead.
   * Serves the static dashboard.
   * Exposes a POST `/api/query` API endpoint which executes queries sent from the client-side dashboard and returns JSON.

4. **BI Front-End Command Center (`public/`)**:
   * Designed with a premium **dark glassmorphism theme** using custom fonts (Inter & JetBrains Mono).
   * Incorporates **Chart.js** for animated widgets.
   * Includes a fully integrated **SQL Sandbox IDE** displaying the active database schema and allowing live execution of arbitrary queries.
   * Features a **Data Quality Audit ledger** mapping data cleaning rules.

---

## 🛠️ Quick Start Instructions

Ensure you have **Python 3.8+** installed. No external packages or package managers (Node, npm, pip) are required.

### 1. Generate Data & Populate Database
Open a terminal in the project directory and run the data generator:
```bash
python generate_data.py
```
*This will create the clean/raw CSV files, run the QA audit, compile `ecommerce.db`, and run `schema.sql` to build the precomputed analytics views.*

### 2. Start the Server
Start the local server:
```bash
python server.py
```
*The command prompt will confirm the server is running:*
`Local URL: http://localhost:3000`

### 3. Open the Dashboard
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 📊 Dashboard Modules

### 1. Executive Summary
* **KPI Engine**: Live tracking of Revenue, Net Profit, Gross Margin, Total Orders, Average Order Value (AOV), Customer Lifetime Value (CLV Proxy), and Repeat Purchase Rate (RPR).
* **Moving Average Forecast**: Chart displaying actual sales vs. a 3-month moving average trendline.
* **Decision Overlay**: Evaluates margin compression and identifies promo code impacts.

### 2. Customer Intelligence
* **RFM Segments**: Distributes the database into Champions, Loyal, Promising, At-Risk, and Lost customers.
* **Top 10% Leaderboard**: Lists high-value spenders to identify target customer lists.

### 3. Product Performance
* **Margin Matrix Scatter Plot**: Segments products into quadrants. Top-Right represents **Stars** (high sales, high profit), and Top-Left represents **Profit Leaks** (high sales, negative profits).
* **Discount Sensitivity**: Visualizes product volume growth against margin compression at different discount ranges.

### 4. Regional Performance
* **Logistics Tracker**: Compares MoM revenue against average shipping delay durations per region. Shows the July 2025 shipping delay spike and subsequent sales decline on the West Coast.

### 5. Retention & Cohort Heatmap
* **Interactive Heatmap**: A color-shaded grid displaying MoM cohort survival rates.
* **Churn Predictor**: Renders customers flagged as "High Risk (Overdue)" based on their order intervals.

### 6. Data Quality Audit (Excel Sim)
* **QA Health Score**: Displays data cleanliness percentages.
* **Cleanup Ledger**: Lists audit results showing how duplicates, nulls, price constraints, and orphan foreign keys were resolved before database import.

### 7. SQL Sandbox IDE
* **Schema Explorer**: Sidebar listing tables, views, and columns.
* **Interactive Editor**: Allows writing custom SQL against the active SQLite database. Includes pre-loaded templates for testing query logic.

---

## 💡 Executive Strategic Recommendations (Decision Intelligence)

Based on the simulated transactional dataset, the following key findings and recommended actions have been integrated into the Command Center:

1. **Fix Product Profit Leaks**:
   * **Finding**: The *GigaCharge Wireless Charger* and *NeoSound Earbuds* generate high unit sales but operate at a net loss due to average promotional discounts exceeding 42%.
   * **Recommendation**: Replace flat, single-item discount markdowns with bundle deals (e.g., "Buy an Espresso Maker, get a charger at 15% off"). Introduce a strict 35% discount cap on all Electronics.

2. **Mitigate West Coast Logistics Delays**:
   * **Finding**: The *North America West* region saw a 48% decline in sales starting July 2025, which directly correlates with average shipping delays surging from 3.2 days to 11.8 days due to carrier bottlenecks.
   * **Recommendation**: Transition fulfillment to local West Coast third-party logistics (3PL) providers to reduce transit times. Auto-issue a $10 store credit to delayed buyers to prevent permanent churn.

3. **Incentivize Month 1 Cohort Retention**:
   * **Finding**: Cohort retention drops sharply from 100% to ~20% in Month 1 across all buyer cohorts, indicating high drop-off after the first transaction.
   * **Recommendation**: Implement post-purchase onboarding emails. Auto-send accessory recommendations with a 15% discount code valid for 14 days after their initial delivery.
