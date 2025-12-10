export interface PaymentFailedProps {
  paymentId: string;
  orderId: string;
  failureReason: string;
}

export class PaymentFailed {
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

