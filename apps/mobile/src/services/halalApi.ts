import { api, qs } from './api';

type HalalRestaurant = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  cuisineType?: string;
  priceRange?: number;
  halalCertified: boolean;
  certifyingBody?: string;
  phone?: string;
  website?: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  verificationCount?: number;
};

type HalalReview = {
  id: string;
  userId: string;
  restaurantId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const halalApi = {
  findNearby: (lat: number, lng: number, opts?: {
    radius?: number;
    cuisine?: string;
    priceRange?: number;
    certified?: boolean;
    cursor?: string;
  }) =>
    api.get<PaginatedResponse<HalalRestaurant>>(
      `/halal/restaurants${qs({ lat, lng, radius: opts?.radius, cuisine: opts?.cuisine, priceRange: opts?.priceRange, certified: opts?.certified ? 'true' : undefined, cursor: opts?.cursor })}`,
    ),

  getById: (id: string) =>
    api.get<HalalRestaurant>(`/halal/restaurants/${id}`),

  create: (data: {
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    cuisineType?: string;
    priceRange?: number;
    halalCertified?: boolean;
    certifyingBody?: string;
    phone?: string;
    website?: string;
    imageUrl?: string;
  }) =>
    api.post<HalalRestaurant>('/halal/restaurants', data),

  addReview: (restaurantId: string, data: { rating: number; comment?: string }) =>
    api.post<HalalReview>(`/halal/restaurants/${restaurantId}/reviews`, data),

  getReviews: (restaurantId: string, cursor?: string) =>
    api.get<PaginatedResponse<HalalReview>>(
      `/halal/restaurants/${restaurantId}/reviews${qs({ cursor })}`,
    ),

  verify: (restaurantId: string) =>
    api.post<{ verified: boolean }>(`/halal/restaurants/${restaurantId}/verify`, {}),
};
