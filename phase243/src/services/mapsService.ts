import { Ticket } from '../types/index.ts';

/**
 * Builds a standardized Google Maps search query URL using actual customer address fields.
 * Format: https://www.google.com/maps/search/?api=1&query=ALAMAT_PELANGGAN
 */
export function buildGoogleMapsSearchUrl(ticket: Partial<Ticket>): { url: string; address: string } {
  if (!ticket) return { url: '', address: '' };

  const fields = [
    ticket.streetName,
    ticket.address,
    ticket.streetAlternatif,
    ticket.clusterName,
    ticket.area,
    ticket.city,
    ticket.postalCode
  ];

  const address = fields
    .filter((value): value is string => 
      typeof value === 'string' && 
      value.trim() !== '' && 
      value.trim() !== '-' && 
      value.toLowerCase() !== 'null' && 
      value.toLowerCase() !== 'undefined'
    )
    .map(value => value.trim())
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(', ');

  if (!address) {
    return { url: '', address: '' };
  }

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return { url, address };
}

/**
 * Opens Google Maps search directly in a new window/tab or launches the native Google Maps app on Android.
 */
export function openCustomerAddressInGoogleMaps(ticket: Partial<Ticket>, onEmpty?: () => void): boolean {
  const { url, address } = buildGoogleMapsSearchUrl(ticket);
  if (!url || !address) {
    if (onEmpty) {
      onEmpty();
    }
    return false;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
