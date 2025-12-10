import { NatsConnection, JSONCodec, Subscription } from 'nats';
import { CHANNELS } from './channels';
import { OrderCreated } from './models/OrderCreated';
import { OrderCancelled } from './models/OrderCancelled';
import { OrderCompleted } from './models/OrderCompleted';
import { PaymentFailed } from './models/PaymentFailed';
import { ShipmentDelivered } from './models/ShipmentDelivered';

const jc = JSONCodec();

// ============================================================================
// Send (Publish) Functions
// ============================================================================

/**
 * sendOrderCancelled - Publishes OrderCancelled event
 * Channel: order.cancelled
 */
export function sendOrderCancelled(nc: NatsConnection, data: OrderCancelled): void {
  nc.publish(CHANNELS.orderCancelled, jc.encode(data));
  console.log(`📤 [${CHANNELS.orderCancelled}] OrderCancelled sent:`, data);
}

/**
 * sendOrderCompleted - Publishes OrderCompleted event
 * Channel: order.completed
 */
export function sendOrderCompleted(nc: NatsConnection, data: OrderCompleted): void {
  nc.publish(CHANNELS.orderCompleted, jc.encode(data));
  console.log(`📤 [${CHANNELS.orderCompleted}] OrderCompleted sent:`, data);
}

// ============================================================================
// Receive (Subscribe) Functions
// ============================================================================

/**
 * receiveOrderCreated - Subscribes to OrderCreated events
 * Channel: order.created
 */
export function receiveOrderCreated(
  nc: NatsConnection,
  handler: (data: OrderCreated) => Promise<void>
): Subscription {
  const sub = nc.subscribe(CHANNELS.orderCreated);
  
  (async () => {
    for await (const msg of sub) {
      try {
        const data = jc.decode(msg.data) as OrderCreated;
        await handler(data);
      } catch (err) {
        console.error(`❌ Error processing OrderCreated:`, err);
      }
    }
  })();

  console.log(`📬 Subscribed to: ${CHANNELS.orderCreated}`);
  return sub;
}

/**
 * receivePaymentFailed - Subscribes to PaymentFailed events
 * Channel: payment.failed
 */
export function receivePaymentFailed(
  nc: NatsConnection,
  handler: (data: PaymentFailed) => Promise<void>
): Subscription {
  const sub = nc.subscribe(CHANNELS.paymentFailed);
  
  (async () => {
    for await (const msg of sub) {
      try {
        const data = jc.decode(msg.data) as PaymentFailed;
        await handler(data);
      } catch (err) {
        console.error(`❌ Error processing PaymentFailed:`, err);
      }
    }
  })();

  console.log(`📬 Subscribed to: ${CHANNELS.paymentFailed}`);
  return sub;
}

/**
 * receiveShipmentDelivered - Subscribes to ShipmentDelivered events
 * Channel: shipment.delivered
 */
export function receiveShipmentDelivered(
  nc: NatsConnection,
  handler: (data: ShipmentDelivered) => Promise<void>
): Subscription {
  const sub = nc.subscribe(CHANNELS.shipmentDelivered);
  
  (async () => {
    for await (const msg of sub) {
      try {
        const data = jc.decode(msg.data) as ShipmentDelivered;
        await handler(data);
      } catch (err) {
        console.error(`❌ Error processing ShipmentDelivered:`, err);
      }
    }
  })();

  console.log(`📬 Subscribed to: ${CHANNELS.shipmentDelivered}`);
  return sub;
}

