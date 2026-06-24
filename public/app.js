/* ==========================================================================
   E-COMMERCE INTELLIGENCE COMMAND CENTER - CORE DASHBOARD ENGINE
   ========================================================================== */

// Base SQL Queries with {WHERE_CLAUSE} and {RFM_WHERE_CLAUSE} placeholders
const QUERIES = {
    // 1. Executive Dashboard KPIs
    kpis: `
        SELECT 
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
            ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent,
            COUNT(DISTINCT o.order_id) AS total_orders,
            COUNT(DISTINCT o.customer_id) AS total_customers,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)) / COUNT(DISTINCT o.order_id), 2) AS average_order_value_aov,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)) / COUNT(DISTINCT o.customer_id), 2) AS clv_proxy
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON oi.product_id = p.product_id
        WHERE o.status != 'Cancelled' {WHERE_CLAUSE};
    `,
    rpr: `
        WITH customer_order_counts AS (
            SELECT o.customer_id, COUNT(o.order_id) AS order_count
            FROM orders o
            JOIN customers c ON o.customer_id = c.customer_id
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN products p ON oi.product_id = p.product_id
            WHERE o.status != 'Cancelled' {WHERE_CLAUSE}
            GROUP BY o.customer_id
        )
        SELECT 
            ROUND((COUNT(CASE WHEN order_count > 1 THEN 1 END) * 100.0) / COUNT(*), 2) AS repeat_purchase_rate
        FROM customer_order_counts;
    `,
    // Executive trend: Daily revenue & profit (to compute 30d rolling average in JS)
    execTrend: `
        SELECT 
            o.order_date,
            SUM(oi.quantity * oi.price * (1 - oi.discount)) AS daily_revenue,
            SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) AS daily_profit
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON oi.product_id = p.product_id
        WHERE o.status != 'Cancelled' {WHERE_CLAUSE}
        GROUP BY o.order_date
        ORDER BY o.order_date ASC;
    `,
    // 2. Customer View: Precomputed RFM Distribution
    rfmDistribution: `
        SELECT customer_segment, COUNT(*) AS customer_count
        FROM view_customer_rfm
        WHERE 1=1 {RFM_WHERE_CLAUSE}
        GROUP BY customer_segment
        ORDER BY customer_count DESC;
    `,
    // Customer View: Top 10% High-Value customers
    topCustomers: `
        SELECT customer_id, name, region, monetary, frequency, customer_segment
        FROM view_customer_rfm
        WHERE 1=1 {RFM_WHERE_CLAUSE}
        ORDER BY monetary DESC
        LIMIT 15;
    `,
    // 3. Product View: Revenue vs Profit Matrix
    productMatrix: `
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
        JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.status != 'Cancelled' {WHERE_CLAUSE}
        GROUP BY p.product_id, p.name, p.category
        ORDER BY total_profit ASC;
    `,
    // Product View: Discount sensitivity analysis
    discountSensitivity: `
        SELECT 
            CASE 
                WHEN discount = 0 THEN '0% No Discount'
                WHEN discount > 0 AND discount <= 0.15 THEN '1-15% Light'
                WHEN discount > 0.15 AND discount <= 0.35 THEN '16-35% Medium'
                WHEN discount > 0.35 AND discount <= 0.50 THEN '36-50% Heavy Promo'
                ELSE '51-70% Clearance'
            END AS discount_tier,
            COUNT(DISTINCT oi.order_id) AS order_count,
            SUM(oi.quantity) AS units_sold,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
            ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        JOIN orders o ON oi.order_id = o.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.status != 'Cancelled' {WHERE_CLAUSE}
        GROUP BY discount_tier
        ORDER BY discount_tier ASC;
    `,
    // 4. Regional View: Logistics Shipping Delays MoM
    regionalShipping: `
        SELECT 
            c.region,
            strftime('%Y-%m', o.order_date) AS sales_month,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS revenue,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS profit,
            COUNT(DISTINCT o.order_id) AS order_count,
            ROUND(AVG(JULIANDAY(o.shipping_date) - JULIANDAY(o.order_date)), 1) AS average_shipping_delay_days
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON oi.product_id = p.product_id
        WHERE o.status = 'Delivered' {WHERE_CLAUSE}
        GROUP BY c.region, sales_month
        ORDER BY c.region, sales_month ASC;
    `,
    // Regional Summary Leaderboard
    regionalTable: `
        SELECT 
            c.region,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
            ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
            ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent,
            COUNT(DISTINCT o.order_id) AS total_orders,
            ROUND(AVG(JULIANDAY(o.shipping_date) - JULIANDAY(o.order_date)), 1) AS average_shipping_delay_days
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON oi.product_id = p.product_id
        WHERE o.status = 'Delivered' {WHERE_CLAUSE}
        GROUP BY c.region
        ORDER BY total_revenue DESC;
    `,
    // 5. Retention: Precomputed Cohort Retention Matrix
    cohortRetention: `
        SELECT cohort_month, cohort_index, cohort_size, active_customers, retention_rate
        FROM view_cohort_retention
        ORDER BY cohort_month, cohort_index ASC;
    `,
    // Retention: Churn risk prediction
    churnPrediction: `
        SELECT name, email, region, days_since_last, avg_order_interval_days, churn_risk_status
        FROM view_churn_prediction
        WHERE churn_risk_status LIKE 'High Risk%' {RFM_WHERE_CLAUSE}
        ORDER BY total_orders DESC, days_since_last DESC
        LIMIT 10;
    `
};

// SQL Templates for Sandbox IDE
const SQL_TEMPLATES = {
    custom: `SELECT * FROM customers LIMIT 10;`,
    kpis: `-- KPI Engine: Basic High-Level Metrics
SELECT 
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
    ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS profit_margin_percent,
    COUNT(DISTINCT o.order_id) AS total_orders
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
WHERE o.status != 'Cancelled';`,
    rfm: `-- RFM Score Distribution from view_customer_rfm
SELECT 
    customer_segment,
    COUNT(*) AS customer_count,
    ROUND(AVG(recency_days), 1) AS avg_recency_days,
    ROUND(AVG(frequency), 1) AS avg_frequency,
    ROUND(AVG(monetary), 2) AS avg_monetary_spend
FROM view_customer_rfm
GROUP BY customer_segment
ORDER BY customer_count DESC;`,
    leaks: `-- Product Margin Analysis showing Profit Leakage Products (Negative margins)
SELECT 
    p.product_id,
    p.name AS product_name,
    p.category,
    SUM(oi.quantity) AS units_sold,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount)), 2) AS total_revenue,
    ROUND(SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost), 2) AS total_profit,
    ROUND((SUM(oi.quantity * oi.price * (1 - oi.discount) - (oi.quantity * p.cost) - oi.shipping_cost) / SUM(oi.quantity * oi.price * (1 - oi.discount))) * 100, 2) AS margin_percent
FROM products p
JOIN order_items oi ON p.product_id = oi.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.status != 'Cancelled'
GROUP BY p.product_id, p.name
ORDER BY total_profit ASC;`,
    regions: `-- Regional Delivery Delays vs Order Cancellations
SELECT 
    c.region,
    COUNT(o.order_id) AS total_orders,
    COUNT(CASE WHEN o.status = 'Cancelled' THEN 1 END) AS cancelled_orders,
    ROUND(AVG(JULIANDAY(o.shipping_date) - JULIANDAY(o.order_date)), 1) AS avg_shipping_delay_days
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'Delivered' OR o.status = 'Cancelled'
GROUP BY c.region;`,
    cohorts: `-- Precomputed Cohort Retention Matrix (Month 0 to Month 5)
SELECT cohort_month, cohort_size,
    MAX(CASE WHEN cohort_index = 0 THEN retention_rate END) AS "Month 0",
    MAX(CASE WHEN cohort_index = 1 THEN retention_rate END) AS "Month 1",
    MAX(CASE WHEN cohort_index = 2 THEN retention_rate END) AS "Month 2",
    MAX(CASE WHEN cohort_index = 3 THEN retention_rate END) AS "Month 3",
    MAX(CASE WHEN cohort_index = 4 THEN retention_rate END) AS "Month 4",
    MAX(CASE WHEN cohort_index = 5 THEN retention_rate END) AS "Month 5"
FROM view_cohort_retention
GROUP BY cohort_month
ORDER BY cohort_month ASC;`,
    churn: `-- Churn Prediction risk factors list
SELECT name, email, region, total_orders, days_since_last, avg_order_interval_days, churn_risk_status, churn_probability
FROM view_churn_prediction
ORDER BY churn_probability DESC
LIMIT 20;`
};

// Global application state
const state = {
    filters: {
        startDate: '2024-01-01',
        endDate: '2025-12-31',
        region: 'All',
        category: 'All'
    },
    charts: {}
};

// ==========================================
// API CALL GATEWAY
// ==========================================
async function executeSQL(queryText) {
    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: queryText })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Server responded with error');
        }
        return result;
    } catch (error) {
        console.error('API Error:', error.message);
        throw error;
    }
}

// Helper to inject filters into query structures
function compileQuery(queryKey) {
    let baseQuery = QUERIES[queryKey];
    
    // 1. Prepare Standard Join Filters
    let conditions = [];
    if (state.filters.startDate) {
        conditions.push(`o.order_date >= '${state.filters.startDate}'`);
    }
    if (state.filters.endDate) {
        conditions.push(`o.order_date <= '${state.filters.endDate}'`);
    }
    if (state.filters.region && state.filters.region !== 'All') {
        conditions.push(`c.region = '${state.filters.region}'`);
    }
    if (state.filters.category && state.filters.category !== 'All') {
        conditions.push(`p.category = '${state.filters.category}'`);
    }
    let whereClause = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";

    // 2. Prepare RFM Specific Filters
    let rfmConditions = [];
    if (state.filters.region && state.filters.region !== 'All') {
        rfmConditions.push(`region = '${state.filters.region}'`);
    }
    let rfmWhereClause = rfmConditions.length > 0 ? "AND " + rfmConditions.join(" AND ") : "";

    // Interpolate clauses into base SQL
    return baseQuery
        .replace(/{WHERE_CLAUSE}/g, whereClause)
        .replace(/{RFM_WHERE_CLAUSE}/g, rfmWhereClause);
}

// Utility to format numbers as Currency
function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

// Utility to format standard percentages
function formatPercent(val) {
    return (val || 0).toFixed(2) + '%';
}

// ==========================================
// INITIALIZE APPLICATION VIEW CONTROLLER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilterBar();
    initSQLPlayground();
    
    // Initial data load
    refreshDashboards();
    loadDataQualityAudit();
});

// View Navigation Switcher
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.dashboard-view');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = item.getAttribute('data-view');

            // Set active class on nav
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Set active class on view sections
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `view-${targetView}`) {
                    section.classList.add('active');
                }
            });
        });
    });
}

// Filters listeners
function initFilterBar() {
    const applyBtn = document.getElementById('apply-filters-btn');
    const resetBtn = document.getElementById('reset-filters-btn');

    applyBtn.addEventListener('click', () => {
        state.filters.startDate = document.getElementById('filter-start-date').value;
        state.filters.endDate = document.getElementById('filter-end-date').value;
        state.filters.region = document.getElementById('filter-region').value;
        state.filters.category = document.getElementById('filter-category').value;
        
        refreshDashboards();
    });

    resetBtn.addEventListener('click', () => {
        document.getElementById('filter-start-date').value = '2024-01-01';
        document.getElementById('filter-end-date').value = '2025-12-31';
        document.getElementById('filter-region').value = 'All';
        document.getElementById('filter-category').value = 'All';

        state.filters = {
            startDate: '2024-01-01',
            endDate: '2025-12-31',
            region: 'All',
            category: 'All'
        };

        refreshDashboards();
    });
}

// ==========================================
// REFRESH ALL DASHBOARD ELEMENTS
// ==========================================
async function refreshDashboards() {
    console.log("Loading dashboard data for filters:", state.filters);
    
    // Load each dashboard view sequentially to avoid overloading local DB connection
    await loadExecutiveSummary();
    await loadCustomerIntelligence();
    await loadProductPerformance();
    await loadRegionalPerformance();
    await loadRetentionCohort();
}

// ==========================================
// 1. EXECUTIVE SUMMARY VIEW
// ==========================================
async function loadExecutiveSummary() {
    try {
        // A. Run KPI query
        const kpiSql = compileQuery('kpis');
        const kpiResult = await executeSQL(kpiSql);
        
        // B. Run RPR query
        const rprSql = compileQuery('rpr');
        const rprResult = await executeSQL(rprSql);
        
        if (kpiResult.rows && kpiResult.rows.length > 0) {
            const data = kpiResult.rows[0];
            document.getElementById('kpi-revenue').innerText = formatCurrency(data.total_revenue || 0);
            document.getElementById('kpi-profit').innerText = formatCurrency(data.total_profit || 0);
            document.getElementById('kpi-margin').innerText = formatPercent(data.profit_margin_percent || 0);
            document.getElementById('kpi-orders').innerText = (data.total_orders || 0).toLocaleString();
            document.getElementById('kpi-aov-clv').innerText = `${formatCurrency(data.average_order_value_aov || 0)} / ${formatCurrency(data.clv_proxy || 0)}`;
        }
        
        if (rprResult.rows && rprResult.rows.length > 0) {
            document.getElementById('kpi-rpr').innerText = formatPercent(rprResult.rows[0].repeat_purchase_rate || 0);
        }

        // C. Run Forecast/Trend line chart
        const trendSql = compileQuery('execTrend');
        const trendResult = await executeSQL(trendSql);
        
        renderExecTrendChart(trendResult.rows);

    } catch (err) {
        console.error('Failed to load Executive Summary:', err);
    }
}

function renderExecTrendChart(rows) {
    const canvas = document.getElementById('chart-exec-forecast');
    if (!canvas) return;

    // Group rows by month to prevent daily volatility noise in line chart
    const monthlyData = {};
    rows.forEach(r => {
        const month = r.order_date.substring(0, 7); // YYYY-MM
        if (!monthlyData[month]) {
            monthlyData[month] = { revenue: 0, profit: 0 };
        }
        monthlyData[month].revenue += r.daily_revenue;
        monthlyData[month].profit += r.daily_profit;
    });

    const labels = Object.keys(monthlyData).sort();
    const revenues = labels.map(m => monthlyData[m].revenue);
    const profits = labels.map(m => monthlyData[m].profit);

    // Compute rolling 3-Month average as simple trend forecast
    const forecast30d = [];
    for (let i = 0; i < revenues.length; i++) {
        if (i === 0) {
            forecast30d.push(revenues[i]);
        } else if (i === 1) {
            forecast30d.push((revenues[i] + revenues[i-1]) / 2);
        } else {
            forecast30d.push((revenues[i] + revenues[i-1] + revenues[i-2]) / 3);
        }
    }

    if (state.charts['execForecast']) {
        state.charts['execForecast'].destroy();
    }

    state.charts['execForecast'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue ($)',
                    data: revenues,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.05)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Net Profit ($)',
                    data: profits,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Sales Trend/Forecast (3-Mo MA)',
                    data: forecast30d,
                    borderColor: '#06b6d4',
                    borderDash: [5, 5],
                    tension: 0.3,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6' } }
            }
        }
    });
}

// ==========================================
// 2. CUSTOMER INTELLIGENCE VIEW
// ==========================================
async function loadCustomerIntelligence() {
    try {
        // A. Load RFM distribution
        const rfmSql = compileQuery('rfmDistribution');
        const rfmResult = await executeSQL(rfmSql);
        renderRFMChart(rfmResult.rows);

        // B. Load Top Customers table
        const topCustSql = compileQuery('topCustomers');
        const topCustResult = await executeSQL(topCustSql);
        populateTopCustomersTable(topCustResult.rows);

    } catch (err) {
        console.error('Failed to load Customer Intelligence:', err);
    }
}

function renderRFMChart(rows) {
    const canvas = document.getElementById('chart-rfm-distribution');
    if (!canvas) return;

    const labels = rows.map(r => r.customer_segment);
    const counts = rows.map(r => r.customer_count);
    
    // Assign matching segment colors
    const colors = labels.map(l => {
        if (l === 'Champions') return '#10b981';
        if (l === 'Loyal Customers') return '#06b6d4';
        if (l === 'New / Promising') return '#6366f1';
        if (l === 'At-Risk Customers') return '#f59e0b';
        if (l === 'Lost Customers') return '#ef4444';
        return '#9ca3af';
    });

    if (state.charts['rfm']) {
        state.charts['rfm'].destroy();
    }

    state.charts['rfm'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Customers count',
                data: counts,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bars
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#f3f4f6' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function populateTopCustomersTable(rows) {
    const tbody = document.querySelector('#table-top-customers tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    rows.forEach(r => {
        const tr = document.createElement('tr');
        
        let segmentClass = 'default';
        if (r.customer_segment === 'Champions') segmentClass = 'champions';
        else if (r.customer_segment === 'Loyal Customers') segmentClass = 'loyal';
        else if (r.customer_segment === 'New / Promising') segmentClass = 'new';
        else if (r.customer_segment === 'At-Risk Customers') segmentClass = 'at-risk';
        else if (r.customer_segment === 'Lost Customers') segmentClass = 'lost';

        tr.innerHTML = `
            <td>${r.customer_id}</td>
            <td><strong>${r.name}</strong></td>
            <td>${r.region}</td>
            <td>${formatCurrency(r.monetary)}</td>
            <td>${r.frequency}</td>
            <td><span class="badge-segment ${segmentClass}">${r.customer_segment}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 3. PRODUCT PERFORMANCE VIEW
// ==========================================
async function loadProductPerformance() {
    try {
        // A. Load revenue vs profit matrix scatter
        const matrixSql = compileQuery('productMatrix');
        const matrixResult = await executeSQL(matrixSql);
        
        renderProductMatrixChart(matrixResult.rows);
        populateProductTable(matrixResult.rows);

        // B. Load discount sensitivity
        const discountSql = compileQuery('discountSensitivity');
        const discountResult = await executeSQL(discountSql);
        renderDiscountSensitivityChart(discountResult.rows);

    } catch (err) {
        console.error('Failed to load Product Performance:', err);
    }
}

function renderProductMatrixChart(rows) {
    const canvas = document.getElementById('chart-product-matrix');
    if (!canvas) return;

    // Map rows into coordinates: X = Revenue, Y = Profit
    const dataPoints = rows.map(r => {
        const isLeak = r.total_profit < 0;
        return {
            x: r.total_revenue,
            y: r.total_profit,
            label: r.product_name,
            category: r.category,
            pointBackgroundColor: isLeak ? '#ef4444' : '#10b981',
            pointRadius: r.units_sold / 20 + 3 // Radius proportional to units sold
        };
    });

    if (state.charts['productMatrix']) {
        state.charts['productMatrix'].destroy();
    }

    state.charts['productMatrix'] = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Products',
                data: dataPoints,
                pointBackgroundColor: dataPoints.map(p => p.pointBackgroundColor),
                pointBorderColor: 'rgba(255,255,255,0.2)',
                pointRadius: dataPoints.map(p => p.pointRadius),
                hoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Total Revenue ($)', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    title: { display: true, text: 'Net Profit ($)', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const pt = ctx.raw;
                            return `${pt.label} (${pt.category}): Rev: ${formatCurrency(pt.x)}, Profit: ${formatCurrency(pt.y)}`;
                        }
                    }
                },
                legend: { display: false }
            }
        }
    });
}

function renderDiscountSensitivityChart(rows) {
    const canvas = document.getElementById('chart-discount-sensitivity');
    if (!canvas) return;

    // Filter order list order details
    const labels = rows.map(r => r.discount_tier);
    const units = rows.map(r => r.units_sold);
    const margins = rows.map(r => r.profit_margin_percent);

    if (state.charts['discount']) {
        state.charts['discount'].destroy();
    }

    state.charts['discount'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Units Sold (Volume)',
                    type: 'bar',
                    data: units,
                    backgroundColor: 'rgba(99, 102, 241, 0.6)',
                    yAxisID: 'y'
                },
                {
                    label: 'Net Margin (%)',
                    type: 'line',
                    data: margins,
                    borderColor: '#f59e0b',
                    pointBackgroundColor: '#f59e0b',
                    tension: 0.2,
                    fill: false,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    position: 'left',
                    title: { display: true, text: 'Units Sold', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'Net Margin %', color: '#f59e0b' },
                    grid: { display: false },
                    ticks: { color: '#f59e0b' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6' } }
            }
        }
    });
}

function populateProductTable(rows) {
    const tbody = document.querySelector('#table-products-contribution tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    rows.forEach(r => {
        const isLeak = r.total_profit < 0;
        const tr = document.createElement('tr');
        if (isLeak) {
            tr.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
        }

        tr.innerHTML = `
            <td>${r.product_id}</td>
            <td><strong>${r.product_name}</strong></td>
            <td>${r.category}</td>
            <td>${r.units_sold.toLocaleString()}</td>
            <td>${formatCurrency(r.total_revenue)}</td>
            <td style="color: ${r.profit_margin_percent < 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">
                ${formatPercent(r.profit_margin_percent)}
            </td>
            <td style="color: ${isLeak ? '#ef4444' : '#10b981'}; font-weight: bold;">
                ${formatCurrency(r.total_profit)}
            </td>
            <td>${formatPercent(r.average_discount_percent)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 4. REGIONAL PERFORMANCE VIEW
// ==========================================
async function loadRegionalPerformance() {
    try {
        // A. Regional delays
        const delaySql = compileQuery('regionalShipping');
        const delayResult = await executeSQL(delaySql);
        renderRegionalDelaysChart(delayResult.rows);

        // B. Regional table
        const regTableSql = compileQuery('regionalTable');
        const regTableResult = await executeSQL(regTableSql);
        populateRegionalTable(regTableResult.rows);

    } catch (err) {
        console.error('Failed to load Regional Performance:', err);
    }
}

function renderRegionalDelaysChart(rows) {
    const canvas = document.getElementById('chart-shipping-delays-sales');
    if (!canvas) return;

    // Filter dataset to show delays by region MoM
    const regions = [...new Set(rows.map(r => r.region))];
    const months = [...new Set(rows.map(r => r.sales_month))].sort();

    // Map datasets
    const datasets = regions.map(reg => {
        // Colors mapping
        let color = '#6366f1';
        if (reg === 'North America West') color = '#ef4444'; // Highlight the anomaly region
        else if (reg === 'North America East') color = '#10b981';
        else if (reg === 'Europe') color = '#06b6d4';
        else if (reg === 'Asia') color = '#f59e0b';
        else if (reg === 'Latin America') color = '#c084fc';

        const data = months.map(m => {
            const found = rows.find(r => r.region === reg && r.sales_month === m);
            return found ? found.average_shipping_delay_days : 0;
        });

        return {
            label: reg,
            data: data,
            borderColor: color,
            borderWidth: reg === 'North America West' ? 3 : 1.5,
            tension: 0.25,
            fill: false
        };
    });

    if (state.charts['regionalDelays']) {
        state.charts['regionalDelays'].destroy();
    }

    state.charts['regionalDelays'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: months,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    title: { display: true, text: 'Average Shipping Delay (Days)', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6' } }
            }
        }
    });
}

function populateRegionalTable(rows) {
    const tbody = document.querySelector('#table-regional-performance tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    rows.forEach(r => {
        const isAnomaly = r.region === 'North America West';
        const tr = document.createElement('tr');
        if (isAnomaly) {
            tr.style.borderLeft = '3px solid var(--color-danger)';
            tr.style.backgroundColor = 'rgba(239, 68, 68, 0.02)';
        }

        tr.innerHTML = `
            <td><strong>${r.region}</strong> ${isAnomaly ? '🚨 (Logistics Drop)' : ''}</td>
            <td>${formatCurrency(r.total_revenue)}</td>
            <td>${formatCurrency(r.total_profit)}</td>
            <td>${formatPercent(r.profit_margin_percent)}</td>
            <td>${r.total_orders.toLocaleString()}</td>
            <td style="color: ${r.average_shipping_delay_days > 6 ? '#ef4444' : '#10b981'}; font-weight: bold;">
                ${r.average_shipping_delay_days} Days
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 5. RETENTION & COHORT HEATMAP VIEW
// ==========================================
async function loadRetentionCohort() {
    try {
        // A. Load cohort matrix
        const cohortSql = compileQuery('cohortRetention');
        const cohortResult = await executeSQL(cohortSql);
        renderCohortHeatmapTable(cohortResult.rows);
        renderCohortCurveChart(cohortResult.rows);

        // B. Load churn prediction
        const churnSql = compileQuery('churnPrediction');
        const churnResult = await executeSQL(churnSql);
        populateChurnTable(churnResult.rows);

    } catch (err) {
        console.error('Failed to load Retention & Cohort:', err);
    }
}

function renderCohortHeatmapTable(rows) {
    const table = document.getElementById('table-cohort-retention');
    if (!table) return;

    // Pivot the flat database rows into cohort lists: cohort_month -> { size: X, indices: { 0: R0, 1: R1... } }
    const cohortMap = {};
    let maxCohortIndex = 0;

    rows.forEach(r => {
        const month = r.cohort_month;
        if (!cohortMap[month]) {
            cohortMap[month] = {
                size: r.cohort_size,
                indices: {}
            };
        }
        cohortMap[month].indices[r.cohort_index] = r.retention_rate;
        if (r.cohort_index > maxCohortIndex) {
            maxCohortIndex = r.cohort_index;
        }
    });

    const sortedCohortMonths = Object.keys(cohortMap).sort();

    // Rebuild Heatmap Header Row
    let headHtml = `
        <thead>
            <tr>
                <th>Cohort Month</th>
                <th>Cohort Size</th>
    `;
    for (let idx = 0; idx <= maxCohortIndex; idx++) {
        headHtml += `<th>Month ${idx}</th>`;
    }
    headHtml += `
            </tr>
        </thead>
    `;

    // Rebuild Heatmap Body Rows
    let bodyHtml = '<tbody>';
    sortedCohortMonths.forEach(m => {
        const cohort = cohortMap[m];
        bodyHtml += `
            <tr>
                <td><strong>${m}</strong></td>
                <td>${cohort.size} customers</td>
        `;

        for (let idx = 0; idx <= maxCohortIndex; idx++) {
            const val = cohort.indices[idx];
            if (val !== undefined) {
                // Calculate opacity dynamically: more retention = deeper color
                // Scale retention rate to opacity (0.1 to 1.0)
                const opacity = idx === 0 ? 1 : Math.max(0.1, val / 100);
                let cellColor = `rgba(99, 102, 241, ${opacity})`;
                
                // If retention rate drops below 15% in later stages, shade it red/warning
                if (idx > 0 && val < 15) {
                    cellColor = `rgba(239, 68, 68, ${opacity * 0.7})`;
                }
                
                bodyHtml += `<td style="background-color: ${cellColor}; color: #ffffff;">${val.toFixed(1)}%</td>`;
            } else {
                bodyHtml += `<td style="background-color: rgba(255, 255, 255, 0.01); color: var(--text-dark);">N/A</td>`;
            }
        }
        bodyHtml += '</tr>';
    });
    bodyHtml += '</tbody>';

    table.innerHTML = headHtml + bodyHtml;
}

function renderCohortCurveChart(rows) {
    const canvas = document.getElementById('chart-retention-curve');
    if (!canvas) return;

    // Calculate average retention index over all cohorts to build the survival curve
    const indexSums = {};
    const indexCounts = {};

    rows.forEach(r => {
        const idx = r.cohort_index;
        if (indexSums[idx] === undefined) {
            indexSums[idx] = 0;
            indexCounts[idx] = 0;
        }
        indexSums[idx] += r.retention_rate;
        indexCounts[idx]++;
    });

    const sortedIndices = Object.keys(indexSums).map(Number).sort((a,b)=>a-b);
    const averageSurvivalRates = sortedIndices.map(idx => indexSums[idx] / indexCounts[idx]);

    if (state.charts['retentionCurve']) {
        state.charts['retentionCurve'].destroy();
    }

    state.charts['retentionCurve'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: sortedIndices.map(idx => `Month ${idx}`),
            datasets: [{
                label: 'Average Retention Survival Rate (%)',
                data: averageSurvivalRates,
                borderColor: '#818cf8',
                backgroundColor: 'rgba(129, 140, 248, 0.1)',
                tension: 0.3,
                fill: true,
                borderWidth: 2,
                pointBackgroundColor: '#6366f1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    min: 0,
                    max: 100,
                    title: { display: true, text: 'Retention Rate %', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function populateChurnTable(rows) {
    const tbody = document.querySelector('#table-churn-prediction tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    rows.forEach(r => {
        const tr = document.createElement('tr');
        
        let badgeClass = 'low';
        let riskLabel = 'Low Risk';
        if (r.churn_risk_status.includes('High Risk')) {
            badgeClass = 'high';
            riskLabel = 'High Risk';
        } else if (r.churn_risk_status.includes('Medium Risk')) {
            badgeClass = 'medium';
            riskLabel = 'Medium Risk';
        }

        tr.innerHTML = `
            <td><strong>${r.name}</strong></td>
            <td>${r.email}</td>
            <td>${r.region}</td>
            <td style="font-weight: 500;">${r.days_since_last} Days Ago</td>
            <td>${r.avg_order_interval_days} Days</td>
            <td><span class="badge-risk ${badgeClass}">${riskLabel}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// DATA QUALITY AUDIT LOADER (Excel Sim)
// ==========================================
async function loadDataQualityAudit() {
    try {
        const response = await fetch('/data/qa_audit_results.json');
        if (!response.ok) {
            throw new Error('Audit file missing');
        }
        const qaData = await response.json();
        
        // Calculate health percentage
        const summary = qaData.summary;
        const totalChecked = summary.total_customers_checked + summary.total_products_checked + summary.total_orders_checked + summary.total_items_checked;
        const issuesFound = summary.total_issues_found;
        
        const healthPercent = ((totalChecked - issuesFound) / totalChecked) * 100;
        
        document.getElementById('qa-health-score').innerText = healthPercent.toFixed(2) + '%';
        document.getElementById('qa-progress-fill').style.width = healthPercent.toFixed(2) + '%';

        // Render Issue List
        const issuesList = document.getElementById('qa-issues-list');
        issuesList.innerHTML = '';
        
        const issuesMap = [
            { key: 'null_emails', label: 'Missing / Null Email Fields', color: '#ef4444' },
            { key: 'null_regions', label: 'Missing / Null Regions Fields', color: '#f59e0b' },
            { key: 'invalid_prices', label: 'Invalid Price constraints (<= $0)', color: '#f87171' },
            { key: 'duplicate_items', label: 'Duplicate Order Item keys', color: '#ef4444' },
            { key: 'discount_outliers', label: 'Discount Outliers (> 70% or Negative)', color: '#f59e0b' },
            { key: 'orphan_orders', label: 'Orphan Order keys (Invalid FK)', color: '#ef4444' }
        ];

        issuesMap.forEach(item => {
            const count = qaData.issues[item.key] ? qaData.issues[item.key].length : 0;
            const li = document.createElement('li');
            li.className = count > 0 ? 'anomaly' : 'ok';
            
            li.innerHTML = `
                <div class="label">
                    <span class="dot" style="background-color: ${count > 0 ? item.color : '#10b981'}"></span>
                    ${item.label}
                </div>
                <span class="count">${count > 0 ? `${count} Issues` : 'Clean'}</span>
            `;
            issuesList.appendChild(li);
        });

    } catch (err) {
        console.error('Failed to load QA Audit report:', err);
    }
}

// ==========================================
// SQL SANDBOX IDE CONTROLLER
// ==========================================
function initSQLPlayground() {
    const editor = document.getElementById('sql-editor');
    const templateSelect = document.getElementById('query-template');
    const runBtn = document.getElementById('btn-run-query');
    const errorPanel = document.getElementById('query-error');
    const metaPanel = document.getElementById('result-meta');
    const tableHead = document.querySelector('#playground-results-table thead');
    const tableBody = document.querySelector('#playground-results-table tbody');

    // Handle template changes
    templateSelect.addEventListener('change', () => {
        const val = templateSelect.value;
        if (SQL_TEMPLATES[val]) {
            editor.value = SQL_TEMPLATES[val];
        }
    });

    // Execute query
    runBtn.addEventListener('click', async () => {
        const sqlText = editor.value.trim();
        if (!sqlText) return;

        // Reset display state
        runBtn.disabled = true;
        runBtn.innerText = '⏳ Executing...';
        errorPanel.style.display = 'none';
        metaPanel.innerText = 'Executing query on database...';
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';

        const startTime = performance.now();

        try {
            const result = await executeSQL(sqlText);
            const duration = (performance.now() - startTime).toFixed(1);

            if (result.type === 'select') {
                const rows = result.rows;
                if (!rows || rows.length === 0) {
                    metaPanel.innerHTML = `✅ <strong>Success:</strong> Query completed successfully in ${duration}ms, but returned <strong>0 rows</strong>.`;
                    return;
                }

                metaPanel.innerHTML = `✅ <strong>Success:</strong> Query completed successfully in ${duration}ms. Returned <strong>${rows.length} rows</strong>.`;

                // Rebuild Table headers
                const columns = Object.keys(rows[0]);
                let headTr = document.createElement('tr');
                columns.forEach(col => {
                    let th = document.createElement('th');
                    th.innerText = col;
                    headTr.appendChild(th);
                });
                tableHead.appendChild(headTr);

                // Rebuild Table rows
                rows.forEach(row => {
                    let tr = document.createElement('tr');
                    columns.forEach(col => {
                        let td = document.createElement('td');
                        let val = row[col];
                        if (val === null || val === undefined) {
                            td.innerHTML = `<span style="color: var(--text-dark); font-style: italic;">NULL</span>`;
                        } else if (typeof val === 'number') {
                            td.innerText = val.toLocaleString(undefined, { maximumFractionDigits: 4 });
                            td.style.textAlign = 'right';
                        } else {
                            td.innerText = val;
                        }
                        tr.appendChild(td);
                    });
                    tableBody.appendChild(tr);
                });

            } else {
                // Write operation info
                metaPanel.innerHTML = `✅ <strong>Success:</strong> Write query completed successfully in ${duration}ms. <strong>Changes:</strong> ${result.changes || 0} rows. <strong>Last Insert ID:</strong> ${result.lastInsertRowid || 0}`;
            }

        } catch (error) {
            errorPanel.querySelector('.error-msg').innerText = error.message;
            errorPanel.style.display = 'block';
            metaPanel.innerText = 'Execution failed.';
        } finally {
            runBtn.disabled = false;
            runBtn.innerText = '⚡ Execute Query';
        }
    });
}
