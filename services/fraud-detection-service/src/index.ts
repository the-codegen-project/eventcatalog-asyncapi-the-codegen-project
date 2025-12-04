import { connect, NatsConnection, Subscription, JSONCodec } from 'nats';

// Type definitions based on AsyncAPI spec
interface FraudAlert {
  alertId: string;
  transactionId: string;
  alertTime: string;
  severity: string;
  details: string;
}

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

// Channel addresses from AsyncAPI spec
const CHANNELS = {
  FRAUD_ALERT: 'fraud.alert',
  TRANSACTION_EVALUATED: 'transaction.evaluated',
  TRANSACTION_REVIEW: 'transaction.review',
};

class FraudDetectionService {
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

  // Operation: sendFraudAlert
  async sendFraudAlert(alert: FraudAlert): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Publishing fraud alert for transaction ${alert.transactionId}`);
    this.nc.publish(CHANNELS.FRAUD_ALERT, this.jc.encode(alert));
  }

  // Operation: receiveTransactionEvaluated
  async subscribeToTransactionEvaluated(
    handler: (data: TransactionEvaluated) => Promise<void>
  ): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Subscribing to ${CHANNELS.TRANSACTION_EVALUATED}...`);
    const sub = this.nc.subscribe(CHANNELS.TRANSACTION_EVALUATED);
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.jc.decode(msg.data) as TransactionEvaluated;
          console.log(`Received transaction evaluation for ${data.transactionId}`);
          await handler(data);
        } catch (err) {
          console.error('Error processing transaction evaluated message:', err);
        }
      }
    })();
  }

  // Operation: receiveTransactionReview
  async subscribeToTransactionReview(
    handler: (data: TransactionReview) => Promise<void>
  ): Promise<void> {
    if (!this.nc) throw new Error('Not connected to NATS');
    
    console.log(`Subscribing to ${CHANNELS.TRANSACTION_REVIEW}...`);
    const sub = this.nc.subscribe(CHANNELS.TRANSACTION_REVIEW);
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.jc.decode(msg.data) as TransactionReview;
          console.log(`Received transaction review for ${data.transactionId}`);
          await handler(data);
        } catch (err) {
          console.error('Error processing transaction review message:', err);
        }
      }
    })();
  }
}

// Main application logic
async function main() {
  const service = new FraudDetectionService();
  
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
  
  try {
    await service.connect(natsUrl);

    // Handle transaction evaluations
    await service.subscribeToTransactionEvaluated(async (data) => {
      console.log('Processing transaction evaluation:', JSON.stringify(data, null, 2));
      
      // Business logic: If transaction is flagged as fraudulent, send an alert
      if (data.isFraudulent || data.riskScore > 0.7) {
        const alert: FraudAlert = {
          alertId: `ALERT-${Date.now()}`,
          transactionId: data.transactionId,
          alertTime: new Date().toISOString(),
          severity: data.riskScore > 0.9 ? 'CRITICAL' : data.riskScore > 0.7 ? 'HIGH' : 'MEDIUM',
          details: `Transaction flagged with risk score: ${data.riskScore}`,
        };
        await service.sendFraudAlert(alert);
      }
    });

    // Handle manual transaction reviews
    await service.subscribeToTransactionReview(async (data) => {
      console.log('Processing transaction review:', JSON.stringify(data, null, 2));
      
      // Business logic: Log review outcomes
      if (data.reviewOutcome === 'Declined') {
        console.log(`Transaction ${data.transactionId} was declined by reviewer ${data.reviewerId}`);
      } else if (data.reviewOutcome === 'Escalated') {
        const alert: FraudAlert = {
          alertId: `ALERT-ESC-${Date.now()}`,
          transactionId: data.transactionId,
          alertTime: new Date().toISOString(),
          severity: 'HIGH',
          details: `Transaction escalated by reviewer ${data.reviewerId}`,
        };
        await service.sendFraudAlert(alert);
      }
    });

    console.log('Fraud Detection Service is running. Press Ctrl+C to exit.');

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
    console.error('Failed to start Fraud Detection Service:', err);
    process.exit(1);
  }
}

main();
