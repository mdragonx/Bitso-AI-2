import { NextResponse } from 'next/server';

type ContextItem = {
  type: 'news' | 'sentiment';
  source: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
};

const APPROVED_NEWS_FEEDS = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
] as const;

const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1';

function stripCdata(value: string) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(itemXml: string, tag: string) {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripCdata(match[1]) : '';
}

function parseRss(xml: string, source: string, limit = 3): ContextItem[] {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  return itemMatches.slice(0, limit).map((itemXml) => {
    const title = extractTag(itemXml, 'title');
    const summary = extractTag(itemXml, 'description');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');

    return {
      type: 'news',
      source,
      title,
      summary,
      url: link,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    };
  });
}

async function fetchNewsItems(): Promise<ContextItem[]> {
  const responses = await Promise.all(
    APPROVED_NEWS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { next: { revalidate: 120 } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRss(xml, feed.source);
      } catch {
        return [];
      }
    })
  );

  return responses.flat();
}

async function fetchSentimentItems(): Promise<ContextItem[]> {
  try {
    const res = await fetch(FEAR_GREED_URL, { next: { revalidate: 120 } });
    if (!res.ok) return [];

    const json = await res.json();
    const first = json?.data?.[0];
    if (!first) return [];

    return [
      {
        type: 'sentiment',
        source: 'Alternative.me Fear & Greed Index',
        title: `Fear & Greed: ${first.value_classification ?? 'N/A'} (${first.value ?? 'N/A'})`,
        summary: `Index value ${first.value ?? 'N/A'} (${first.value_classification ?? 'N/A'}).`,
        url: 'https://alternative.me/crypto/fear-and-greed-index/',
        published_at: first.timestamp ? new Date(Number(first.timestamp) * 1000).toISOString() : new Date().toISOString(),
      },
    ];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [newsItems, sentimentItems] = await Promise.all([fetchNewsItems(), fetchSentimentItems()]);
    const items = [...sentimentItems, ...newsItems]
      .filter((item) => item.title)
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 8);

    return NextResponse.json({
      success: true,
      data: {
        approved_sources: {
          news: APPROVED_NEWS_FEEDS.map((feed) => feed.source),
          sentiment: ['Alternative.me Fear & Greed Index'],
        },
        items,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message ?? 'Failed to fetch market context' }, { status: 500 });
  }
}
