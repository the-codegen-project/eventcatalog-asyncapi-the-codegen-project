export interface ShipmentDeliveredProps {
  orderId: string;
  shipmentId: string;
  deliveryTime: string; // ISO 8601 date-time
}

export class ShipmentDelivered {
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

