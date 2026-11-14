// @env bun
import { createHash } from 'node:crypto';

import { requestHeaders, wbiPermutation } from './constants';
import { ConnectionError } from './errors';
import type { ApiResponse, ConnectionInfo, DanmuInfo, NavInfo, Fetcher } from './types';

async function request<T>(
  url: string | URL,
  cookie: string,
  signal: AbortSignal,
  fetcher: Fetcher,
  allowLoggedOut = false,
): Promise<T> {
  const path = new URL(url).pathname;

  const response = await fetcher(url, {
    headers: { ...requestHeaders, ...(cookie ? { Cookie: cookie } : {}) },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });

  if (!response.ok) {
    throw new ConnectionError(`Bilibili ${path} returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<T>;

  if (body.code !== 0 && !(allowLoggedOut && body.code === -101)) {
    throw new ConnectionError(`Bilibili ${path} returned code ${body.code}`);
  }

  return body.data;
}

function sign(params: Record<string, string>, images: NavInfo['wbi_img']): string {
  const key = (url: string): string => new URL(url).pathname.split('/').pop()!.split('.')[0];
  const source = key(images.img_url) + key(images.sub_url);

  const mixed = wbiPermutation
    .map(index => source[index])
    .join('')
    .slice(0, 32);

  const timestamp = String(Math.floor(Date.now() / 1000));

  const query = Object.entries({ ...params, wts: timestamp })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value.replaceAll(/[!'()*]/g, ''))}`,
    )
    .join('&');

  return `${query}&w_rid=${createHash('md5')
    .update(query + mixed)
    .digest('hex')}`;
}

export async function discoverRooms(
  cookie = '',
  signal: AbortSignal = new AbortController().signal,
): Promise<number[]> {
  const data = await request<{ list: { roomid: number }[] }>(
    'https://api.live.bilibili.com/room/v3/area/getRoomList?platform=web&parent_area_id=9&area_id=0&sort_type=online&page=1&page_size=10',
    cookie,
    signal,
    (url, init) => fetch(url, init),
  );

  return [...new Set(data.list.map(room => room.roomid))]
    .filter(id => Number.isSafeInteger(id) && id > 0)
    .slice(0, 3);
}

export async function resolveConnection(
  roomId: number,
  cookie: string,
  signal: AbortSignal,
  fetcher: Fetcher = (url, init) => fetch(url, init),
  serverIndex = 0,
): Promise<ConnectionInfo> {
  const nav = await request<NavInfo>(
    'https://api.bilibili.com/x/web-interface/nav',
    cookie,
    signal,
    fetcher,
    true,
  );

  if (cookie && !nav.isLogin) {
    throw new ConnectionError('Cookie is no longer logged in');
  }

  const room = await request<{ room_id: number; live_time?: number }>(
    `https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomId}`,
    cookie,
    signal,
    fetcher,
  );

  const query = sign({ id: String(room.room_id), type: '0', web_location: '444.8' }, nav.wbi_img);

  const info = await request<DanmuInfo>(
    `https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?${query}`,
    cookie,
    signal,
    fetcher,
  );

  const host = info.host_list[serverIndex % info.host_list.length];

  if (!host) {
    throw new ConnectionError('Bilibili returned no WebSocket hosts');
  }

  const cookies = new Bun.CookieMap(cookie);
  let buvid = cookies.get('buvid3');

  if (!buvid) {
    const device = await request<{ b_3: string }>(
      'https://api.bilibili.com/x/frontend/finger/spi',
      cookie,
      signal,
      fetcher,
    );

    buvid = device.b_3;
  }

  return {
    roomId: room.room_id,
    liveStartTime:
      room.live_time && Number.isSafeInteger(room.live_time) && room.live_time > 0
        ? room.live_time
        : null,
    url: `wss://${host.host}:${host.wss_port}/sub`,
    auth: {
      uid: nav.isLogin ? nav.mid : 0,
      roomid: room.room_id,
      protover: 3,
      platform: 'web',
      type: 2,
      key: info.token,
      buvid,
    },
  };
}
