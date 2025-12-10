import { OrderItem } from './OrderItem';

export interface OrderCreatedProps {
  orderId: string;
  userId: string;
  totalAmount: number;
  items: OrderItem[];
}

export class OrderCreated {
  private _orderId: string;
  private _userId: string;
  private _totalAmount: number;
  private _items: OrderItem[];

  constructor(props: OrderCreatedProps) {
    this._orderId = props.orderId;
    this._userId = props.userId;
    this._totalAmount = props.totalAmount;
    this._items = props.items;
  }

  get orderId(): string { return this._orderId; }
  get userId(): string { return this._userId; }
  get totalAmount(): number { return this._totalAmount; }
  get items(): OrderItem[] { return this._items; }
}

