import { QueryClient } from '@tanstack/react-query';

// Entity reads are cheap on Base44 but adding a small staleTime avoids
// redundant refetches when navigating between pages that share queries
// (e.g. portals appears on Dashboard / Pending / Tasks / Rules / Connectors).
export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 30_000,
			gcTime: 5 * 60_000,
		},
	},
});