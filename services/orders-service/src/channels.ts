// ============================================================================
// Channels (keys are AsyncAPI channel IDs, values are NATS subjects)
// ============================================================================
export const CHANNELS = {
  // Channels this service PUBLISHES to
  orderCancelled: 'order.cancelled',
  orderCompleted: 'order.completed',

  // Channels this service SUBSCRIBES to
  orderCreated: 'order.created',
  paymentFailed: 'payment.failed',
  shipmentDelivered: 'shipment.delivered',
} as const;

