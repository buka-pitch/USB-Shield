export interface UsbDeviceInfo {
  vendor_id: number;
  product_id: number;
  manufacturer: string | null;
  product: string | null;
  serial_number: string | null;
  port_number: number | null;
  connected: boolean;
  trusted: boolean;
}

export type TrustedDevice = [number, number]; // [vendor_id, product_id]
