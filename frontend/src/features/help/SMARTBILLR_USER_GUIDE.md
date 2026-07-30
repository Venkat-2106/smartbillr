# SmartBillr User Guide

Welcome to SmartBillr — your billing and business management app. This guide shows you how to get your work done, step by step.

---

## What SmartBillr Is

SmartBillr is a cloud-based billing, inventory, and accounting app for small and medium businesses. It helps you manage sales, purchases, inventory, customers, suppliers, payments, expenses, and taxes all in one place.

### Who It's For

- **Business Owners** — View reports, manage operations, configure settings
- **Cashiers & Sales Staff** — Create invoices, process sales
- **Inventory Managers** — Track stock, adjust inventory
- **Accountants** — View tax summaries, payment history, reports
- **Administrators** — Manage staff accounts, set roles

### Supported Business Types

Any product-based business: retail shops, wholesale distributors, manufacturers, trading businesses.

### Supported Tax Systems

- **GST** — For India-registered businesses with a valid GSTIN
- **VAT / Sales Tax** — For non-Indian businesses
- **No Tax** — Operate without tax calculation

### Core Features

| Feature | Status |
|---------|--------|
| Sales Invoicing | ✓ |
| Purchase Management | ✓ |
| Product & Category Management | ✓ |
| Customer & Supplier Management | ✓ |
| Stock Tracking & Adjustments | ✓ |
| Low Stock Alerts | ✓ |
| Payment Recording | ✓ |
| Sales & Purchase Returns (with approval) | ✓ |
| Expense Tracking | ✓ |
| Dashboard with KPIs & Charts | ✓ |
| Reports (12 categories) | ✓ |
| GST & Tax Reporting | ✓ |
| Roles & Permissions (Admin / Manager / Staff) | ✓ |
| Staff Management | ✓ |
| CSV Import / Export | ✓ |
| Barcode Scanning | ✓ |
| Subscription & Billing | ✓ |
| Audit Logs | ✓ |
| Keyboard Shortcuts | ✓ |

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

## Navigation

The sidebar menu on the left is your main way to move around. Here's what you'll find in each section:

| Section | Menu items |
|---------|------------|
| **Overview** | Dashboard |
| **Commerce** | Sales, Purchases, Payments, Sales Returns, Purchase Returns |
| **People** | Customers, Suppliers, Staff (admin only) |
| **Inventory** | Products, Categories, Stock |
| **Finance** | Expenses, Reports |
| **System** | Settings (admin only) |

### Sidebar Tips
- The sidebar can be **collapsed** to icons-only — click the arrow at the top.
- On mobile, the sidebar slides in from the left.
- Your **business name** shows at the top, your **name and role** at the bottom.
- Press `?` anywhere to see keyboard shortcuts.

---

## Dashboard

The Dashboard is the first page you see after logging in. It gives you a quick snapshot of your business.

### What You'll See

- **KPI Cards** at the top: Total Revenue, Total Sales, Total Expenses, Net Profit
- **Sales Trend Chart** showing revenue over time (switch between weekly, monthly, and yearly)
- **Quick Action Cards** to jump to common tasks: Create Sale, Add Product, View Reports, Manage Stock

> If you're on a trial or **Basic** plan, financial KPIs (revenue, profit) are locked — you'll see an upgrade prompt instead.

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
- You can **print** the invoice from the sale details — open any sale and click **Print Invoice**.

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

**From the Sales page** (when invoice is unpaid or partially paid):
1. Click **Sales** in the sidebar.
2. Click the invoice row to open the sale details.
3. In the **Payment Collection** section, enter the amount received.
4. Click **Update Payment Status** to save.

**From the Payments page** (when invoice is partially paid):
1. Click **Payments** in the sidebar.
2. Click the invoice row to open the payment drawer.
3. Click **+ Record Payment**.
4. Enter the amount and choose the method: **Cash**, **UPI**, **Card**, **Bank**, or **Split**.
5. Click **Save Payment**.

### Record a Partial Payment

Both methods above support partial payments. You can record multiple payments against the same invoice until it's fully paid. The system tracks how much is still owed.

### View Payment History for an Invoice

1. Go to **Sales**.
2. Click the invoice row.
3. In the panel that opens, scroll to the **Payment History** section to see every payment with dates, amounts, and methods.

---

## Sales Returns (Customer Returns)

When a customer brings something back.

### Create a Return Request

Returns can only be created from the original sale — there is no standalone "Create Return" page.

1. Click **Sales** in the sidebar.
2. Click the invoice row to open the sale details.
3. Click **Process Return** in the drawer header.
4. **For each item being returned**, enter the quantity and refund amount.
5. Optionally enter a **reason** for the return.
6. Choose whether to **restock** returned items (checked by default).
7. Click **Submit Return**.

The return is now in **Pending** status, waiting for approval.

Only **Admin** and **Manager** roles can approve or reject returns. Staff can create returns but cannot change their status.

### Approve or Reject a Return

1. Go to **Sales Returns** in the sidebar.
2. Click the pending return in the list.
3. Review the details.
4. Click **Approve** or **Reject**.

**If approved:**
- Stock is restored (if restocking was chosen).
- An expense entry is created for the refund amount.

**If rejected:**
- Nothing changes.
- The rejection reason is saved.

---

## Purchase Returns (Supplier Returns)

When you send items back to a supplier.

### Create a Return

Returns can only be created from the original purchase.

1. Click **Purchases** in the sidebar.
2. Click the purchase row to open the purchase details.
3. Click **Process Return** in the drawer header.
4. For each item, enter the return quantity and refund amount.
5. Optionally enter a **reason**.
6. Choose whether to **restock** the items.
7. Click **Submit Return**.

Only **Admin** and **Manager** roles can approve or reject.

### Approve or Reject

Same flow as sales returns — go to **Purchase Returns** in the sidebar, click a pending return, and approve or reject it.

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

> Reports marked *(paid plans)* need an active **Pro**, **Pro Yearly**, or **Lifetime** subscription. You'll see an upgrade prompt if you're on the trial or **Basic** plan.

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
| **Manager** | Sales, purchases, customers, suppliers, products, stock, reports, returns (including approve), expenses | Manage staff, change settings |
| **Staff** | Create sales, view products, view stock, manage customers, create/list returns | Purchases, approve returns, payments, reports, expenses, staff, settings |

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
2. Choose **Basic** (₹499/mo), **Pro** (₹999/mo), **Pro Yearly** (₹4,999/yr), or **Lifetime** (₹14,999).
3. Click **Get Started**.
4. Complete the payment (Razorpay for INR, Stripe for USD).
5. Access is upgraded immediately after payment.

### Plan Limits

| Feature | Trial | Basic | Pro | Pro Yearly | Lifetime |
|---------|-------|-------|-----|------------|----------|
| Plan code | `trial` | `basic` | `pro` | `pro_yearly` | `lifetime` |
| Pricing (INR) | Free | ₹499/month | ₹999/month | ₹4,999/year | ₹14,999 (one-time) |
| Products | Up to 50 | Up to 500 | Unlimited | Unlimited | Unlimited |
| Customers | Up to 50 | Up to 500 | Unlimited | Unlimited | Unlimited |
| Suppliers | Up to 25 | Unlimited | Unlimited | Unlimited | Unlimited |
| Sales per month | Up to 100 | Up to 2,000 | Unlimited | Unlimited | Unlimited |
| Staff accounts | 0 | Up to 2 | Up to 10 | Up to 10 | Unlimited |
| Manager accounts | 0 | Up to 1 | Up to 10 | Up to 10 | Unlimited |
| Financial reports | — | — | ✓ | ✓ | ✓ |
| Product profit view | — | — | ✓ | ✓ | ✓ |

---

## Tax & GST

### Setting Up Tax

1. Go to **Settings** → **Tax Settings**.
2. Toggle **GST Registered** on (only available for Indian businesses).
3. Enter your **GSTIN** (15-digit GST number).
4. For non-Indian businesses, the system uses VAT or Sales Tax labels automatically.

### How Tax Works on Invoices

Each product has a **tax rate** (e.g., 5%, 12%, 18%, 28%). When you create an invoice, the tax is calculated automatically per item. For GST-enabled businesses:

- **Same state** (customer in your state): Tax splits into **CGST** and **SGST** equally — e.g., 18% = 9% CGST + 9% SGST
- **Different state** (customer outside your state): Full tax charged as **IGST** — e.g., 18% = 18% IGST

### Tax Reports

The **Reports** page has a dedicated Tax section where you can see:
- **Tax Collected** — Tax from your sales (output tax)
- **Tax Paid** — Tax on your purchases (input tax)
- **Tax Liability** — Tax Collected minus Tax Paid (what you owe)

> Tax reports are only available on **Pro**, **Pro Yearly**, or **Lifetime** plans.

---

## FAQ

### How do I create my first invoice?

Go to **Sales** → Click **New Sale** → Select a customer → Add products → Set quantities → Click **Create Sale**.

### How do I record a payment from a customer?

1. Click **Payments** in the sidebar.
2. Click the invoice row you want to record a payment for.
3. In the drawer that opens, click **+ Record Payment**.
4. Enter the amount.
5. Choose the payment method: **Cash**, **UPI**, **Card**, **Bank**, or **Split**.
6. Click **Save Payment**.

### How do I handle a customer returning an item?

Go to **Sales** → Click the invoice → Click **Process Return** → Choose items and quantities → Enter a reason → Click **Submit Return**. A manager/admin then needs to approve it from the **Sales Returns** page.

### How do I fix incorrect stock levels?

Go to **Stock** → **Current Stock** → Find the product → Click **Adjust Stock** → Enter the correct quantity → Choose a reason → Click **Save**.

### How do I add a staff member?

Go to **Staff** (only available if you're the admin) → Click **Add Staff** → Enter their name, email, and choose a role → Click **Save**. They'll get an email invitation.

### Why can't I see financial data?

Financial reports and product profit information are only available on **Pro**, **Pro Yearly**, or **Lifetime** plans. The **Basic** plan does not include them. Upgrade from the **Pricing** page to unlock them.

### Can I edit an expense after creating it?

No. Expenses can't be edited. Delete the incorrect expense and create a new one.

### Can I edit an invoice after creating it?

You cannot change the products or quantities on an existing invoice. To change what was sold, delete the invoice (optionally restoring stock) and create a new one. You can, however, update the payment status or amount on an existing invoice if needed.

### I'm locked out because my subscription expired. What do I do?

Go to **Pricing**, choose a plan, and complete the payment. Access is restored automatically.

### What reports can I run?

12 categories: Summary, Sales, Purchases, Profitability, Inventory, Customers, Suppliers, Expenses, Tax, Returns, Payments, and Audit. Go to **Reports** to explore.

---

## Best Practices

### Order of Operations
1. **Set up categories** before creating products.
2. **Add products** before creating sales or purchases.
3. **Record purchases** before sales to ensure stock is available.
4. **Record payments** immediately after sales to keep balances accurate.
5. **Review stock** regularly to catch discrepancies early.

### Common Mistakes to Avoid
- **Creating sales with insufficient stock**: You can override this, but it creates negative inventory.
- **Forgetting to record payments**: Unpaid invoices show as outstanding balances.
- **Not setting tax rates on products**: Results in 0 tax on invoices.
- **Creating duplicate customers**: Use the search box first before adding.
- **Deleting a sale without restoring stock**: Choose "restore stock" to keep inventory accurate.
- **Not configuring GST**: If you're GST-registered, make sure products have correct tax rates and customers have state information.

### Inventory Tips
- Use **Stock Adjustments** to fix discrepancies.
- Check the **Low Stock Alerts** tab regularly.
- Group products into **categories** for easier management.
- Review the **Stock Movements** tab for a full audit trail.

### Payment Tips
- Record each partial payment separately for an accurate history.
- Note the payment method (cash, UPI, card, bank, split) to reconcile with bank statements.

---

## Glossary

| Term | Meaning |
|------|---------|
| **CGST** | Central GST — the central part of GST for same-state transactions |
| **SGST** | State GST — the state part of GST for same-state transactions |
| **IGST** | Integrated GST — applies when buyer and seller are in different states |
| **GSTIN** | 15-digit GST registration number |
| **MRP** | Maximum Retail Price — the printed price on a product |
| **Invoice** | A sales document listing what a customer bought |
| **Purchase Order** | A document recording products bought from a supplier |
| **Sales Return** | When a customer returns previously purchased items |
| **Purchase Return** | When you return items to a supplier |
| **Payment Status** | Whether an invoice is unpaid (pending), partially paid (partial), or fully paid (paid) |
| **Outstanding Balance** | The remaining amount to be paid on an invoice or by a customer |
| **Stock Movement** | A record of inventory change — sale, purchase, return, adjustment, or damage |
| **Low Stock Alert** | A notification when a product's stock is below its threshold |
| **RBAC** | Role-Based Access Control — the permission system that controls what each user can do |
| **Tax Liability** | Net tax payable = Tax Collected on Sales minus Tax Paid on Purchases |
| **Razorpay** | Payment gateway for INR (Indian Rupee) subscription payments |
| **Stripe** | Payment gateway for USD (US Dollar) subscription payments |

---

*Last updated: July 2026*
