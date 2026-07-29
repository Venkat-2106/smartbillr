# SmartBillr User Guide

Welcome to SmartBillr — your billing and business management app. This guide shows you how to get your work done, step by step.

---

## Getting Started

### Sign Up

1. Go to the **Sign Up** page.
2. Enter your **email address** and create a **password**.
3. Click **Create Account**.
4. You're logged in automatically and land on Login page.

That's it. A business account is created for you and you're ready to go.

### Log In

1. Go to the **Login** page.
2. Enter your **email** and **password**.
3. Click **Sign In**.

### Log Out

1. Click your **name** at the bottom of the sidebar.
2. Click **Sign Out**.

### Set Up Your Business (First Time)

After signing up, set up your business details:

1. Click **Settings** in the sidebar.
2. On the **Business Info** tab, fill in:
   - Business name
   - Phone number
   - Address
3. Click **Save**.

---

## Customers

### Add a New Customer

1. Click **Customers** in the sidebar.
2. Click the **+ Add Customer** button.
3. Fill in the form:
   - Customer Name (required)
   - Phone Number
   - Email Address
   - Tax / GST Number
   - Country
   - State
   - Address
4. Click **Save**.

### Find a Customer

1. Go to **Customers**.
2. Type a name, phone number, or email in the **search bar**.
3. Results update as you type.

### View a Customer's Details and History

1. Go to **Customers**.
2. Click the customer's row in the list.
3. A panel opens showing their profile and past sales.

### Edit a Customer

1. Go to **Customers**.
2. Click the customer's row.
3. In the panel, click **Edit**.
4. Update the fields you need.
5. Click **Save**.

### Delete a Customer

1. Go to **Customers**.
2. Click the customer's row.
3. In the panel, click **Delete**.
4. Confirm by clicking **Delete** again.

### Import Customers from a File

1. Go to **Customers**.
2. Click **Import**.
3. Upload a CSV file with your customer data.
4. Review the results — any errors are shown so you can fix them.
5. Click **Import**.

### Export Customers

1. Go to **Customers**.
2. Click **Export**.
3. A CSV file downloads to your computer.

---

## Suppliers

### Add a New Supplier

1. Click **Suppliers** in the sidebar.
2. Click **+ Add Supplier**.
3. Fill in the form:
   - Supplier Name (required)
   - Phone Number
   - Email Address
   - Tax / GST Number
   - Country
   - State
   - Address
4. Click **Save**.

### Find, Edit, or Delete a Supplier

Same as Customers — click a row in the list to open their details, then Edit or Delete from there.

---

## Categories

### Create a Category

1. Click **Categories** in the sidebar.
2. Click **+ Add Category**.
3. Enter a name (e.g., "Beverages", "Electronics").
4. Click **Save**.

### Edit or Delete a Category

1. Go to **Categories**.
2. Click the category row.
3. Click **Edit** or **Delete**.

> Deleting a category will also remove all products inside it. Make sure no active products are assigned to the category before deleting.

---

## Products

### Add a Product

1. Click **Products** in the sidebar.
2. Click **+ Add Product**.
3. Fill in these fields:

| Field | Required | What to enter |
|-------|----------|---------------|
| Product Name | Yes | What you call this item |
| Category | No | Pick from your categories |
| Sell Price | Yes | What you sell it for |
| Cost Price | Yes | What you paid for it |
| MRP | No | Maximum retail price (if printed on the item) |
| Barcode | No | Scan this at checkout |
| Stock Quantity | No | How many you have right now |
| Low Stock Alert | No | Alert when stock falls below this number (default: 10) |
| Tax Rate | No | Tax % to apply (e.g., 5, 12, 18) |
| Unit | No | "pcs", "kg", "meter", etc. |

4. Click **Save**.

### Find a Product

1. Go to **Products**.
2. Search by **product name** or **barcode**.
3. Or filter by **category** using the dropdown.

### Edit a Product

1. Go to **Products**.
2. Click the product row.
3. Click **Edit**.
4. Make your changes.
5. Click **Save**.

### Delete a Product

1. Go to **Products**.
2. Click the product row.
3. Click **Delete**.
4. Confirm.

### Import Products from a File

1. Go to **Products**.
2. Click **Import**.
3. Upload a CSV file.
4. Review and confirm.

### Export Products

1. Go to **Products**.
2. Click **Export**.
3. A CSV file downloads.

---

## Stock & Inventory

### View Current Stock

1. Click **Stock** in the sidebar.
2. The **Current Stock** tab shows every product with its quantity.
3. Use the search bar to find a specific product.
4. Filter by **category** or **stock status** (All, Low Stock, Out of Stock).

### Manually Adjust Stock

Use this when stock is wrong due to damage, theft, or a counting error.

1. Go to **Stock** → **Current Stock**.
2. Find the product and click **Adjust Stock**.
3. Enter the **new quantity** (or the amount changed).
4. Select the **reason** (damage, correction, etc.).
5. Click **Save**.

### View Stock Movements (History)

1. Go to **Stock** → **Stock Movements** tab.
2. Every stock change is listed — sales, purchases, returns, adjustments.
3. You can filter by movement type or date range.

### Check Low Stock Alerts

1. Go to **Stock** → **Low Stock Alerts** tab.
2. Products below their threshold are listed here.
3. Click **Mark as Read** on individual items, or **Mark All as Read** to clear them.

---

## Creating a Sale (Invoice)

This is how you bill a customer.

### Step-by-Step

1. Click **Sales** in the sidebar.
2. Click **New Sale**.

3. **Choose the customer:**
   - Start typing the customer's name in the search box.
   - Click the customer when they appear.
   - If they're new, click **+ Add Customer** and fill in their details right here.

4. **Add products:**
   - Type a product name or scan a barcode.
   - Click the product to add it.
   - For each product, set the **quantity**.

5. **Review the invoice:**
   - The subtotal, tax, and total are calculated automatically.
   - If needed, add a **discount** amount at the bottom.

6. **Record payment (optional):**
   - Select **Paid**, **Unpaid**, or **Partial**.
   - If paid or partial, choose the **payment method**: Cash, UPI, Card, Bank, or Split.
   - Enter the amount received.

7. Click **Create Sale**.

### What Happens Next

- The invoice gets a number: INV-001, INV-002, etc.
- Stock decreases automatically.
- The sale appears in your **Sales** list.
- If you recorded a payment, it shows in **Payments**.

### Invoice Sections at a Glance

| Section | What it is |
|---------|------------|
| Customer | Who's buying |
| Products | What they're buying, prices, quantities |
| Totals | Subtotal, tax, discount, grand total |
| Payment | How much they paid and how |

---

## Creating a Purchase

This is how you record what you buy from suppliers.

### Step-by-Step

1. Click **Purchases** in the sidebar.
2. Click **New Purchase**.

3. **Choose the supplier:**
   - Type their name in the search box.
   - Click the supplier to select them.
   - If new, click **+ Add Supplier**.

4. **Add products:**
   - Search for products to add.
   - For each product, set the **quantity** and **unit price**.
   - The unit price you enter becomes the product's new cost price.

5. **Review:**
   - Check the subtotal, tax, and total.
   - Add a discount if needed.

6. **Record payment (optional):**
   - Pay now or leave as unpaid.

7. Click **Create Purchase**.

### What Happens Next

- Stock increases automatically (items are in your inventory now).
- The product's cost price updates to what you paid.
- The purchase appears in your **Purchases** list.

---

## Payments

### Record a Payment from a Customer

1. Click **Payments** in the sidebar.
2. Click **Record Payment**.
3. **Find the invoice:**
   - Type the invoice number or customer name.
   - Click the invoice when it appears.
4. Enter the **payment amount**.
5. Choose the **payment method**: Cash, UPI, Card, Bank, or Split.
6. Click **Save**.

### Record a Partial Payment

Same steps as above. You can record multiple payments against the same invoice until it's fully paid. The system tracks how much is still owed.

### View Payment History for an Invoice

1. Go to **Sales**.
2. Click the invoice row.
3. In the panel that opens, you'll see every payment made against that invoice with dates, amounts, and methods.

---

## Sales Returns (Customer Returns)

When a customer brings something back.

### Create a Return Request

1. Click **Sales Returns** in the sidebar.
2. Click **Create Return**.
3. **Select the original sale** — type the invoice number to find it.
4. **Choose which items are being returned:**
   - You can return some items and keep others.
   - You can return partial quantities.
5. Enter a **reason** for the return.
6. Choose whether to **restock** the items (add them back to inventory).
7. Set the **refund method** (cash, bank, etc.).
8. Click **Submit**.

The return is now in **Pending** status, waiting for approval.

### Approve or Reject a Return

1. Go to **Sales Returns**.
2. Click the pending return in the list.
3. Review the details.
4. Click **Approve** or **Reject**.

**If approved:**
- Stock is restored (if restocking was chosen).
- Payment is adjusted — the invoice may show a new balance.

**If rejected:**
- Nothing changes.
- The rejection reason is saved.

---

## Purchase Returns (Supplier Returns)

When you send items back to a supplier.

### Create a Return

1. Click **Purchase Returns** in the sidebar.
2. Click **Create Return**.
3. **Select the original purchase**.
4. Choose which items and quantities to return.
5. Enter a **reason**.
6. Set the **refund amount** and method (can be ₹0).
7. Click **Submit**.

Approval works the same way as sales returns.

---

## Expenses

### Add an Expense

1. Click **Expenses** in the sidebar.
2. Click **Add Expense**.
3. Fill in:
   - **Amount** (required)
   - **Category** (required): Rent, Salary, Electricity, Internet, Maintenance, Marketing, Purchase, Other
   - **Date** (defaults to today)
   - **Notes** (optional)
4. Click **Save**.

### Delete an Expense

1. Go to **Expenses**.
2. Click the expense row.
3. Click **Delete**.
4. Confirm.

> Expenses cannot be edited after creation. If you made a mistake, delete it and create again.

---

## Reports

### View a Report

1. Click **Reports** in the sidebar.
2. Pick a **category tab** at the top: Summary, Sales, Purchases, Profitability, Inventory, etc.
3. Choose a **date range** using the presets (Today, This Week, This Month, etc.) or set a custom range.
4. The report loads automatically.

### Reports Available

| Tab | What you'll see |
|-----|-----------------|
| Summary | Total sales, purchases, expenses, profit, tax — all in one view |
| Sales | Trends, breakdowns by customer, product, category, payment method |
| Purchases | Trends, breakdowns by supplier, product, tax summary |
| Profitability | Gross profit, profit by product/category/customer *(paid plans)* |
| Inventory | Stock value, movement summary, fast/slow-moving items |
| Customers | Top customers, transaction history, lifetime value |
| Suppliers | Top suppliers, spend analysis |
| Expenses | Breakdown by category, trends over time |
| Tax | Tax collected vs paid, net liability *(paid plans)* |
| Returns | Return summaries and financial impact *(paid plans)* |
| Payments | Collections, outstanding balances *(paid plans)* |
| Audit | User activity log, login history, data changes |

> Reports marked *(paid plans)* need an active paid subscription. You'll see an upgrade prompt if you're on the trial.

---

## Settings

### Update Business Info

1. Click **Settings** in the sidebar.
2. On the **Business Info** tab, update your:
   - Business name
   - Phone number
   - Address
3. Click **Save**.

### Turn On GST

1. Go to **Settings** → **Tax Settings**.
2. Toggle **GST Registered** to On.
3. Enter your **GSTIN** (15-digit GST number).
4. Click **Save**.

After this, all invoices will calculate CGST, SGST, or IGST automatically based on the customer's state.

### Check Your Plan

1. Go to **Settings** → **Pricing & Plans**.
2. See your current plan, when it ends, and how many days are left.
3. Click **View All Plans** to upgrade.

---

## Staff

### Add a Staff Member

1. Click **Staff** in the sidebar (only visible to admins).
2. Click **Add Staff**.
3. Fill in:
   - **Name**
   - **Email**
   - **Role**: Admin, Manager, or Staff
4. Click **Save**.
5. The staff member receives an email invitation to set up their account.

### What Each Role Can Do

| Role | Can do | Cannot do |
|------|--------|-----------|
| **Admin** | Everything | Nothing |
| **Manager** | Sales, purchases, customers, suppliers, products, stock, reports, returns, expenses | Manage staff, change settings |
| **Staff** | Create sales, view products, view stock, manage customers | Purchases, returns, payments, reports, expenses, staff, settings |

### Deactivate a Staff Member

1. Go to **Staff**.
2. Click the staff member's row.
3. Click **Edit**.
4. Set their status to **Inactive**.
5. Click **Save**.

They won't be able to log in anymore.

---

## Keyboard Shortcuts

| Press this | To do this |
|------------|------------|
| `?` | Show all available shortcuts |
| `Ctrl + K` | Open the command palette (search anything) |
| `Alt + N` | Create a new record on the current page |
| `Ctrl + F` | Jump to the search box |
| `F5` | Refresh the current page's data |
| `g then d` | Go to Dashboard |
| `g then c` | Go to Customers |
| `g then s` | Go to Sales |
| `g then p` | Go to Products |
| `g then u` | Go to Suppliers |
| `g then t` | Go to Stock |
| `g then e` | Go to Expenses |
| `g then r` | Go to Reports |
| `g then h` | Go to Settings |
| `g then b` | Go to Purchases |

Press `?` anywhere in the app to see the full shortcut list.

---

## Plans & Pricing

### Check Your Current Plan

1. Click your name at the bottom of the sidebar, or go to **Settings** → **Pricing & Plans**.
2. You'll see what plan you're on and when it expires.

### Upgrade Your Plan

1. Go to the **Pricing** page.
2. Choose **Monthly**, **Yearly**, or **Lifetime**.
3. Click **Get Started**.
4. Complete the payment (Razorpay for INR, Stripe for USD).
5. Access is upgraded immediately after payment.

### Plan Limits

| Feature | Trial | Monthly | Yearly | Lifetime |
|---------|-------|---------|--------|----------|
| Products | Up to 50 | Unlimited | Unlimited | Unlimited |
| Customers | Up to 50 | Unlimited | Unlimited | Unlimited |
| Suppliers | Up to 25 | Unlimited | Unlimited | Unlimited |
| Sales per month | Up to 100 | Unlimited | Unlimited | Unlimited |
| Staff accounts | 0 | Up to 2 | Unlimited | Unlimited |
| Manager accounts | 0 | Up to 1 | Unlimited | Unlimited |
| Financial reports | — | ✓ | ✓ | ✓ |
| Product profit view | — | ✓ | ✓ | ✓ |

---

## FAQ

### How do I create my first invoice?

Go to **Sales** → Click **New Sale** → Select a customer → Add products → Set quantities → Click **Create Sale**.

### How do I record a payment from a customer?

Go to **Payments** → Click **Record Payment** → Find the invoice by number or customer name → Enter the amount → Choose the method → Click **Save**.

### How do I handle a customer returning an item?

Go to **Sales Returns** → Click **Create Return** → Select the original sale → Choose the items being returned → Enter a reason → Submit for approval. Then a manager/admin needs to approve it.

### How do I fix incorrect stock levels?

Go to **Stock** → **Current Stock** → Find the product → Click **Adjust Stock** → Enter the correct quantity → Choose a reason → Click **Save**.

### How do I add a staff member?

Go to **Staff** (only available if you're the admin) → Click **Add Staff** → Enter their name, email, and choose a role → Click **Save**. They'll get an email invitation.

### How do I set up GST?

Go to **Settings** → **Tax Settings** → Turn **GST Registered** ON → Enter your **GSTIN** → Click **Save**.

### Why can't I see financial data?

Financial reports and profit information are only available on paid plans (Monthly, Yearly, or Lifetime). Upgrade from the **Pricing** page to unlock them.

### Can I edit an expense after creating it?

No. Expenses can't be edited. Delete the incorrect expense and create a new one.

### Can I edit an invoice after creating it?

Not directly. Delete the invoice (optionally restoring stock) and create a new one.

### I'm locked out because my subscription expired. What do I do?

Go to **Pricing**, choose a plan, and complete the payment. Access is restored automatically.

### What reports can I run?

12 categories: Summary, Sales, Purchases, Profitability, Inventory, Customers, Suppliers, Expenses, Tax, Returns, Payments, and Audit. Go to **Reports** to explore.

---

## Tips

- **Create categories** before products — it makes everything easier to manage.
- **Search before adding** a customer or supplier to avoid duplicates.
- **Record payments right after a sale** to keep your books accurate.
- **Set low stock alerts** on all your products so you never run out unexpectedly.
- **Regularly check Stock Movements** to spot discrepancies early.
- **Use barcodes** on products for faster checkout.
- **Always capture the customer's state** for correct GST calculations.
- When deleting a sale, choose **restore stock** to keep inventory accurate.

---

*Last updated: July 2026*
