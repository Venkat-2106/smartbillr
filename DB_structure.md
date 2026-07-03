## tables
| table\_schema | table\_name |
| --- | --- |
| public | alembic\_version |
| public | audit\_logs |
| public | business\_counters |
| public | businesses |
| public | categories |
| public | customers |
| public | expenses |
| public | low\_stock\_alerts |
| public | payments |
| public | permissions |
| public | products |
| public | profiles |
| public | purchase\_items |
| public | purchase\_return\_items |
| public | purchase\_returns |
| public | purchases |
| public | role\_permissions |
| public | roles |
| public | sale\_items |
| public | sales |
| public | sales\_return\_items |
| public | sales\_returns |
| public | stock\_movements |
| public | super\_admins |
| public | suppliers |

## columns
| table\_name | column\_name | data\_type | is\_nullable | column\_default |
| --- | --- | --- | --- | --- |
| alembic\_version | version\_num | character varying | NO | NaN |
| audit\_logs | audit\_id | uuid | NO | gen\_random\_uuid() |
| audit\_logs | business\_id | uuid | YES | NaN |
| audit\_logs | user\_id | uuid | YES | NaN |
| audit\_logs | action\_type | character varying | YES | NaN |
| audit\_logs | table\_name | character varying | YES | NaN |
| audit\_logs | record\_id | uuid | YES | NaN |
| audit\_logs | old\_data | jsonb | YES | NaN |
| audit\_logs | new\_data | jsonb | YES | NaN |
| audit\_logs | created\_at | timestamp with time zone | YES | now() |
| business\_counters | business\_id | uuid | NO | NaN |
| business\_counters | invoice\_counter | integer | YES | 0 |
| business\_counters | purchase\_counter | integer | YES | 0 |
| business\_counters | customer\_counter | integer | YES | 0 |
| business\_counters | updated\_at | timestamp without time zone | YES | now() |
| businesses | business\_id | uuid | NO | gen\_random\_uuid() |
| businesses | business\_name | text | NO | NaN |
| businesses | business\_email | text | YES | NaN |
| businesses | business\_phone | text | YES | NaN |
| businesses | business\_address | text | YES | NaN |
| businesses | business\_state | text | YES | NaN |
| businesses | gstin | text | YES | NaN |
| businesses | is\_gst\_registered | boolean | YES | True |
| businesses | is\_deleted | boolean | YES | 0 |
| businesses | created\_at | timestamp without time zone | YES | now() |
| businesses | business\_country\_code | character varying | YES | NaN |
| businesses | updated\_at | timestamp without time zone | YES | now() |
| businesses | payment\_status | character varying | NO | 'pending'::character varying |
| businesses | subscription\_type | character varying | NO | 'trial'::character varying |
| businesses | subscription\_start\_at | timestamp with time zone | YES | NaN |
| businesses | subscription\_end\_at | timestamp with time zone | YES | NaN |
| businesses | trial\_start\_at | timestamp with time zone | YES | NaN |
| businesses | trial\_end\_at | timestamp with time zone | YES | NaN |
| businesses | is\_active | boolean | NO | True |
| categories | category\_id | uuid | NO | gen\_random\_uuid() |
| categories | business\_id | uuid | YES | NaN |
| categories | category\_name | character varying | NO | NaN |
| categories | is\_deleted | boolean | YES | 0 |
| categories | created\_at | timestamp without time zone | YES | now() |
| categories | updated\_at | timestamp without time zone | YES | CURRENT\_TIMESTAMP |
| categories | updated\_by | uuid | YES | NaN |
| categories | created\_by | uuid | YES | NaN |
| customers | cust\_id | uuid | NO | gen\_random\_uuid() |
| customers | business\_id | uuid | YES | NaN |
| customers | cust\_name | character varying | NO | NaN |
| customers | cust\_phone | character varying | YES | NaN |
| customers | cust\_email | character varying | YES | NaN |
| customers | is\_deleted | boolean | YES | 0 |
| customers | cust\_created\_at | timestamp without time zone | YES | now() |
| customers | cust\_country\_code | character varying | YES | NaN |
| customers | cust\_tax\_number | character varying | YES | NaN |
| customers | cust\_address | text | YES | NaN |
| customers | cust\_state | character varying | YES | NaN |
| customers | updated\_at | timestamp without time zone | YES | CURRENT\_TIMESTAMP |
| customers | updated\_by | uuid | YES | NaN |
| expenses | expense\_id | uuid | NO | gen\_random\_uuid() |
| expenses | business\_id | uuid | YES | NaN |
| expenses | expense\_category | character varying | YES | NaN |
| expenses | expense\_amount | numeric | NO | NaN |
| expenses | expense\_date | date | YES | CURRENT\_DATE |
| expenses | expense\_notes | text | YES | NaN |
| expenses | is\_deleted | boolean | YES | 0 |
| expenses | created\_at | timestamp without time zone | YES | now() |
| expenses | created\_by | uuid | YES | NaN |
| expenses | updated\_at | timestamp without time zone | YES | now() |
| expenses | updated\_by | uuid | YES | NaN |
| expenses | source\_type | character varying | YES | NaN |
| expenses | source\_id | uuid | YES | NaN |
| low\_stock\_alerts | alert\_id | uuid | NO | gen\_random\_uuid() |
| low\_stock\_alerts | business\_id | uuid | YES | NaN |
| low\_stock\_alerts | product\_id | uuid | YES | NaN |
| low\_stock\_alerts | alert\_stock\_qty | integer | NO | NaN |
| low\_stock\_alerts | alert\_threshold | integer | NO | NaN |
| low\_stock\_alerts | alert\_status | character varying | YES | 'unread'::character varying |
| low\_stock\_alerts | alert\_created\_at | timestamp without time zone | YES | now() |
| low\_stock\_alerts | updated\_at | timestamp without time zone | YES | now() |
| payments | payment\_id | uuid | NO | gen\_random\_uuid() |
| payments | business\_id | uuid | YES | NaN |
| payments | sale\_id | uuid | YES | NaN |
| payments | payment\_amount | numeric | NO | NaN |
| payments | payment\_method | character varying | YES | NaN |
| payments | payment\_paid\_at | timestamp without time zone | YES | now() |
| payments | payment\_status | character varying | NO | 'pending'::character varying |
| payments | is\_active | boolean | NO | True |
| payments | cumulative\_paid | numeric | YES | 0 |
| payments | updated\_at | timestamp without time zone | YES | now() |
| permissions | id | integer | NO | nextval('permissions\_id\_seq'::regclass) |
| permissions | code | text | NO | NaN |
| permissions | description | text | YES | NaN |
| permissions | created\_at | timestamp without time zone | YES | now() |
| products | prod\_id | uuid | NO | gen\_random\_uuid() |
| products | business\_id | uuid | YES | NaN |
| products | category\_id | uuid | YES | NaN |
| products | prod\_name | character varying | NO | NaN |
| products | prod\_sell\_price | numeric | NO | NaN |
| products | prod\_cost\_price | numeric | NO | NaN |
| products | prod\_stock\_qty | integer | YES | 0 |
| products | prod\_low\_stock\_alert | integer | YES | 10 |
| products | tax\_rate | numeric | YES | 0 |
| products | tax\_code | text | YES | NaN |
| products | barcode | text | YES | NaN |
| products | unit | text | YES | 'pcs'::text |
| products | is\_deleted | boolean | YES | 0 |
| products | prod\_created\_at | timestamp without time zone | YES | now() |
| products | updated\_at | timestamp without time zone | YES | CURRENT\_TIMESTAMP |
| products | updated\_by | uuid | YES | NaN |
| products | created\_by | uuid | YES | NaN |
| products | prod\_mrp | numeric | YES | NULL::numeric |
| products | prod\_profit | numeric | YES | NaN |
| profiles | id | uuid | NO | NaN |
| profiles | business\_id | uuid | NO | NaN |
| profiles | full\_name | text | YES | NaN |
| profiles | role | text | YES | 'staff'::text |
| profiles | is\_active | boolean | YES | True |
| profiles | created\_at | timestamp without time zone | YES | now() |
| profiles | updated\_at | timestamp without time zone | YES | now() |
| profiles | email | text | YES | NaN |
| profiles | role\_id | integer | NO | NaN |
| profiles | last\_logout\_at | timestamp with time zone | YES | NaN |
| profiles | last\_login\_at | timestamp with time zone | YES | NaN |
| purchase\_items | item\_id | uuid | NO | gen\_random\_uuid() |
| purchase\_items | business\_id | uuid | YES | NaN |
| purchase\_items | pur\_id | uuid | YES | NaN |
| purchase\_items | product\_id | uuid | YES | NaN |
| purchase\_items | pur\_item\_qty | integer | NO | NaN |
| purchase\_items | item\_unit\_price | numeric | NO | NaN |
| purchase\_items | item\_subtotal | numeric | YES | NaN |
| purchase\_items | gst\_rate | numeric | YES | 0 |
| purchase\_items | cgst\_amount | numeric | YES | 0 |
| purchase\_items | sgst\_amount | numeric | YES | 0 |
| purchase\_items | igst\_amount | numeric | YES | 0 |
| purchase\_items | pur\_tax\_total | numeric | YES | 0 |
| purchase\_items | item\_tax\_total | numeric | YES | NaN |
| purchase\_items | item\_total\_with\_tax | numeric | YES | NaN |
| purchase\_return\_items | return\_item\_id | uuid | NO | gen\_random\_uuid() |
| purchase\_return\_items | return\_id | uuid | YES | NaN |
| purchase\_return\_items | product\_id | uuid | YES | NaN |
| purchase\_return\_items | return\_qty | integer | NO | NaN |
| purchase\_return\_items | refund\_amount | numeric | NO | NaN |
| purchase\_return\_items | return\_item\_subtotal | numeric | YES | NaN |
| purchase\_return\_items | business\_id | uuid | NO | NaN |
| purchase\_returns | return\_id | uuid | NO | gen\_random\_uuid() |
| purchase\_returns | business\_id | uuid | YES | NaN |
| purchase\_returns | pur\_id | uuid | YES | NaN |
| purchase\_returns | return\_reason | text | YES | NaN |
| purchase\_returns | return\_status | character varying | YES | 'pending'::character varying |
| purchase\_returns | return\_created\_at | timestamp without time zone | YES | now() |
| purchase\_returns | created\_by | uuid | YES | NaN |
| purchase\_returns | restock | boolean | YES | True |
| purchase\_returns | stock\_updated | boolean | YES | 0 |
| purchase\_returns | refund\_method | character varying | YES | 'cash'::character varying |
| purchase\_returns | approved\_by | uuid | YES | NaN |
| purchase\_returns | approved\_at | timestamp without time zone | YES | NaN |
| purchase\_returns | rejected\_reason | text | YES | NaN |
| purchase\_returns | return\_amount | numeric | YES | 0 |
| purchase\_returns | updated\_at | timestamp without time zone | YES | now() |
| purchases | pur\_id | uuid | NO | gen\_random\_uuid() |
| purchases | business\_id | uuid | YES | NaN |
| purchases | supp\_id | uuid | YES | NaN |
| purchases | pur\_total\_amount | numeric | NO | NaN |
| purchases | pur\_discount | numeric | YES | 0 |
| purchases | pur\_cgst\_total | numeric | YES | 0 |
| purchases | pur\_sgst\_total | numeric | YES | 0 |
| purchases | pur\_igst\_total | numeric | YES | 0 |
| purchases | pur\_payment\_status | character varying | YES | 'pending'::character varying |
| purchases | is\_deleted | boolean | YES | 0 |
| purchases | pur\_created\_at | timestamp without time zone | YES | now() |
| purchases | created\_by | uuid | YES | NaN |
| purchases | pur\_tax\_total | numeric | YES | 0 |
| purchases | pur\_final\_amount | numeric | YES | NaN |
| purchases | updated\_at | timestamp without time zone | YES | now() |
| purchases | updated\_by | uuid | YES | NaN |
| role\_permissions | role\_id | integer | NO | NaN |
| role\_permissions | permission\_id | integer | NO | NaN |
| roles | id | integer | NO | nextval('roles\_id\_seq'::regclass) |
| roles | name | text | NO | NaN |
| roles | description | text | YES | NaN |
| roles | created\_at | timestamp without time zone | YES | now() |
| sale\_items | sale\_item\_id | uuid | NO | gen\_random\_uuid() |
| sale\_items | business\_id | uuid | YES | NaN |
| sale\_items | sale\_id | uuid | YES | NaN |
| sale\_items | product\_id | uuid | YES | NaN |
| sale\_items | sale\_item\_quantity | integer | NO | NaN |
| sale\_items | sale\_item\_unit\_price | numeric | NO | NaN |
| sale\_items | sale\_item\_subtotal | numeric | YES | NaN |
| sale\_items | gst\_rate | numeric | YES | 0 |
| sale\_items | cgst\_amount | numeric | YES | 0 |
| sale\_items | sgst\_amount | numeric | YES | 0 |
| sale\_items | igst\_amount | numeric | YES | 0 |
| sale\_items | tax\_amount | numeric | YES | 0 |
| sale\_items | item\_tax\_total | numeric | YES | NaN |
| sale\_items | item\_total\_with\_tax | numeric | YES | NaN |
| sale\_items | item\_mrp | numeric | YES | NULL::numeric |
| sale\_items | sale\_item\_cost\_price\_at\_sale | numeric | YES | NaN |
| sales | sales\_id | uuid | NO | gen\_random\_uuid() |
| sales | business\_id | uuid | YES | NaN |
| sales | customer\_id | uuid | YES | NaN |
| sales | invoice\_no | text | YES | NaN |
| sales | sales\_total\_amount | numeric | NO | NaN |
| sales | sales\_discount | numeric | YES | 0 |
| sales | cgst\_total | numeric | YES | 0 |
| sales | sgst\_total | numeric | YES | 0 |
| sales | igst\_total | numeric | YES | 0 |
| sales | sales\_payment\_method | character varying | YES | NaN |
| sales | sales\_payment\_status | character varying | YES | 'pending'::character varying |
| sales | is\_deleted | boolean | YES | 0 |
| sales | sales\_created\_at | timestamp without time zone | YES | now() |
| sales | created\_by | uuid | YES | NaN |
| sales | tax\_total | numeric | YES | 0 |
| sales | sales\_final\_amount | numeric | YES | NaN |
| sales | updated\_at | timestamp without time zone | YES | now() |
| sales\_return\_items | return\_item\_id | uuid | NO | gen\_random\_uuid() |
| sales\_return\_items | return\_id | uuid | NO | NaN |
| sales\_return\_items | sale\_item\_id | uuid | NO | NaN |
| sales\_return\_items | product\_id | uuid | NO | NaN |
| sales\_return\_items | return\_qty | numeric | NO | NaN |
| sales\_return\_items | unit\_price | numeric | NO | NaN |
| sales\_return\_items | tax\_amount | numeric | YES | 0 |
| sales\_return\_items | created\_at | timestamp without time zone | YES | now() |
| sales\_return\_items | original\_qty | numeric | NO | NaN |
| sales\_return\_items | original\_unit\_price | numeric | NO | NaN |
| sales\_return\_items | business\_id | uuid | NO | NaN |
| sales\_returns | return\_id | uuid | NO | gen\_random\_uuid() |
| sales\_returns | business\_id | uuid | YES | NaN |
| sales\_returns | sale\_id | uuid | YES | NaN |
| sales\_returns | return\_amount | numeric | NO | NaN |
| sales\_returns | return\_reason | text | YES | NaN |
| sales\_returns | return\_status | character varying | YES | 'pending'::character varying |
| sales\_returns | return\_created\_at | timestamp without time zone | YES | now() |
| sales\_returns | created\_by | uuid | YES | NaN |
| sales\_returns | restock | boolean | YES | 0 |
| sales\_returns | refund\_method | character varying | YES | NaN |
| sales\_returns | approved\_by | uuid | YES | NaN |
| sales\_returns | approved\_at | timestamp without time zone | YES | NaN |
| sales\_returns | rejected\_reason | text | YES | NaN |
| sales\_returns | stock\_updated | boolean | YES | 0 |
| sales\_returns | updated\_at | timestamp without time zone | YES | now() |
| stock\_movements | move\_id | uuid | NO | gen\_random\_uuid() |
| stock\_movements | business\_id | uuid | YES | NaN |
| stock\_movements | product\_id | uuid | YES | NaN |
| stock\_movements | move\_type | character varying | NO | NaN |
| stock\_movements | move\_qty | integer | NO | NaN |
| stock\_movements | move\_prev\_stock | integer | NO | NaN |
| stock\_movements | move\_new\_stock | integer | YES | NaN |
| stock\_movements | sale\_reference\_id | uuid | YES | NaN |
| stock\_movements | purchase\_reference\_id | uuid | YES | NaN |
| stock\_movements | move\_notes | text | YES | NaN |
| stock\_movements | move\_created\_at | timestamp without time zone | YES | now() |
| stock\_movements | move\_created\_by | uuid | YES | NaN |
| stock\_movements | reference\_type | text | YES | NaN |
| stock\_movements | reference\_id | uuid | YES | NaN |
| super\_admins | id | integer | NO | nextval('super\_admins\_id\_seq'::regclass) |
| super\_admins | user\_id | character varying | NO | NaN |
| super\_admins | created\_at | timestamp without time zone | YES | now() |
| suppliers | supp\_id | uuid | NO | gen\_random\_uuid() |
| suppliers | business\_id | uuid | YES | NaN |
| suppliers | supp\_name | character varying | NO | NaN |
| suppliers | supp\_phone | character varying | YES | NaN |
| suppliers | supp\_email | character varying | YES | NaN |
| suppliers | supp\_address | text | YES | NaN |
| suppliers | is\_deleted | boolean | YES | 0 |
| suppliers | supp\_created\_at | timestamp without time zone | YES | now() |
| suppliers | supp\_country\_code | character varying | YES | NaN |
| suppliers | supp\_tax\_number | character varying | YES | NaN |
| suppliers | supp\_state | character varying | YES | NaN |
| suppliers | updated\_at | timestamp without time zone | YES | now() |
| suppliers | updated\_by | uuid | YES | NaN |

## primary key
| table\_name | column\_name |
| --- | --- |
| alembic\_version | version\_num |
| audit\_logs | audit\_id |
| business\_counters | business\_id |
| businesses | business\_id |
| categories | category\_id |
| customers | cust\_id |
| expenses | expense\_id |
| low\_stock\_alerts | alert\_id |
| payments | payment\_id |
| permissions | id |
| products | prod\_id |
| profiles | id |
| purchase\_items | item\_id |
| purchase\_return\_items | return\_item\_id |
| purchase\_returns | return\_id |
| purchases | pur\_id |
| role\_permissions | permission\_id |
| role\_permissions | role\_id |
| roles | id |
| sale\_items | sale\_item\_id |
| sales | sales\_id |
| sales\_return\_items | return\_item\_id |
| sales\_returns | return\_id |
| stock\_movements | move\_id |
| super\_admins | id |
| suppliers | supp\_id |

## foregin key
| table\_name | column\_name | foreign\_table\_name | foreign\_column\_name |
| --- | --- | --- | --- |
| audit\_logs | user\_id | profiles | id |
| audit\_logs | business\_id | businesses | business\_id |
| business\_counters | business\_id | businesses | business\_id |
| categories | created\_by | profiles | id |
| categories | business\_id | businesses | business\_id |
| categories | updated\_by | profiles | id |
| customers | updated\_by | profiles | id |
| customers | business\_id | businesses | business\_id |
| expenses | created\_by | profiles | id |
| expenses | business\_id | businesses | business\_id |
| expenses | updated\_by | profiles | id |
| low\_stock\_alerts | business\_id | businesses | business\_id |
| low\_stock\_alerts | product\_id | products | prod\_id |
| payments | business\_id | businesses | business\_id |
| payments | sale\_id | sales | sales\_id |
| products | business\_id | businesses | business\_id |
| products | created\_by | profiles | id |
| products | updated\_by | profiles | id |
| products | category\_id | categories | category\_id |
| profiles | business\_id | businesses | business\_id |
| profiles | business\_id | businesses | business\_id |
| profiles | role\_id | roles | id |
| purchase\_items | pur\_id | purchases | pur\_id |
| purchase\_items | product\_id | products | prod\_id |
| purchase\_items | business\_id | businesses | business\_id |
| purchase\_return\_items | business\_id | businesses | business\_id |
| purchase\_return\_items | return\_id | purchase\_returns | return\_id |
| purchase\_return\_items | product\_id | products | prod\_id |
| purchase\_returns | business\_id | businesses | business\_id |
| purchase\_returns | approved\_by | profiles | id |
| purchase\_returns | created\_by | profiles | id |
| purchase\_returns | pur\_id | purchases | pur\_id |
| purchases | business\_id | businesses | business\_id |
| purchases | updated\_by | profiles | id |
| purchases | created\_by | profiles | id |
| purchases | supp\_id | suppliers | supp\_id |
| role\_permissions | permission\_id | permissions | id |
| role\_permissions | role\_id | roles | id |
| sale\_items | business\_id | businesses | business\_id |
| sale\_items | product\_id | products | prod\_id |
| sale\_items | sale\_id | sales | sales\_id |
| sales | customer\_id | customers | cust\_id |
| sales | created\_by | profiles | id |
| sales | business\_id | businesses | business\_id |
| sales\_return\_items | product\_id | products | prod\_id |
| sales\_return\_items | business\_id | businesses | business\_id |
| sales\_return\_items | return\_id | sales\_returns | return\_id |
| sales\_return\_items | sale\_item\_id | sale\_items | sale\_item\_id |
| sales\_returns | business\_id | businesses | business\_id |
| sales\_returns | sale\_id | sales | sales\_id |
| sales\_returns | created\_by | profiles | id |
| stock\_movements | move\_created\_by | profiles | id |
| stock\_movements | purchase\_reference\_id | purchases | pur\_id |
| stock\_movements | product\_id | products | prod\_id |
| stock\_movements | business\_id | businesses | business\_id |
| stock\_movements | sale\_reference\_id | sales | sales\_id |
| suppliers | business\_id | businesses | business\_id |
| suppliers | updated\_by | profiles | id |

## Constraints
| table\_name | constraint\_name | constraint\_type | definition |
| --- | --- | --- | --- |
| businesses | businesses\_pkey | p | PRIMARY KEY (business\_id) |
| profiles | profiles\_role\_id\_fkey | f | FOREIGN KEY (role\_id) REFERENCES roles(id) |
| profiles | profiles\_role\_check | c | CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text, 'manager'::text]))) |
| profiles | profiles\_pkey | p | PRIMARY KEY (id) |
| profiles | profiles\_id\_fkey | f | FOREIGN KEY (id) REFERENCES auth.users(id) |
| profiles | profiles\_email\_unique | u | UNIQUE (email) |
| profiles | profiles\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| profiles | fk\_profiles\_business\_id | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| business\_counters | business\_counters\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| business\_counters | business\_counters\_pkey | p | PRIMARY KEY (business\_id) |
| categories | categories\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| categories | categories\_updated\_by\_fkey | f | FOREIGN KEY (updated\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| categories | categories\_pkey | p | PRIMARY KEY (category\_id) |
| categories | categories\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| customers | customers\_updated\_by\_fkey | f | FOREIGN KEY (updated\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| customers | customers\_pkey | p | PRIMARY KEY (cust\_id) |
| customers | customers\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| suppliers | suppliers\_pkey | p | PRIMARY KEY (supp\_id) |
| suppliers | suppliers\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| suppliers | suppliers\_updated\_by\_fkey | f | FOREIGN KEY (updated\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| products | products\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| products | products\_pkey | p | PRIMARY KEY (prod\_id) |
| products | products\_category\_id\_fkey | f | FOREIGN KEY (category\_id) REFERENCES categories(category\_id) |
| products | products\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| products | products\_updated\_by\_fkey | f | FOREIGN KEY (updated\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| sales | sales\_invoice\_no\_key | u | UNIQUE (invoice\_no) |
| sales | sales\_sales\_payment\_method\_check | c | CHECK (((sales\_payment\_method)::text = ANY ((ARRAY['cash'::character varying, 'upi'::character varying, 'card'::character varying, 'bank'::character varying, 'split'::character varying])::text[]))) |
| sales | sales\_sales\_payment\_status\_check | c | CHECK (((sales\_payment\_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partial'::character varying])::text[]))) |
| sales | sales\_pkey | p | PRIMARY KEY (sales\_id) |
| sales | sales\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| sales | sales\_customer\_id\_fkey | f | FOREIGN KEY (customer\_id) REFERENCES customers(cust\_id) |
| sales | sales\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) |
| sale\_items | sale\_items\_product\_id\_fkey | f | FOREIGN KEY (product\_id) REFERENCES products(prod\_id) |
| sale\_items | sale\_items\_pkey | p | PRIMARY KEY (sale\_item\_id) |
| sale\_items | sale\_items\_sale\_id\_fkey | f | FOREIGN KEY (sale\_id) REFERENCES sales(sales\_id) ON DELETE CASCADE |
| sale\_items | sale\_items\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| payments | payments\_pkey | p | PRIMARY KEY (payment\_id) |
| payments | payments\_sale\_id\_fkey | f | FOREIGN KEY (sale\_id) REFERENCES sales(sales\_id) ON DELETE CASCADE |
| payments | payments\_payment\_method\_check | c | CHECK (((payment\_method)::text = ANY (ARRAY['cash'::text, 'upi'::text, 'card'::text, 'bank'::text, 'split'::text, 'adjustment'::text]))) |
| payments | payments\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| purchases | purchases\_supp\_id\_fkey | f | FOREIGN KEY (supp\_id) REFERENCES suppliers(supp\_id) |
| purchases | purchases\_pkey | p | PRIMARY KEY (pur\_id) |
| purchases | purchases\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| purchases | purchases\_pur\_payment\_status\_check | c | CHECK (((pur\_payment\_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partial'::character varying])::text[]))) |
| purchases | purchases\_updated\_by\_fkey | f | FOREIGN KEY (updated\_by) REFERENCES profiles(id) ON DELETE SET NULL |
| purchases | purchases\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) |
| purchase\_items | purchase\_items\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| purchase\_items | purchase\_items\_pur\_id\_fkey | f | FOREIGN KEY (pur\_id) REFERENCES purchases(pur\_id) ON DELETE CASCADE |
| purchase\_items | purchase\_items\_product\_id\_fkey | f | FOREIGN KEY (product\_id) REFERENCES products(prod\_id) |
| purchase\_items | purchase\_items\_pkey | p | PRIMARY KEY (item\_id) |
| low\_stock\_alerts | low\_stock\_alerts\_product\_id\_fkey | f | FOREIGN KEY (product\_id) REFERENCES products(prod\_id) |
| low\_stock\_alerts | low\_stock\_alerts\_alert\_status\_check | c | CHECK (((alert\_status)::text = ANY ((ARRAY['unread'::character varying, 'read'::character varying, 'resolved'::character varying])::text[]))) |
| low\_stock\_alerts | low\_stock\_alerts\_pkey | p | PRIMARY KEY (alert\_id) |
| low\_stock\_alerts | low\_stock\_alerts\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| stock\_movements | stock\_movements\_sale\_reference\_id\_fkey | f | FOREIGN KEY (sale\_reference\_id) REFERENCES sales(sales\_id) |
| stock\_movements | stock\_movements\_move\_type\_check | c | CHECK (((move\_type)::text = ANY ((ARRAY['sale'::character varying, 'purchase'::character varying, 'adjustment'::character varying, 'sales\_return'::character varying, 'sales\_return\_reversal'::character varying, 'purchase\_return'::character varying, 'purchase\_return\_reversal'::character varying, 'damage'::character varying])::text[]))) |
| stock\_movements | stock\_movements\_purchase\_reference\_id\_fkey | f | FOREIGN KEY (purchase\_reference\_id) REFERENCES purchases(pur\_id) |
| stock\_movements | stock\_movements\_move\_created\_by\_fkey | f | FOREIGN KEY (move\_created\_by) REFERENCES profiles(id) |
| stock\_movements | stock\_movements\_pkey | p | PRIMARY KEY (move\_id) |
| stock\_movements | stock\_movements\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| stock\_movements | stock\_movements\_product\_id\_fkey | f | FOREIGN KEY (product\_id) REFERENCES products(prod\_id) |
| sales\_returns | sales\_returns\_sale\_id\_fkey | f | FOREIGN KEY (sale\_id) REFERENCES sales(sales\_id) |
| sales\_returns | sales\_returns\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) |
| sales\_returns | sales\_returns\_return\_status\_check | c | CHECK (((return\_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))) |
| sales\_returns | sales\_returns\_pkey | p | PRIMARY KEY (return\_id) |
| sales\_returns | sales\_returns\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| expenses | expenses\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) |
| expenses | expenses\_expense\_category\_check | c | CHECK (((expense\_category)::text = ANY (ARRAY['rent'::text, 'salary'::text, 'electricity'::text, 'internet'::text, 'maintenance'::text, 'marketing'::text, 'other'::text, 'purchase'::text]))) |
| expenses | chk\_expense\_amount\_positive | c | CHECK ((expense\_amount > (0)::numeric)) |
| expenses | expenses\_updated\_by\_fkey | f | FOREIGN KEY (updated\_by) REFERENCES profiles(id) |
| expenses | expenses\_pkey | p | PRIMARY KEY (expense\_id) |
| expenses | expenses\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| audit\_logs | audit\_logs\_action\_type\_check | c | CHECK (((action\_type)::text = ANY ((ARRAY['insert'::character varying, 'update'::character varying, 'delete'::character varying, 'login'::character varying, 'export'::character varying])::text[]))) |
| audit\_logs | audit\_logs\_pkey | p | PRIMARY KEY (audit\_id) |
| audit\_logs | audit\_logs\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| audit\_logs | audit\_logs\_user\_id\_fkey | f | FOREIGN KEY (user\_id) REFERENCES profiles(id) |
| purchase\_returns | purchase\_returns\_pkey | p | PRIMARY KEY (return\_id) |
| purchase\_returns | purchase\_returns\_pur\_id\_fkey | f | FOREIGN KEY (pur\_id) REFERENCES purchases(pur\_id) |
| purchase\_returns | purchase\_returns\_approved\_by\_fkey | f | FOREIGN KEY (approved\_by) REFERENCES profiles(id) |
| purchase\_returns | purchase\_returns\_return\_status\_check | c | CHECK (((return\_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))) |
| purchase\_returns | purchase\_returns\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| purchase\_returns | purchase\_returns\_created\_by\_fkey | f | FOREIGN KEY (created\_by) REFERENCES profiles(id) |
| purchase\_return\_items | purchase\_return\_items\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| purchase\_return\_items | purchase\_return\_items\_product\_id\_fkey | f | FOREIGN KEY (product\_id) REFERENCES products(prod\_id) |
| purchase\_return\_items | purchase\_return\_items\_return\_id\_fkey | f | FOREIGN KEY (return\_id) REFERENCES purchase\_returns(return\_id) ON DELETE CASCADE |
| purchase\_return\_items | purchase\_return\_items\_pkey | p | PRIMARY KEY (return\_item\_id) |
| sales\_return\_items | sales\_return\_items\_product\_id\_fkey | f | FOREIGN KEY (product\_id) REFERENCES products(prod\_id) |
| sales\_return\_items | sales\_return\_items\_return\_qty\_check | c | CHECK ((return\_qty > (0)::numeric)) |
| sales\_return\_items | sales\_return\_items\_unit\_price\_check | c | CHECK ((unit\_price >= (0)::numeric)) |
| sales\_return\_items | sales\_return\_items\_pkey | p | PRIMARY KEY (return\_item\_id) |
| sales\_return\_items | sales\_return\_items\_return\_id\_fkey | f | FOREIGN KEY (return\_id) REFERENCES sales\_returns(return\_id) ON DELETE CASCADE |
| sales\_return\_items | sales\_return\_items\_sale\_item\_id\_fkey | f | FOREIGN KEY (sale\_item\_id) REFERENCES sale\_items(sale\_item\_id) |
| sales\_return\_items | sales\_return\_items\_business\_id\_fkey | f | FOREIGN KEY (business\_id) REFERENCES businesses(business\_id) |
| roles | roles\_pkey | p | PRIMARY KEY (id) |
| roles | roles\_name\_key | u | UNIQUE (name) |
| permissions | permissions\_code\_key | u | UNIQUE (code) |
| permissions | permissions\_pkey | p | PRIMARY KEY (id) |
| role\_permissions | role\_permissions\_role\_id\_fkey | f | FOREIGN KEY (role\_id) REFERENCES roles(id) ON DELETE CASCADE |
| role\_permissions | role\_permissions\_permission\_id\_fkey | f | FOREIGN KEY (permission\_id) REFERENCES permissions(id) ON DELETE CASCADE |
| role\_permissions | role\_permissions\_pkey | p | PRIMARY KEY (role\_id, permission\_id) |
| alembic\_version | alembic\_version\_pkc | p | PRIMARY KEY (version\_num) |
| super\_admins | super\_admins\_user\_id\_key | u | UNIQUE (user\_id) |
| super\_admins | super\_admins\_pkey | p | PRIMARY KEY (id) |

## index
| schemaname | tablename | indexname | indexdef |
| --- | --- | --- | --- |
| public | alembic\_version | alembic\_version\_pkc | CREATE UNIQUE INDEX alembic\_version\_pkc ON public.alembic\_version USING btree (version\_num) |
| public | audit\_logs | audit\_logs\_pkey | CREATE UNIQUE INDEX audit\_logs\_pkey ON public.audit\_logs USING btree (audit\_id) |
| public | audit\_logs | idx\_audit\_logs\_business\_action | CREATE INDEX idx\_audit\_logs\_business\_action ON public.audit\_logs USING btree (business\_id, action\_type, created\_at DESC) |
| public | audit\_logs | idx\_audit\_logs\_business | CREATE INDEX idx\_audit\_logs\_business ON public.audit\_logs USING btree (business\_id) |
| public | business\_counters | business\_counters\_pkey | CREATE UNIQUE INDEX business\_counters\_pkey ON public.business\_counters USING btree (business\_id) |
| public | businesses | idx\_businesses\_name\_unique | CREATE UNIQUE INDEX idx\_businesses\_name\_unique ON public.businesses USING btree (lower(business\_name)) WHERE ((is\_deleted = false) OR (is\_deleted IS NULL)) |
| public | businesses | ix\_businesses\_payment\_status\_sub\_end | CREATE INDEX ix\_businesses\_payment\_status\_sub\_end ON public.businesses USING btree (payment\_status, subscription\_end\_at) WHERE ((payment\_status)::text = 'paid'::text) |
| public | businesses | businesses\_pkey | CREATE UNIQUE INDEX businesses\_pkey ON public.businesses USING btree (business\_id) |
| public | categories | categories\_pkey | CREATE UNIQUE INDEX categories\_pkey ON public.categories USING btree (category\_id) |
| public | categories | idx\_categories\_business\_deleted | CREATE INDEX idx\_categories\_business\_deleted ON public.categories USING btree (business\_id, is\_deleted) |
| public | categories | idx\_categories\_business\_updated | CREATE INDEX idx\_categories\_business\_updated ON public.categories USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |
| public | categories | idx\_categories\_name\_trgm | CREATE INDEX idx\_categories\_name\_trgm ON public.categories USING gin (category\_name gin\_trgm\_ops) WHERE (is\_deleted = false) |
| public | customers | customers\_pkey | CREATE UNIQUE INDEX customers\_pkey ON public.customers USING btree (cust\_id) |
| public | customers | idx\_customers\_business\_deleted | CREATE INDEX idx\_customers\_business\_deleted ON public.customers USING btree (business\_id, is\_deleted) |
| public | customers | idx\_customers\_business\_lower\_trim\_name | CREATE INDEX idx\_customers\_business\_lower\_trim\_name ON public.customers USING btree (business\_id, lower(TRIM(BOTH FROM cust\_name))) WHERE (is\_deleted = false) |
| public | customers | idx\_customers\_lean\_dropdown | CREATE INDEX idx\_customers\_lean\_dropdown ON public.customers USING btree (business\_id, cust\_name, cust\_phone, cust\_id) WHERE (is\_deleted = false) |
| public | customers | idx\_customers\_phone\_trgm | CREATE INDEX idx\_customers\_phone\_trgm ON public.customers USING gin (cust\_phone gin\_trgm\_ops) |
| public | customers | idx\_customers\_name\_trgm | CREATE INDEX idx\_customers\_name\_trgm ON public.customers USING gin (cust\_name gin\_trgm\_ops) |
| public | customers | idx\_customers\_updated | CREATE INDEX idx\_customers\_updated ON public.customers USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |
| public | customers | idx\_customers\_business\_name | CREATE INDEX idx\_customers\_business\_name ON public.customers USING btree (business\_id, cust\_name) WHERE (is\_deleted = false) |
| public | customers | idx\_customers\_business\_updated | CREATE INDEX idx\_customers\_business\_updated ON public.customers USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |
| public | customers | idx\_customers\_cust\_name | CREATE INDEX idx\_customers\_cust\_name ON public.customers USING btree (cust\_name) |
| public | customers | idx\_customers\_email\_trgm | CREATE INDEX idx\_customers\_email\_trgm ON public.customers USING gin (cust\_email gin\_trgm\_ops) |
| public | expenses | idx\_expenses\_date | CREATE INDEX idx\_expenses\_date ON public.expenses USING btree (business\_id, expense\_date DESC) |
| public | expenses | expenses\_pkey | CREATE UNIQUE INDEX expenses\_pkey ON public.expenses USING btree (expense\_id) |
| public | expenses | idx\_expenses\_business\_deleted | CREATE INDEX idx\_expenses\_business\_deleted ON public.expenses USING btree (business\_id, is\_deleted) |
| public | expenses | uix\_expenses\_source | CREATE UNIQUE INDEX uix\_expenses\_source ON public.expenses USING btree (business\_id, source\_type, source\_id) WHERE ((is\_deleted = false) AND (source\_type IS NOT NULL)) |
| public | low\_stock\_alerts | low\_stock\_alerts\_pkey | CREATE UNIQUE INDEX low\_stock\_alerts\_pkey ON public.low\_stock\_alerts USING btree (alert\_id) |
| public | low\_stock\_alerts | idx\_low\_stock\_alerts\_business | CREATE INDEX idx\_low\_stock\_alerts\_business ON public.low\_stock\_alerts USING btree (business\_id, alert\_status) |
| public | mv\_dashboard\_summary | idx\_mv\_dashboard\_summary\_pk | CREATE UNIQUE INDEX idx\_mv\_dashboard\_summary\_pk ON public.mv\_dashboard\_summary USING btree (business\_id) |
| public | mv\_sales\_trend\_monthly | idx\_mv\_sales\_trend\_monthly\_pk | CREATE UNIQUE INDEX idx\_mv\_sales\_trend\_monthly\_pk ON public.mv\_sales\_trend\_monthly USING btree (business\_id, year\_month) |
| public | payments | payments\_pkey | CREATE UNIQUE INDEX payments\_pkey ON public.payments USING btree (payment\_id) |
| public | payments | idx\_payments\_business\_active\_paid\_at | CREATE INDEX idx\_payments\_business\_active\_paid\_at ON public.payments USING btree (business\_id, is\_active, payment\_paid\_at DESC) |
| public | payments | idx\_payments\_sale | CREATE INDEX idx\_payments\_sale ON public.payments USING btree (business\_id, sale\_id) |
| public | payments | idx\_payments\_sale\_active | CREATE INDEX idx\_payments\_sale\_active ON public.payments USING btree (sale\_id, is\_active) |
| public | payments | idx\_payments\_business\_active | CREATE INDEX idx\_payments\_business\_active ON public.payments USING btree (business\_id, is\_active) |
| public | payments | idx\_payments\_sale\_id | CREATE INDEX idx\_payments\_sale\_id ON public.payments USING btree (sale\_id) |
| public | payments | idx\_payments\_business\_method\_date | CREATE INDEX idx\_payments\_business\_method\_date ON public.payments USING btree (business\_id, payment\_method, payment\_paid\_at DESC) WHERE (is\_active = true) |
| public | permissions | permissions\_pkey | CREATE UNIQUE INDEX permissions\_pkey ON public.permissions USING btree (id) |
| public | permissions | permissions\_code\_key | CREATE UNIQUE INDEX permissions\_code\_key ON public.permissions USING btree (code) |
| public | products | idx\_products\_business\_updated | CREATE INDEX idx\_products\_business\_updated ON public.products USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |
| public | products | idx\_products\_updated | CREATE INDEX idx\_products\_updated ON public.products USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |
| public | products | products\_pkey | CREATE UNIQUE INDEX products\_pkey ON public.products USING btree (prod\_id) |
| public | products | idx\_products\_business\_deleted | CREATE INDEX idx\_products\_business\_deleted ON public.products USING btree (business\_id, is\_deleted) |
| public | products | idx\_products\_barcode | CREATE INDEX idx\_products\_barcode ON public.products USING btree (barcode) WHERE (barcode IS NOT NULL) |
| public | products | idx\_products\_category | CREATE INDEX idx\_products\_category ON public.products USING btree (category\_id) WHERE (category\_id IS NOT NULL) |
| public | products | uix\_products\_name\_business | CREATE UNIQUE INDEX uix\_products\_name\_business ON public.products USING btree (business\_id, lower(TRIM(BOTH FROM prod\_name))) WHERE (is\_deleted = false) |
| public | products | uix\_products\_barcode\_business | CREATE UNIQUE INDEX uix\_products\_barcode\_business ON public.products USING btree (business\_id, barcode) WHERE (barcode IS NOT NULL) |
| public | products | idx\_products\_business\_name\_active | CREATE INDEX idx\_products\_business\_name\_active ON public.products USING btree (business\_id, prod\_name) WHERE (is\_deleted = false) |
| public | products | idx\_products\_business\_barcode\_active | CREATE INDEX idx\_products\_business\_barcode\_active ON public.products USING btree (business\_id, barcode) WHERE ((is\_deleted = false) AND (barcode IS NOT NULL)) |
| public | products | idx\_products\_name\_trgm | CREATE INDEX idx\_products\_name\_trgm ON public.products USING gin (prod\_name gin\_trgm\_ops) WHERE (is\_deleted = false) |
| public | products | idx\_products\_barcode\_trgm | CREATE INDEX idx\_products\_barcode\_trgm ON public.products USING gin (barcode gin\_trgm\_ops) WHERE ((barcode IS NOT NULL) AND (is\_deleted = false)) |
| public | products | idx\_products\_business\_category\_active | CREATE INDEX idx\_products\_business\_category\_active ON public.products USING btree (business\_id, category\_id) WHERE (is\_deleted = false) |
| public | profiles | ix\_profiles\_last\_logout\_at | CREATE INDEX ix\_profiles\_last\_logout\_at ON public.profiles USING btree (last\_logout\_at) |
| public | profiles | idx\_profiles\_business\_id | CREATE INDEX idx\_profiles\_business\_id ON public.profiles USING btree (business\_id) |
| public | profiles | idx\_profiles\_id\_active | CREATE INDEX idx\_profiles\_id\_active ON public.profiles USING btree (id) WHERE (is\_active = true) |
| public | profiles | profiles\_email\_unique | CREATE UNIQUE INDEX profiles\_email\_unique ON public.profiles USING btree (email) |
| public | profiles | profiles\_pkey | CREATE UNIQUE INDEX profiles\_pkey ON public.profiles USING btree (id) |
| public | purchase\_items | idx\_purchase\_items\_business\_purchase | CREATE INDEX idx\_purchase\_items\_business\_purchase ON public.purchase\_items USING btree (business\_id, pur\_id) |
| public | purchase\_items | idx\_purchase\_items\_purchase\_id | CREATE INDEX idx\_purchase\_items\_purchase\_id ON public.purchase\_items USING btree (pur\_id) |
| public | purchase\_items | idx\_purchase\_items\_business\_product | CREATE INDEX idx\_purchase\_items\_business\_product ON public.purchase\_items USING btree (business\_id, product\_id) |
| public | purchase\_items | idx\_purchase\_items\_product\_id | CREATE INDEX idx\_purchase\_items\_product\_id ON public.purchase\_items USING btree (product\_id) |
| public | purchase\_items | purchase\_items\_pkey | CREATE UNIQUE INDEX purchase\_items\_pkey ON public.purchase\_items USING btree (item\_id) |
| public | purchase\_return\_items | idx\_purchase\_return\_items\_return | CREATE INDEX idx\_purchase\_return\_items\_return ON public.purchase\_return\_items USING btree (return\_id) |
| public | purchase\_return\_items | idx\_pur\_return\_items\_business | CREATE INDEX idx\_pur\_return\_items\_business ON public.purchase\_return\_items USING btree (business\_id) |
| public | purchase\_return\_items | purchase\_return\_items\_pkey | CREATE UNIQUE INDEX purchase\_return\_items\_pkey ON public.purchase\_return\_items USING btree (return\_item\_id) |
| public | purchase\_returns | idx\_purchase\_returns\_purchase | CREATE INDEX idx\_purchase\_returns\_purchase ON public.purchase\_returns USING btree (business\_id, pur\_id) |
| public | purchase\_returns | idx\_purchase\_returns\_purchase\_id | CREATE INDEX idx\_purchase\_returns\_purchase\_id ON public.purchase\_returns USING btree (pur\_id) |
| public | purchase\_returns | idx\_purchase\_returns\_business\_status\_date | CREATE INDEX idx\_purchase\_returns\_business\_status\_date ON public.purchase\_returns USING btree (business\_id, return\_status, return\_created\_at DESC) |
| public | purchase\_returns | idx\_purchase\_returns\_business\_date | CREATE INDEX idx\_purchase\_returns\_business\_date ON public.purchase\_returns USING btree (business\_id, return\_created\_at DESC) |
| public | purchase\_returns | idx\_purchase\_returns\_status | CREATE INDEX idx\_purchase\_returns\_status ON public.purchase\_returns USING btree (business\_id, return\_status) |
| public | purchase\_returns | idx\_purchase\_returns\_pur | CREATE INDEX idx\_purchase\_returns\_pur ON public.purchase\_returns USING btree (pur\_id) |
| public | purchase\_returns | idx\_purchase\_returns\_business | CREATE INDEX idx\_purchase\_returns\_business ON public.purchase\_returns USING btree (business\_id) |
| public | purchase\_returns | purchase\_returns\_pkey | CREATE UNIQUE INDEX purchase\_returns\_pkey ON public.purchase\_returns USING btree (return\_id) |
| public | purchases | purchases\_pkey | CREATE UNIQUE INDEX purchases\_pkey ON public.purchases USING btree (pur\_id) |
| public | purchases | idx\_purchases\_payment\_status | CREATE INDEX idx\_purchases\_payment\_status ON public.purchases USING btree (business\_id, pur\_payment\_status) WHERE (is\_deleted = false) |
| public | purchases | idx\_purchases\_business\_deleted | CREATE INDEX idx\_purchases\_business\_deleted ON public.purchases USING btree (business\_id, is\_deleted) |
| public | purchases | idx\_purchases\_supplier | CREATE INDEX idx\_purchases\_supplier ON public.purchases USING btree (supp\_id) WHERE (supp\_id IS NOT NULL) |
| public | purchases | idx\_purchases\_created\_at | CREATE INDEX idx\_purchases\_created\_at ON public.purchases USING btree (business\_id, pur\_created\_at DESC) |
| public | role\_permissions | role\_permissions\_pkey | CREATE UNIQUE INDEX role\_permissions\_pkey ON public.role\_permissions USING btree (role\_id, permission\_id) |
| public | role\_permissions | idx\_role\_permissions\_role\_id | CREATE INDEX idx\_role\_permissions\_role\_id ON public.role\_permissions USING btree (role\_id) |
| public | roles | roles\_name\_key | CREATE UNIQUE INDEX roles\_name\_key ON public.roles USING btree (name) |
| public | roles | roles\_pkey | CREATE UNIQUE INDEX roles\_pkey ON public.roles USING btree (id) |
| public | sale\_items | idx\_sale\_items\_sale\_biz | CREATE INDEX idx\_sale\_items\_sale\_biz ON public.sale\_items USING btree (sale\_id, business\_id) |
| public | sale\_items | sale\_items\_pkey | CREATE UNIQUE INDEX sale\_items\_pkey ON public.sale\_items USING btree (sale\_item\_id) |
| public | sale\_items | idx\_sale\_items\_sale\_id | CREATE INDEX idx\_sale\_items\_sale\_id ON public.sale\_items USING btree (sale\_id) |
| public | sale\_items | idx\_sale\_items\_business | CREATE INDEX idx\_sale\_items\_business ON public.sale\_items USING btree (business\_id) |
| public | sale\_items | idx\_sale\_items\_business\_product | CREATE INDEX idx\_sale\_items\_business\_product ON public.sale\_items USING btree (business\_id, product\_id) |
| public | sale\_items | idx\_sale\_items\_business\_sale | CREATE INDEX idx\_sale\_items\_business\_sale ON public.sale\_items USING btree (business\_id, sale\_id) |
| public | sale\_items | idx\_sale\_items\_product\_id | CREATE INDEX idx\_sale\_items\_product\_id ON public.sale\_items USING btree (product\_id) |
| public | sales | idx\_sales\_payment\_status | CREATE INDEX idx\_sales\_payment\_status ON public.sales USING btree (business\_id, sales\_payment\_status) WHERE (is\_deleted = false) |
| public | sales | idx\_sales\_invoice\_trgm | CREATE INDEX idx\_sales\_invoice\_trgm ON public.sales USING gin (invoice\_no gin\_trgm\_ops) WHERE (is\_deleted = false) |
| public | sales | idx\_sales\_invoice\_no | CREATE INDEX idx\_sales\_invoice\_no ON public.sales USING btree (invoice\_no) |
| public | sales | idx\_sales\_customer\_history | CREATE INDEX idx\_sales\_customer\_history ON public.sales USING btree (business\_id, customer\_id, sales\_created\_at DESC) WHERE (is\_deleted = false) |
| public | sales | idx\_sales\_biz\_created | CREATE INDEX idx\_sales\_biz\_created ON public.sales USING btree (business\_id, sales\_created\_at) |
| public | sales | sales\_pkey | CREATE UNIQUE INDEX sales\_pkey ON public.sales USING btree (sales\_id) |
| public | sales | sales\_invoice\_no\_key | CREATE UNIQUE INDEX sales\_invoice\_no\_key ON public.sales USING btree (invoice\_no) |
| public | sales | idx\_sales\_business\_id | CREATE INDEX idx\_sales\_business\_id ON public.sales USING btree (business\_id) WHERE (is\_deleted = false) |
| public | sales | idx\_sales\_created\_at | CREATE INDEX idx\_sales\_created\_at ON public.sales USING btree (business\_id, sales\_created\_at DESC) WHERE (is\_deleted = false) |
| public | sales | idx\_sales\_business\_deleted | CREATE INDEX idx\_sales\_business\_deleted ON public.sales USING btree (business\_id, is\_deleted) |
| public | sales | idx\_sales\_customer | CREATE INDEX idx\_sales\_customer ON public.sales USING btree (customer\_id) WHERE (customer\_id IS NOT NULL) |
| public | sales | idx\_sales\_customer\_payment | CREATE INDEX idx\_sales\_customer\_payment ON public.sales USING btree (business\_id, customer\_id, sales\_payment\_status) WHERE (is\_deleted = false) |
| public | sales | idx\_sales\_business\_status\_date | CREATE INDEX idx\_sales\_business\_status\_date ON public.sales USING btree (business\_id, sales\_payment\_status, sales\_created\_at DESC) WHERE (is\_deleted = false) |
| public | sales\_return\_items | ux\_return\_item\_unique | CREATE UNIQUE INDEX ux\_return\_item\_unique ON public.sales\_return\_items USING btree (return\_id, sale\_item\_id) |
| public | sales\_return\_items | idx\_return\_items\_product\_id | CREATE INDEX idx\_return\_items\_product\_id ON public.sales\_return\_items USING btree (product\_id) |
| public | sales\_return\_items | sales\_return\_items\_pkey | CREATE UNIQUE INDEX sales\_return\_items\_pkey ON public.sales\_return\_items USING btree (return\_item\_id) |
| public | sales\_return\_items | idx\_sales\_return\_items\_sale\_item | CREATE INDEX idx\_sales\_return\_items\_sale\_item ON public.sales\_return\_items USING btree (sale\_item\_id) |
| public | sales\_return\_items | idx\_sales\_return\_items\_return | CREATE INDEX idx\_sales\_return\_items\_return ON public.sales\_return\_items USING btree (return\_id) |
| public | sales\_returns | idx\_sales\_returns\_sale\_id | CREATE INDEX idx\_sales\_returns\_sale\_id ON public.sales\_returns USING btree (sale\_id) |
| public | sales\_returns | idx\_sales\_returns\_business\_date | CREATE INDEX idx\_sales\_returns\_business\_date ON public.sales\_returns USING btree (business\_id, return\_created\_at DESC) |
| public | sales\_returns | idx\_sales\_returns\_status | CREATE INDEX idx\_sales\_returns\_status ON public.sales\_returns USING btree (business\_id, return\_status) |
| public | sales\_returns | idx\_sales\_returns\_business | CREATE INDEX idx\_sales\_returns\_business ON public.sales\_returns USING btree (business\_id) |
| public | sales\_returns | idx\_sales\_returns\_sale | CREATE INDEX idx\_sales\_returns\_sale ON public.sales\_returns USING btree (sale\_id) |
| public | sales\_returns | sales\_returns\_pkey | CREATE UNIQUE INDEX sales\_returns\_pkey ON public.sales\_returns USING btree (return\_id) |
| public | sales\_returns | idx\_sales\_returns\_business\_status\_date | CREATE INDEX idx\_sales\_returns\_business\_status\_date ON public.sales\_returns USING btree (business\_id, return\_status, return\_created\_at DESC) |
| public | stock\_movements | idx\_stock\_movements\_biz\_created | CREATE INDEX idx\_stock\_movements\_biz\_created ON public.stock\_movements USING btree (business\_id, move\_created\_at) |
| public | stock\_movements | idx\_stock\_movements\_product | CREATE INDEX idx\_stock\_movements\_product ON public.stock\_movements USING btree (product\_id) |
| public | stock\_movements | idx\_stock\_movements\_business | CREATE INDEX idx\_stock\_movements\_business ON public.stock\_movements USING btree (business\_id) |
| public | stock\_movements | idx\_stock\_movements\_created | CREATE INDEX idx\_stock\_movements\_created ON public.stock\_movements USING btree (product\_id, move\_created\_at DESC) |
| public | stock\_movements | idx\_stock\_movements\_product\_biz | CREATE INDEX idx\_stock\_movements\_product\_biz ON public.stock\_movements USING btree (business\_id, product\_id, move\_created\_at DESC) |
| public | stock\_movements | idx\_stock\_movements\_sale\_ref | CREATE INDEX idx\_stock\_movements\_sale\_ref ON public.stock\_movements USING btree (sale\_reference\_id) WHERE (sale\_reference\_id IS NOT NULL) |
| public | stock\_movements | idx\_stock\_movements\_business\_created | CREATE INDEX idx\_stock\_movements\_business\_created ON public.stock\_movements USING btree (business\_id, move\_created\_at DESC) |
| public | stock\_movements | idx\_stock\_movements\_biz\_type\_date | CREATE INDEX idx\_stock\_movements\_biz\_type\_date ON public.stock\_movements USING btree (business\_id, move\_type, move\_created\_at DESC) |
| public | stock\_movements | idx\_stock\_movements\_biz\_product\_type | CREATE INDEX idx\_stock\_movements\_biz\_product\_type ON public.stock\_movements USING btree (business\_id, product\_id, move\_type) |
| public | stock\_movements | idx\_stock\_movements\_product\_id | CREATE INDEX idx\_stock\_movements\_product\_id ON public.stock\_movements USING btree (product\_id) |
| public | stock\_movements | stock\_movements\_pkey | CREATE UNIQUE INDEX stock\_movements\_pkey ON public.stock\_movements USING btree (move\_id) |
| public | super\_admins | super\_admins\_user\_id\_key | CREATE UNIQUE INDEX super\_admins\_user\_id\_key ON public.super\_admins USING btree (user\_id) |
| public | super\_admins | super\_admins\_pkey | CREATE UNIQUE INDEX super\_admins\_pkey ON public.super\_admins USING btree (id) |
| public | suppliers | idx\_suppliers\_email\_trgm | CREATE INDEX idx\_suppliers\_email\_trgm ON public.suppliers USING gin (supp\_email gin\_trgm\_ops) |
| public | suppliers | idx\_suppliers\_name\_trgm | CREATE INDEX idx\_suppliers\_name\_trgm ON public.suppliers USING gin (supp\_name gin\_trgm\_ops) |
| public | suppliers | idx\_suppliers\_phone\_trgm | CREATE INDEX idx\_suppliers\_phone\_trgm ON public.suppliers USING gin (supp\_phone gin\_trgm\_ops) WHERE (supp\_phone IS NOT NULL) |
| public | suppliers | idx\_suppliers\_business\_deleted | CREATE INDEX idx\_suppliers\_business\_deleted ON public.suppliers USING btree (business\_id, is\_deleted) |
| public | suppliers | idx\_suppliers\_updated | CREATE INDEX idx\_suppliers\_updated ON public.suppliers USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |
| public | suppliers | suppliers\_pkey | CREATE UNIQUE INDEX suppliers\_pkey ON public.suppliers USING btree (supp\_id) |
| public | suppliers | idx\_suppliers\_phone | CREATE INDEX idx\_suppliers\_phone ON public.suppliers USING btree (supp\_phone) WHERE (supp\_phone IS NOT NULL) |
| public | suppliers | idx\_suppliers\_business\_updated | CREATE INDEX idx\_suppliers\_business\_updated ON public.suppliers USING btree (business\_id, updated\_at DESC) WHERE (is\_deleted = false) |

## triggers
| table\_name | trigger\_name | event\_manipulation | action\_timing | action\_statement |
| --- | --- | --- | --- | --- |
| businesses | trg\_businesses\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| categories | trg\_audit\_categories | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| categories | trg\_categories\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| categories | trg\_categories\_updated\_by | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_by() |
| categories | trg\_audit\_categories | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| categories | trg\_audit\_categories | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| customers | trg\_audit\_customers | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| customers | trg\_audit\_customers | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| customers | trg\_customers\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| customers | trg\_audit\_customers | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| expenses | trg\_audit\_expenses | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| expenses | trg\_expenses\_updated\_by | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_by() |
| expenses | trg\_expenses\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| expenses | trg\_audit\_expenses | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| expenses | trg\_audit\_expenses | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| low\_stock\_alerts | trg\_low\_stock\_alerts\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| payments | trg\_payments\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| payments | trg\_audit\_payments | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| payments | trg\_audit\_payments | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| payments | trg\_audit\_payments | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| products | trg\_products\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| products | trg\_audit\_products | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| products | trg\_audit\_products | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| products | trg\_audit\_products | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| products | trg\_low\_stock\_alert | UPDATE | AFTER | EXECUTE FUNCTION fn\_low\_stock\_alert() |
| profiles | trg\_profiles\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| purchase\_items | trg\_audit\_purchase\_items | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| purchase\_items | trg\_purchase\_stock\_movement | INSERT | AFTER | EXECUTE FUNCTION fn\_purchase\_stock\_movement() |
| purchase\_items | trg\_audit\_purchase\_items | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| purchase\_items | trg\_audit\_purchase\_items | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| purchase\_returns | trg\_purchase\_returns\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| purchases | trg\_audit\_purchases | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| purchases | trg\_audit\_purchases | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| purchases | trg\_purchases\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| purchases | trg\_audit\_purchases | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sale\_items | trg\_audit\_sale\_items | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sale\_items | trg\_sale\_stock\_movement | INSERT | AFTER | EXECUTE FUNCTION fn\_sale\_stock\_movement() |
| sale\_items | trg\_audit\_sale\_items | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sale\_items | trg\_audit\_sale\_items | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sales | trg\_sales\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| sales | trg\_audit\_sales | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sales | trg\_audit\_sales | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sales | trg\_audit\_sales | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sales\_return\_items | trg\_recalculate\_return\_total | UPDATE | AFTER | EXECUTE FUNCTION fn\_recalculate\_return\_total() |
| sales\_return\_items | trg\_validate\_sales\_return\_items | INSERT | BEFORE | EXECUTE FUNCTION fn\_validate\_sales\_return\_items() |
| sales\_return\_items | trg\_validate\_sales\_return\_items | UPDATE | BEFORE | EXECUTE FUNCTION fn\_validate\_sales\_return\_items() |
| sales\_return\_items | trg\_recalculate\_return\_total | INSERT | AFTER | EXECUTE FUNCTION fn\_recalculate\_return\_total() |
| sales\_return\_items | trg\_recalculate\_return\_total | DELETE | AFTER | EXECUTE FUNCTION fn\_recalculate\_return\_total() |
| sales\_returns | trg\_sales\_return\_stock | UPDATE | AFTER | EXECUTE FUNCTION fn\_sales\_return\_stock() |
| sales\_returns | trg\_sales\_return\_stock | INSERT | AFTER | EXECUTE FUNCTION fn\_sales\_return\_stock() |
| sales\_returns | trg\_audit\_sales\_returns | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sales\_returns | trg\_audit\_sales\_returns | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| sales\_returns | trg\_sales\_returns\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |
| sales\_returns | trg\_audit\_sales\_returns | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| suppliers | trg\_suppliers\_updated\_by | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_by() |
| suppliers | trg\_audit\_suppliers | UPDATE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| suppliers | trg\_audit\_suppliers | DELETE | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| suppliers | trg\_audit\_suppliers | INSERT | AFTER | EXECUTE FUNCTION fn\_audit\_log() |
| suppliers | trg\_suppliers\_updated\_at | UPDATE | BEFORE | EXECUTE FUNCTION fn\_set\_updated\_at() |

## triggers_function
| function\_name | function\_definition |
| --- | --- |
| fn\_audit\_log | CREATE OR REPLACE FUNCTION public.fn\_audit\_log()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n v\_business\_id UUID;\_x000D\_\n v\_user\_id UUID;\_x000D\_\n v\_record\_id UUID;\_x000D\_\n v\_old\_data JSONB;\_x000D\_\n v\_new\_data JSONB;\_x000D\_\n v\_pk\_name TEXT;\_x000D\_\n v\_row\_data JSONB;\_x000D\_\nBEGIN\_x000D\_\n -- Build JSONB representation of the affected row\_x000D\_\n IF TG\_OP IN ('INSERT', 'UPDATE') THEN\_x000D\_\n v\_new\_data := to\_jsonb(NEW.\*);\_x000D\_\n v\_row\_data := v\_new\_data;\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n IF TG\_OP IN ('DELETE', 'UPDATE') THEN\_x000D\_\n v\_old\_data := to\_jsonb(OLD.\*);\_x000D\_\n IF TG\_OP = 'DELETE' THEN\_x000D\_\n v\_row\_data := v\_old\_data;\_x000D\_\n END IF;\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Dynamically resolve the primary key column name from system catalogs\_x000D\_\n SELECT a.attname INTO v\_pk\_name\_x000D\_\n FROM pg\_index i\_x000D\_\n JOIN pg\_attribute a ON a.attrelid = i.indrelid\_x000D\_\n AND a.attnum = ANY(i.indkey)\_x000D\_\n WHERE i.indrelid = TG\_RELID\_x000D\_\n AND i.indisprimary\_x000D\_\n LIMIT 1;\_x000D\_\n\_x000D\_\n -- Extract the primary key value from the row's JSONB representation\_x000D\_\n v\_record\_id := (v\_row\_data ->> v\_pk\_name)::uuid;\_x000D\_\n\_x000D\_\n -- Determine business\_id\_x000D\_\n v\_business\_id := (v\_row\_data ->> 'business\_id')::uuid;\_x000D\_\n\_x000D\_\n -- Use the user\_id set by the application via SET LOCAL app.current\_user\_id.\_x000D\_\n -- Falls back to NULL if the setting was not set (e.g. direct SQL queries).\_x000D\_\n v\_user\_id := current\_setting('app.current\_user\_id', true)::uuid;\_x000D\_\n\_x000D\_\n INSERT INTO audit\_logs (\_x000D\_\n business\_id, user\_id, action\_type, table\_name,\_x000D\_\n record\_id, old\_data, new\_data\_x000D\_\n ) VALUES (\_x000D\_\n v\_business\_id,\_x000D\_\n v\_user\_id,\_x000D\_\n LOWER(TG\_OP),\_x000D\_\n TG\_TABLE\_NAME,\_x000D\_\n v\_record\_id,\_x000D\_\n v\_old\_data,\_x000D\_\n v\_new\_data\_x000D\_\n );\_x000D\_\n\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_low\_stock\_alert | CREATE OR REPLACE FUNCTION public.fn\_low\_stock\_alert()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nBEGIN\_x000D\_\n IF NEW.prod\_stock\_qty <= NEW.prod\_low\_stock\_alert THEN\_x000D\_\n INSERT INTO low\_stock\_alerts (\_x000D\_\n business\_id,\_x000D\_\n product\_id,\_x000D\_\n alert\_stock\_qty,\_x000D\_\n alert\_threshold\_x000D\_\n ) VALUES (\_x000D\_\n NEW.business\_id,\_x000D\_\n NEW.prod\_id,\_x000D\_\n NEW.prod\_stock\_qty,\_x000D\_\n NEW.prod\_low\_stock\_alert\_x000D\_\n );\_x000D\_\n END IF;\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_purchase\_stock\_movement | CREATE OR REPLACE FUNCTION public.fn\_purchase\_stock\_movement()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n v\_prev\_stock INT;\_x000D\_\nBEGIN\_x000D\_\n SELECT prod\_stock\_qty INTO v\_prev\_stock\_x000D\_\n FROM products\_x000D\_\n WHERE prod\_id = NEW.product\_id;\_x000D\_\n\_x000D\_\n INSERT INTO stock\_movements (\_x000D\_\n business\_id,\_x000D\_\n product\_id,\_x000D\_\n move\_type,\_x000D\_\n move\_qty,\_x000D\_\n move\_prev\_stock,\_x000D\_\n purchase\_reference\_id,\_x000D\_\n move\_notes\_x000D\_\n ) VALUES (\_x000D\_\n NEW.business\_id,\_x000D\_\n NEW.product\_id,\_x000D\_\n 'purchase',\_x000D\_\n +NEW.pur\_item\_qty,\_x000D\_\n v\_prev\_stock,\_x000D\_\n NEW.pur\_id,\_x000D\_\n 'Auto entry from purchase'\_x000D\_\n );\_x000D\_\n\_x000D\_\n UPDATE products\_x000D\_\n SET prod\_stock\_qty = prod\_stock\_qty + NEW.pur\_item\_qty,\_x000D\_\n updated\_at = NOW()\_x000D\_\n WHERE prod\_id = NEW.product\_id;\_x000D\_\n\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_recalculate\_return\_total | CREATE OR REPLACE FUNCTION public.fn\_recalculate\_return\_total()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n v\_return\_id UUID;\_x000D\_\nBEGIN\_x000D\_\n -- Detect affected return\_id\_x000D\_\n IF TG\_OP = 'DELETE' THEN\_x000D\_\n v\_return\_id := OLD.return\_id;\_x000D\_\n ELSE\_x000D\_\n v\_return\_id := NEW.return\_id;\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Recalculate total refund amount\_x000D\_\n UPDATE sales\_returns sr\_x000D\_\n SET return\_amount = COALESCE((\_x000D\_\n SELECT SUM(\_x000D\_\n (return\_qty \* unit\_price) + COALESCE(tax\_amount,0)\_x000D\_\n )\_x000D\_\n FROM sales\_return\_items\_x000D\_\n WHERE return\_id = v\_return\_id\_x000D\_\n ),0)\_x000D\_\n WHERE sr.return\_id = v\_return\_id;\_x000D\_\n\_x000D\_\n RETURN NULL;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_sale\_stock\_movement | CREATE OR REPLACE FUNCTION public.fn\_sale\_stock\_movement()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n v\_prev\_stock INT;\_x000D\_\n v\_tax\_rate NUMERIC;\_x000D\_\n v\_total\_tax NUMERIC;\_x000D\_\n v\_subtotal NUMERIC;\_x000D\_\n v\_country VARCHAR;\_x000D\_\n v\_biz\_state TEXT;\_x000D\_\n v\_cust\_state VARCHAR;\_x000D\_\n v\_cust\_country VARCHAR;\_x000D\_\n v\_cgst NUMERIC := 0;\_x000D\_\n v\_sgst NUMERIC := 0;\_x000D\_\n v\_igst NUMERIC := 0;\_x000D\_\n v\_tax\_amt NUMERIC := 0;\_x000D\_\nBEGIN\_x000D\_\n\_x000D\_\n -- ── STEP 1+2: products — one SELECT for stock qty and tax rate ─────────────\_x000D\_\n SELECT prod\_stock\_qty,\_x000D\_\n COALESCE(tax\_rate, 0)\_x000D\_\n INTO v\_prev\_stock,\_x000D\_\n v\_tax\_rate\_x000D\_\n FROM products\_x000D\_\n WHERE prod\_id = NEW.product\_id;\_x000D\_\n\_x000D\_\n IF v\_prev\_stock < NEW.sale\_item\_quantity THEN\_x000D\_\n RAISE EXCEPTION 'Insufficient stock! Only % units available.', v\_prev\_stock;\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- ── STEPS 3+4: business + customer — cached per sale\_id ──────────────────\_x000D\_\n --\_x000D\_\n -- The temp table \_sbr\_sale\_ctx caches (sale\_id, country, biz\_state,\_x000D\_\n -- cust\_state, cust\_country) for the transaction duration.\_x000D\_\n -- First item on a given sale\_id: table does not exist → create and populate.\_x000D\_\n -- Subsequent items: SELECT from cache (zero extra DB hits).\_x000D\_\n -- ON COMMIT DROP = automatic cleanup, zero maintenance risk.\_x000D\_\n --\_x000D\_\n BEGIN\_x000D\_\n SELECT country, biz\_state, cust\_state, cust\_country\_x000D\_\n INTO v\_country, v\_biz\_state, v\_cust\_state, v\_cust\_country\_x000D\_\n FROM \_sbr\_sale\_ctx\_x000D\_\n WHERE sale\_id = NEW.sale\_id;\_x000D\_\n\_x000D\_\n EXCEPTION WHEN undefined\_table THEN\_x000D\_\n\_x000D\_\n CREATE TEMP TABLE \_sbr\_sale\_ctx (\_x000D\_\n sale\_id UUID PRIMARY KEY,\_x000D\_\n country VARCHAR,\_x000D\_\n biz\_state TEXT,\_x000D\_\n cust\_state VARCHAR,\_x000D\_\n cust\_country VARCHAR\_x000D\_\n ) ON COMMIT DROP;\_x000D\_\n\_x000D\_\n SELECT COALESCE(business\_country\_code, ''),\_x000D\_\n COALESCE(business\_state, '')\_x000D\_\n INTO v\_country, v\_biz\_state\_x000D\_\n FROM businesses\_x000D\_\n WHERE business\_id = NEW.business\_id;\_x000D\_\n\_x000D\_\n -- Walk-in customers (customer\_id IS NULL) → cust\_state='', cust\_country=''\_x000D\_\n SELECT COALESCE(c.cust\_state, ''),\_x000D\_\n COALESCE(c.cust\_country\_code, '')\_x000D\_\n INTO v\_cust\_state, v\_cust\_country\_x000D\_\n FROM sales s\_x000D\_\n LEFT JOIN customers c ON c.cust\_id = s.customer\_id\_x000D\_\n WHERE s.sales\_id = NEW.sale\_id;\_x000D\_\n\_x000D\_\n INSERT INTO \_sbr\_sale\_ctx (sale\_id, country, biz\_state, cust\_state, cust\_country)\_x000D\_\n VALUES (NEW.sale\_id, v\_country, v\_biz\_state, v\_cust\_state, v\_cust\_country);\_x000D\_\n\_x000D\_\n END;\_x000D\_\n\_x000D\_\n -- ── STEP 5: Tax calculation using the full global rule set ────────────────\_x000D\_\n v\_subtotal := NEW.sale\_item\_quantity \* NEW.sale\_item\_unit\_price;\_x000D\_\n v\_total\_tax := (v\_subtotal \* v\_tax\_rate) / 100;\_x000D\_\n\_x000D\_\n IF v\_country = 'IN' THEN\_x000D\_\n\_x000D\_\n -- Rule 1: Customer is outside India → IGST (cross-border supply)\_x000D\_\n -- Only fires when cust\_country is explicitly set and is non-India.\_x000D\_\n -- Walk-in (cust\_country = '') skips this and falls through to state rules.\_x000D\_\n IF v\_cust\_country != '' AND v\_cust\_country != 'IN' THEN\_x000D\_\n v\_igst := round(v\_total\_tax, 2);\_x000D\_\n\_x000D\_\n -- Rule 2: Customer in India (or unknown), no state → CGST+SGST (intrastate default)\_x000D\_\n -- Missing state data must never incorrectly trigger IGST.\_x000D\_\n ELSIF v\_cust\_state = '' THEN\_x000D\_\n v\_cgst := round(v\_total\_tax / 2, 2);\_x000D\_\n v\_sgst := round(v\_total\_tax / 2, 2);\_x000D\_\n\_x000D\_\n -- Rule 3: Same state → intrastate (CGST + SGST)\_x000D\_\n ELSIF lower(trim(v\_biz\_state)) = lower(trim(v\_cust\_state)) THEN\_x000D\_\n v\_cgst := round(v\_total\_tax / 2, 2);\_x000D\_\n v\_sgst := round(v\_total\_tax / 2, 2);\_x000D\_\n\_x000D\_\n -- Rule 4: Different state → interstate (IGST)\_x000D\_\n ELSE\_x000D\_\n v\_igst := round(v\_total\_tax, 2);\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n ELSE\_x000D\_\n -- Non-India business: single tax\_amount bucket only\_x000D\_\n v\_tax\_amt := round(v\_total\_tax, 2);\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- ── STEP 6: Write tax columns back to the sale\_item row ───────────────────\_x000D\_\n UPDATE sale\_items\_x000D\_\n SET gst\_rate = v\_tax\_rate,\_x000D\_\n cgst\_amount = v\_cgst,\_x000D\_\n sgst\_amount = v\_sgst,\_x000D\_\n igst\_amount = v\_igst,\_x000D\_\n tax\_amount = v\_tax\_amt\_x000D\_\n WHERE sale\_item\_id = NEW.sale\_item\_id;\_x000D\_\n\_x000D\_\n -- ── STEP 7: Stock movement ledger ─────────────────────────────────────────\_x000D\_\n INSERT INTO stock\_movements (\_x000D\_\n business\_id, product\_id, move\_type,\_x000D\_\n move\_qty, move\_prev\_stock,\_x000D\_\n sale\_reference\_id, move\_notes\_x000D\_\n ) VALUES (\_x000D\_\n NEW.business\_id, NEW.product\_id, 'sale',\_x000D\_\n -NEW.sale\_item\_quantity, v\_prev\_stock,\_x000D\_\n NEW.sale\_id, 'Auto entry from sale'\_x000D\_\n );\_x000D\_\n\_x000D\_\n -- ── STEP 8: Deduct stock ──────────────────────────────────────────────────\_x000D\_\n UPDATE products\_x000D\_\n SET prod\_stock\_qty = prod\_stock\_qty - NEW.sale\_item\_quantity,\_x000D\_\n updated\_at = NOW()\_x000D\_\n WHERE prod\_id = NEW.product\_id;\_x000D\_\n\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_sales\_return\_stock | CREATE OR REPLACE FUNCTION public.fn\_sales\_return\_stock()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n item RECORD;\_x000D\_\n v\_prev\_stock INTEGER;\_x000D\_\n v\_new\_stock INTEGER;\_x000D\_\nBEGIN\_x000D\_\n -- ── Only fire when ALL THREE conditions are true ───────────────\_x000D\_\n -- 1. The new status is 'approved'\_x000D\_\n -- 2. restock flag is TRUE (business wants stock back)\_x000D\_\n -- 3. Something actually changed (avoid re-firing if no change)\_x000D\_\n -- ──────────────────────────────────────────────────────────────\_x000D\_\n IF NEW.return\_status = 'approved'\_x000D\_\n AND NEW.restock = TRUE\_x000D\_\n AND (\_x000D\_\n OLD.return\_status IS DISTINCT FROM 'approved'\_x000D\_\n OR\_x000D\_\n OLD.restock IS DISTINCT FROM TRUE\_x000D\_\n )\_x000D\_\n THEN\_x000D\_\n -- Loop through every item in this return\_x000D\_\n FOR item IN\_x000D\_\n SELECT product\_id, return\_qty\_x000D\_\n FROM sales\_return\_items\_x000D\_\n WHERE return\_id = NEW.return\_id\_x000D\_\n LOOP\_x000D\_\n -- Get current stock before the update\_x000D\_\n SELECT prod\_stock\_qty\_x000D\_\n INTO v\_prev\_stock\_x000D\_\n FROM products\_x000D\_\n WHERE prod\_id = item.product\_id;\_x000D\_\n\_x000D\_\n v\_new\_stock := v\_prev\_stock + item.return\_qty;\_x000D\_\n\_x000D\_\n -- Add the returned stock back to the product\_x000D\_\n UPDATE products\_x000D\_\n SET prod\_stock\_qty = v\_new\_stock\_x000D\_\n WHERE prod\_id = item.product\_id;\_x000D\_\n\_x000D\_\n -- ── THE FIX ───────────────────────────────────────────────\_x000D\_\n -- Do NOT include move\_new\_stock in this INSERT.\_x000D\_\n -- It is a GENERATED ALWAYS AS column — PostgreSQL calculates\_x000D\_\n -- it automatically as (move\_prev\_stock + move\_qty).\_x000D\_\n -- Inserting it manually causes: "cannot insert a non-DEFAULT\_x000D\_\n -- value into column move\_new\_stock".\_x000D\_\n -- ─────────────────────────────────────────────────────────\_x000D\_\n INSERT INTO stock\_movements (\_x000D\_\n move\_id,\_x000D\_\n business\_id,\_x000D\_\n product\_id,\_x000D\_\n move\_type,\_x000D\_\n move\_qty,\_x000D\_\n move\_prev\_stock,\_x000D\_\n reference\_type,\_x000D\_\n reference\_id,\_x000D\_\n move\_notes,\_x000D\_\n move\_created\_by\_x000D\_\n ) VALUES (\_x000D\_\n gen\_random\_uuid(),\_x000D\_\n NEW.business\_id,\_x000D\_\n item.product\_id,\_x000D\_\n 'sales\_return',\_x000D\_\n item.return\_qty,\_x000D\_\n v\_prev\_stock,\_x000D\_\n 'sales\_return',\_x000D\_\n NEW.return\_id,\_x000D\_\n 'Stock added from approved sales return',\_x000D\_\n NEW.created\_by\_x000D\_\n );\_x000D\_\n\_x000D\_\n END LOOP;\_x000D\_\n\_x000D\_\n -- Mark the return as stock\_updated so we don't double-process\_x000D\_\n UPDATE sales\_returns\_x000D\_\n SET stock\_updated = TRUE\_x000D\_\n WHERE return\_id = NEW.return\_id;\_x000D\_\n\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_set\_updated\_at | CREATE OR REPLACE FUNCTION public.fn\_set\_updated\_at()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nBEGIN\_x000D\_\n NEW.updated\_at = now();\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| fn\_set\_updated\_by | CREATE OR REPLACE FUNCTION public.fn\_set\_updated\_by()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\n BEGIN\_x000D\_\n NEW.updated\_by = NULLIF(current\_setting('app.current\_user\_id', true), '')::uuid;\_x000D\_\n RETURN NEW;\_x000D\_\n END;\_x000D\_\n $function$\_x000D\_\n |
| fn\_validate\_sales\_return\_items | CREATE OR REPLACE FUNCTION public.fn\_validate\_sales\_return\_items()\_x000D\_\n RETURNS trigger\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n v\_sale\_id UUID;\_x000D\_\n v\_sold\_qty NUMERIC;\_x000D\_\n v\_sold\_price NUMERIC;\_x000D\_\n v\_total\_returned NUMERIC;\_x000D\_\nBEGIN\_x000D\_\n -- Get the parent sale\_id from sales\_returns\_x000D\_\n SELECT sale\_id INTO v\_sale\_id\_x000D\_\n FROM sales\_returns\_x000D\_\n WHERE return\_id = NEW.return\_id;\_x000D\_\n\_x000D\_\n IF v\_sale\_id IS NULL THEN\_x000D\_\n RAISE EXCEPTION 'Invalid return: parent sale not found';\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Check product exists in original sale\_x000D\_\n SELECT sale\_item\_quantity, sale\_item\_unit\_price\_x000D\_\n INTO v\_sold\_qty, v\_sold\_price\_x000D\_\n FROM sale\_items\_x000D\_\n WHERE sale\_item\_id = NEW.sale\_item\_id\_x000D\_\n AND sale\_id = v\_sale\_id\_x000D\_\n AND product\_id = NEW.product\_id;\_x000D\_\n\_x000D\_\n IF v\_sold\_qty IS NULL THEN\_x000D\_\n RAISE EXCEPTION 'Return rejected: product not in original sale';\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Check unit price not greater than original price\_x000D\_\n IF NEW.unit\_price > v\_sold\_price THEN\_x000D\_\n RAISE EXCEPTION 'Return rejected: price greater than original sale price';\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Get total previously returned qty for this sale item\_x000D\_\n SELECT COALESCE(SUM(return\_qty),0)\_x000D\_\n INTO v\_total\_returned\_x000D\_\n FROM sales\_return\_items sri\_x000D\_\n JOIN sales\_returns sr ON sr.return\_id = sri.return\_id\_x000D\_\n WHERE sri.sale\_item\_id = NEW.sale\_item\_id\_x000D\_\n AND sr.return\_status != 'rejected'\_x000D\_\n AND sri.return\_item\_id != COALESCE(NEW.return\_item\_id, gen\_random\_uuid());\_x000D\_\n\_x000D\_\n -- Ensure cumulative return ≤ sold qty\_x000D\_\n IF (v\_total\_returned + NEW.return\_qty) > v\_sold\_qty THEN\_x000D\_\n RAISE EXCEPTION \_x000D\_\n 'Return rejected: cumulative return qty exceeds sold qty (Sold: %, Already Returned: %, Trying: %)',\_x000D\_\n v\_sold\_qty, v\_total\_returned, NEW.return\_qty;\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Store original values for audit snapshot\_x000D\_\n NEW.original\_qty := v\_sold\_qty;\_x000D\_\n NEW.original\_unit\_price := v\_sold\_price;\_x000D\_\n\_x000D\_\n RETURN NEW;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| get\_next\_invoice\_number | CREATE OR REPLACE FUNCTION public.get\_next\_invoice\_number(p\_business\_id uuid)\_x000D\_\n RETURNS text\_x000D\_\n LANGUAGE plpgsql\_x000D\_\nAS $function$\_x000D\_\nDECLARE\_x000D\_\n new\_counter INT;\_x000D\_\n invoice TEXT;\_x000D\_\n prefix TEXT;\_x000D\_\nBEGIN\_x000D\_\n -- Get custom prefix from business\_settings if set\_x000D\_\n SELECT COALESCE(invoice\_prefix, 'INV')\_x000D\_\n INTO prefix\_x000D\_\n FROM business\_settings\_x000D\_\n WHERE business\_id = p\_business\_id;\_x000D\_\n\_x000D\_\n IF prefix IS NULL THEN\_x000D\_\n prefix := 'INV';\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n -- Lock row to prevent duplicate invoices under concurrent requests\_x000D\_\n UPDATE business\_counters\_x000D\_\n SET invoice\_counter = invoice\_counter + 1,\_x000D\_\n updated\_at = now()\_x000D\_\n WHERE business\_id = p\_business\_id\_x000D\_\n RETURNING invoice\_counter INTO new\_counter;\_x000D\_\n\_x000D\_\n -- If no counter row exists yet, create it\_x000D\_\n IF new\_counter IS NULL THEN\_x000D\_\n INSERT INTO business\_counters (business\_id, invoice\_counter, updated\_at)\_x000D\_\n VALUES (p\_business\_id, 1, now())\_x000D\_\n RETURNING invoice\_counter INTO new\_counter;\_x000D\_\n END IF;\_x000D\_\n\_x000D\_\n invoice := prefix || '-' || LPAD(new\_counter::TEXT, 4, '0');\_x000D\_\n RETURN invoice;\_x000D\_\nEND;\_x000D\_\n$function$\_x000D\_\n |
| gin\_extract\_query\_trgm | CREATE OR REPLACE FUNCTION public.gin\_extract\_query\_trgm(text, internal, smallint, internal, internal, internal, internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gin\_extract\_query\_trgm$function$\_x000D\_\n |
| gin\_extract\_value\_trgm | CREATE OR REPLACE FUNCTION public.gin\_extract\_value\_trgm(text, internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gin\_extract\_value\_trgm$function$\_x000D\_\n |
| gin\_trgm\_consistent | CREATE OR REPLACE FUNCTION public.gin\_trgm\_consistent(internal, smallint, text, integer, internal, internal, internal, internal)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gin\_trgm\_consistent$function$\_x000D\_\n |
| gin\_trgm\_triconsistent | CREATE OR REPLACE FUNCTION public.gin\_trgm\_triconsistent(internal, smallint, text, integer, internal, internal, internal)\_x000D\_\n RETURNS "char"\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gin\_trgm\_triconsistent$function$\_x000D\_\n |
| gtrgm\_compress | CREATE OR REPLACE FUNCTION public.gtrgm\_compress(internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_compress$function$\_x000D\_\n |
| gtrgm\_consistent | CREATE OR REPLACE FUNCTION public.gtrgm\_consistent(internal, text, smallint, oid, internal)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_consistent$function$\_x000D\_\n |
| gtrgm\_decompress | CREATE OR REPLACE FUNCTION public.gtrgm\_decompress(internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_decompress$function$\_x000D\_\n |
| gtrgm\_distance | CREATE OR REPLACE FUNCTION public.gtrgm\_distance(internal, text, smallint, oid, internal)\_x000D\_\n RETURNS double precision\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_distance$function$\_x000D\_\n |
| gtrgm\_in | CREATE OR REPLACE FUNCTION public.gtrgm\_in(cstring)\_x000D\_\n RETURNS gtrgm\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_in$function$\_x000D\_\n |
| gtrgm\_options | CREATE OR REPLACE FUNCTION public.gtrgm\_options(internal)\_x000D\_\n RETURNS void\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_options$function$\_x000D\_\n |
| gtrgm\_out | CREATE OR REPLACE FUNCTION public.gtrgm\_out(gtrgm)\_x000D\_\n RETURNS cstring\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_out$function$\_x000D\_\n |
| gtrgm\_penalty | CREATE OR REPLACE FUNCTION public.gtrgm\_penalty(internal, internal, internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_penalty$function$\_x000D\_\n |
| gtrgm\_picksplit | CREATE OR REPLACE FUNCTION public.gtrgm\_picksplit(internal, internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_picksplit$function$\_x000D\_\n |
| gtrgm\_same | CREATE OR REPLACE FUNCTION public.gtrgm\_same(gtrgm, gtrgm, internal)\_x000D\_\n RETURNS internal\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_same$function$\_x000D\_\n |
| gtrgm\_union | CREATE OR REPLACE FUNCTION public.gtrgm\_union(internal, internal)\_x000D\_\n RETURNS gtrgm\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$gtrgm\_union$function$\_x000D\_\n |
| set\_limit | CREATE OR REPLACE FUNCTION public.set\_limit(real)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$set\_limit$function$\_x000D\_\n |
| show\_limit | CREATE OR REPLACE FUNCTION public.show\_limit()\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n STABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$show\_limit$function$\_x000D\_\n |
| show\_trgm | CREATE OR REPLACE FUNCTION public.show\_trgm(text)\_x000D\_\n RETURNS text[]\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$show\_trgm$function$\_x000D\_\n |
| similarity | CREATE OR REPLACE FUNCTION public.similarity(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$similarity$function$\_x000D\_\n |
| similarity\_dist | CREATE OR REPLACE FUNCTION public.similarity\_dist(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$similarity\_dist$function$\_x000D\_\n |
| similarity\_op | CREATE OR REPLACE FUNCTION public.similarity\_op(text, text)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n STABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$similarity\_op$function$\_x000D\_\n |
| strict\_word\_similarity | CREATE OR REPLACE FUNCTION public.strict\_word\_similarity(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$strict\_word\_similarity$function$\_x000D\_\n |
| strict\_word\_similarity\_commutator\_op | CREATE OR REPLACE FUNCTION public.strict\_word\_similarity\_commutator\_op(text, text)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n STABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$strict\_word\_similarity\_commutator\_op$function$\_x000D\_\n |
| strict\_word\_similarity\_dist\_commutator\_op | CREATE OR REPLACE FUNCTION public.strict\_word\_similarity\_dist\_commutator\_op(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$strict\_word\_similarity\_dist\_commutator\_op$function$\_x000D\_\n |
| strict\_word\_similarity\_dist\_op | CREATE OR REPLACE FUNCTION public.strict\_word\_similarity\_dist\_op(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$strict\_word\_similarity\_dist\_op$function$\_x000D\_\n |
| strict\_word\_similarity\_op | CREATE OR REPLACE FUNCTION public.strict\_word\_similarity\_op(text, text)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n STABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$strict\_word\_similarity\_op$function$\_x000D\_\n |
| word\_similarity | CREATE OR REPLACE FUNCTION public.word\_similarity(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$word\_similarity$function$\_x000D\_\n |
| word\_similarity\_commutator\_op | CREATE OR REPLACE FUNCTION public.word\_similarity\_commutator\_op(text, text)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n STABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$word\_similarity\_commutator\_op$function$\_x000D\_\n |
| word\_similarity\_dist\_commutator\_op | CREATE OR REPLACE FUNCTION public.word\_similarity\_dist\_commutator\_op(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$word\_similarity\_dist\_commutator\_op$function$\_x000D\_\n |
| word\_similarity\_dist\_op | CREATE OR REPLACE FUNCTION public.word\_similarity\_dist\_op(text, text)\_x000D\_\n RETURNS real\_x000D\_\n LANGUAGE c\_x000D\_\n IMMUTABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$word\_similarity\_dist\_op$function$\_x000D\_\n |
| word\_similarity\_op | CREATE OR REPLACE FUNCTION public.word\_similarity\_op(text, text)\_x000D\_\n RETURNS boolean\_x000D\_\n LANGUAGE c\_x000D\_\n STABLE PARALLEL SAFE STRICT\_x000D\_\nAS '$libdir/pg\_trgm', $function$word\_similarity\_op$function$\_x000D\_\n |

## Row Level Security
| schemaname | tablename | rowsecurity |
| --- | --- | --- |
| public | alembic\_version | False |
| public | audit\_logs | True |
| public | business\_counters | True |
| public | businesses | True |
| public | categories | True |
| public | customers | True |
| public | expenses | True |
| public | low\_stock\_alerts | True |
| public | payments | True |
| public | permissions | True |
| public | products | True |
| public | profiles | True |
| public | purchase\_items | True |
| public | purchase\_return\_items | True |
| public | purchase\_returns | True |
| public | purchases | True |
| public | role\_permissions | True |
| public | roles | True |
| public | sale\_items | True |
| public | sales | True |
| public | sales\_return\_items | True |
| public | sales\_returns | True |
| public | stock\_movements | True |
| public | super\_admins | True |
| public | suppliers | True |

## Complete ER Relationship Mappin
| table\_name | column\_name | references\_table | references\_column |
| --- | --- | --- | --- |
| audit\_logs | user\_id | profiles | id |
| audit\_logs | business\_id | businesses | business\_id |
| business\_counters | business\_id | businesses | business\_id |
| categories | created\_by | profiles | id |
| categories | business\_id | businesses | business\_id |
| categories | updated\_by | profiles | id |
| customers | updated\_by | profiles | id |
| customers | business\_id | businesses | business\_id |
| expenses | created\_by | profiles | id |
| expenses | business\_id | businesses | business\_id |
| expenses | updated\_by | profiles | id |
| low\_stock\_alerts | business\_id | businesses | business\_id |
| low\_stock\_alerts | product\_id | products | prod\_id |
| payments | business\_id | businesses | business\_id |
| payments | sale\_id | sales | sales\_id |
| products | business\_id | businesses | business\_id |
| products | created\_by | profiles | id |
| products | updated\_by | profiles | id |
| products | category\_id | categories | category\_id |
| profiles | business\_id | businesses | business\_id |
| profiles | business\_id | businesses | business\_id |
| profiles | role\_id | roles | id |
| purchase\_items | pur\_id | purchases | pur\_id |
| purchase\_items | product\_id | products | prod\_id |
| purchase\_items | business\_id | businesses | business\_id |
| purchase\_return\_items | business\_id | businesses | business\_id |
| purchase\_return\_items | return\_id | purchase\_returns | return\_id |
| purchase\_return\_items | product\_id | products | prod\_id |
| purchase\_returns | business\_id | businesses | business\_id |
| purchase\_returns | approved\_by | profiles | id |
| purchase\_returns | created\_by | profiles | id |
| purchase\_returns | pur\_id | purchases | pur\_id |
| purchases | business\_id | businesses | business\_id |
| purchases | updated\_by | profiles | id |
| purchases | created\_by | profiles | id |
| purchases | supp\_id | suppliers | supp\_id |
| role\_permissions | permission\_id | permissions | id |
| role\_permissions | role\_id | roles | id |
| sale\_items | business\_id | businesses | business\_id |
| sale\_items | product\_id | products | prod\_id |
| sale\_items | sale\_id | sales | sales\_id |
| sales | customer\_id | customers | cust\_id |
| sales | created\_by | profiles | id |
| sales | business\_id | businesses | business\_id |
| sales\_return\_items | product\_id | products | prod\_id |
| sales\_return\_items | business\_id | businesses | business\_id |
| sales\_return\_items | return\_id | sales\_returns | return\_id |
| sales\_return\_items | sale\_item\_id | sale\_items | sale\_item\_id |
| sales\_returns | business\_id | businesses | business\_id |
| sales\_returns | sale\_id | sales | sales\_id |
| sales\_returns | created\_by | profiles | id |
| stock\_movements | move\_created\_by | profiles | id |
| stock\_movements | purchase\_reference\_id | purchases | pur\_id |
| stock\_movements | product\_id | products | prod\_id |
| stock\_movements | business\_id | businesses | business\_id |
| stock\_movements | sale\_reference\_id | sales | sales\_id |
| suppliers | business\_id | businesses | business\_id |
| suppliers | updated\_by | profiles | id |

## RLS Policies
| schemaname | tablename | policyname | permissive | roles | cmd | qual | with\_check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| public | categories | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | categories | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | customers | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | customers | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | suppliers | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | suppliers | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | products | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | products | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | purchases | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | purchases | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | sales | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | sales | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | sale\_items | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | sale\_items | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | low\_stock\_alerts | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | low\_stock\_alerts | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | stock\_movements | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | stock\_movements | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | sales\_returns | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | sales\_returns | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | audit\_logs | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | audit\_logs | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | expenses | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | expenses | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | purchase\_returns | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | purchase\_returns | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | purchase\_return\_items | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | purchase\_return\_items | tenant\_isolation | PERMISSIVE | {public} | ALL | (return\_id IN ( SELECT pr.return\_id\_x000D\_\n FROM purchase\_returns pr\_x000D\_\n WHERE (pr.business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid))) | NaN |
| public | profiles | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | profiles | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | businesses | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | businesses | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | business\_counters | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | business\_counters | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | roles | readonly\_for\_all | PERMISSIVE | {public} | SELECT | True | NaN |
| public | sales\_return\_items | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | sales\_return\_items | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | permissions | readonly\_for\_all | PERMISSIVE | {public} | SELECT | True | NaN |
| public | role\_permissions | readonly\_for\_all | PERMISSIVE | {public} | SELECT | True | NaN |
| public | payments | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | payments | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | purchase\_items | tenant\_access\_policy | PERMISSIVE | {public} | ALL | (business\_id = app.current\_business\_id()) | NaN |
| public | purchase\_items | tenant\_isolation | PERMISSIVE | {public} | ALL | (business\_id = (((current\_setting('request.jwt.claims'::text, true))::json ->> 'business\_id'::text))::uuid) | NaN |
| public | super\_admins | deny\_all\_policy | PERMISSIVE | {public} | ALL | False | NaN |

## Sequences
| sequence\_catalog | sequence\_schema | sequence\_name | data\_type | numeric\_precision | numeric\_precision\_radix | numeric\_scale | start\_value | minimum\_value | maximum\_value | increment | cycle\_option |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| postgres | public | roles\_id\_seq | integer | 32 | 2 | 0 | 1 | 1 | 2147483647 | 1 | NO |
| postgres | public | permissions\_id\_seq | integer | 32 | 2 | 0 | 1 | 1 | 2147483647 | 1 | NO |
| postgres | public | super\_admins\_id\_seq | integer | 32 | 2 | 0 | 1 | 1 | 2147483647 | 1 | NO |

## Extensions
| oid | extname | extowner | extnamespace | extrelocatable | extversion | extconfig | extcondition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 13615 | plpgsql | 10 | 11 | False | 1 | NaN | NaN |
| 16393 | pg\_stat\_statements | 16388 | 16392 | True | 1.11 | NaN | NaN |
| 16436 | uuid-ossp | 16388 | 16392 | True | 1.1 | NaN | NaN |
| 16447 | pgcrypto | 16388 | 16392 | True | 1.3 | NaN | NaN |
| 16608 | supabase\_vault | 10 | 16607 | False | 0.3.1 | [16612] | [""] |
| 20511 | pg\_trgm | 10 | 2200 | True | 1.6 | NaN | NaN |