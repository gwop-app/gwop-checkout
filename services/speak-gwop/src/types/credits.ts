export type CreditOrderStatus =
  | 'OPEN'
  | 'PAID'
  | 'CREDITED'
  | 'EXPIRED'
  | 'CANCELED';

export interface CreditSku {
  id: string;
  label: string;
  amount_usdc: number;
  characters: number;
  currency: 'USDC';
}

export interface CreditOrderRecord {
  id: string;
  agent_id: string;
  sku: string;
  quantity: number;
  amount_usdc: number;
  chars_to_grant: number;
  invoice_id: string;
  status: CreditOrderStatus;
  created_at: string;
  updated_at: string;
  credited_at?: string;
}
