import os
import random
import sqlite3
import json
import csv
from datetime import datetime, timedelta

# Set random seed for reproducibility
random.seed(42)

# Configurations
WORKSPACE_DIR = r"d:\e commrce"
DATA_DIR = os.path.join(WORKSPACE_DIR, "data")
DB_PATH = os.path.join(WORKSPACE_DIR, "ecommerce.db")

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)

# Helper constants
REGIONS = ["North America East", "North America West", "Europe", "Asia", "Latin America"]
CATEGORIES = ["Electronics", "Apparel", "Home & Kitchen", "Books", "Beauty"]

# Raw data structures (to be populated and audited)
customers = []
products = []
orders = []
order_items = []

# Raw "dirty" data copies for audit simulation
dirty_customers = []
dirty_products = []
dirty_orders = []
dirty_order_items = []

print("Starting E-Commerce Synthetic Data Generation...")

# ==========================================
# 1. GENERATE PRODUCTS
# ==========================================
product_templates = [
    # Electronics
    ("GigaCharge Wireless Charger", "Electronics", 49.99, 20.00),
    ("NeoSound Earbuds", "Electronics", 89.99, 35.00),
    ("Apex Fitness Tracker", "Electronics", 129.99, 60.00),
    ("VisionHD Webcam", "Electronics", 79.99, 30.00),
    ("VoltStream Power Bank", "Electronics", 39.99, 15.00),
    # Apparel
    ("ComfortFit Denim Jeans", "Apparel", 59.99, 18.00),
    ("AeroDry Performance Tee", "Apparel", 29.99, 8.00),
    ("ThermaWarm Hoodie", "Apparel", 69.99, 22.00),
    ("BreezeWalk Running Shoes", "Apparel", 110.00, 45.00),
    ("Classic Leather Belt", "Apparel", 34.99, 10.00),
    # Home & Kitchen
    ("BaristaPro Espresso Maker", "Home & Kitchen", 299.99, 120.00),
    ("HydroPure Water Pitcher", "Home & Kitchen", 34.99, 12.00),
    ("ChefSlice Knife Block Set", "Home & Kitchen", 149.99, 50.00),
    ("SleepDeep Pillow (Standard)", "Home & Kitchen", 45.00, 15.00),
    ("EcoClean Robot Vacuum", "Home & Kitchen", 249.99, 95.00),
    # Books
    ("Data Science Demystified", "Books", 39.99, 12.00),
    ("The Lean Business Roadmap", "Books", 24.99, 6.00),
    ("History of the Modern Age", "Books", 29.99, 8.00),
    ("Gourmet Cooking Made Easy", "Books", 34.99, 11.00),
    ("Python Coding Masterclass", "Books", 49.99, 15.00),
    # Beauty
    ("DermaGlow Hyaluronic Serum", "Beauty", 45.00, 14.00),
    ("SilkTouch Hydrating Lotion", "Beauty", 24.99, 7.00),
    ("LashVolume Waterproof Mascara", "Beauty", 19.99, 5.00),
    ("BrightSmile Whitening Kit", "Beauty", 59.99, 20.00),
    ("Botanical Revitalizing Shampoo", "Beauty", 21.99, 6.00),
]

for idx, (name, category, price, cost) in enumerate(product_templates, 1):
    products.append({
        "product_id": idx,
        "name": name,
        "category": category,
        "price": price,
        "cost": cost
    })

# Inject price/cost anomalies (Data Quality Check)
# Let's add a couple of products with invalid prices
products.append({
    "product_id": 26,
    "name": "Invalid Price Product A",
    "category": "Electronics",
    "price": -19.99,
    "cost": 10.00
})
products.append({
    "product_id": 27,
    "name": "Invalid Price Product B",
    "category": "Apparel",
    "price": 0.00,
    "cost": 5.00
})

dirty_products = [p.copy() for p in products]

# ==========================================
# 2. GENERATE CUSTOMERS
# ==========================================
first_names = ["John", "Jane", "Robert", "Emily", "Michael", "Sarah", "David", "Jessica", "James", "Amanda", "Daniel", "Lisa", "William", "Ashley", "Thomas", "Olivia", "Joseph", "Sophia", "Charles", "Isabella"]
last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]

customer_count = 250
start_date = datetime(2024, 1, 1)

for i in range(1, customer_count + 1):
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    name = f"{fn} {ln}"
    email = f"{fn.lower()}.{ln.lower()}{i}@example.com"
    region = random.choice(REGIONS)
    
    # Signups distributed over the 2 years
    signup_days_offset = random.randint(0, 700)
    signup_date = (start_date + timedelta(days=signup_days_offset)).strftime("%Y-%m-%d")
    
    customers.append({
        "customer_id": i,
        "name": name,
        "email": email,
        "region": region,
        "signup_date": signup_date
    })

# Inject Customer QA anomalies:
# 1. Null Emails
customers[5]["email"] = None
customers[15]["email"] = ""
# 2. Null Regions
customers[12]["region"] = None
customers[35]["region"] = ""

dirty_customers = [c.copy() for c in customers]

# ==========================================
# 3. GENERATE ORDERS & ORDER ITEMS (WITH ANOMALIES)
# ==========================================
order_id_counter = 1
item_id_counter = 1

# Maintain lists of customer IDs to control repeat purchases and cohort retention
customer_signups = {c["customer_id"]: datetime.strptime(c["signup_date"], "%Y-%m-%d") for c in customers}

for cust in customers:
    cust_id = cust["customer_id"]
    signup_dt = customer_signups[cust_id]
    
    if not cust["email"] or not cust["region"]:
        # Let's keep them as signups with no orders
        pass

    # Customer Behaviors:
    # 1. 50% are "One-time buyers"
    # 2. 10% are "Champions" (order frequently, every 15-45 days, spending high amounts)
    # 3. 20% are "Loyal" (order every 30-90 days)
    # 4. 20% are "At-Risk/Lost" (order once or twice in 2024, then stop in 2025)
    
    behavior_rand = random.random()
    if behavior_rand < 0.50:
        behavior = "one_time"
        purchase_count = 1
    elif behavior_rand < 0.60:
        behavior = "champion"
        purchase_count = random.randint(8, 15)
    elif behavior_rand < 0.80:
        behavior = "loyal"
        purchase_count = random.randint(3, 7)
    else:
        behavior = "at_risk_lost"
        purchase_count = random.randint(1, 2)
        
    current_date = signup_dt
    for order_seq in range(purchase_count):
        if behavior == "one_time":
            gap = random.randint(0, 3)
        elif behavior == "champion":
            gap = random.randint(15, 45)
        elif behavior == "loyal":
            gap = random.randint(30, 90)
        else: # at_risk_lost
            gap = random.randint(10, 60)
            
        current_date += timedelta(days=gap)
        if current_date > datetime(2025, 12, 31):
            break
            
        # Regional logistics anomaly:
        # In North America West, shipping delays rise starting July 2025.
        is_naw_delay_period = (cust["region"] == "North America West" and current_date >= datetime(2025, 7, 1))
        
        if is_naw_delay_period:
            # Sales drop by 60% MoM
            if random.random() < 0.60 and order_seq > 0:
                continue
            shipping_delay_days = random.randint(8, 14)
        else:
            shipping_delay_days = random.choice([1, 2, 3, 4])
            
        shipping_date_dt = current_date + timedelta(days=shipping_delay_days)
        
        if current_date >= datetime(2025, 12, 28):
            status = random.choice(["Shipped", "Processing"])
            shipping_date = None if status == "Processing" else shipping_date_dt.strftime("%Y-%m-%d")
        else:
            if random.random() < 0.03:
                status = "Cancelled"
                shipping_date = None
            else:
                status = "Delivered"
                shipping_date = shipping_date_dt.strftime("%Y-%m-%d")
                
        orders.append({
            "order_id": order_id_counter,
            "customer_id": cust_id,
            "order_date": current_date.strftime("%Y-%m-%d"),
            "shipping_date": shipping_date,
            "status": status
        })
        
        # Items for order
        item_count = random.choice([1, 1, 1, 2, 2, 3])
        order_products = random.sample([p for p in products if p["price"] > 0], item_count)
        
        for prod in order_products:
            qty = random.choice([1, 1, 1, 1, 2, 3])
            
            # Product Profit Leakage:
            if prod["product_id"] in [1, 2]:
                if random.random() < 0.70:
                    discount = round(random.uniform(0.35, 0.60), 2)
                    if discount > 0.45 and random.random() < 0.5:
                        qty += 1
                else:
                    discount = round(random.uniform(0.0, 0.15), 2)
            else:
                if random.random() < 0.20:
                    discount = round(random.uniform(0.05, 0.20), 2)
                else:
                    discount = 0.0
                    
            shipping_cost = round(random.uniform(2.50, 7.50), 2)
            if is_naw_delay_period:
                shipping_cost += round(random.uniform(3.00, 6.00), 2)
                
            order_items.append({
                "item_id": item_id_counter,
                "order_id": order_id_counter,
                "product_id": prod["product_id"],
                "quantity": qty,
                "price": prod["price"],
                "discount": discount,
                "shipping_cost": shipping_cost
            })
            
            item_id_counter += 1
            
        order_id_counter += 1

# Inject QA anomalies into Orders and Order Items:
# 1. Orphan Orders (customer_id does not exist)
orders.append({
    "order_id": order_id_counter,
    "customer_id": 999,
    "order_date": "2025-06-15",
    "shipping_date": "2025-06-18",
    "status": "Delivered"
})
order_items.append({
    "item_id": item_id_counter,
    "order_id": order_id_counter,
    "product_id": 3,
    "quantity": 1,
    "price": 129.99,
    "discount": 0.0,
    "shipping_cost": 5.00
})
order_id_counter += 1
item_id_counter += 1

# 2. Duplicate Order Items (same item listed twice in an order)
dup_item = order_items[50].copy()
dup_item["item_id"] = item_id_counter
order_items.append(dup_item)
item_id_counter += 1

# 3. Discount Outliers (>70% or negative)
order_items[100]["discount"] = 1.25
order_items[120]["discount"] = -0.10

dirty_orders = [o.copy() for o in orders]
dirty_order_items = [oi.copy() for oi in order_items]

print(f"Generated Raw Records: {len(dirty_customers)} customers, {len(dirty_products)} products, {len(dirty_orders)} orders, {len(dirty_order_items)} order items.")

# ==========================================
# 4. DATA QUALITY AUDIT & Excel Simulation
# ==========================================
print("Executing Data Quality Audit...")

qa_report = {
    "timestamp": datetime.now().isoformat(),
    "summary": {
        "total_customers_checked": len(dirty_customers),
        "total_products_checked": len(dirty_products),
        "total_orders_checked": len(dirty_orders),
        "total_items_checked": len(dirty_order_items),
        "total_issues_found": 0
    },
    "issues": {
        "null_emails": [],
        "null_regions": [],
        "invalid_prices": [],
        "duplicate_items": [],
        "discount_outliers": [],
        "orphan_orders": []
    }
}

# 1. Check Customer Nulls
for c in dirty_customers:
    if c["email"] is None or c["email"] == "":
        qa_report["issues"]["null_emails"].append(c)
    if c["region"] is None or c["region"] == "":
        qa_report["issues"]["null_regions"].append(c)

# 2. Check Product prices
for p in dirty_products:
    if p["price"] <= 0:
        qa_report["issues"]["invalid_prices"].append(p)

# 3. Check Duplicate Order Items (same order_id and product_id)
seen_items = set()
for oi in dirty_order_items:
    key = (oi["order_id"], oi["product_id"])
    if key in seen_items:
        qa_report["issues"]["duplicate_items"].append(oi)
    else:
        seen_items.add(key)

# 4. Check Discount Outliers
for oi in dirty_order_items:
    if oi["discount"] < 0 or oi["discount"] > 0.70:
        qa_report["issues"]["discount_outliers"].append(oi)

# 5. Check Orphan Orders (FK Customer ID check)
customer_ids_set = {c["customer_id"] for c in dirty_customers if c["customer_id"]}
for o in dirty_orders:
    if o["customer_id"] not in customer_ids_set:
        qa_report["issues"]["orphan_orders"].append(o)

# Calculate totals
issue_count = sum(len(lst) for lst in qa_report["issues"].values())
qa_report["summary"]["total_issues_found"] = issue_count

print(f"Data Quality Audit Completed. Found {issue_count} issues.")

# Write QA Report to JSON for UI usage
qa_public_path = os.path.join(WORKSPACE_DIR, "data", "qa_audit_results.json")
with open(qa_public_path, "w") as f:
    json.dump(qa_report, f, indent=4)
print(f"Audit log saved to {qa_public_path}")


# ==========================================
# 5. CLEAN DATA & SAVE TO CSV (EXCEL CLEANROOM STAGE)
# ==========================================
print("Cleaning data based on audit findings...")

# 1. Clean Customers: Remove null emails, impute missing regions as "Unknown"
clean_customers = []
for c in dirty_customers:
    if c["email"] is None or c["email"] == "":
        continue
    cleaned_c = c.copy()
    if cleaned_c["region"] is None or cleaned_c["region"] == "":
        cleaned_c["region"] = "Unknown"
    clean_customers.append(cleaned_c)

# 2. Clean Products: Remove negative or zero-priced items
clean_products = [p.copy() for p in dirty_products if p["price"] > 0]

# 3. Clean Orders: Remove orphan orders
clean_orders = [o.copy() for o in dirty_orders if o["customer_id"] in {c["customer_id"] for c in clean_customers}]

# 4. Clean Order Items:
clean_orders_ids = {o["order_id"] for o in clean_orders}
clean_products_ids = {p["product_id"] for p in clean_products}

clean_order_items = []
seen_pairs = set()

for oi in dirty_order_items:
    if oi["order_id"] not in clean_orders_ids or oi["product_id"] not in clean_products_ids:
        continue
        
    pair = (oi["order_id"], oi["product_id"])
    if pair in seen_pairs:
        continue
    seen_pairs.add(pair)
    
    cleaned_oi = oi.copy()
    if cleaned_oi["discount"] > 0.70:
        cleaned_oi["discount"] = 0.70
    elif cleaned_oi["discount"] < 0:
        cleaned_oi["discount"] = 0.0
        
    clean_order_items.append(cleaned_oi)

print(f"Cleaned Records: {len(clean_customers)} customers, {len(clean_products)} products, {len(clean_orders)} orders, {len(clean_order_items)} order items.")

# Flat denormalized CSV generator for BI/Excel integration
def generate_flat_csv(order_items_list, orders_list, products_list, customers_list, filename):
    cust_dict = {c["customer_id"]: c for c in customers_list}
    prod_dict = {p["product_id"]: p for p in products_list}
    ord_dict = {o["order_id"]: o for o in orders_list}
    
    flat_records = []
    for oi in order_items_list:
        o = ord_dict.get(oi["order_id"], {})
        c = cust_dict.get(o.get("customer_id"), {})
        p = prod_dict.get(oi["product_id"], {})
        
        flat_records.append({
            "item_id": oi.get("item_id"),
            "order_id": oi.get("order_id"),
            "order_date": o.get("order_date"),
            "customer_id": o.get("customer_id"),
            "customer_name": c.get("name"),
            "customer_email": c.get("email"),
            "customer_region": c.get("region"),
            "product_id": oi.get("product_id"),
            "product_name": p.get("name"),
            "category": p.get("category"),
            "price": oi.get("price"),
            "discount": oi.get("discount"),
            "quantity": oi.get("quantity"),
            "shipping_cost": oi.get("shipping_cost"),
            "status": o.get("status")
        })
    
    filepath = os.path.join(DATA_DIR, filename)
    fieldnames = ["item_id", "order_id", "order_date", "customer_id", "customer_name", "customer_email", "customer_region", "product_id", "product_name", "category", "price", "discount", "quantity", "shipping_cost", "status"]
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(flat_records)
    print(f"Exported flat CSV: {filepath}")

# Export raw and cleaned transaction ledgers
generate_flat_csv(clean_order_items, clean_orders, clean_products, clean_customers, "cleaned_data.csv")
generate_flat_csv(dirty_order_items, dirty_orders, dirty_products, dirty_customers, "raw_data.csv")

# ==========================================
# 6. WRITE TO SQLITE DATABASE (ecommerce.db)
# ==========================================
print(f"Writing clean data to SQLite database at: {DB_PATH}...")

if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    region TEXT NOT NULL,
    signup_date TEXT NOT NULL
);
""")

cursor.execute("""
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL
);
""")

cursor.execute("""
CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    order_date TEXT NOT NULL,
    shipping_date TEXT,
    status TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
);
""")

cursor.execute("""
CREATE TABLE order_items (
    item_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    discount REAL DEFAULT 0.0,
    shipping_cost REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(order_id),
    FOREIGN KEY(product_id) REFERENCES products(product_id)
);
""")

# Insert cleaned records
for c in clean_customers:
    cursor.execute("INSERT INTO customers VALUES (?,?,?,?,?)", (c["customer_id"], c["name"], c["email"], c["region"], c["signup_date"]))

for p in clean_products:
    cursor.execute("INSERT INTO products VALUES (?,?,?,?,?)", (p["product_id"], p["name"], p["category"], p["price"], p["cost"]))

for o in clean_orders:
    cursor.execute("INSERT INTO orders VALUES (?,?,?,?,?)", (o["order_id"], o["customer_id"], o["order_date"], o["shipping_date"], o["status"]))

for oi in clean_order_items:
    cursor.execute("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)", (oi["item_id"], oi["order_id"], oi["product_id"], oi["quantity"], oi["price"], oi["discount"], oi["shipping_cost"]))

conn.commit()

# Read and execute schema.sql (views)
schema_path = os.path.join(WORKSPACE_DIR, "schema.sql")
if os.path.exists(schema_path):
    print("Executing schema.sql to create analytical views...")
    with open(schema_path, "r", encoding="utf-8") as schema_file:
        schema_sql = schema_file.read()
        cursor.executescript(schema_sql)
    conn.commit()

conn.close()

print("Data generation, cleaning, CSV export, and SQL database with views created successfully!")
