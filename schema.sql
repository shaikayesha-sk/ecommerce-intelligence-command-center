-- ==========================================
-- E-COMMERCE INTELLIGENCE COMMAND CENTER
-- Precomputed SQL Views and Analytical Layer
-- ==========================================

-- 1. VIEW: RFM Segment Analysis
-- Computes Recency, Frequency, and Monetary scores and maps to customer segments
DROP VIEW IF EXISTS view_customer_rfm;
CREATE VIEW view_customer_rfm AS
WITH customer_aggregates AS (
    -- Get base customer metrics
    SELECT 
        c.customer_id,
        c.name,
        c.email,
        c.region,
        MAX(o.order_date) AS last_purchase_date,
        -- Calculate recency: days since last purchase relative to the latest transaction in the DB
        (SELECT JULIANDAY(MAX(order_date)) FROM orders) - JULIANDAY(MAX(o.order_date)) AS recency_days,
        COUNT(DISTINCT o.order_id) AS frequency,
        SUM(oi.quantity * oi.price * (1 - oi.discount)) AS monetary
    FROM customers c
    JOIN orders o ON c.customer_id = o.customer_id
    JOIN order_items oi ON o.order_id = oi.order_id
    WHERE o.status != 'Cancelled'
    GROUP BY c.customer_id, c.name, c.email, c.region
),
rfm_raw_scores AS (
    -- Score Recency, Frequency, and Monetary from 1-5 using NTILE
    SELECT 
        customer_id,
        name,
        email,
        region,
        last_purchase_date,
        recency_days,
        frequency,
        monetary,
        -- Recency: higher score for smaller recency_days (most recent). 
        -- NTILE orders ASC, so we order by recency_days DESC to give smallest days the score 5.
        NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,
        NTILE(5) OVER (ORDER BY frequency ASC) AS f_score,
        NTILE(5) OVER (ORDER BY monetary ASC) AS m_score
    FROM customer_aggregates
)
SELECT 
    customer_id,
    name,
    email,
    region,
    last_purchase_date,
    recency_days,
    frequency,
    monetary,
    r_score,
    f_score,
    m_score,
    (r_score || f_score || m_score) AS rfm_cell,
    CASE 
        -- Champions: Recent, frequent, and high spenders
        WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
        -- Loyal Customers: Frequent and spend well
        WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3 THEN 'Loyal Customers'
        -- New/Recent buyers: High recency but low frequency
        WHEN r_score >= 4 AND f_score <= 2 THEN 'New / Promising'
        -- At-Risk: Inactive for a while but bought frequently/spent a lot historically
        WHEN r_score <= 2 AND (f_score >= 3 OR m_score >= 3) THEN 'At-Risk Customers'
        -- Lost: Haven't bought in a long time, low frequency, low monetary
        WHEN r_score <= 2 AND f_score <= 2 THEN 'Lost Customers'
        -- Default classification
        ELSE 'Needs Attention / About to Sleep'
    END AS customer_segment
FROM rfm_raw_scores;


-- 2. VIEW: Cohort Retention Matrix
-- Precomputes monthly customer signup cohorts and tracks retention MoM
DROP VIEW IF EXISTS view_cohort_retention;
CREATE VIEW view_cohort_retention AS
WITH customer_first_purchase AS (
    -- Identify the first purchase date of each customer
    SELECT 
        customer_id,
        MIN(order_date) AS first_purchase_date,
        strftime('%Y-%m', MIN(order_date)) AS cohort_month
    FROM orders
    WHERE status != 'Cancelled'
    GROUP BY customer_id
),
customer_activity_months AS (
    -- Get distinct months each customer made a purchase and calculate MoM index
    SELECT DISTINCT 
        o.customer_id,
        strftime('%Y-%m', o.order_date) AS activity_month,
        cfp.cohort_month,
        -- Calculate month offset (Cohort Index: 0, 1, 2...)
        ((strftime('%Y', o.order_date) - strftime('%Y', cfp.first_purchase_date)) * 12 + 
         (strftime('%m', o.order_date) - strftime('%m', cfp.first_purchase_date))) AS cohort_index
    FROM orders o
    JOIN customer_first_purchase cfp ON o.customer_id = cfp.customer_id
    WHERE o.status != 'Cancelled'
),
cohort_sizes AS (
    -- Size of each signup cohort (Month 0 size)
    SELECT 
        cohort_month, 
        COUNT(DISTINCT customer_id) AS cohort_size
    FROM customer_first_purchase
    GROUP BY cohort_month
),
cohort_retention_counts AS (
    -- Count of active customers in each subsequent month
    SELECT 
        cohort_month,
        cohort_index,
        COUNT(DISTINCT customer_id) AS active_customers
    FROM customer_activity_months
    GROUP BY cohort_month, cohort_index
)
SELECT 
    r.cohort_month,
    r.cohort_index,
    s.cohort_size,
    r.active_customers,
    ROUND((CAST(r.active_customers AS REAL) / s.cohort_size) * 100, 2) AS retention_rate
FROM cohort_retention_counts r
JOIN cohort_sizes s ON r.cohort_month = s.cohort_month;


-- 3. VIEW: Customer Churn Prediction Layer
-- Identifies customer-specific purchasing behaviors and flags those overdue for orders
DROP VIEW IF EXISTS view_churn_prediction;
CREATE VIEW view_churn_prediction AS
WITH customer_order_gaps AS (
    SELECT 
        c.customer_id,
        c.name,
        c.email,
        c.region,
        COUNT(o.order_id) AS total_orders,
        MIN(o.order_date) AS first_order,
        MAX(o.order_date) AS last_order,
        -- Days since last order relative to global max date
        (SELECT JULIANDAY(MAX(order_date)) FROM orders) - JULIANDAY(MAX(o.order_date)) AS days_since_last,
        -- Total duration of customer lifecycle
        JULIANDAY(MAX(o.order_date)) - JULIANDAY(MIN(o.order_date)) AS lifetime_days
    FROM customers c
    JOIN orders o ON c.customer_id = o.customer_id
    WHERE o.status != 'Cancelled'
    GROUP BY c.customer_id, c.name, c.email, c.region
),
customer_intervals AS (
    SELECT 
        customer_id,
        name,
        email,
        region,
        total_orders,
        days_since_last,
        -- Calculate average order frequency (interval) in days. 
        -- If customer only has 1 order, default to 90 days.
        CASE 
            WHEN total_orders > 1 THEN ROUND(lifetime_days / (total_orders - 1), 2)
            ELSE 90.00
        END AS avg_order_interval_days
    FROM customer_order_gaps
)
SELECT 
    customer_id,
    name,
    email,
    region,
    total_orders,
    days_since_last,
    avg_order_interval_days,
    -- Determine churn probability
    CASE 
        WHEN total_orders = 1 AND days_since_last > 180 THEN 'High Risk (Inactive One-Timer)'
        WHEN days_since_last > 3 * avg_order_interval_days THEN 'High Risk (Churned)'
        WHEN days_since_last > 1.5 * avg_order_interval_days AND days_since_last <= 3 * avg_order_interval_days THEN 'Medium Risk (Warning)'
        ELSE 'Low Risk (Active)'
    END AS churn_risk_status,
    CASE 
        WHEN total_orders = 1 AND days_since_last > 180 THEN 0.85
        WHEN days_since_last > 3 * avg_order_interval_days THEN 0.95
        WHEN days_since_last > 1.5 * avg_order_interval_days AND days_since_last <= 3 * avg_order_interval_days THEN 0.50
        ELSE 0.10
    END AS churn_probability
FROM customer_intervals;


-- 4. VIEW: Daily Sales & 30-Day Rolling Forecast Trend
DROP VIEW IF EXISTS view_sales_forecast;
CREATE VIEW view_sales_forecast AS
WITH daily_sales AS (
    SELECT 
        o.order_date, 
        SUM(oi.quantity * oi.price * (1 - oi.discount)) AS daily_revenue,
        SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) AS daily_profit,
        COUNT(DISTINCT o.order_id) AS daily_orders
    FROM orders o
    JOIN order_items oi ON o.order_id = oi.order_id
    JOIN products p ON oi.product_id = p.product_id
    WHERE o.status != 'Cancelled'
    GROUP BY o.order_date
)
SELECT 
    order_date, 
    daily_revenue,
    daily_profit,
    daily_orders,
    -- Calculate 30-day moving average for revenue
    ROUND(AVG(daily_revenue) OVER (
        ORDER BY order_date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ), 2) AS rolling_avg_revenue_30d,
    -- Calculate 30-day moving average for profit
    ROUND(AVG(daily_profit) OVER (
        ORDER BY order_date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ), 2) AS rolling_avg_profit_30d
FROM daily_sales;
