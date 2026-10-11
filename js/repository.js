import { normalizeSearch } from './selectors.js';
import { validateWatchLog, validateMedia, MEDIA_MAX_TOTAL_BYTES } from './validation.js';

const DATABASE_NAME = 'movie_journal';
const DATABASE_VERSION = 1;
const CATALOG_TABLES = [
  'Movie', 'MovieAlias', 'Person', 'MovieCredit', 'Genre', 'MovieGenre',
  'Country', 'MovieCountry', 'Series', 'SeriesMovie', 'AchievementRule'
];

function catalogError(message) {
  throw new Error(`영화 자료를 확인해 주세요: ${message}`);
}

function requireText(row, key, location, allowEmpty = false) {
  const value = row[key];
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    catalogError(`${location}.${key}는 ${allowEmpty ? '' : '비어 있지 않은 '}문자열이어야 합니다.`);
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function uniqueKey(set, parts, location) {
  const key = JSON.stringify(parts);
  if (set.has(key)) catalogError(`${location}의 키가 중복되었습니다: ${parts.join(' / ')}`);
  set.add(key);
}

function makeLookup(rows, key, location) {
  const map = new Map();
  for (const row of rows) {
    requireText(row, key, location);
    if (map.has(row[key])) catalogError(`${location}.${key}가 중복되었습니다: ${row[key]}`);
    map.set(row[key], row);
  }
  return map;
}

function requireReference(map, id, location) {
  if (typeof id !== 'string' || !map.has(id)) {
    catalogError(`${location}가 존재하지 않는 항목을 참조합니다: ${String(id)}`);
  }
}

function validateCatalog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) catalogError('최상위 자료는 객체여야 합니다.');
  for (const name of CATALOG_TABLES) {
    if (!Array.isArray(raw[name])) catalogError(`${name} 배열이 없습니다.`);
    raw[name].forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        catalogError(`${name}[${index}]는 객체여야 합니다.`);
      }
    });
  }

  const lookup = {
    movieById: makeLookup(raw.Movie, 'movie_id', 'Movie'),
    personById: makeLookup(raw.Person, 'person_id', 'Person'),
    genreById: makeLookup(raw.Genre, 'genre_id', 'Genre'),
    countryByCode: makeLookup(raw.Country, 'country_code', 'Country'),
    seriesById: makeLookup(raw.Series, 'series_id', 'Series')
  };
  makeLookup(raw.MovieAlias, 'alias_id', 'MovieAlias');
  makeLookup(raw.AchievementRule, 'rule_id', 'AchievementRule');

  for (const movie of raw.Movie) {
    requireText(movie, 'title', 'Movie');
    requireText(movie, 'overview', 'Movie', true);
    if (movie.release_date !== null && !validDate(movie.release_date)) {
      catalogError(`Movie(${movie.movie_id}).release_date는 실제 YYYY-MM-DD 날짜 또는 null이어야 합니다.`);
    }
    if (movie.runtime_min !== null && (!Number.isInteger(movie.runtime_min) || movie.runtime_min <= 0)) {
      catalogError(`Movie(${movie.movie_id}).runtime_min은 양의 정수 또는 null이어야 합니다.`);
    }
    if (movie.poster_url !== null) {
      requireText(movie, 'poster_url', 'Movie');
      const url = new URL(movie.poster_url, globalThis.location?.href || 'http://localhost/');
      if (!['http:', 'https:'].includes(url.protocol)) catalogError('poster_url에는 웹 주소 또는 상대 경로를 사용하세요.');
    }
  }
  for (const [name, rows] of [['Person', raw.Person], ['Genre', raw.Genre], ['Country', raw.Country], ['Series', raw.Series]]) {
    for (const row of rows) requireText(row, 'name', name);
  }
  for (const row of raw.Series) requireText(row, 'description', 'Series', true);
  for (const country of raw.Country) {
    if (!/^[A-Z]{2}$/.test(country.country_code)) catalogError('Country.country_code는 영문 대문자 두 자리여야 합니다.');
    if (!Number.isFinite(country.pin_lat) || Math.abs(country.pin_lat) > 90 ||
        !Number.isFinite(country.pin_lng) || Math.abs(country.pin_lng) > 180) {
      catalogError(`Country(${country.country_code})의 위도·경도가 유효하지 않습니다.`);
    }
  }

  const aliasKeys = new Set();
  for (const alias of raw.MovieAlias) {
    requireReference(lookup.movieById, alias.movie_id, 'MovieAlias.movie_id');
    requireText(alias, 'alias', 'MovieAlias');
    uniqueKey(aliasKeys, [alias.movie_id, normalizeSearch(alias.alias)], 'MovieAlias');
  }
  const creditKeys = new Set();
  for (const credit of raw.MovieCredit) {
    requireReference(lookup.movieById, credit.movie_id, 'MovieCredit.movie_id');
    requireReference(lookup.personById, credit.person_id, 'MovieCredit.person_id');
    if (!['actor', 'director'].includes(credit.role)) catalogError('MovieCredit.role은 actor 또는 director여야 합니다.');
    uniqueKey(creditKeys, [credit.movie_id, credit.person_id, credit.role], 'MovieCredit');
  }
  for (const [name, key, parentMap] of [
    ['MovieGenre', 'genre_id', lookup.genreById],
    ['MovieCountry', 'country_code', lookup.countryByCode]
  ]) {
    const keys = new Set();
    for (const row of raw[name]) {
      requireReference(lookup.movieById, row.movie_id, `${name}.movie_id`);
      requireReference(parentMap, row[key], `${name}.${key}`);
      uniqueKey(keys, [row.movie_id, row[key]], name);
    }
  }
  const seriesMovies = new Set();
  const seriesOrders = new Set();
  for (const row of raw.SeriesMovie) {
    requireReference(lookup.movieById, row.movie_id, 'SeriesMovie.movie_id');
    requireReference(lookup.seriesById, row.series_id, 'SeriesMovie.series_id');
    if (!Number.isInteger(row.release_order) || row.release_order < 1) catalogError('시리즈 순서는 양의 정수여야 합니다.');
    uniqueKey(seriesMovies, [row.series_id, row.movie_id], 'SeriesMovie');
    uniqueKey(seriesOrders, [row.series_id, row.release_order], '시리즈 개봉 순서');
  }
  for (const rule of raw.AchievementRule) {
    requireText(rule, 'label', 'AchievementRule');
    if (!['unique_movie_count', 'runtime_total', 'genre_count'].includes(rule.metric)) {
      catalogError(`지원하지 않는 업적 지표입니다: ${String(rule.metric)}`);
    }
    if (!Number.isInteger(rule.target) || rule.target <= 0) catalogError('업적 목표는 양의 정수여야 합니다.');
  }
  return { ...raw, lookup };
}

export async function loadCatalog(url = 'data/catalog.json') {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('영화 자료를 불러오지 못했습니다. 실행 안내에 따라 HTTP 서버를 열고 다시 시도하세요.');
  }
  if (!response.ok) throw new Error(`영화 자료를 불러오지 못했습니다. 응답 코드: ${response.status}`);
  let raw;
  try { raw = await response.json(); }
  catch { throw new Error('catalog.json의 JSON 문법을 확인해 주세요.'); }
  return validateCatalog(raw);
}

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('브라우저 저장 공간이 부족합니다. 사진을 정리한 뒤 다시 저장하세요. 입력 내용은 유지됩니다.');
  if (error?.name === 'ConstraintError') return new Error('이미 존재하는 데이터와 키가 겹칩니다. 새로고침 후 다시 시도하세요.');
  if (error?.name === 'InvalidStateError') return new Error('저장소 연결이 닫혔습니다. 페이지를 새로고침해 주세요.');
  return error instanceof Error ? error : new Error('저장소 작업을 완료하지 못했습니다. 다시 시도해 주세요.');
}

function transaction(db, storeNames, mode, executor) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(storeNames, mode); }
    catch (error) { reject(storageError(error)); return; }
    let result;
    let failure;
    const abort = error => {
      failure = error;
      try { tx.abort(); }
      catch { reject(storageError(error)); }
    };
    const request = (idbRequest, onSuccess) => {
      idbRequest.onsuccess = () => {
        try { onSuccess?.(idbRequest.result); }
        catch (error) { abort(error); }
      };
      idbRequest.onerror = () => { failure = idbRequest.error; };
      return idbRequest;
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(storageError(failure || tx.error));
    tx.onerror = () => { failure ||= tx.error; };
    try { executor(tx, request, value => { result = value; }); }
    catch (error) { abort(error); }
  });
}

function ensureRepository(repo) {
  if (!repo?.db || !repo?.profile?.profile_id) throw new Error('저장소가 준비되지 않았습니다. 페이지를 새로고침해 주세요.');
}

function ensureProfile(profile) {
  if (!profile) throw new Error('현재 프로필을 찾지 못했습니다. 페이지를 새로고침해 주세요.');
}

function requireOwner(row, profileId, label) {
  if (!row) throw new Error(`${label}을 찾지 못했습니다. 새로고침 후 다시 확인하세요.`);
  if (row.profile_id !== profileId) throw new Error(`현재 프로필의 ${label}만 사용할 수 있습니다.`);
}

function requirePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('입력 내용을 확인해 주세요.');
}

function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}이 없습니다.`);
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('이 브라우저에서 식별자를 만들 수 없습니다. localhost 주소로 실행해 주세요.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ensureVersion(row, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('기록 버전이 없습니다. 새로고침 후 다시 시도하세요.');
  if ((row.version || 1) !== expectedVersion) throw new Error('다른 탭에서 이 기록을 변경했습니다. 새로고침으로 최신 내용을 확인한 뒤 다시 시도하세요.');
}

export async function openRepository(options = {}) {
  if (!globalThis.indexedDB) throw new Error('이 브라우저는 IndexedDB 저장을 지원하지 않습니다. 최신 브라우저로 실행하세요.');
  const name = options.name || DATABASE_NAME;
  const version = options.version || DATABASE_VERSION;
  const db = await new Promise((resolve, reject) => {
    let failed = false;
    const open = indexedDB.open(name, version);
    open.onupgradeneeded = () => {
      const database = open.result;
      const upgrade = open.transaction;
      const ensureStore = (storeName, keyPath) => database.objectStoreNames.contains(storeName)
        ? upgrade.objectStore(storeName)
        : database.createObjectStore(storeName, { keyPath });
      ensureStore('Profile', 'profile_id');
      const logs = ensureStore('WatchLog', 'log_id');
      const assets = ensureStore('MediaAsset', 'asset_id');
      ensureStore('MediaBlob', 'storage_key');
      for (const store of [logs, assets]) {
        if (!store.indexNames.contains('profile_id')) store.createIndex('profile_id', 'profile_id');
        if (!store.indexNames.contains('movie_id')) store.createIndex('movie_id', 'movie_id');
      }
      if (!assets.indexNames.contains('storage_key')) assets.createIndex('storage_key', 'storage_key', { unique: true });
    };
    open.onblocked = () => {
      failed = true;
      reject(new Error('다른 탭에서 같은 저장소를 사용 중입니다. 다른 FILMLOG 탭을 닫고 새로고침하세요.'));
    };
    open.onerror = () => reject(storageError(open.error));
    open.onsuccess = () => {
      if (failed) { open.result.close(); return; }
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
  });
  try {
    const profile = await transaction(db, ['Profile'], 'readwrite', (tx, request, finish) => {
      const store = tx.objectStore('Profile');
      request(store.get('demo'), existing => {
        const row = existing || { profile_id: 'demo', display_name: '나의 필름로그', created_at: new Date().toISOString() };
        if (!existing) request(store.add(row));
        finish(row);
      });
    });
    return { db, profile };
  } catch (error) { db.close(); throw error; }
}

export async function readSnapshot(repo) {
  ensureRepository(repo);
  const profileId = repo.profile.profile_id;
  const result = await transaction(repo.db, ['Profile', 'WatchLog', 'MediaAsset'], 'readonly', (tx, request, finish) => {
    const snapshot = { profile: null, logs: [], assets: [] };
    request(tx.objectStore('Profile').get(profileId), profile => { ensureProfile(profile); snapshot.profile = profile; });
    request(tx.objectStore('WatchLog').index('profile_id').getAll(profileId), rows => { snapshot.logs = rows; });
    request(tx.objectStore('MediaAsset').index('profile_id').getAll(profileId), rows => { snapshot.assets = rows; });
    finish(snapshot);
  });
  result.logs.sort((a, b) => b.watched_on.localeCompare(a.watched_on) || b.created_at.localeCompare(a.created_at) || a.log_id.localeCompare(b.log_id));
  result.assets.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.asset_id.localeCompare(b.asset_id));
  return result;
}

export async function mutateWatchLog(repo, catalog, action, payload) {
  ensureRepository(repo);
  requirePayload(payload);
  if (!['create', 'update', 'delete'].includes(action)) throw new Error('지원하지 않는 감상 기록 작업입니다.');
  const valid = action === 'delete' ? null : validateWatchLog(payload, catalog);
  if (action !== 'create') requireId(payload.log_id, '감상 기록 ID');
  const profileId = repo.profile.profile_id;
  return transaction(repo.db, ['Profile', 'WatchLog'], 'readwrite', (tx, request, finish) => {
    request(tx.objectStore('Profile').get(profileId), profile => {
      ensureProfile(profile);
      const store = tx.objectStore('WatchLog');
      if (action === 'create') {
        const now = new Date().toISOString();
        const row = { ...valid, log_id: makeId(), profile_id: profileId, created_at: now, updated_at: now, version: 1 };
        request(store.add(row));
        finish(row.log_id);
        return;
      }
      request(store.get(payload.log_id), current => {
        requireOwner(current, profileId, '감상 기록');
        ensureVersion(current, payload.expected_version);
        if (action === 'delete') request(store.delete(current.log_id));
        else {
          if (current.movie_id !== valid.movie_id) throw new Error('기록의 영화는 변경할 수 없습니다. 다른 영화는 새 기록으로 추가하세요.');
          const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString();
          request(store.put({
            ...current, ...valid, log_id: current.log_id, profile_id: profileId,
            created_at: current.created_at, updated_at: updatedAt, version: (current.version || 1) + 1
          }));
        }
        finish(current.log_id);
      });
    });
  });
}

export async function manageMedia(repo, catalog, action, payload) {
  ensureRepository(repo);
  requirePayload(payload);
  if (!['add', 'read', 'delete'].includes(action)) throw new Error('지원하지 않는 사진 작업입니다.');
  let validated;
  if (action === 'add') {
    if (!catalog.lookup.movieById.has(payload.movie_id)) throw new Error('사진을 연결할 영화를 선택하세요.');
    validated = await validateMedia(payload.file, payload.kind);
  } else requireId(payload.asset_id, '사진 ID');
  const profileId = repo.profile.profile_id;
  const mode = action === 'read' ? 'readonly' : 'readwrite';
  return transaction(repo.db, ['Profile', 'MediaAsset', 'MediaBlob'], mode, (tx, request, finish) => {
    request(tx.objectStore('Profile').get(profileId), profile => {
      ensureProfile(profile);
      const assets = tx.objectStore('MediaAsset');
      const blobs = tx.objectStore('MediaBlob');
      if (action === 'add') {
        request(assets.getAll(), rows => {
          let total = 0;
          for (let i = 0; i < rows.length; i++) {
            total = total + rows[i].byte_size;
          }
          if (total + validated.byte_size > MEDIA_MAX_TOTAL_BYTES) {
            throw new Error('사진 합계 50 MiB 제한을 넘습니다. 보관함에서 일부 사진을 삭제한 뒤 다시 저장하세요.');
          }
          const assetId = makeId();
          const storageKey = makeId();
          request(assets.add({
            asset_id: assetId, profile_id: profileId, movie_id: payload.movie_id,
            kind: validated.kind, storage_key: storageKey, mime_type: validated.mime_type,
            byte_size: validated.byte_size, created_at: new Date().toISOString()
          }));
          request(blobs.add({ storage_key: storageKey, blob: validated.blob }));
          finish(assetId);
        });
        return;
      }
      request(assets.get(payload.asset_id), current => {
        requireOwner(current, profileId, '사진');
        if (action === 'delete') {
          request(assets.delete(current.asset_id));
          request(blobs.delete(current.storage_key));
          finish(current.asset_id);
        } else {
          request(blobs.get(current.storage_key), row => {
            if (!row || !(row.blob instanceof Blob)) throw new Error('사진 원본을 찾지 못했습니다. 저장소 상태를 확인해 주세요.');
            finish(row.blob);
          });
        }
      });
    });
  });
}
