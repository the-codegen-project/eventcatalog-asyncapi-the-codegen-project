export interface OrderCompletedProps {
  orderId: string;
  completionTime: string; // ISO 8601 date-time
}

export class OrderCompleted {
  private _orderId: string;
  private _completionTime: string;

  constructor(props: OrderCompletedProps) {
    this._orderId = props.orderId;
    this._completionTime = props.completionTime;
  }

  get orderId(): string { return this._orderId; }
  get completionTime(): string { return this._completionTime; }
}

