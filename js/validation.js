export const MEDIA_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const MEDIA_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export const MEDIA_KINDS = Object.freeze(['ticket', 'poster', 'other']);

function fieldError(fields) {
  const error = new Error(Object.values(fields).join(' '));

  error.name = 'ValidationError';
  error.fields = fields;
  return error;
}

export function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(0);
  date.setHours(0, 0, 0, 0);

  date.setFullYear(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateWatchLog(payload, catalog) {
  const fields = {};

  const input = payload ?? {};

  const movieExists = typeof input.movie_id === 'string'
    && (catalog.lookup?.movieById?.has(input.movie_id) ?? catalog.Movie.some(movie => movie.movie_id === input.movie_id));
  if (!movieExists) fields.movie_id = '목록에 있는 영화를 선택해 주세요.';

  if (!isValidCalendarDate(input.watched_on)) fields.watched_on = '실제 존재하는 감상 날짜를 입력해 주세요.';

  let rating = null;
  const rawRating = input.rating;

  const blankRating = rawRating === null || rawRating === undefined
    || (typeof rawRating === 'string' && rawRating.trim() === '');
  if (!blankRating) {
    if (typeof rawRating !== 'number' && typeof rawRating !== 'string') {
      fields.rating = '별점은 0.5부터 5까지 0.5 단위로 입력해 주세요.';
    } else {
      rating = Number(rawRating);

      if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
        fields.rating = '별점은 0.5부터 5까지 0.5 단위로 입력해 주세요.';
      }
    }
  }

  let review_text = null;
  if (input.review_text !== undefined && input.review_text !== null) {
    if (typeof input.review_text !== 'string') fields.review_text = '감상평은 글자로 입력해 주세요.';

    else review_text = input.review_text.trim() || null;
  }

  if (Object.keys(fields).length) throw fieldError(fields);

  return { movie_id: input.movie_id, watched_on: input.watched_on, rating, review_text };
}

function detectImageMime(bytes) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';

  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';

  if (bytes.length >= 12
    && [82, 73, 70, 70].every((value, index) => bytes[index] === value)
    && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)) return 'image/webp';
  return null;
}

async function verifyImageDecodes(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height) throw new Error('이미지 크기가 없습니다.');
    } finally {
      bitmap.close();
    }

    return;
  }

  if (typeof Image !== 'function') throw new Error('이 환경에서는 이미지 내용을 확인할 수 없습니다.');

  const objectUrl = URL.createObjectURL(blob);
  try {

    await new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error('이미지 크기가 없습니다.'));

      image.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));

      image.src = objectUrl;
    });
  } finally {

    URL.revokeObjectURL(objectUrl);
  }
}

export async function validateMedia(file, kind) {
  const fields = {};

  if (!MEDIA_KINDS.includes(kind)) fields.kind = '사진 종류를 선택해 주세요.';

  if (!(file instanceof Blob) || typeof file.name !== 'string') fields.file = '사진 파일을 선택해 주세요.';
  else if (file.size === 0) fields.file = '빈 파일은 저장할 수 없습니다.';
  else if (file.size > MEDIA_MAX_FILE_BYTES) fields.file = '사진 한 장은 5 MiB 이하여야 합니다.';

  if (Object.keys(fields).length) throw fieldError(fields);

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime_type = detectImageMime(bytes);

  if (!mime_type || file.type.toLowerCase() !== mime_type) {
    throw fieldError({ file: '실제 형식이 일치하는 JPEG, PNG 또는 WebP 사진을 선택해 주세요.' });
  }
  try {
    await verifyImageDecodes(file);
  } catch {
    throw fieldError({ file: '사진이 손상되었거나 브라우저에서 읽을 수 없습니다. 다른 사진을 선택해 주세요.' });
  }

  return { blob: file, mime_type, byte_size: file.size, kind };
}
