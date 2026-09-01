import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import api from '../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart, ShoppingCart, Package, Users, Truck, ChevronDown, ChevronUp } from 'lucide-react'
import { MagicWand01Icon } from './AnimatedMagicWand'

/**
 * AIChatWidget – Floating AI chat button with popup
 * Uses the animated magic wand icon as the trigger.
 * Features black/zinc dark theme matching the portal aesthetic.
 */
export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! 👋 I'm your AI assistant. How can I help you today?" }
  ])
  const [isTyping, setIsTyping] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const messagesEndRef = useRef(null)

  // --- DECISION TREE DATA STRUCTURE ---
  const DECISION_TREE = {
    'root': {
      options: [
        { id: 'analytics', text: 'Show me analytics & insights', icon: BarChart, prompt: 'Show me analytics & insights', nextNode: 'analytics_main' },
        { id: 'orders', text: 'I need to manage orders', icon: ShoppingCart, prompt: 'I need to manage orders', nextNode: 'orders_main' },
        { id: 'inventory', text: 'Check inventory & stock levels', icon: Package, prompt: 'Check inventory & stock levels', nextNode: 'inventory_main' },
        { id: 'customers', text: 'Look up or add a customer', icon: Users, prompt: 'Look up or add a customer', nextNode: 'customers_main' },
        { id: 'admin', text: 'Manage logistics & system admin', icon: Truck, prompt: 'Manage logistics & system admin', nextNode: null },
      ]
    },
    'analytics_main': {
      aiResponse: "I can help with that! What specific area of our performance would you like to explore?",
      options: [
        { id: 'a_revenue', text: "What's our sales & order trend?", prompt: "What's our sales & order trend?", nextNode: 'analytics_revenue' },
        { id: 'a_delivery', text: 'How is our delivery & logistics performance?', prompt: 'How is our delivery & logistics performance?', nextNode: 'analytics_delivery' },
        { id: 'a_product', text: 'Show me product & inventory analytics', prompt: 'Show me product & inventory analytics', nextNode: 'analytics_product' },
        { id: 'a_regional', text: 'I want to see regional & customer insights', prompt: 'I want to see regional & customer insights', nextNode: 'analytics_regional' },
      ]
    },
    'analytics_revenue': {
      aiResponse: "Got it! How would you like to explore our sales activity & order frequency?",
      options: [
        { id: 'r_dash', text: 'Show general order frequency & volume overview', prompt: 'Show general order frequency & volume overview', nextNode: null, action: 'fetch_sales_summary' },
        { id: 'r_trend', text: 'Show order frequency trends over time', prompt: 'Show order frequency trends over time', nextNode: null, action: 'viz_sales_trend' },
        { id: 'r_prod', text: 'Break down order frequency by product', prompt: 'Break down order frequency by product', nextNode: null, action: 'viz_sales_product' },
        { id: 'r_cust', text: 'Break down order frequency by customer', prompt: 'Break down order frequency by customer', nextNode: null, action: 'viz_sales_customer' },
      ]
    },
    'analytics_delivery': {
      aiResponse: "Sure. Which delivery metric should we look at?",
      options: [
        { id: 'd_ontime', text: "What's our on-time delivery rate?", prompt: "What's our on-time delivery rate?", nextNode: null, action: 'viz_ontime' },
        { id: 'd_delayed', text: 'Which orders are currently delayed?', prompt: 'Which orders are currently delayed?', nextNode: null, action: 'fetch_delayed' },
        { id: 'd_avg', text: 'Show me average delivery times', prompt: 'Show me average delivery times', nextNode: null, action: 'viz_avg_delivery' },
        { id: 'd_status', text: 'Show order status breakdown', prompt: 'Show order status breakdown', nextNode: null, action: 'viz_status_breakdown' },
      ]
    },
    'analytics_product': {
      aiResponse: "What product information do you need?",
      options: [
        { id: 'p_topsell', text: 'Which products are ordered the most?', prompt: 'Which products are ordered the most?', nextNode: null, action: 'viz_top_products' },
        { id: 'p_lowstock', text: 'Show me low stock warnings', prompt: 'Show me low stock warnings', nextNode: null, action: 'fetch_low_stock' },
        { id: 'p_dispatched', text: 'What is our total quantity dispatched?', prompt: 'What is our total quantity dispatched?', nextNode: null, action: 'viz_qty_dispatched' },
      ]
    },
    'analytics_regional': {
      aiResponse: "Would you like to analyze by state, geopolitical zone, or active customer counts?",
      options: [
        { id: 'reg_state', text: 'What are our top ordering states?', prompt: 'What are our top ordering states?', nextNode: null, action: 'viz_top_states' },
        { id: 'reg_zone', text: 'Break down orders by geopolitical zone', prompt: 'Break down orders by geopolitical zone', nextNode: null, action: 'fetch_global_zones' },
        { id: 'reg_active', text: 'Show me active customer counts', prompt: 'Show me active customer counts', nextNode: null, action: 'fetch_active_customers' },
      ]
    },
    // --- ORDER MANAGEMENT DECISION TREE ---
    'orders_main': {
      aiResponse: "I can help with order management analytics & insights! Which order category would you like to examine?",
      options: [
        { id: 'o_tracking', text: 'Active Shipment & Delivery Status', prompt: 'Active Shipment & Delivery Status', nextNode: 'orders_tracking' },
        { id: 'o_quantities', text: 'Order Volume & Quantities per Order', prompt: 'Order Volume & Quantities per Order', nextNode: 'orders_quantities' },
        { id: 'o_search', text: 'Recent Order Activity & Distribution', prompt: 'Recent Order Activity & Distribution', nextNode: 'orders_search' },
        { id: 'o_costs', text: 'Order Costs & Fulfillment Expenses', prompt: 'Order Costs & Fulfillment Expenses', nextNode: 'orders_costs' },
        { id: 'o_audit', text: 'Order Audit Logs & History Tracking', prompt: 'Order Audit Logs & History Tracking', nextNode: 'orders_audit' },
      ]
    },
    'orders_tracking': {
      aiResponse: "I can help you track active shipments and status metrics! What would you like to inspect?",
      options: [
        { id: 't_intransit', text: 'Which orders are currently in transit?', prompt: 'Which orders are currently in transit?', nextNode: null, action: 'fetch_orders_in_transit' },
        { id: 't_delayed', text: 'Which orders are overdue or delayed?', prompt: 'Which orders are overdue or delayed?', nextNode: null, action: 'fetch_delayed' },
        { id: 't_delivered', text: 'Show recently delivered orders', prompt: 'Show recently delivered orders', nextNode: null, action: 'fetch_recent_delivered' },
        { id: 't_dispatched', text: 'What orders were dispatched today?', prompt: 'What orders were dispatched today?', nextNode: null, action: 'fetch_orders_dispatched_today' },
      ]
    },
    'orders_quantities': {
      aiResponse: "Let's review order quantities, average units per order, and brand volume metrics.",
      options: [
        { id: 'q_avg_units', text: 'What is our average quantity/units per order?', prompt: 'What is our average quantity/units per order?', nextNode: null, action: 'fetch_avg_units_per_order' },
        { id: 'q_largest', text: 'Which orders had the largest product quantity?', prompt: 'Which orders had the largest product quantity?', nextNode: null, action: 'fetch_largest_quantity_orders' },
        { id: 'q_unit_type', text: 'Show total cartons vs pieces dispatched', prompt: 'Show total cartons vs pieces dispatched', nextNode: null, action: 'fetch_unit_type_breakdown' },
        { id: 'q_brand', text: 'Break down orders by reference card brand (DSL vs DSLP)', prompt: 'Break down orders by reference card brand (DSL vs DSLP)', nextNode: null, action: 'fetch_brand_orders_breakdown' },
      ]
    },
    'orders_search': {
      aiResponse: "What order activity or driver/customer breakdown would you like to view?",
      options: [
        { id: 's_recent', text: 'Show the 10 most recent orders', prompt: 'Show the 10 most recent orders', nextNode: null, action: 'fetch_latest_orders' },
        { id: 's_bydriver', text: 'Show order count grouped by driver', prompt: 'Show order count grouped by driver', nextNode: null, action: 'viz_orders_by_driver' },
        { id: 's_bycustomer', text: 'Show order count grouped by customer', prompt: 'Show order count grouped by customer', nextNode: null, action: 'viz_orders_by_customer' },
        { id: 's_status', text: 'Show order fulfillment status breakdown', prompt: 'Show order fulfillment status breakdown', nextNode: null, action: 'viz_status_breakdown' },
      ]
    },
    'orders_costs': {
      aiResponse: "Let's review logistics expenses and order fulfillment costs.",
      options: [
        { id: 'cost_summary', text: 'Show order fulfillment costs summary (Fuel & Waybill costs)', prompt: 'Show order fulfillment costs summary (Fuel & Waybill costs)', nextNode: null, action: 'fetch_order_costs_summary' },
        { id: 'cost_highest', text: 'Which orders had the highest fulfillment expenses?', prompt: 'Which orders had the highest fulfillment expenses?', nextNode: null, action: 'fetch_highest_cost_orders' },
        { id: 'cost_avg', text: 'Show average fuel and waybill cost per order', prompt: 'Show average fuel and waybill cost per order', nextNode: null, action: 'fetch_avg_costs_per_order' },
        { id: 'cost_by_store', text: 'Show logistics cost breakdown by store location', prompt: 'Show logistics cost breakdown by store location', nextNode: null, action: 'fetch_store_costs' },
      ]
    },
    'orders_audit': {
      aiResponse: "What order modification history or audit logs would you like to inspect?",
      options: [
        { id: 'audit_recent', text: 'Show recent order audit logs and modifications', prompt: 'Show recent order audit logs and modifications', nextNode: null, action: 'fetch_recent_order_audits' },
        { id: 'audit_status', text: 'Who updated or marked orders recently?', prompt: 'Who updated or marked orders recently?', nextNode: null, action: 'fetch_order_status_audits' },
        { id: 'audit_deleted', text: 'Show deleted or cancelled order records', prompt: 'Show deleted or cancelled order records', nextNode: null, action: 'fetch_deleted_orders_summary' },
      ]
    },
    // --- INVENTORY MANAGEMENT DECISION TREE ---
    'inventory_main': {
      aiResponse: "I can help you check inventory & stock levels! Which inventory area would you like to inspect?",
      options: [
        { id: 'inv_lowstock', text: 'Low Stock Warnings & Reorder Alerts', prompt: 'Low Stock Warnings & Reorder Alerts', nextNode: 'inventory_lowstock' },
        { id: 'inv_catalog', text: 'Product Catalog & Stock Availability', prompt: 'Product Catalog & Stock Availability', nextNode: 'inventory_catalog' },
        { id: 'inv_stores', text: 'Store Location Inventory Breakdown', prompt: 'Store Location Inventory Breakdown', nextNode: 'inventory_stores' },
        { id: 'inv_dispatched', text: 'Stock Movements & Dispatched Volumes', prompt: 'Stock Movements & Dispatched Volumes', nextNode: 'inventory_dispatched' },
        { id: 'inv_audit', text: 'Inventory Audit Logs & Transfer History', prompt: 'Inventory Audit Logs & Transfer History', nextNode: 'inventory_audit' },
      ]
    },
    'inventory_lowstock': {
      aiResponse: "Let's review low stock warnings and reorder alerts across store locations.",
      options: [
        { id: 'i_low_items', text: 'Which products are currently below reorder level?', prompt: 'Which products are currently below reorder level?', nextNode: null, action: 'fetch_low_stock_items' },
        { id: 'i_out_stock', text: 'Which items are completely out of stock?', prompt: 'Which items are completely out of stock?', nextNode: null, action: 'fetch_out_of_stock_items' },
        { id: 'i_reorder_count', text: 'How many total reorder warnings are active?', prompt: 'How many total reorder warnings are active?', nextNode: null, action: 'fetch_low_stock_count' },
        { id: 'i_low_by_store', text: 'Break down low stock warnings by store location', prompt: 'Break down low stock warnings by store location', nextNode: null, action: 'fetch_low_stock_by_store' },
      ]
    },
    'inventory_catalog': {
      aiResponse: "Here is information on our registered product catalog and stock availability.",
      options: [
        { id: 'i_total_products', text: 'Show total number of registered products', prompt: 'Show total number of registered products', nextNode: null, action: 'fetch_total_products_count' },
        { id: 'i_unittype', text: 'Break down products by unit type (Cartons vs Pieces)', prompt: 'Break down products by unit type (Cartons vs Pieces)', nextNode: null, action: 'fetch_products_by_unittype' },
        { id: 'i_top_stocked', text: 'Which products have the highest total stock volume?', prompt: 'Which products have the highest total stock volume?', nextNode: null, action: 'fetch_top_stocked_products' },
      ]
    },
    'inventory_stores': {
      aiResponse: "Let's examine inventory stock levels across specific store locations.",
      options: [
        { id: 'i_store_summary', text: 'Show total stock level breakdown by store', prompt: 'Show total stock level breakdown by store', nextNode: null, action: 'fetch_store_inventory_summary' },
        { id: 'i_store_central', text: 'Show stock levels at Central Warehouse / Main Store', prompt: 'Show stock levels at Central Warehouse / Main Store', nextNode: null, action: 'fetch_central_store_inventory' },
        { id: 'i_store_branch', text: 'Show stock levels at Regional Branch Stores', prompt: 'Show stock levels at Regional Branch Stores', nextNode: null, action: 'fetch_branch_store_inventory' },
      ]
    },
    'inventory_dispatched': {
      aiResponse: "Let's review stock movements and dispatched product volumes.",
      options: [
        { id: 'i_dispatched_30d', text: 'What is our total dispatched product volume in last 30 days?', prompt: 'What is our total dispatched product volume in last 30 days?', nextNode: null, action: 'viz_qty_dispatched' },
        { id: 'i_most_dispatched', text: 'Which products have been dispatched the most?', prompt: 'Which products have been dispatched the most?', nextNode: null, action: 'viz_top_products' },
        { id: 'i_avg_dispatched', text: 'Show average dispatched quantity per product', prompt: 'Show average dispatched quantity per product', nextNode: null, action: 'fetch_avg_product_dispatched_qty' },
      ]
    },
    'inventory_audit': {
      aiResponse: "What inventory audit logs or stock movement history would you like to view?",
      options: [
        { id: 'i_transfers_log', text: 'Show recent inter-store stock transfer history', prompt: 'Show recent inter-store stock transfer history', nextNode: null, action: 'fetch_interstore_transfers_log' },
        { id: 'i_inv_audits', text: 'Show recent inventory adjustment & audit logs', prompt: 'Show recent inventory adjustment & audit logs', nextNode: null, action: 'fetch_inventory_audit_logs' },
      ]
    },
    // --- CUSTOMER MANAGEMENT DECISION TREE ---
    'customers_main': {
      aiResponse: "I can help with customer account insights & directory lookups! Which customer area would you like to explore?",
      options: [
        { id: 'cust_accounts', text: 'Customer Accounts & Registration Overview', prompt: 'Customer Accounts & Registration Overview', nextNode: 'customers_accounts' },
        { id: 'cust_regional', text: 'Regional Distribution & Customer Density', prompt: 'Regional Distribution & Customer Density', nextNode: 'customers_regional' },
        { id: 'cust_activity', text: 'Customer Order Activity & Frequency', prompt: 'Customer Order Activity & Frequency', nextNode: 'customers_activity' },
        { id: 'cust_fulfillment', text: 'Customer Delivery & Volume Directory', prompt: 'Customer Delivery & Volume Directory', nextNode: 'customers_fulfillment' },
        { id: 'cust_audit', text: 'Customer Account Audit Logs & Changes', prompt: 'Customer Account Audit Logs & Changes', nextNode: 'customers_audit' },
      ]
    },
    'customers_accounts': {
      aiResponse: "Here is information on our registered customer accounts and registration metrics.",
      options: [
        { id: 'c_total_accs', text: 'Show total registered customer accounts count', prompt: 'Show total registered customer accounts count', nextNode: null, action: 'fetch_total_customer_accounts' },
        { id: 'c_active_accs', text: 'Show active customer counts (placed orders recently)', prompt: 'Show active customer counts (placed orders recently)', nextNode: null, action: 'fetch_active_customers_breakdown' },
        { id: 'c_inactive_accs', text: 'Show count of inactive/dormant customer accounts', prompt: 'Show count of inactive/dormant customer accounts', nextNode: null, action: 'fetch_inactive_customers_count' },
        { id: 'c_latest_accs', text: 'Show 15 most recently registered customer accounts', prompt: 'Show 15 most recently registered customer accounts', nextNode: null, action: 'fetch_latest_registered_customers' },
      ]
    },
    'customers_regional': {
      aiResponse: "Let's review regional customer account density and geopolitical distribution.",
      options: [
        { id: 'c_top_states', text: 'What are our top ordering states by customer count?', prompt: 'What are our top ordering states by customer count?', nextNode: null, action: 'viz_top_states' },
        { id: 'c_zones_breakdown', text: 'Break down customer accounts by geopolitical zone', prompt: 'Break down customer accounts by geopolitical zone', nextNode: null, action: 'fetch_global_zones' },
        { id: 'c_city_density', text: 'Show customer account density by state & location', prompt: 'Show customer account density by state & location', nextNode: null, action: 'fetch_customer_states_breakdown' },
      ]
    },
    'customers_activity': {
      aiResponse: "Let's inspect customer ordering frequency and current shipment activity.",
      options: [
        { id: 'c_top_orderers', text: 'Which customer accounts place the most orders?', prompt: 'Which customer accounts place the most orders?', nextNode: null, action: 'viz_sales_customer' },
        { id: 'c_with_intransit', text: 'Which customers have orders currently in transit?', prompt: 'Which customers have orders currently in transit?', nextNode: null, action: 'fetch_customers_with_intransit_orders' },
        { id: 'c_with_delayed', text: 'Which customers have delayed or overdue orders?', prompt: 'Which customers have delayed or overdue orders?', nextNode: null, action: 'fetch_delayed' },
      ]
    },
    'customers_fulfillment': {
      aiResponse: "Here is data on product volume dispatches and customer contact directory details.",
      options: [
        { id: 'c_top_volume', text: 'Which customers receive the highest product quantities?', prompt: 'Which customers receive the highest product quantities?', nextNode: null, action: 'viz_revenue_customer' },
        { id: 'c_directory_sample', text: 'Show a sample customer directory (Names, States, Contacts)', prompt: 'Show a sample customer directory (Names, States, Contacts)', nextNode: null, action: 'fetch_customer_directory_sample' },
      ]
    },
    'customers_audit': {
      aiResponse: "What customer account audit logs or modification history would you like to inspect?",
      options: [
        { id: 'c_creation_logs', text: 'Show recent customer account creation audit logs', prompt: 'Show recent customer account creation audit logs', nextNode: null, action: 'fetch_customer_creation_audits' },
        { id: 'c_modification_logs', text: 'Show recent customer profile modification audit logs', prompt: 'Show recent customer profile modification audit logs', nextNode: null, action: 'fetch_customer_modification_audits' },
      ]
    }
  };

  const [currentNode, setCurrentNode] = useState('root');
  const [isOptionsCollapsed, setIsOptionsCollapsed] = useState(false);
  const currentOptions = DECISION_TREE[currentNode]?.options || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const executeAction = async (action, userPrompt) => {
    let backendData = null;
    try {
      switch (action) {
        case 'fetch_sales_summary':
        case 'fetch_dashboard': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          backendData = {
            total_orders_today: dashData.total_orders_today,
            total_orders_last_30_days: dashData.total_orders_30_days,
            orders_growth_percentage_last_30_days: dashData.orders_growth_percentage,
            delivered_orders_this_week: dashData.delivered_this_week,
            order_status_breakdown: dashData.status_breakdown,
            active_customers_this_month: dashData.active_customers_this_month
          };
          break;
        }
        case 'viz_sales_trend':
        case 'viz_revenue_time':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'day', time_range: 'last_30_days' })).data;
          break;
        case 'viz_sales_product':
        case 'viz_revenue_product':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'product', time_range: 'last_30_days' })).data;
          break;
        case 'viz_sales_customer':
        case 'viz_revenue_customer':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'customer', time_range: 'last_30_days' })).data;
          break;
        case 'viz_ontime':
          backendData = (await api.post('/analytics/visualize', { metric: 'on_time_rate', group_by: 'week', time_range: 'last_30_days' })).data;
          break;
        case 'fetch_delayed': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          backendData = dashData.delayed_orders || [];
          break;
        }
        case 'viz_avg_delivery':
          backendData = (await api.post('/analytics/visualize', { metric: 'avg_delivery_hours', group_by: 'driver', time_range: 'last_30_days' })).data;
          break;
        case 'viz_status_breakdown':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'status', time_range: 'last_30_days' })).data;
          break;
        case 'viz_top_products':
          backendData = (await api.post('/analytics/visualize', { metric: 'total_quantity', group_by: 'product', time_range: 'last_30_days' })).data;
          break;
        case 'fetch_low_stock': {
          const lowStockData = (await api.get('/analytics/low-stock')).data;
          backendData = Array.isArray(lowStockData)
            ? lowStockData.map(item => ({
                store_name: item.store_name,
                product_name: item.product_name,
                current_stock: item.stock,
                reorder_level: item.reorder_level,
                unit: item.unit
              }))
            : lowStockData;
          break;
        }
        case 'viz_qty_dispatched':
          backendData = (await api.post('/analytics/visualize', { metric: 'total_quantity', group_by: 'day', time_range: 'last_30_days' })).data;
          break;
        case 'viz_top_states':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'state', time_range: 'last_30_days' })).data;
          break;
        case 'fetch_global_zones': {
          const globalRes = (await api.get('/analytics/global')).data;
          backendData = globalRes.zones?.map(z => ({
            geopolitical_zone: z.zone,
            total_orders: z.total_orders,
            top_products: z.top_products?.slice(0, 3).map(p => ({ product: p.product, order_count: p.order_count }))
          })) || globalRes;
          break;
        }
        case 'fetch_active_customers': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          backendData = {
            total_registered_customer_accounts: dashData.total_registered_customers,
            customers_who_placed_orders_this_week: dashData.active_customers_this_week,
            customers_who_placed_orders_this_month: dashData.active_customers_this_month,
            customers_who_placed_orders_last_90_days: dashData.active_customers_90_days,
          };
          break;
        }
        // --- ORDER MANAGEMENT ACTION HANDLERS ---
        case 'fetch_orders_in_transit': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const inTransit = orders.filter(o => o.order_status === 'In Transit');
          backendData = inTransit.slice(0, 15).map(o => ({
            order_number: o.order_number,
            waybill_number: o.waybill_number,
            customer_name: o.customer_name || o.customer?.name,
            dispatch_time: o.dispatch_time,
            expected_delivery_time: o.expected_delivery_time,
            driver_name: o.driver_name
          }));
          break;
        }
        case 'fetch_recent_delivered': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const delivered = orders.filter(o => (o.order_status || '').includes('Delivered'));
          backendData = delivered.slice(0, 15).map(o => ({
            order_number: o.order_number,
            customer_name: o.customer_name || o.customer?.name,
            status: o.order_status,
            actual_delivery_time: o.actual_delivery_time,
            delivery_duration: o.delivery_duration
          }));
          break;
        }
        case 'fetch_orders_dispatched_today': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const todayStr = new Date().toISOString().split('T')[0];
          const todayOrders = orders.filter(o => o.dispatch_time && o.dispatch_time.startsWith(todayStr));
          backendData = todayOrders.map(o => ({
            order_number: o.order_number,
            customer_name: o.customer_name || o.customer?.name,
            dispatch_time: o.dispatch_time,
            status: o.order_status
          }));
          break;
        }
        case 'fetch_avg_units_per_order': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          let totalUnits = 0;
          let totalLineItems = 0;
          orders.forEach(o => {
            if (o.line_items) {
              totalLineItems += o.line_items.length;
              o.line_items.forEach(item => {
                totalUnits += item.quantity || 0;
              });
            }
          });
          const count = orders.length || 1;
          backendData = {
            total_orders_evaluated: orders.length,
            total_units_dispatched: totalUnits,
            total_line_items: totalLineItems,
            average_units_per_order: Math.round((totalUnits / count) * 100) / 100,
            average_line_items_per_order: Math.round((totalLineItems / count) * 100) / 100
          };
          break;
        }
        case 'fetch_largest_quantity_orders': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const sorted = orders.map(o => {
            const totalQty = o.line_items ? o.line_items.reduce((sum, i) => sum + (i.quantity || 0), 0) : 0;
            return {
              order_number: o.order_number,
              customer_name: o.customer_name || o.customer?.name,
              total_quantity: totalQty,
              line_item_count: o.line_items ? o.line_items.length : 0,
              dispatch_time: o.dispatch_time
            };
          }).sort((a, b) => b.total_quantity - a.total_quantity);
          backendData = sorted.slice(0, 10);
          break;
        }
        case 'fetch_unit_type_breakdown': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          let totalCartons = 0;
          let totalPieces = 0;
          orders.forEach(o => {
            if (o.line_items) {
              o.line_items.forEach(item => {
                const u = (item.unit || '').toUpperCase();
                if (u.includes('CARTON')) {
                  totalCartons += item.quantity || 0;
                } else {
                  totalPieces += item.quantity || 0;
                }
              });
            }
          });
          backendData = {
            total_orders_evaluated: orders.length,
            total_cartons_dispatched: totalCartons,
            total_pieces_dispatched: totalPieces,
            total_units_combined: totalCartons + totalPieces
          };
          break;
        }
        case 'fetch_brand_orders_breakdown': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          let dslCount = 0;
          let dslpCount = 0;
          let unassignedCount = 0;
          orders.forEach(o => {
            if (o.reference_cards && o.reference_cards.length > 0) {
              o.reference_cards.forEach(card => {
                const b = (card.brand || '').toUpperCase();
                if (b.includes('DSLP')) dslpCount++;
                else if (b.includes('DSL')) dslCount++;
                else unassignedCount++;
              });
            } else {
              unassignedCount++;
            }
          });
          backendData = {
            dsl_brand_reference_cards_count: dslCount,
            dslp_brand_reference_cards_count: dslpCount,
            unassigned_brand_orders_count: unassignedCount,
            total_evaluated_orders: orders.length
          };
          break;
        }
        case 'fetch_latest_orders': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          backendData = orders.slice(0, 10).map(o => ({
            order_number: o.order_number,
            waybill_number: o.waybill_number,
            invoice_number: o.invoice_number,
            customer_name: o.customer_name || o.customer?.name,
            dispatch_time: o.dispatch_time,
            status: o.order_status
          }));
          break;
        }
        case 'viz_orders_by_driver':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'driver', time_range: 'last_30_days' })).data;
          break;
        case 'viz_orders_by_customer':
          backendData = (await api.post('/analytics/visualize', { metric: 'order_count', group_by: 'customer', time_range: 'last_30_days' })).data;
          break;
        case 'fetch_order_costs_summary': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          let totalFuel = 0;
          let totalWaybill = 0;
          let totalOther = 0;
          orders.forEach(o => {
            totalFuel += o.fuel_cost || 0;
            totalWaybill += o.waybill_cost || 0;
            totalOther += o.other_costs || 0;
          });
          backendData = {
            total_orders_evaluated: orders.length,
            total_fuel_cost: Math.round(totalFuel * 100) / 100,
            total_waybill_cost: Math.round(totalWaybill * 100) / 100,
            total_other_costs: Math.round(totalOther * 100) / 100,
            total_logistics_expense: Math.round((totalFuel + totalWaybill + totalOther) * 100) / 100
          };
          break;
        }
        case 'fetch_highest_cost_orders': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const sorted = orders.map(o => {
            const totCost = (o.fuel_cost || 0) + (o.waybill_cost || 0) + (o.other_costs || 0);
            return {
              order_number: o.order_number,
              customer_name: o.customer_name || o.customer?.name,
              fuel_cost: o.fuel_cost || 0,
              waybill_cost: o.waybill_cost || 0,
              other_costs: o.other_costs || 0,
              total_fulfillment_cost: Math.round(totCost * 100) / 100,
              dispatch_time: o.dispatch_time
            };
          }).sort((a, b) => b.total_fulfillment_cost - a.total_fulfillment_cost);
          backendData = sorted.slice(0, 10);
          break;
        }
        case 'fetch_avg_costs_per_order': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const count = orders.length || 1;
          let totalFuel = 0;
          let totalWaybill = 0;
          let totalOther = 0;
          orders.forEach(o => {
            totalFuel += o.fuel_cost || 0;
            totalWaybill += o.waybill_cost || 0;
            totalOther += o.other_costs || 0;
          });
          backendData = {
            total_orders_evaluated: orders.length,
            average_fuel_cost_per_order: Math.round((totalFuel / count) * 100) / 100,
            average_waybill_cost_per_order: Math.round((totalWaybill / count) * 100) / 100,
            average_other_cost_per_order: Math.round((totalOther / count) * 100) / 100,
            average_total_logistics_cost_per_order: Math.round(((totalFuel + totalWaybill + totalOther) / count) * 100) / 100
          };
          break;
        }
        case 'fetch_store_costs': {
          const globalRes = (await api.get('/analytics/global')).data;
          backendData = globalRes.stores?.map(s => ({
            store_name: s.name,
            total_orders: s.total_orders,
            total_fuel_cost: s.fuel_cost,
            total_waybill_cost: s.waybill_cost
          })) || globalRes;
          break;
        }
        case 'fetch_recent_order_audits': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const orderLogs = Array.isArray(logs) ? logs.filter(l => l.table_name === 'orders') : [];
          backendData = orderLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            action: l.action,
            record_id: l.record_id,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        case 'fetch_order_status_audits': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const statusLogs = Array.isArray(logs) ? logs.filter(l => l.table_name === 'orders' && (l.action === 'UPDATE' || l.action === 'MARK_DELIVERED')) : [];
          backendData = statusLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            action: l.action,
            record_id: l.record_id,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        case 'fetch_deleted_orders_summary': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const deletedLogs = Array.isArray(logs) ? logs.filter(l => l.table_name === 'orders' && l.action === 'DELETE') : [];
          backendData = deletedLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            record_id: l.record_id,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        // --- INVENTORY MANAGEMENT ACTION HANDLERS ---
        case 'fetch_low_stock_items': {
          const items = (await api.get('/analytics/low-stock')).data;
          backendData = Array.isArray(items) ? items.slice(0, 15).map(i => ({
            store_name: i.store_name,
            product_name: i.product_name,
            current_stock: i.stock,
            reorder_level: i.reorder_level,
            unit: i.unit
          })) : items;
          break;
        }
        case 'fetch_out_of_stock_items': {
          const items = (await api.get('/analytics/low-stock')).data;
          const outOfStock = Array.isArray(items) ? items.filter(i => i.stock === 0) : [];
          backendData = outOfStock.slice(0, 15).map(i => ({
            store_name: i.store_name,
            product_name: i.product_name,
            reorder_level: i.reorder_level,
            unit: i.unit
          }));
          break;
        }
        case 'fetch_low_stock_count': {
          const countRes = (await api.get('/analytics/low-stock?count_only=true')).data;
          backendData = {
            total_active_low_stock_alerts: countRes.count || 0
          };
          break;
        }
        case 'fetch_low_stock_by_store': {
          const items = (await api.get('/analytics/low-stock')).data;
          const storeCounts = {};
          if (Array.isArray(items)) {
            items.forEach(i => {
              storeCounts[i.store_name] = (storeCounts[i.store_name] || 0) + 1;
            });
          }
          backendData = {
            total_low_stock_items: Array.isArray(items) ? items.length : 0,
            low_stock_counts_by_store: storeCounts
          };
          break;
        }
        case 'fetch_total_products_count': {
          const prodRes = (await api.get('/products/?limit=100')).data;
          const items = prodRes.items || [];
          backendData = {
            total_registered_products: prodRes.total || items.length,
            product_catalog_sample: items.slice(0, 15).map(p => ({
              product_name: p.name,
              brand: p.brand,
              unit_type: p.default_unit,
              unit_price: p.unit_price
            }))
          };
          break;
        }
        case 'fetch_products_by_unittype': {
          const prodRes = (await api.get('/products/?limit=1000')).data;
          const items = prodRes.items || [];
          const breakdown = {};
          items.forEach(p => {
            const unit = p.default_unit || 'UNKNOWN';
            breakdown[unit] = (breakdown[unit] || 0) + 1;
          });
          backendData = {
            total_products_evaluated: items.length,
            product_count_by_unit_type: breakdown
          };
          break;
        }
        case 'fetch_top_stocked_products': {
          const stores = (await api.get('/stores/')).data;
          const productStockMap = {};
          if (Array.isArray(stores)) {
            for (const s of stores) {
              const inv = (await api.get(`/stores/${s.id}/inventory`)).data;
              if (Array.isArray(inv)) {
                inv.forEach(i => {
                  const pname = i.product_name || i.product?.name;
                  if (pname) {
                    productStockMap[pname] = (productStockMap[pname] || 0) + (i.stock || 0);
                  }
                });
              }
            }
          }
          const sorted = Object.entries(productStockMap)
            .map(([product_name, total_stock]) => ({ product_name, total_stock }))
            .sort((a, b) => b.total_stock - a.total_stock);
          backendData = sorted.slice(0, 10);
          break;
        }
        case 'fetch_store_inventory_summary': {
          const stores = (await api.get('/stores/')).data;
          const storeSummaries = [];
          if (Array.isArray(stores)) {
            for (const s of stores) {
              const inv = (await api.get(`/stores/${s.id}/inventory`)).data;
              const totalItems = Array.isArray(inv) ? inv.length : 0;
              const totalStock = Array.isArray(inv) ? inv.reduce((sum, item) => sum + (item.stock || 0), 0) : 0;
              const lowStockCount = Array.isArray(inv) ? inv.filter(item => (item.stock || 0) <= (item.reorder_level || 0)).length : 0;
              storeSummaries.push({
                store_name: s.name,
                is_central: s.is_central,
                total_product_skus: totalItems,
                total_physical_stock_units: totalStock,
                low_stock_warnings: lowStockCount
              });
            }
          }
          backendData = storeSummaries;
          break;
        }
        case 'fetch_central_store_inventory': {
          const stores = (await api.get('/stores/')).data;
          const centralStore = Array.isArray(stores) ? stores.find(s => s.is_central) : null;
          if (centralStore) {
            const inv = (await api.get(`/stores/${centralStore.id}/inventory`)).data;
            backendData = {
              store_name: centralStore.name,
              total_product_skus: Array.isArray(inv) ? inv.length : 0,
              stock_levels_sample: Array.isArray(inv) ? inv.slice(0, 15).map(i => ({
                product_name: i.product_name || i.product?.name,
                current_stock: i.stock,
                reorder_level: i.reorder_level,
                unit: i.unit
              })) : []
            };
          } else {
            backendData = { message: "No central store found." };
          }
          break;
        }
        case 'fetch_branch_store_inventory': {
          const stores = (await api.get('/stores/')).data;
          const branches = Array.isArray(stores) ? stores.filter(s => !s.is_central) : [];
          const branchData = [];
          for (const b of branches) {
            const inv = (await api.get(`/stores/${b.id}/inventory`)).data;
            const totalStock = Array.isArray(inv) ? inv.reduce((sum, item) => sum + (item.stock || 0), 0) : 0;
            branchData.push({
              store_name: b.name,
              location: `${b.city || ''}, ${b.state || ''}`.trim(),
              total_skus: Array.isArray(inv) ? inv.length : 0,
              total_stock_units: totalStock
            });
          }
          backendData = branchData;
          break;
        }
        case 'fetch_avg_product_dispatched_qty': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const prodQtyMap = {};
          const prodOrderMap = {};
          orders.forEach(o => {
            (o.line_items || []).forEach(item => {
              const pname = item.product_name || item.product?.name;
              if (pname) {
                prodQtyMap[pname] = (prodQtyMap[pname] || 0) + (item.quantity || 0);
                prodOrderMap[pname] = (prodOrderMap[pname] || 0) + 1;
              }
            });
          });
          const result = Object.keys(prodQtyMap).map(pname => ({
            product_name: pname,
            total_quantity_dispatched: prodQtyMap[pname],
            times_ordered: prodOrderMap[pname],
            average_quantity_per_order: Math.round((prodQtyMap[pname] / prodOrderMap[pname]) * 10) / 10
          })).sort((a, b) => b.total_quantity_dispatched - a.total_quantity_dispatched);
          backendData = result.slice(0, 10);
          break;
        }
        case 'fetch_interstore_transfers_log': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const transferLogs = Array.isArray(logs) ? logs.filter(l => (l.details || '').toLowerCase().includes('transfer') || (l.action || '').includes('TRANSFER')) : [];
          backendData = transferLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            action: l.action,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        case 'fetch_inventory_audit_logs': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const invLogs = Array.isArray(logs) ? logs.filter(l => l.table_name === 'store_inventories' || l.table_name === 'products') : [];
          backendData = invLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            table_name: l.table_name,
            action: l.action,
            record_id: l.record_id,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        // --- CUSTOMER MANAGEMENT ACTION HANDLERS ---
        case 'fetch_total_customer_accounts': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          backendData = {
            total_registered_customer_accounts: dashData.total_registered_customers,
            active_customers_this_month: dashData.active_customers_this_month,
            active_customers_this_week: dashData.active_customers_this_week,
            active_customers_last_90_days: dashData.active_customers_90_days
          };
          break;
        }
        case 'fetch_active_customers_breakdown': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          backendData = {
            total_registered_customers: dashData.total_registered_customers,
            customers_who_placed_orders_this_week: dashData.active_customers_this_week,
            customers_who_placed_orders_this_month: dashData.active_customers_this_month,
            customers_who_placed_orders_last_90_days: dashData.active_customers_90_days
          };
          break;
        }
        case 'fetch_inactive_customers_count': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          const total = dashData.total_registered_customers || 0;
          const active90 = dashData.active_customers_90_days || 0;
          backendData = {
            total_registered_customer_accounts: total,
            active_ordering_customers_90_days: active90,
            estimated_inactive_or_dormant_customer_accounts: Math.max(0, total - active90)
          };
          break;
        }
        case 'fetch_latest_registered_customers': {
          const custRes = (await api.get('/customers/?limit=15')).data;
          const items = custRes.items || [];
          backendData = {
            total_registered_customers: custRes.total || items.length,
            recent_customer_registrations: items.map(c => ({
              customer_name: c.name,
              state: c.state || 'N/A',
              city: c.city || 'N/A',
              registration_date: c.created_at
            }))
          };
          break;
        }
        case 'fetch_customer_states_breakdown': {
          const dashData = (await api.get('/analytics/dashboard')).data;
          backendData = {
            top_ordering_states: dashData.top_5_states || []
          };
          break;
        }
        case 'fetch_customers_with_intransit_orders': {
          const resData = (await api.get('/orders')).data;
          const orders = Array.isArray(resData) ? resData : (resData.items || []);
          const inTransitOrders = orders.filter(o => o.order_status === 'In Transit');
          const customerMap = {};
          inTransitOrders.forEach(o => {
            const cname = o.customer_name || o.customer?.name || 'Unknown';
            customerMap[cname] = (customerMap[cname] || 0) + 1;
          });
          backendData = {
            total_orders_in_transit: inTransitOrders.length,
            customers_with_in_transit_shipments: Object.entries(customerMap).map(([customer_name, active_shipments]) => ({
              customer_name,
              active_shipments
            }))
          };
          break;
        }
        case 'fetch_customer_directory_sample': {
          const custRes = (await api.get('/customers/?limit=20')).data;
          const items = custRes.items || [];
          backendData = {
            total_customer_count: custRes.total || items.length,
            directory_sample: items.map(c => ({
              name: c.name,
              city: c.city,
              state: c.state,
              contact_number: c.contact_number,
              email: c.email
            }))
          };
          break;
        }
        case 'fetch_customer_creation_audits': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const custLogs = Array.isArray(logs) ? logs.filter(l => l.table_name === 'customers' && l.action === 'CREATE') : [];
          backendData = custLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            action: l.action,
            record_id: l.record_id,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        case 'fetch_customer_modification_audits': {
          const logs = (await api.get('/analytics/audit-logs')).data;
          const custLogs = Array.isArray(logs) ? logs.filter(l => l.table_name === 'customers' && l.action === 'UPDATE') : [];
          backendData = custLogs.slice(0, 15).map(l => ({
            user_name: l.user_name || 'System User',
            action: l.action,
            record_id: l.record_id,
            timestamp: l.timestamp,
            details: l.details
          }));
          break;
        }
        default:
          return "Sorry, that action is not fully wired up yet.";
      }

      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
      const prompt = `You are the AI Assistant for Diversay Solutions Limited, a commercial logistics, order fulfillment, and sales distribution enterprise in Nigeria.

The user asked the following question on their company portal:
"${userPrompt}"

The backend API returned the following concise summary data for this query:
${JSON.stringify(backendData, null, 2)}

Instructions:
1. Directly, thoroughly, and comprehensively answer the user's question ("${userPrompt}") based strictly on the retrieved summary data.
2. Extrapolate Hidden Insights: Act as an expert senior logistics & operations analyst. Do not just list raw numbers; analyze the data to surface non-obvious patterns, operational risks, stock imbalances, concentration bottlenecks, or operational efficiency trends.
3. Be Nuanced & Domain-Specific: Provide a rich, nuanced explanation using precise logistics terminology (e.g. fulfillment throughput, reorder thresholds, dispatched volume, waybill cost allocation, driver distribution).
4. Do NOT Ask Follow-Up Questions: Conclude your analysis authoritatively. Do NOT end with conversational follow-up questions, closing prompts, or offers for further help (such as "Would you like me to check anything else?", "Let me know if you need more details", etc.).
5. Domain Context: In this application, "sales trends", "sales volume", and "sales performance" are evaluated using order counts, order frequency, and dispatched item quantities (monetary prices/revenue are not tracked in this logistics portal). Do NOT report ₦0 revenue or claim there are no sales; instead explain sales activity using order count, frequency, and volume.
6. Format your response cleanly with markdown headers, bold callouts, bullet points, and beautifully structured tables where applicable.
7. Important Distinction: "total_registered_customer_accounts" refers to the total number of registered customers. The "customers_who_placed_orders_*" metrics refer only to those who placed orders recently. Do not confuse total customer accounts with active ordering subsets.`;

      const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let response = null;
      let lastErr = null;
      for (const model of models) {
        try {
          response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] }
          );
          if (response?.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            break;
          }
        } catch (e) {
          lastErr = e;
          console.warn(`Model ${model} failed, trying next candidate:`, e?.response?.data || e.message);
        }
      }

      if (!response?.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw lastErr || new Error('All model candidates failed');
      }

      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Action failed:', error);
      return "I'm sorry, I encountered an error while fetching or analyzing that data. Please try again.";
    }
  };

  const handleOptionClick = (option) => {
    // 1. Add user message
    setMessages(prev => [...prev, { role: 'user', text: option.prompt }])
    setIsTyping(true)

    // 2. Determine next step
    if (option.nextNode && DECISION_TREE[option.nextNode]) {
      setTimeout(() => {
        // Navigate down the tree
        setCurrentNode(option.nextNode);
        const nextAiResponse = DECISION_TREE[option.nextNode].aiResponse;
        if (nextAiResponse) {
          setMessages(prev => [...prev, { role: 'assistant', text: nextAiResponse }]);
        }
        setIsTyping(false)
      }, 800)
    } else {
      // Leaf node reached: Trigger action/API simulation
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: `Let me pull that data and analyze it for you...` }
      ]);

      executeAction(option.action, option.prompt).then((aiResponseText) => {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', text: aiResponseText }
        ]);
        setTimeout(() => setCurrentNode('root'), 1000);
        setIsTyping(false);
      });
    }
  }

  return (
    <>
      {/* Floating trigger button - Black engulfing circle with white magic wand */}
      <motion.button
        id="ai-chat-trigger"
        drag
        dragMomentum={false}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setTimeout(() => setIsDragging(false), 150)}
        onClick={() => {
          if (!isDragging) setIsOpen(!isOpen)
        }}
        className="fixed z-50 rounded-full cursor-grab active:cursor-grabbing focus:outline-none"
        style={{
          bottom: 24,
          left: 'calc(50vw - 30px)',
          width: 60,
          height: 60,
          background: '#09090b',
          border: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 20px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1)',
          touchAction: 'none',
        }}
        whileHover={{
          scale: 1.08,
          borderColor: '#3f3f46',
          boxShadow: '0 0 25px rgba(255, 255, 255, 0.2), 0 10px 40px rgba(0, 0, 0, 0.8)',
        }}
        whileTap={{ scale: 0.95 }}
        animate={{
          boxShadow: [
            '0 0 15px rgba(255, 255, 255, 0.08), 0 8px 32px rgba(0,0,0,0.6)',
            '0 0 25px rgba(255, 255, 255, 0.2), 0 8px 32px rgba(0,0,0,0.8)',
            '0 0 15px rgba(255, 255, 255, 0.08), 0 8px 32px rgba(0,0,0,0.6)',
          ],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        aria-label={isOpen ? 'Close AI Chat' : 'Open AI Chat'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.svg
              key="close"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </motion.svg>
          ) : (
            <motion.div
              key="wand"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MagicWand01Icon size={26} autoPlay style={{ color: '#ffffff' }} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat popup - Centralized 75% modal with blurred backdrop */}
      <AnimatePresence>
        {isOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            {/* Blurred Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            />

            {/* Modal Container */}
            <motion.div
              id="ai-chat-popup"
              style={{
                position: 'relative',
                zIndex: 51,
                width: '60vw',
                height: '85vh',
                maxWidth: '960px',
                maxHeight: '850px',
                minWidth: '320px',
                minHeight: '400px',
                borderRadius: 20,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: '#09090b',
                border: '1px solid #27272a',
                boxShadow: '0 25px 80px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.7)',
              }}
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid #27272a',
                  background: '#18181b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#27272a',
                    border: '1px solid #3f3f46',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MagicWand01Icon size={22} autoPlay style={{ color: '#ffffff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: '"Lora", Georgia, serif', fontWeight: 600, fontSize: 16, color: '#ffffff' }}>
                    AI Assistant
                  </div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#22c55e',
                        display: 'inline-block',
                        boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)',
                      }}
                    />
                    Online
                  </div>
                </div>
                {/* Header Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #27272a',
                    color: '#a1a1aa',
                    padding: '6px 10px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3f3f46'
                    e.currentTarget.style.color = '#ffffff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#27272a'
                    e.currentTarget.style.color = '#a1a1aa'
                  }}
                  aria-label="Close modal"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Messages area */}
              <div
                className="custom-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 16px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  background: '#09090b',
                }}
              >
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        fontSize: 13,
                        lineHeight: 1.5,
                        fontFamily: '"Lora", Georgia, serif',
                        ...(msg.role === 'user'
                          ? {
                            background: '#27272a',
                            color: '#ffffff',
                            border: '1px solid #3f3f46',
                          }
                          : {
                            background: '#18181b',
                            color: '#e4e4e7',
                            border: '1px solid #27272a',
                          }),
                      }}
                    >
                      {msg.role === 'user' ? (
                        msg.text
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ node, ...props }) => <h1 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', margin: '8px 0 4px', borderBottom: '1px solid #27272a', paddingBottom: '4px' }} {...props} />,
                            h2: ({ node, ...props }) => <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff', margin: '6px 0 4px' }} {...props} />,
                            h3: ({ node, ...props }) => <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#f43f5e', margin: '6px 0 4px' }} {...props} />,
                            h4: ({ node, ...props }) => <h4 style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8', margin: '4px 0 2px' }} {...props} />,
                            p: ({ node, ...props }) => <p style={{ margin: '0 0 6px 0', lineHeight: '1.5' }} {...props} />,
                            ul: ({ node, ...props }) => <ul style={{ paddingLeft: '18px', margin: '4px 0 8px', listStyleType: 'disc' }} {...props} />,
                            ol: ({ node, ...props }) => <ol style={{ paddingLeft: '18px', margin: '4px 0 8px', listStyleType: 'decimal' }} {...props} />,
                            li: ({ node, ...props }) => <li style={{ marginBottom: '3px' }} {...props} />,
                            strong: ({ node, ...props }) => <strong style={{ color: '#ffffff', fontWeight: 600 }} {...props} />,
                            em: ({ node, ...props }) => <em style={{ color: '#a1a1aa' }} {...props} />,
                            hr: ({ node, ...props }) => <hr style={{ border: 'none', borderTop: '1px solid #27272a', margin: '8px 0' }} {...props} />,
                            table: ({ node, ...props }) => (
                              <div style={{ overflowX: 'auto', margin: '10px 0', borderRadius: '8px', border: '1px solid #3f3f46', background: 'rgba(24, 24, 27, 0.7)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }} {...props} />
                              </div>
                            ),
                            thead: ({ node, ...props }) => (
                              <thead style={{ background: '#27272a', color: '#f4f4f5', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }} {...props} />
                            ),
                            tbody: ({ node, ...props }) => (
                              <tbody style={{ divideY: '1px solid #27272a' }} {...props} />
                            ),
                            tr: ({ node, ...props }) => (
                              <tr style={{ borderBottom: '1px solid #27272a' }} {...props} />
                            ),
                            th: ({ node, ...props }) => (
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#38bdf8', whiteSpace: 'nowrap' }} {...props} />
                            ),
                            td: ({ node, ...props }) => (
                              <td style={{ padding: '8px 12px', color: '#d4d4d8' }} {...props} />
                            ),
                            code: ({ node, inline, ...props }) =>
                              inline ? (
                                <code style={{ background: '#27272a', color: '#fbbf24', padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }} {...props} />
                              ) : (
                                <code style={{ display: 'block', background: '#18181b', border: '1px solid #27272a', padding: '8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', overflowX: 'auto', margin: '6px 0' }} {...props} />
                              )
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <div
                      style={{
                        padding: '12px 18px',
                        borderRadius: '16px 16px 16px 4px',
                        background: '#18181b',
                        border: '1px solid #27272a',
                        display: 'flex',
                        gap: 5,
                        alignItems: 'center',
                      }}
                    >
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#a1a1aa',
                            display: 'block',
                          }}
                          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            delay: i * 0.2,
                            ease: 'easeInOut',
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Preset Options Bar with Collapse Toggle */}
              <div
                style={{
                  borderTop: '1px solid #27272a',
                  background: '#09090b',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px 6px',
                    background: '#09090b',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Quick Options
                  </span>
                  <button
                    onClick={() => setIsOptionsCollapsed(!isOptionsCollapsed)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #27272a',
                      color: '#a1a1aa',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 12,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#3f3f46'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#27272a'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    {isOptionsCollapsed ? (
                      <>
                        <span>Show Options</span>
                        <ChevronUp size={13} />
                      </>
                    ) : (
                      <>
                        <span>Hide</span>
                        <ChevronDown size={13} />
                      </>
                    )}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {!isOptionsCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        padding: '4px 16px 14px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}
                      >
                        {currentNode !== 'root' && (
                          <motion.button
                            onClick={() => setCurrentNode('root')}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3f3f46',
                              color: '#a1a1aa',
                              padding: '8px 14px',
                              borderRadius: 16,
                              fontSize: 12,
                              fontFamily: '"Lora", Georgia, serif',
                              cursor: 'pointer',
                              transition: 'border-color 0.2s, color 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#52525b'
                              e.currentTarget.style.color = '#e4e4e7'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#3f3f46'
                              e.currentTarget.style.color = '#a1a1aa'
                            }}
                          >
                            ← Back to Menu
                          </motion.button>
                        )}
                        {currentOptions.map((option) => (
                          <motion.button
                            key={option.id}
                            onClick={() => handleOptionClick(option)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                              background: '#18181b',
                              border: '1px solid #27272a',
                              color: '#e4e4e7',
                              padding: '8px 14px',
                              borderRadius: 16,
                              fontSize: 12,
                              fontFamily: '"Lora", Georgia, serif',
                              cursor: 'pointer',
                              transition: 'border-color 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3f3f46')}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#27272a')}
                          >
                            {option.icon && <option.icon size={14} />}
                            {option.text}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
