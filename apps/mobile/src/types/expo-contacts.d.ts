declare module 'expo-contacts' {
  export interface Contact {
    id: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    phoneNumbers?: Array<{ number?: string; label?: string }>;
    emails?: Array<{ email?: string; label?: string }>;
    imageAvailable?: boolean;
    image?: { uri: string };
  }

  export function getContactsAsync(options?: {
    fields?: string[];
    pageSize?: number;
    pageOffset?: number;
    sort?: string;
  }): Promise<{ data: Contact[]; hasNextPage: boolean; hasPreviousPage: boolean; total: number }>;

  export function requestPermissionsAsync(): Promise<{ status: string; granted: boolean }>;
  export function getPermissionsAsync(): Promise<{ status: string; granted: boolean }>;

  export const Fields: Record<string, string>;
  export const SortTypes: Record<string, string>;
}
