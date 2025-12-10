import { connect, NatsConnection, Subscription } from 'nats';

import { CHANNELS } from './channels';
import { OrderCreated } from './models/OrderCreated';
import { OrderCancelled } from './models/OrderCancelled';
import { OrderCompleted } from './models/OrderCompleted';
import { PaymentFailed } from './models/PaymentFailed';
import { ShipmentDelivered } from './models/ShipmentDelivered';
import {
  sendOrderCancelled,
  sendOrderCompleted,
  receiveOrderCreated,
  receivePaymentFailed,
  receiveShipmentDelivered,
} from './nats';

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'completed' | 'cancelled';
export interface OrderItems {
  itemId: string;
  quantity: number;
  price: number;
}
export interface Order {
  orderId: string;
  userId: string;
  totalAmount: number;
  items: OrderItems[];
  status: OrderStatus;
  createdAt: Date;
}

// ============================================================================
// Orders Service Implementation
// ============================================================================
class OrdersService {
  private nc: NatsConnection | null = null;
  private subscriptions: Subscription[] = [];
  private orders: Map<string, Order> = new Map();
  private running = true;

  async connect(natsUrl: string = 'nats://localhost:4222'): Promise<void> {
    console.log(`🔌 Connecting to NATS at ${natsUrl}...`);
    this.nc = await connect({ servers: natsUrl });
    console.log(`✅ Connected to NATS server: ${this.nc.getServer()}`);
  }

  async disconnect(): Promise<void> {
    this.running = false;
    
    // Unsubscribe from all subscriptions
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];

    if (this.nc) {
      await this.nc.drain();
      console.log('👋 Disconnected from NATS');
    }
  }

  // =========================================================================
  // Handlers (Business Logic)
  // =========================================================================

  /**
   * handleOrderCreated - Handles OrderCreated events
   * When an order is created (by another service/frontend), track it internally
   */
  private handleOrderCreated = async (data: OrderCreated): Promise<void> => {
    console.log(`📥 [${CHANNELS.orderCreated}] OrderCreated received:`, {
      orderId: data.orderId,
      userId: data.userId,
      totalAmount: data.totalAmount,
      itemCount: data.items.length,
    });

    // Check if we already have this order
    if (this.orders.has(data.orderId)) {
      console.log(`⚠️  Order ${data.orderId} already exists, ignoring duplicate`);
      return;
    }

    // Track order internally
    this.orders.set(data.orderId, {
      orderId: data.orderId,
      userId: data.userId,
      totalAmount: data.totalAmount,
      items: data.items,
      status: 'pending',
      createdAt: new Date(),
    });

    console.log(`✅ Order ${data.orderId} registered - waiting for payment/shipment events`);
  };

  /**
   * handlePaymentFailed - Handles PaymentFailed events
   * When payment fails, the order should be cancelled
   */
  private handlePaymentFailed = async (data: PaymentFailed): Promise<void> => {
    console.log(`📥 [${CHANNELS.paymentFailed}] PaymentFailed received:`, data);

    const order = this.orders.get(data.orderId);
    if (!order) {
      console.log(`⚠️  Order ${data.orderId} not found, ignoring payment failure`);
      return;
    }

    if (order.status === 'cancelled') {
      console.log(`⚠️  Order ${data.orderId} already cancelled, ignoring`);
      return;
    }

    // Cancel the order due to payment failure
    console.log(`🚫 Cancelling order ${data.orderId} due to payment failure: ${data.failureReason}`);
    this.publishOrderCancelled(new OrderCancelled({
      orderId: data.orderId,
      reason: `Payment failed: ${data.failureReason}`,
    }));
  };

  /**
   * handleShipmentDelivered - Handles ShipmentDelivered events
   * When shipment is delivered, the order should be marked as completed
   */
  private handleShipmentDelivered = async (data: ShipmentDelivered): Promise<void> => {
    console.log(`📥 [${CHANNELS.shipmentDelivered}] ShipmentDelivered received:`, data);

    const order = this.orders.get(data.orderId);
    if (!order) {
      console.log(`⚠️  Order ${data.orderId} not found, ignoring shipment delivery`);
      return;
    }

    if (order.status === 'cancelled') {
      console.log(`⚠️  Order ${data.orderId} is cancelled, ignoring shipment delivery`);
      return;
    }

    if (order.status === 'completed') {
      console.log(`⚠️  Order ${data.orderId} already completed, ignoring`);
      return;
    }

    // Mark order as completed
    console.log(`✅ Completing order ${data.orderId} - shipment delivered at ${data.deliveryTime}`);
    this.publishOrderCompleted(new OrderCompleted({
      orderId: data.orderId,
      completionTime: new Date().toISOString(),
    }));
  };

  // =========================================================================
  // Publishing wrappers (update state + send)
  // =========================================================================

  private publishOrderCancelled(data: OrderCancelled): void {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    sendOrderCancelled(this.nc, data);

    // Update internal state
    const order = this.orders.get(data.orderId);
    if (order) {
      order.status = 'cancelled';
    }
  }

  private publishOrderCompleted(data: OrderCompleted): void {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    sendOrderCompleted(this.nc, data);

    // Update internal state
    const order = this.orders.get(data.orderId);
    if (order) {
      order.status = 'completed';
    }
  }

  // =========================================================================
  // Subscription setup
  // =========================================================================

  async setupSubscriptions(): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');

    this.subscriptions.push(receiveOrderCreated(this.nc, this.handleOrderCreated));
    this.subscriptions.push(receivePaymentFailed(this.nc, this.handlePaymentFailed));
    this.subscriptions.push(receiveShipmentDelivered(this.nc, this.handleShipmentDelivered));
  }

  // =========================================================================
  // Public API for order management
  // =========================================================================

  cancelOrder(orderId: string, reason: string): void {
    const order = this.orders.get(orderId);
    if (!order) {
      console.log(`⚠️  Cannot cancel: Order ${orderId} not found`);
      return;
    }

    if (order.status === 'cancelled') {
      console.log(`⚠️  Order ${orderId} is already cancelled`);
      return;
    }

    if (order.status === 'completed') {
      console.log(`⚠️  Cannot cancel completed order ${orderId}`);
      return;
    }

    this.publishOrderCancelled(new OrderCancelled({ orderId, reason }));
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getOrderCount(): number {
    return this.orders.size;
  }

  getOrdersByStatus(status: OrderStatus): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === status);
  }

  // =========================================================================
  // Service runner
  // =========================================================================

  async run(): Promise<void> {
    console.log('\n' + '═'.repeat(60));
    console.log('  📦 ORDERS SERVICE');
    console.log('  Processing orders and orchestrating the order lifecycle');
    console.log('═'.repeat(60));

    console.log('\n📤 Publishing to channels:');
    console.log(`   • ${CHANNELS.orderCancelled}`);
    console.log(`   • ${CHANNELS.orderCompleted}`);

    console.log('\n📥 Subscribing to channels:');
    console.log(`   • ${CHANNELS.orderCreated}`);
    console.log(`   • ${CHANNELS.paymentFailed}`);
    console.log(`   • ${CHANNELS.shipmentDelivered}`);

    await this.setupSubscriptions();

    console.log('\n✅ Orders Service is running. Waiting for events...');
    console.log('   Press Ctrl+C to stop.\n');

    // Keep the service running
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Periodic status report (every 30 seconds)
      if (Date.now() % 30000 < 1000) {
        const pending = this.getOrdersByStatus('pending').length;
        const completed = this.getOrdersByStatus('completed').length;
        const cancelled = this.getOrdersByStatus('cancelled').length;
        console.log(`📊 Status: ${this.orders.size} total orders (${pending} pending, ${completed} completed, ${cancelled} cancelled)`);
      }
    }
  }
}

// ============================================================================
// Main entry point
// ============================================================================
async function main() {
  const service = new OrdersService();
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  try {
    await service.connect(natsUrl);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n\n🛑 Shutting down Orders Service...');
      await service.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await service.run();

  } catch (err) {
    console.error('❌ Failed to start Orders Service:', err);
    process.exit(1);
  }
}

main();
