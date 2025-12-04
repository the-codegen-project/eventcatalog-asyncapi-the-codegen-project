import { connect, NatsConnection, Subscription, JSONCodec } from 'nats';

// Type definitions based on AsyncAPI spec
interface InventoryItem {
  itemId: string;
  quantity: number;
}

interface InventoryReserved {
  reservationId: string;
  orderId: string;
  items: InventoryItem[];
}

interface InventoryReleased {
  reservationId: string;
  orderId: string;
  items: InventoryItem[];
}

interface InventoryUpdated {
  itemId: string;
  newQuantity: number;
}

interface OrderCreated {
  orderId: string;
  items: InventoryItem[];
}

interface OrderCancelled {
  orderId: string;
  items: InventoryItem[];
}

// Channel addresses from AsyncAPI spec
const CHANNELS = {
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_RELEASED: 'inventory.released',
  INVENTORY_UPDATED: 'inventory.updated',
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
};

// Simple in-memory inventory store
const inventoryStore: Map<string, number> = new Map([
  ['ITEM-001', 100],
  ['ITEM-002', 50],
  ['ITEM-003', 200],
  ['ITEM-004', 75],
]);

// Track active reservations
const reservations: Map<string, { orderId: string; items: InventoryItem[] }> = new Map();

class InventoryService {
  private nc: NatsConnection | null = null;
  private subscriptions: Subscription[] = [];
  private jc = JSONCodec();

  async connect(natsUrl: string = 'nats://localhost:4222'): Promise<void> {
    console.log(`Connecting to NATS at ${natsUrl}...`);
    this.nc = await connect({ servers: natsUrl });
    console.log(`Connected to NATS server: ${this.nc.getServer()}`);
  }

  async disconnect(): Promise<void> {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    if (this.nc) {
      await this.nc.drain();
      console.log('Disconnected from NATS');
    }
  }

  // Operation: sendInventoryReserved
  async sendInventoryReserved(data: InventoryReserved): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Publishing inventory reserved for order ${data.orderId}`);
    this.nc.publish(CHANNELS.INVENTORY_RESERVED, this.jc.encode(data));
  }

  // Operation: sendInventoryReleased
  async sendInventoryReleased(data: InventoryReleased): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Publishing inventory released for order ${data.orderId}`);
    this.nc.publish(CHANNELS.INVENTORY_RELEASED, this.jc.encode(data));
  }

  // Operation: sendInventoryUpdated
  async sendInventoryUpdated(data: InventoryUpdated): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Publishing inventory updated for item ${data.itemId}`);
    this.nc.publish(CHANNELS.INVENTORY_UPDATED, this.jc.encode(data));
  }

  // Operation: receiveOrderCreated
  async subscribeToOrderCreated(
    handler: (data: OrderCreated) => Promise<void>
  ): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Subscribing to ${CHANNELS.ORDER_CREATED}...`);
    const sub = this.nc.subscribe(CHANNELS.ORDER_CREATED);
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.jc.decode(msg.data) as OrderCreated;
          console.log(`Received order created for ${data.orderId}`);
          await handler(data);
        } catch (err) {
          console.error('Error processing order created message:', err);
        }
      }
    })();
  }

  // Operation: receiveOrderCancelled
  async subscribeToOrderCancelled(
    handler: (data: OrderCancelled) => Promise<void>
  ): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Subscribing to ${CHANNELS.ORDER_CANCELLED}...`);
    const sub = this.nc.subscribe(CHANNELS.ORDER_CANCELLED);
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.jc.decode(msg.data) as OrderCancelled;
          console.log(`Received order cancelled for ${data.orderId}`);
          await handler(data);
        } catch (err) {
          console.error('Error processing order cancelled message:', err);
        }
      }
    })();
  }
}

// Business logic helpers
function checkInventoryAvailability(items: InventoryItem[]): boolean {
  for (const item of items) {
    const available = inventoryStore.get(item.itemId) || 0;
    if (available < item.quantity) {
      return false;
    }
  }
  return true;
}

function reserveInventory(items: InventoryItem[]): void {
  for (const item of items) {
    const current = inventoryStore.get(item.itemId) || 0;
    inventoryStore.set(item.itemId, current - item.quantity);
  }
}

function releaseInventory(items: InventoryItem[]): void {
  for (const item of items) {
    const current = inventoryStore.get(item.itemId) || 0;
    inventoryStore.set(item.itemId, current + item.quantity);
  }
}

// Main application logic
async function main() {
  const service = new InventoryService();
  
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
  
  try {
    await service.connect(natsUrl);

    // Handle order created - reserve inventory
    await service.subscribeToOrderCreated(async (data) => {
      console.log('Processing order created:', JSON.stringify(data, null, 2));
      
      // Check if inventory is available
      if (checkInventoryAvailability(data.items)) {
        // Reserve the inventory
        reserveInventory(data.items);
        
        const reservationId = `RES-${Date.now()}`;
        
        // Store the reservation for potential release
        reservations.set(reservationId, {
          orderId: data.orderId,
          items: data.items,
        });

        // Send inventory reserved event
        const reserved: InventoryReserved = {
          reservationId,
          orderId: data.orderId,
          items: data.items,
        };
        await service.sendInventoryReserved(reserved);
        
        console.log(`Inventory reserved for order ${data.orderId}`);
        
        // Send inventory updates for each item
        for (const item of data.items) {
          const newQuantity = inventoryStore.get(item.itemId) || 0;
          await service.sendInventoryUpdated({
            itemId: item.itemId,
            newQuantity,
          });
        }
      } else {
        console.log(`Insufficient inventory for order ${data.orderId}`);
      }
    });

    // Handle order cancelled - release inventory
    await service.subscribeToOrderCancelled(async (data) => {
      console.log('Processing order cancelled:', JSON.stringify(data, null, 2));
      
      // Find the reservation for this order
      let reservationId: string | null = null;
      for (const [resId, reservation] of reservations.entries()) {
        if (reservation.orderId === data.orderId) {
          reservationId = resId;
          break;
        }
      }

      if (reservationId) {
        const reservation = reservations.get(reservationId)!;
        
        // Release the inventory
        releaseInventory(reservation.items);
        
        // Remove the reservation
        reservations.delete(reservationId);

        // Send inventory released event
        const released: InventoryReleased = {
          reservationId,
          orderId: data.orderId,
          items: reservation.items,
        };
        await service.sendInventoryReleased(released);
        
        console.log(`Inventory released for order ${data.orderId}`);
        
        // Send inventory updates for each item
        for (const item of reservation.items) {
          const newQuantity = inventoryStore.get(item.itemId) || 0;
          await service.sendInventoryUpdated({
            itemId: item.itemId,
            newQuantity,
          });
        }
      } else {
        console.log(`No reservation found for order ${data.orderId}`);
      }
    });

    console.log('Inventory Service is running. Press Ctrl+C to exit.');
    console.log('Current inventory levels:', Object.fromEntries(inventoryStore));

    // Keep the service running
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await service.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      await service.disconnect();
      process.exit(0);
    });

  } catch (err) {
    console.error('Failed to start Inventory Service:', err);
    process.exit(1);
  }
}

main();

