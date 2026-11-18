import { createHash } from 'node:crypto';

import { abortable } from './async';
import { requestHeaders, wbiPermutation } from './constants';
import { ConnectionError } from './errors';
import type {
  ApiResponse,
  ConnectionInfo,
  CookieParser,
  DanmuInfo,
  NavInfo,
  Fetcher,
} from './types';

async function request<T>(
  url: string | URL,
  cookie: string,
  signal: AbortSignal,
  fetcher: Fetcher,
  allowLoggedOut = false,
): Promise<T> {
  const path = new URL(url).pathname;

  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  let response: Response;

  try {
    requestSignal.throwIfAborted();
    response = await abortable(
      fetcher(url, {
        headers: { ...requestHeaders, ...(cookie ? { Cookie: cookie } : {}) },
        signal: requestSignal,
      }),
      requestSignal,
    );
  } catch {
    const failure = requestSignal.aborted ? 'timed out or was cancelled' : 'failed';
    throw new ConnectionError(`Bilibili ${path} request ${failure}`);
  }

  if (!response.ok) {
    throw new ConnectionError(`Bilibili ${path} returned HTTP ${response.status}`);
  }

  return readResponse<T>(response, path, requestSignal, allowLoggedOut);
}

async function readResponse<T>(
  response: Response,
  path: string,
  requestSignal: AbortSignal,
  allowLoggedOut: boolean,
): Promise<T> {
  let body: ApiResponse<T>;

  try {
    requestSignal.throwIfAborted();
    body = (await abortable(response.json(), requestSignal)) as ApiResponse<T>;
  } catch {
    const failure = requestSignal.aborted
      ? 'read timed out or was cancelled'
      : 'was not valid JSON';

    throw new ConnectionError(`Bilibili ${path} response ${failure}`);
  }

  if (!body || typeof body.code !== 'number') {
    throw new ConnectionError(`Bilibili ${path} returned an invalid response`);
  }

  if (body.code !== 0 && !(allowLoggedOut && body.code === -101)) {
    throw new ConnectionError(`Bilibili ${path} returned code ${body.code}`);
  }

  if (!body.data || typeof body.data !== 'object') {
    throw new ConnectionError(`Bilibili ${path} returned invalid data`);
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

function readBuvid(cookie: string, parseCookie?: CookieParser): string | undefined {
  try {
    return cookie ? parseCookie?.(cookie).buvid3 : undefined;
  } catch {
    throw new ConnectionError('Cookie parser failed');
  }
}

export async function resolveConnection(
  roomId: number,
  cookie: string,
  signal: AbortSignal,
  fetcher: Fetcher = (url, init) => fetch(url, init),
  serverIndex = 0,
  parseCookie?: CookieParser,
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

  let buvid = readBuvid(cookie, parseCookie);

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
