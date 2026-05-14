import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel');

  if (!channel) return NextResponse.json({ error: 'Kanal adı gerekli' }, { status: 400 });

  try {
    // Cloudflare Anti-Bot sistemini aşmak için maskeleme (v2 API'si ve detaylı headers)
    const res = await fetch(`https://kick.com/api/v2/channels/${channel}`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `https://kick.com/${channel}`,
        'Origin': 'https://kick.com',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Kick Cloudflare/API Engeli: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    
    if (!data || !data.chatroom || !data.chatroom.id) {
      return NextResponse.json({ error: 'Chatroom ID bulunamadı veya kanal geçersiz.' }, { status: 404 });
    }

    return NextResponse.json({ chatroomId: data.chatroom.id });
  } catch (error: any) {
    return NextResponse.json({ error: 'Sunucu hatası: ' + error.message }, { status: 500 });
  }
}