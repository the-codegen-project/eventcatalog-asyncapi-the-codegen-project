export interface OrderCancelledProps {
  orderId: string;
  reason: string;
}

export class OrderCancelled {
  private _orderId: string;
  private _reason: string;

  constructor(props: OrderCancelledProps) {
    this._orderId = props.orderId;
    this._reason = props.reason;
  }

  get orderId(): string { return this._orderId; }
  get reason(): string { return this._reason; }
}

