-- ==========================================
-- E-COMMERCE INTELLIGENCE COMMAND CENTER
-- SQL Analytics Queries Pack
-- ==========================================

-- 1. EXECUTIVE KPI SUMMARY
-- Queries core high-level metrics for dashboard cards
-- Contains: Revenue, Profit, Total Orders, Active Customers, AOV, Gross Margin, and Repeat Purchase Rate
-- ORDER: Static metrics
-- METRIC 1: Revenue, Profit, Margin, Orders, Customers, AOV
SELECT 
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
    ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent,
    COUNT(DISTINCT o.order_id) AS total_orders,
    COUNT(DISTINCT o.customer_id) AS total_customers,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)) / COUNT(DISTINCT o.order_id), 2) AS average_order_value_aov,
    -- CLV Proxy (Average revenue per customer)
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)) / COUNT(DISTINCT o.customer_id), 2) AS clv_proxy
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
WHERE o.status != 'Cancelled';

-- METRIC 2: Repeat Purchase Rate (RPR)
-- % of customers with > 1 order
WITH customer_order_counts AS (
    SELECT customer_id, COUNT(order_id) AS order_count
    FROM orders
    WHERE status != 'Cancelled'
    GROUP BY customer_id
)
SELECT 
    ROUND((COUNT(CASE WHEN order_count > 1 THEN 1 END) * 100.0) / COUNT(*), 2) AS repeat_purchase_rate
FROM customer_order_counts;


-- 2. PRODUCT PERFORMANCE MATRIX (PROFIT LEAK ANALYSIS)
-- Evaluates which products generate high sales but destroy value (profit leaks)
SELECT 
    p.product_id,
    p.name AS product_name,
    p.category,
    SUM(oi.quantity) AS units_sold,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
    ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent,
    ROUND(AVG(oi.discount) * 100, 2) AS average_discount_percent
FROM products p
JOIN order_items oi ON p.product_id = oi.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.status != 'Cancelled'
GROUP BY p.product_id, p.name, p.category
ORDER BY total_profit ASC; -- Negative profits (leaks) appear at the top


-- 3. DISCOUNT SENSITIVITY BREAKDOWN
-- Groups transactions into discount ranges to see the impact on volume and profit margin
SELECT 
    CASE 
        WHEN discount = 0 THEN '0% No Discount'
        WHEN discount > 0 AND discount <= 0.15 THEN '1-15% Light Discount'
        WHEN discount > 0.15 AND discount <= 0.35 THEN '16-35% Medium Discount'
        WHEN discount > 0.35 AND discount <= 0.50 THEN '36-50% Heavy Promo'
        ELSE '51-70% Deep Discount Clearance'
    END AS discount_tier,
    COUNT(DISTINCT oi.order_id) AS order_count,
    SUM(oi.quantity) AS units_sold,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
    ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.status != 'Cancelled'
GROUP BY discount_tier
ORDER BY discount_tier ASC;


-- 4. CUSTOMER SEGMENTS (RFM DISTRIBUTION)
-- Extracts volume, average metrics, and financial share of each RFM customer segment
SELECT 
    customer_segment,
    COUNT(*) AS customer_count,
    ROUND((COUNT(*) * 100.0) / (SELECT COUNT(*) FROM view_customer_rfm), 2) AS segment_share_percent,
    ROUND(AVG(recency_days), 1) AS avg_recency_days,
    ROUND(AVG(frequency), 1) AS avg_frequency,
    ROUND(AVG(monetary), 2) AS avg_monetary_spend,
    ROUND(SUM(monetary), 2) AS total_segment_revenue
FROM view_customer_rfm
GROUP BY customer_segment
ORDER BY total_segment_revenue DESC;


-- 5. REGIONAL PERFORMANCE LOGISTICS SHIFTS (MONTH-OVER-MONTH)
-- Displays revenue, profit, orders, and delivery delays MoM by region
SELECT 
    c.region,
    strftime('%Y-%m', o.order_date) AS sales_month,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS revenue,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS profit,
    COUNT(DISTINCT o.order_id) AS order_count,
    -- Average delivery delay in days
    ROUND(AVG(JULIANDAY(o.shipping_date) - JULIANDAY(o.order_date)), 1) AS average_shipping_delay_days
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
JOIN customers c ON o.customer_id = c.customer_id
JOIN products p ON oi.product_id = p.product_id
WHERE o.status = 'Delivered' -- Delay calculation only applies to successfully delivered orders
GROUP BY c.region, sales_month
ORDER BY c.region, sales_month ASC;


-- 6. COHORT RETENTION HEATMAP
-- Selects precomputed monthly retention matrix
SELECT 
    cohort_month,
    cohort_index,
    cohort_size,
    active_customers,
    retention_rate
FROM view_cohort_retention
ORDER BY cohort_month, cohort_index ASC;


-- 7. CHURN RISK PREDICTION REPORT
-- Selects top customers at high risk of churning, highlighting key contacts
SELECT 
    customer_id,
    name,
    email,
    region,
    total_orders,
    days_since_last,
    avg_order_interval_days,
    churn_risk_status,
    ROUND(churn_probability * 100, 1) AS churn_probability_percent
FROM view_churn_prediction
WHERE churn_risk_status LIKE 'High Risk%'
ORDER BY total_orders DESC, days_since_last DESC
LIMIT 50;


-- 8. 30-DAY SALES & PROFIT ROLLING FORECAST
-- Selects sales trends with rolling averages
SELECT 
    order_date,
    daily_revenue,
    daily_profit,
    rolling_avg_revenue_30d,
    rolling_avg_profit_30d
FROM view_sales_forecast
ORDER BY order_date ASC;
