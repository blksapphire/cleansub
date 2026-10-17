// Static, offline merchant catalog. It is only used to label detected charges, spot
// overlapping services, and link to a merchant's own account/billing page.
// Links open only when the user clicks them; nothing here makes a network request.
// `cancelUrl` is null where there is no stable official deep link.

export const CATEGORY_LABELS = {
  'streaming-video': 'Video streaming',
  'streaming-music': 'Music streaming',
  'cloud-storage': 'Cloud storage',
  vpn: 'VPN',
  'ai-assistant': 'AI assistants',
  software: 'Software',
  gaming: 'Gaming',
  books: 'Books & audio',
  platform: 'App-store / platform billing',
  membership: 'Memberships'
};

// Categories where paying for two services is worth a second look.
export const OVERLAP_CATEGORIES = new Set(['streaming-video', 'streaming-music', 'cloud-storage', 'vpn', 'ai-assistant']);

const APPLE_HELP = 'https://support.apple.com/en-us/118428';

export const CATALOG = [
  { id: 'netflix', name: 'Netflix', category: 'streaming-video', patterns: ['netflix'], cancelUrl: 'https://www.netflix.com/cancelplan' },
  { id: 'disney-plus', name: 'Disney+', category: 'streaming-video', patterns: ['disney', 'disneyplus', 'disney plus'], cancelUrl: 'https://www.disneyplus.com/account' },
  { id: 'hulu', name: 'Hulu', category: 'streaming-video', patterns: ['hulu'], cancelUrl: 'https://secure.hulu.com/account' },
  { id: 'youtube', name: 'YouTube Premium', category: 'streaming-video', patterns: ['youtube', 'youtubepremium', 'youtube premium'], cancelUrl: 'https://www.youtube.com/paid_memberships' },
  { id: 'prime', name: 'Amazon Prime', category: 'membership', patterns: ['amazon prime', 'prime video', 'amazon prime video'], cancelUrl: 'https://www.amazon.com/gp/primecentral' },
  { id: 'crunchyroll', name: 'Crunchyroll', category: 'streaming-video', patterns: ['crunchyroll'], cancelUrl: 'https://www.crunchyroll.com/account/membership' },
  { id: 'apple-tv', name: 'Apple TV+', category: 'streaming-video', patterns: ['apple tv', 'appletv'], cancelUrl: APPLE_HELP },
  { id: 'showmax', name: 'Showmax', category: 'streaming-video', patterns: ['showmax'], cancelUrl: null },
  { id: 'dstv', name: 'DStv', category: 'streaming-video', patterns: ['dstv'], cancelUrl: null },
  { id: 'gotv', name: 'GOtv', category: 'streaming-video', patterns: ['gotv'], cancelUrl: null },
  { id: 'startimes', name: 'StarTimes', category: 'streaming-video', patterns: ['startimes'], cancelUrl: null },

  { id: 'spotify', name: 'Spotify', category: 'streaming-music', patterns: ['spotify'], cancelUrl: 'https://www.spotify.com/account/subscription/' },
  { id: 'apple-music', name: 'Apple Music', category: 'streaming-music', patterns: ['apple music', 'applemusic'], cancelUrl: APPLE_HELP },
  { id: 'deezer', name: 'Deezer', category: 'streaming-music', patterns: ['deezer'], cancelUrl: 'https://www.deezer.com/account/subscription' },
  { id: 'boomplay', name: 'Boomplay', category: 'streaming-music', patterns: ['boomplay'], cancelUrl: null },
  { id: 'audiomack', name: 'Audiomack', category: 'streaming-music', patterns: ['audiomack'], cancelUrl: null },

  { id: 'icloud', name: 'iCloud+', category: 'cloud-storage', patterns: ['icloud', 'apple icloud'], cancelUrl: APPLE_HELP },
  { id: 'google-one', name: 'Google One', category: 'cloud-storage', patterns: ['google one', 'googleone'], cancelUrl: 'https://one.google.com/settings' },
  { id: 'dropbox', name: 'Dropbox', category: 'cloud-storage', patterns: ['dropbox'], cancelUrl: 'https://www.dropbox.com/account/plan' },
  { id: 'onedrive', name: 'OneDrive', category: 'cloud-storage', patterns: ['onedrive'], cancelUrl: 'https://account.microsoft.com/services' },

  { id: 'nordvpn', name: 'NordVPN', category: 'vpn', patterns: ['nordvpn', 'nord vpn'], cancelUrl: 'https://my.nordaccount.com/' },
  { id: 'expressvpn', name: 'ExpressVPN', category: 'vpn', patterns: ['expressvpn', 'express vpn'], cancelUrl: 'https://www.expressvpn.com/subscriptions' },
  { id: 'surfshark', name: 'Surfshark', category: 'vpn', patterns: ['surfshark'], cancelUrl: null },
  { id: 'protonvpn', name: 'Proton VPN', category: 'vpn', patterns: ['protonvpn', 'proton vpn'], cancelUrl: null },

  { id: 'openai', name: 'ChatGPT / OpenAI', category: 'ai-assistant', patterns: ['openai', 'chatgpt'], cancelUrl: null },
  { id: 'anthropic', name: 'Claude / Anthropic', category: 'ai-assistant', patterns: ['anthropic', 'claude'], cancelUrl: null },
  { id: 'midjourney', name: 'Midjourney', category: 'ai-assistant', patterns: ['midjourney'], cancelUrl: null },
  { id: 'perplexity', name: 'Perplexity', category: 'ai-assistant', patterns: ['perplexity'], cancelUrl: null },

  { id: 'microsoft', name: 'Microsoft', category: 'software', patterns: ['microsoft', 'msft', 'office365'], cancelUrl: 'https://account.microsoft.com/services' },
  { id: 'adobe', name: 'Adobe', category: 'software', patterns: ['adobe'], cancelUrl: 'https://account.adobe.com/plans' },
  { id: 'github', name: 'GitHub', category: 'software', patterns: ['github'], cancelUrl: 'https://github.com/settings/billing' },
  { id: 'zoom', name: 'Zoom', category: 'software', patterns: ['zoom'], cancelUrl: 'https://zoom.us/billing' },
  { id: 'canva', name: 'Canva', category: 'software', patterns: ['canva'], cancelUrl: 'https://www.canva.com/settings/billing-and-teams' },

  { id: 'audible', name: 'Audible', category: 'books', patterns: ['audible'], cancelUrl: 'https://www.audible.com/account/overview' },

  { id: 'xbox', name: 'Xbox / Game Pass', category: 'gaming', patterns: ['xbox', 'game pass', 'gamepass'], cancelUrl: 'https://account.microsoft.com/services' },
  { id: 'playstation', name: 'PlayStation', category: 'gaming', patterns: ['playstation', 'psn'], cancelUrl: null },
  { id: 'nintendo', name: 'Nintendo', category: 'gaming', patterns: ['nintendo'], cancelUrl: null },

  // Generic billing platforms last, so specific services above win on longer matches.
  { id: 'apple', name: 'Apple', category: 'platform', patterns: ['apple'], cancelUrl: APPLE_HELP },
  { id: 'google-play', name: 'Google Play', category: 'platform', patterns: ['google play', 'googleplay', 'google'], cancelUrl: 'https://play.google.com/store/account/subscriptions' }
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMPILED = CATALOG.flatMap((entry) =>
  entry.patterns.map((pattern) => ({
    entry,
    length: pattern.length,
    regex: new RegExp('(^|\\s)' + escapeRegExp(pattern) + '(\\s|$)')
  }))
).sort((a, b) => b.length - a.length);

/** Find the catalog entry for a normalized merchant name; the longest matching pattern wins. */
export function lookupMerchant(normalized) {
  const text = String(normalized || '').toLowerCase();
  if (!text) return null;
  for (const candidate of COMPILED) {
    if (candidate.regex.test(text)) return candidate.entry;
  }
  return null;
}
