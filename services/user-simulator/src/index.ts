import { connect, NatsConnection, JSONCodec } from 'nats';

// ============================================================================
// Type definitions based on AsyncAPI specs across all services
// ============================================================================

interface OrderItem {
  itemId: string;
  quantity: number;
  price?: number;
}

// Orders Service messages
interface OrderCreated {
  orderId: string;
  userId: string;
  totalAmount: number;
  items: OrderItem[];
}

interface OrderCancelled {
  orderId: string;
  reason: string;
}

// Inventory Service messages  
interface InventoryReserved {
  reservationId: string;
  orderId: string;
  items: { itemId: string; quantity: number }[];
}

// Payment Service messages
interface TransactionVerified {
  transactionId: string;
  verificationTime: string;
  status: string;
}

interface PaymentProcessed {
  orderId: string;
  paymentId: string;
  status: string;
}

// Fraud Detection messages
interface TransactionEvaluated {
  transactionId: string;
  evaluationTime: string;
  isFraudulent: boolean;
  riskScore: number;
}

interface TransactionReview {
  transactionId: string;
  reviewTime: string;
  reviewOutcome: string;
  reviewerId: string;
}

// Shipment messages
interface ShipmentDelivered {
  orderId: string;
  shipmentId: string;
  deliveryTime: string;
}

// ============================================================================
// Channel addresses (using dots for NATS subject format)
// ============================================================================
const CHANNELS = {
  // Messages that trigger inventory & fulfillment services
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  
  // Messages that trigger fraud detection service
  TRANSACTION_EVALUATED: 'transaction.evaluated',
  TRANSACTION_REVIEW: 'transaction.review',
  
  // Messages that trigger payment service
  TRANSACTION_VERIFIED: 'transaction.verified',
  
  // Messages that trigger orders service
  PAYMENT_PROCESSED: 'payment.processed',
  INVENTORY_RESERVED: 'inventory.reserved',
  SHIPMENT_DELIVERED: 'shipment.delivered',
};

// ============================================================================
// Sample data for realistic simulation
// ============================================================================
const SAMPLE_ITEMS = [
  { itemId: 'ITEM-001', name: 'Wireless Headphones', price: 79.99 },
  { itemId: 'ITEM-002', name: 'USB-C Cable', price: 12.99 },
  { itemId: 'ITEM-003', name: 'Mechanical Keyboard', price: 149.99 },
  { itemId: 'ITEM-004', name: 'Mouse Pad XL', price: 24.99 },
  { itemId: 'ITEM-005', name: 'Webcam HD', price: 59.99 },
  { itemId: 'ITEM-006', name: 'Monitor Stand', price: 89.99 },
];

const SAMPLE_USERS = ['user-001', 'user-002', 'user-003', 'user-004', 'user-005'];
const REVIEWERS = ['reviewer-001', 'reviewer-002', 'reviewer-003'];
const REVIEW_OUTCOMES = ['Approved', 'Declined', 'Escalated'];
const CANCEL_REASONS = [
  'Customer requested cancellation',
  'Payment declined',
  'Out of stock',
  'Shipping address invalid',
];

// ============================================================================
// Utility functions
// ============================================================================
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// User Simulator Service
// ============================================================================
class UserSimulator {
  private nc: NatsConnection | null = null;
  private jc = JSONCodec();
  private activeOrders: Map<string, OrderCreated> = new Map();
  private running = true;

  async connect(natsUrl: string = 'nats://localhost:4222'): Promise<void> {
    console.log(`🔌 Connecting to NATS at ${natsUrl}...`);
    this.nc = await connect({ servers: natsUrl });
    console.log(`✅ Connected to NATS server: ${this.nc.getServer()}`);
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.nc) {
      await this.nc.drain();
      console.log('👋 Disconnected from NATS');
    }
  }

  private publish<T>(channel: string, data: T): void {
    if (!this.nc) throw new Error('Not connected to NATS');
    this.nc.publish(channel, this.jc.encode(data));
  }

  // =========================================================================
  // Simulation scenarios
  // =========================================================================

  /**
   * Simulate a complete order flow:
   * 1. Create order
   * 2. Reserve inventory
   * 3. Evaluate transaction for fraud
   * 4. Verify transaction
   * 5. Process payment
   * 6. Deliver shipment
   */
  async simulateOrderFlow(): Promise<void> {
    const orderId = generateId('ORD');
    const userId = randomElement(SAMPLE_USERS);
    
    // Create random order items
    const numItems = randomInt(1, 3);
    const items: OrderItem[] = [];
    let totalAmount = 0;
    
    for (let i = 0; i < numItems; i++) {
      const product = randomElement(SAMPLE_ITEMS);
      const quantity = randomInt(1, 3);
      items.push({
        itemId: product.itemId,
        quantity,
        price: product.price,
      });
      totalAmount += product.price * quantity;
    }

    // Step 1: Create order
    const order: OrderCreated = { orderId, userId, totalAmount, items };
    console.log(`\n🛒 Creating order ${orderId} for ${userId} - $${totalAmount.toFixed(2)}`);
    this.publish(CHANNELS.ORDER_CREATED, order);
    this.activeOrders.set(orderId, order);
    
    await sleep(500);

    // Step 2: Simulate inventory reservation
    const reservationId = generateId('RES');
    const inventoryReserved: InventoryReserved = {
      reservationId,
      orderId,
      items: items.map(i => ({ itemId: i.itemId, quantity: i.quantity })),
    };
    console.log(`📦 Inventory reserved (${reservationId}) for order ${orderId}`);
    this.publish(CHANNELS.INVENTORY_RESERVED, inventoryReserved);
    
    await sleep(300);

    // Step 3: Evaluate transaction for fraud
    const transactionId = generateId('TXN');
    const riskScore = Math.random();
    const transactionEvaluated: TransactionEvaluated = {
      transactionId,
      evaluationTime: new Date().toISOString(),
      isFraudulent: riskScore > 0.85,
      riskScore,
    };
    console.log(`🔍 Transaction ${transactionId} evaluated - Risk: ${(riskScore * 100).toFixed(1)}%`);
    this.publish(CHANNELS.TRANSACTION_EVALUATED, transactionEvaluated);

    // If flagged, sometimes trigger manual review
    if (riskScore > 0.7 && Math.random() > 0.5) {
      await sleep(200);
      const review: TransactionReview = {
        transactionId,
        reviewTime: new Date().toISOString(),
        reviewOutcome: randomElement(REVIEW_OUTCOMES),
        reviewerId: randomElement(REVIEWERS),
      };
      console.log(`👤 Manual review for ${transactionId}: ${review.reviewOutcome}`);
      this.publish(CHANNELS.TRANSACTION_REVIEW, review);
    }

    await sleep(400);

    // Step 4: Verify transaction
    const transactionVerified: TransactionVerified = {
      transactionId,
      verificationTime: new Date().toISOString(),
      status: riskScore > 0.9 ? 'rejected' : 'verified',
    };
    console.log(`✔️  Transaction ${transactionId} verification: ${transactionVerified.status}`);
    this.publish(CHANNELS.TRANSACTION_VERIFIED, transactionVerified);

    if (transactionVerified.status === 'rejected') {
      // Cancel the order if transaction rejected
      await sleep(200);
      const cancelled: OrderCancelled = {
        orderId,
        reason: 'Transaction verification failed',
      };
      console.log(`❌ Order ${orderId} cancelled: ${cancelled.reason}`);
      this.publish(CHANNELS.ORDER_CANCELLED, cancelled);
      this.activeOrders.delete(orderId);
      return;
    }

    await sleep(300);

    // Step 5: Process payment
    const paymentId = generateId('PAY');
    const paymentProcessed: PaymentProcessed = {
      orderId,
      paymentId,
      status: 'completed',
    };
    console.log(`💳 Payment ${paymentId} processed for order ${orderId}`);
    this.publish(CHANNELS.PAYMENT_PROCESSED, paymentProcessed);

    await sleep(500);

    // Step 6: Simulate shipment delivery
    const shipmentId = generateId('SHIP');
    const shipmentDelivered: ShipmentDelivered = {
      orderId,
      shipmentId,
      deliveryTime: new Date().toISOString(),
    };
    console.log(`🚚 Shipment ${shipmentId} delivered for order ${orderId}`);
    this.publish(CHANNELS.SHIPMENT_DELIVERED, shipmentDelivered);
    
    this.activeOrders.delete(orderId);
    console.log(`✅ Order ${orderId} flow completed!`);
  }

  /**
   * Occasionally cancel an active order
   */
  async simulateOrderCancellation(): Promise<void> {
    if (this.activeOrders.size === 0) return;
    
    const orders = Array.from(this.activeOrders.keys());
    const orderId = randomElement(orders);
    
    const cancelled: OrderCancelled = {
      orderId,
      reason: randomElement(CANCEL_REASONS),
    };
    
    console.log(`\n🚫 Cancelling order ${orderId}: ${cancelled.reason}`);
    this.publish(CHANNELS.ORDER_CANCELLED, cancelled);
    this.activeOrders.delete(orderId);
  }

  /**
   * Simulate a suspicious transaction for fraud detection
   */
  async simulateSuspiciousActivity(): Promise<void> {
    const transactionId = generateId('SUSPICIOUS-TXN');
    
    const transactionEvaluated: TransactionEvaluated = {
      transactionId,
      evaluationTime: new Date().toISOString(),
      isFraudulent: true,
      riskScore: 0.95 + Math.random() * 0.05, // 95-100% risk
    };
    
    console.log(`\n🚨 Suspicious transaction ${transactionId} - Risk: ${(transactionEvaluated.riskScore * 100).toFixed(1)}%`);
    this.publish(CHANNELS.TRANSACTION_EVALUATED, transactionEvaluated);
    
    await sleep(300);
    
    // Always trigger manual review for suspicious activity
    const review: TransactionReview = {
      transactionId,
      reviewTime: new Date().toISOString(),
      reviewOutcome: 'Escalated',
      reviewerId: randomElement(REVIEWERS),
    };
    console.log(`👮 Escalating suspicious transaction ${transactionId}`);
    this.publish(CHANNELS.TRANSACTION_REVIEW, review);
  }

  /**
   * Main simulation loop
   */
  async runSimulation(): Promise<void> {
    console.log('\n🎮 Starting User Behavior Simulation...');
    console.log('━'.repeat(50));
    
    let orderCount = 0;
    
    while (this.running) {
      try {
        // 70% chance: Normal order flow
        // 15% chance: Cancel an existing order
        // 15% chance: Suspicious activity
        const action = Math.random();
        
        if (action < 0.70) {
          await this.simulateOrderFlow();
          orderCount++;
        } else if (action < 0.85) {
          await this.simulateOrderCancellation();
        } else {
          await this.simulateSuspiciousActivity();
        }
        
        // Wait between 2-5 seconds between actions
        const waitTime = randomInt(2000, 5000);
        console.log(`\n⏳ Next action in ${(waitTime / 1000).toFixed(1)}s... (${orderCount} orders created)`);
        await sleep(waitTime);
        
      } catch (err) {
        console.error('Error in simulation:', err);
        await sleep(1000);
      }
    }
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  const simulator = new UserSimulator();
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  try {
    await simulator.connect(natsUrl);

    console.log('\n' + '═'.repeat(50));
    console.log('  🧪 USER BEHAVIOR SIMULATOR');
    console.log('  Simulates orders, payments, fraud detection, etc.');
    console.log('═'.repeat(50));
    console.log('\nChannels being published to:');
    Object.entries(CHANNELS).forEach(([key, channel]) => {
      console.log(`  • ${channel}`);
    });
    console.log('\nPress Ctrl+C to stop.\n');

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n\n🛑 Shutting down simulator...');
      await simulator.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the simulation
    await simulator.runSimulation();

  } catch (err) {
    console.error('❌ Failed to start User Simulator:', err);
    process.exit(1);
  }
}

main();

