export interface OrderItemProps {
  itemId: string;
  quantity: number;
  price: number;
}

export class OrderItem {
  private _itemId: string;
  private _quantity: number;
  private _price: number;

  constructor(props: OrderItemProps) {
    this._itemId = props.itemId;
    this._quantity = props.quantity;
    this._price = props.price;
  }

  get itemId(): string { return this._itemId; }
  get quantity(): number { return this._quantity; }
  get price(): number { return this._price; }
}

