import { connect, NatsConnection, JSONCodec, Subscription } from 'nats';

// ============================================================================
// Type definitions based on AsyncAPI orders-service.yml specification
// ============================================================================

interface OrderCreatedItemProps {
  itemId: string;
  quantity: number;
  price: number;
}

class OrderCreatedItem {
  private _itemId: string;
  private _quantity: number;
  private _price: number;

  constructor(props: OrderCreatedItemProps) {
    this._itemId = props.itemId;
    this._quantity = props.quantity;
    this._price = props.price;
  }

  get itemId(): string { return this._itemId; }
  get quantity(): number { return this._quantity; }
  get price(): number { return this._price; }
}

// Messages the Orders Service SENDS
interface OrderCreatedProps {
  orderId: string;
  userId: string;
  totalAmount: number;
  items: OrderCreatedItem[];
}

class OrderCreated {
  private _orderId: string;
  private _userId: string;
  private _totalAmount: number;
  private _items: OrderCreatedItem[];

  constructor(props: OrderCreatedProps) {
    this._orderId = props.orderId;
    this._userId = props.userId;
    this._totalAmount = props.totalAmount;
    this._items = props.items;
  }

  get orderId(): string { return this._orderId; }
  get userId(): string { return this._userId; }
  get totalAmount(): number { return this._totalAmount; }
  get items(): OrderCreatedItem[] { return this._items; }
}

interface OrderCancelledProps {
  orderId: string;
  reason: string;
}

class OrderCancelled {
  private _orderId: string;
  private _reason: string;

  constructor(props: OrderCancelledProps) {
    this._orderId = props.orderId;
    this._reason = props.reason;
  }

  get orderId(): string { return this._orderId; }
  get reason(): string { return this._reason; }
}

interface OrderCompletedProps {
  orderId: string;
  completionTime: string; // ISO 8601 date-time
}

class OrderCompleted {
  private _orderId: string;
  private _completionTime: string;

  constructor(props: OrderCompletedProps) {
    this._orderId = props.orderId;
    this._completionTime = props.completionTime;
  }

  get orderId(): string { return this._orderId; }
  get completionTime(): string { return this._completionTime; }
}

// Messages the Orders Service RECEIVES
interface PaymentFailedProps {
  paymentId: string;
  orderId: string;
  failureReason: string;
}

class PaymentFailed {
  private _paymentId: string;
  private _orderId: string;
  private _failureReason: string;

  constructor(props: PaymentFailedProps) {
    this._paymentId = props.paymentId;
    this._orderId = props.orderId;
    this._failureReason = props.failureReason;
  }

  get paymentId(): string { return this._paymentId; }
  get orderId(): string { return this._orderId; }
  get failureReason(): string { return this._failureReason; }
}

interface ShipmentDeliveredProps {
  orderId: string;
  shipmentId: string;
  deliveryTime: string; // ISO 8601 date-time
}

class ShipmentDelivered {
  private _orderId: string;
  private _shipmentId: string;
  private _deliveryTime: string;

  constructor(props: ShipmentDeliveredProps) {
    this._orderId = props.orderId;
    this._shipmentId = props.shipmentId;
    this._deliveryTime = props.deliveryTime;
  }

  get orderId(): string { return this._orderId; }
  get shipmentId(): string { return this._shipmentId; }
  get deliveryTime(): string { return this._deliveryTime; }
}

// ============================================================================
// Channels (keys are AsyncAPI channel IDs, values are NATS subjects)
// ============================================================================
const CHANNELS = {
  // Channels this service PUBLISHES to
  orderCancelled: 'order.cancelled',
  orderCompleted: 'order.completed',

  // Channels this service SUBSCRIBES to
  orderCreated: 'order.created',
  paymentFailed: 'payment.failed',
  shipmentDelivered: 'shipment.delivered',
} as const;

// ============================================================================
// Order state management
// ============================================================================
type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'completed' | 'cancelled';

interface OrderItem {
  itemId: string,
  quantity: number,
  price: number
}

interface Order {
  orderId: string;
  userId: string;
  totalAmount: number;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date;
}

// ============================================================================
// Orders Service Implementation
// ============================================================================
class OrdersService {
  private nc: NatsConnection | null = null;
  private jc = JSONCodec();
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
  // Publishing operations (SEND)
  // =========================================================================

  /**
   * sendOrderCancelled - Publishes OrderCancelled event
   * Channel: order.cancelled
   */
  sendOrderCancelled(data: OrderCancelled): void {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    this.nc.publish(CHANNELS.orderCancelled, this.jc.encode(data));
    console.log(`📤 [${CHANNELS.orderCancelled}] OrderCancelled sent:`, data);

    // Update internal state
    const order = this.orders.get(data.orderId);
    if (order) {
      order.status = 'cancelled';
    }
  }

  /**
   * sendOrderCompleted - Publishes OrderCompleted event
   * Channel: order.completed
   */
  sendOrderCompleted(data: OrderCompleted): void {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    this.nc.publish(CHANNELS.orderCompleted, this.jc.encode(data));
    console.log(`📤 OrderCompleted sent:`, data);

    // Update internal state
    const order = this.orders.get(data.orderId);
    if (order) {
      order.status = 'completed';
    }
  }

  // =========================================================================
  // Subscription handlers (RECEIVE)
  // =========================================================================

  /**
   * receiveOrderCreated - Subscribes to OrderCreated events
   * Channel: order.created
   * 
   * When an order is created (by another service/frontend), track it internally
   */
  private async handleOrderCreated(data: OrderCreated): Promise<void> {
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
  }

  /**
   * receivePaymentFailed - Subscribes to PaymentFailed events
   * Channel: payment.failed
   * 
   * When payment fails, the order should be cancelled
   */
  private async handlePaymentFailed(data: PaymentFailed): Promise<void> {
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
    this.sendOrderCancelled(new OrderCancelled({
      orderId: data.orderId,
      reason: `Payment failed: ${data.failureReason}`,
    }));
  }

  /**
   * receiveShipmentDelivered - Subscribes to ShipmentDelivered events
   * Channel: shipment.delivered
   * 
   * When shipment is delivered, the order should be marked as completed
   */
  private async handleShipmentDelivered(data: ShipmentDelivered): Promise<void> {
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
    this.sendOrderCompleted(new OrderCompleted({
      orderId: data.orderId,
      completionTime: new Date().toISOString(),
    }));
  }

  // =========================================================================
  // Subscription setup
  // =========================================================================

  async setupSubscriptions(): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');

    // Subscribe to OrderCreated events
    const orderCreatedSub = this.nc.subscribe(CHANNELS.orderCreated);
    this.subscriptions.push(orderCreatedSub);
    
    (async () => {
      for await (const msg of orderCreatedSub) {
        try {
          const data = this.jc.decode(msg.data) as OrderCreated;
          await this.handleOrderCreated(data);
        } catch (err) {
          console.error(`❌ Error processing OrderCreated:`, err);
        }
      }
    })();

    console.log(`📬 Subscribed to: ${CHANNELS.orderCreated}`);

    // Subscribe to PaymentFailed events
    const paymentFailedSub = this.nc.subscribe(CHANNELS.paymentFailed);
    this.subscriptions.push(paymentFailedSub);
    
    (async () => {
      for await (const msg of paymentFailedSub) {
        try {
          const data = this.jc.decode(msg.data) as PaymentFailed;
          await this.handlePaymentFailed(data);
        } catch (err) {
          console.error(`❌ Error processing PaymentFailed:`, err);
        }
      }
    })();

    console.log(`📬 Subscribed to: ${CHANNELS.paymentFailed}`);

    // Subscribe to ShipmentDelivered events
    const shipmentDeliveredSub = this.nc.subscribe(CHANNELS.shipmentDelivered);
    this.subscriptions.push(shipmentDeliveredSub);
    
    (async () => {
      for await (const msg of shipmentDeliveredSub) {
        try {
          const data = this.jc.decode(msg.data) as ShipmentDelivered;
          await this.handleShipmentDelivered(data);
        } catch (err) {
          console.error(`❌ Error processing ShipmentDelivered:`, err);
        }
      }
    })();

    console.log(`📬 Subscribed to: ${CHANNELS.shipmentDelivered}`);
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

    this.sendOrderCancelled(new OrderCancelled({ orderId, reason }));
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

