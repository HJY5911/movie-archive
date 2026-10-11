import { boot, el, showMessage } from '../ui.js';
import { mutateWatchLog, manageMedia } from '../repository.js';

const parameters = new URLSearchParams(location.search);
const movieId = parameters.get('id');
let editingId = null;
let editingVersion = null;
let draft = createEmptyDraft();
let busy = false;
let statusText = '';
let statusIsError = false;

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function createEmptyDraft() {
  return {
    watched_on: today(),
    rating: '',
    review_text: ''
  };
}

function resetEditor() {
  editingId = null;
  editingVersion = null;
  draft = createEmptyDraft();
  setStatus('', false);
}

function setBusy(value) {
  busy = value;
  const controls = document.querySelectorAll('#watch-form input, #watch-form select, #watch-form textarea, #watch-form button, .record-panel button');
  for (const control of controls) {
    control.disabled = value;
  }
}

function setStatus(text, isError) {
  statusText = text;
  statusIsError = isError;
  const status = document.getElementById('watch-status');
  if (status === null) return;
  status.textContent = text;
  status.className = 'status';
  if (isError) status.classList.add('error');
}

function errorText(error) {
  if (error && typeof error.message === 'string') return error.message;
  return '작업을 완료하지 못했습니다. 다시 시도해 주세요.';
}

function focusDate() {
  const date = document.getElementById('watched-on');
  if (date !== null) date.focus();
}

function ratingLabel(value) {
  if (value === null) return '별점 미입력';
  return '★ ' + value.toFixed(1);
}

function creditNames(catalog, role) {
  const names = [];
  for (const credit of catalog.MovieCredit) {
    if (credit.movie_id === movieId && credit.role === role) {
      const person = catalog.lookup.personById.get(credit.person_id);
      names.push(person.name);
    }
  }
  if (names.length === 0) return '정보 없음';
  return names.join(', ');
}

async function renderMovie(context) {
  const app = context.app;
  const catalog = context.catalog;
  const repo = context.repo;
  const snapshot = context.snapshot;
  const refresh = context.refresh;
  const movie = catalog.lookup.movieById.get(movieId);

  if (movie === undefined) {
    const empty = el('section', { className: 'empty-state' });
    const title = el('h1', {}, '영화를 찾을 수 없습니다');
    const help = el('p', {}, '주소의 영화 ID를 확인하거나 영화 목록에서 다시 선택해 주세요.');
    const back = el('a', { href: 'movies.html', className: 'button' }, '영화 목록으로');
    empty.append(title, help, back);
    app.replaceChildren(empty);
    return;
  }

  const genreNames = [];
  for (const row of catalog.MovieGenre) {
    if (row.movie_id === movieId) genreNames.push(catalog.lookup.genreById.get(row.genre_id).name);
  }
  const countryNames = [];
  for (const row of catalog.MovieCountry) {
    if (row.movie_id === movieId) countryNames.push(catalog.lookup.countryByCode.get(row.country_code).name);
  }
  const details = el('section', { className: 'movie-detail' });
  if (movie.poster_url) {
    const poster = el('img', {
      className: 'detail-poster',
      src: movie.poster_url,
      alt: movie.title + ' 포스터'
    });
    details.append(poster);
  }
  const info = el('div', { className: 'detail-copy' });
  const title = el('h1', {}, movie.title);
  const tags = el('div', { className: 'tag-row' });
  for (const name of genreNames) {
    const tag = el('span', { className: 'tag' }, name);
    tags.append(tag);
  }
  let releaseText = '개봉일 미등록';
  if (movie.release_date !== null) releaseText = movie.release_date;
  let runtimeText = '상영 시간 미등록';
  if (movie.runtime_min !== null) runtimeText = movie.runtime_min + '분';
  let countryText = '제작 국가 정보 없음';
  if (countryNames.length > 0) countryText = countryNames.join(', ');
  const metadata = el('p', {}, `${releaseText} · ${runtimeText} · ${countryText}`);
  let overviewText = '줄거리 정보가 없습니다.';
  if (movie.overview) overviewText = movie.overview;
  const overview = el('p', { className: 'overview' }, overviewText);
  const directors = el('p', {}, '감독: ' + creditNames(catalog, 'director'));
  const actors = el('p', {}, '출연: ' + creditNames(catalog, 'actor'));
  info.append(title, tags, metadata, overview, directors, actors);
  details.append(info);

  let formTitleText = '감상 기록 추가';
  let submitText = '감상 기록 저장';
  if (editingId !== null) {
    formTitleText = '감상 기록 수정';
    submitText = '수정 내용 저장';
  }
  const formPanel = el('section', { className: 'record-form-panel', id: 'record-form-panel' });
  const formTitle = el('h2', { id: 'watch-form-title' }, formTitleText);
  const form = el('form', { id: 'watch-form' });
  const date = el('input', {
    id: 'watched-on',
    name: 'watched_on',
    type: 'date',
    required: true,
    value: draft.watched_on,
    disabled: busy
  });
  const rating = el('select', {
    id: 'rating',
    name: 'rating',
    disabled: busy
  });
  const noRating = el('option', { value: '' }, '별점 남기지 않음');
  rating.append(noRating);
  for (let n = 1; n <= 10; n++) {
    const option = el('option', { value: String(n / 2) }, ratingLabel(n / 2));
    rating.append(option);
  }
  rating.value = draft.rating;
  const review = el('textarea', {
    id: 'review-text',
    name: 'review_text',
    rows: 5,
    placeholder: '감상평을 입력하세요.',
    value: draft.review_text,
    disabled: busy
  });
  function rememberDate() {
    draft.watched_on = date.value;
  }
  function rememberRating() {
    draft.rating = rating.value;
  }
  function rememberReview() {
    draft.review_text = review.value;
  }
  date.addEventListener('input', rememberDate);
  rating.addEventListener('change', rememberRating);
  review.addEventListener('input', rememberReview);
  const fields = el('div', { className: 'form-grid' });
  const dateField = el('div', { className: 'field' });
  const dateLabel = el('label', { htmlFor: 'watched-on' }, '감상 날짜 · 필수');
  dateField.append(dateLabel, date);
  const ratingField = el('div', { className: 'field' });
  const ratingLabelElement = el('label', { htmlFor: 'rating' }, '별점 · 선택');
  ratingField.append(ratingLabelElement, rating);
  fields.append(dateField, ratingField);
  const reviewField = el('div', { className: 'field' });
  const reviewLabel = el('label', { htmlFor: 'review-text' }, '감상평 · 선택');
  reviewField.append(reviewLabel, review);
  const formHelp = el('p', {}, '같은 영화를 같은 날 여러 번 감상한 기록도 각각 저장할 수 있습니다.');
  const status = el('p', { id: 'watch-status', className: 'status', ariaLive: 'polite' }, statusText);
  if (statusIsError) status.classList.add('error');
  const submit = el('button', { id: 'watch-submit', type: 'submit', className: 'button', disabled: busy }, submitText);
  const buttons = el('div', { className: 'toolbar' });
  buttons.append(submit);

  async function refreshPage() {
    try {
      await refresh();
      return true;
    } catch (error) {
      return false;
    }
  }

  function clearVisibleForm() {
    const currentDate = document.getElementById('watched-on');
    if (currentDate === null) return;
    currentDate.value = draft.watched_on;
    document.getElementById('rating').value = draft.rating;
    document.getElementById('review-text').value = draft.review_text;
    document.getElementById('watch-form-title').textContent = '감상 기록 추가';
    document.getElementById('watch-submit').textContent = '감상 기록 저장';
    const cancel = document.getElementById('watch-cancel');
    if (cancel !== null) cancel.remove();
  }

  async function cancelEditing() {
    if (busy) return;
    setBusy(true);
    try {
      resetEditor();
      clearVisibleForm();
      await refreshPage();
    } finally {
      setBusy(false);
    }
    focusDate();
  }

  if (editingId !== null) {
    const cancel = el('button', { id: 'watch-cancel', type: 'button', className: 'button secondary', disabled: busy }, '수정 취소');
    cancel.addEventListener('click', cancelEditing);
    buttons.append(cancel);
  }
  form.append(fields, reviewField, formHelp, buttons, status);
  formPanel.append(formTitle, form);

  async function saveRecord(event) {
    event.preventDefault();
    if (busy) return;
    rememberDate();
    rememberRating();
    rememberReview();
    setBusy(true);
    setStatus('기록을 저장하는 중입니다.', false);
    let action = 'create';
    if (editingId !== null) action = 'update';
    const payload = {
      movie_id: movieId,
      watched_on: draft.watched_on,
      rating: draft.rating,
      review_text: draft.review_text
    };
    if (editingId !== null) {
      payload.log_id = editingId;
      payload.expected_version = editingVersion;
    }
    let saved = false;
    try {
      await mutateWatchLog(repo, catalog, action, payload);
      resetEditor();
      clearVisibleForm();
      let message = '감상 기록을 저장했습니다.';
      if (action === 'update') message = '감상 기록을 수정했습니다.';
      showMessage(message);
      saved = true;
      await refreshPage();
    } catch (error) {
      const message = errorText(error);
      setStatus(message, true);
      showMessage(message, 'error');
    } finally {
      setBusy(false);
    }
    if (saved) focusDate();
  }
  form.addEventListener('submit', saveRecord);

  const logs = [];
  for (const row of snapshot.logs) {
    if (row.movie_id === movieId) logs.push(row);
  }
  const recordPanel = el('section', { className: 'record-panel' });
  const recordTitle = el('h2', {}, `나의 감상 기록 ${logs.length}건`);
  recordPanel.append(recordTitle);
  if (logs.length === 0) {
    const empty = el('p', { className: 'empty-state compact' }, '아직 이 영화의 감상 기록이 없습니다.');
    recordPanel.append(empty);
  }
  for (const row of logs) {
    const card = el('article', { className: 'log-card' });
    const recordHeading = el('div', { className: 'record-heading' });
    const watchedOn = el('strong', {}, row.watched_on);
    const savedRating = el('span', { className: 'rating' }, ratingLabel(row.rating));
    recordHeading.append(watchedOn, savedRating);
    let reviewText = '남긴 감상평이 없습니다.';
    if (row.review_text) reviewText = row.review_text;
    const savedReview = el('p', { className: 'review-text' }, reviewText);
    const updated = el('p', {}, '최근 저장: ' + new Date(row.updated_at).toLocaleString('ko-KR'));
    const actions = el('div', { className: 'toolbar' });
    const edit = el('button', { type: 'button', className: 'button secondary', disabled: busy }, '수정');
    const remove = el('button', { type: 'button', className: 'button danger', disabled: busy }, '삭제');

    async function editRecord() {
      if (busy) return;
      const previousId = editingId;
      const previousVersion = editingVersion;
      const previousDraft = draft;
      const previousStatus = statusText;
      const previousStatusIsError = statusIsError;
      setBusy(true);
      editingId = row.log_id;
      editingVersion = row.version;
      let ratingValue = '';
      if (row.rating !== null) ratingValue = String(row.rating);
      let reviewValue = '';
      if (row.review_text) reviewValue = row.review_text;
      draft = { watched_on: row.watched_on, rating: ratingValue, review_text: reviewValue };
      setStatus('', false);
      try {
        const refreshed = await refreshPage();
        if (!refreshed) {
          editingId = previousId;
          editingVersion = previousVersion;
          draft = previousDraft;
          setStatus(previousStatus, previousStatusIsError);
          return;
        }
      } finally {
        setBusy(false);
      }
      focusDate();
    }

    async function deleteRecord() {
      if (busy) return;
      const accepted = confirm(`${row.watched_on} 감상 기록을 삭제할까요?`);
      if (!accepted) return;
      setBusy(true);
      try {
        await mutateWatchLog(repo, catalog, 'delete', { log_id: row.log_id, expected_version: row.version });
        if (editingId === row.log_id) {
          resetEditor();
          clearVisibleForm();
        }
        showMessage('감상 기록을 삭제했습니다. 사진은 유지됩니다.');
        await refreshPage();
      } catch (error) {
        showMessage(errorText(error), 'error');
      } finally {
        setBusy(false);
      }
    }
    edit.addEventListener('click', editRecord);
    remove.addEventListener('click', deleteRecord);
    actions.append(edit, remove);
    card.append(recordHeading, savedReview, updated, actions);
    recordPanel.append(card);
  }

  const mediaPanel = el('section', { className: 'page-section' });
  const mediaHeading = el('div', { className: 'section-heading' });
  const mediaTitle = el('h2', {}, '이 영화의 보관 사진');
  const archiveLink = el('a', { href: `archive.html?movie_id=${encodeURIComponent(movieId)}`, className: 'text-link' }, '사진 보관함');
  mediaHeading.append(mediaTitle, archiveLink);
  const photoGrid = el('div', { className: 'media-grid' });
  mediaPanel.append(mediaHeading, photoGrid);
  const recordLayout = el('div', { className: 'record-layout' });
  recordLayout.append(formPanel, recordPanel);
  const back = el('a', { href: 'movies.html', className: 'back-link' }, '← 영화 목록');
  app.replaceChildren(back, details, recordLayout, mediaPanel);

  const objectUrls = [];
  let disposed = false;
  function cleanupPhotos() {
    disposed = true;
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    objectUrls.length = 0;
    removeEventListener('pagehide', cleanupPhotos);
  }
  addEventListener('pagehide', cleanupPhotos);
  const assets = [];
  for (const asset of snapshot.assets) {
    if (asset.movie_id === movieId) assets.push(asset);
  }
  if (assets.length === 0) {
    const emptyPhoto = el('p', { className: 'empty-state compact' }, '이 영화에 저장된 사진이 없습니다.');
    photoGrid.append(emptyPhoto);
  }
  for (const asset of assets) {
    if (disposed) break;
    const card = el('figure', { className: 'media-card' });
    photoGrid.append(card);
    try {
      const blob = await manageMedia(repo, catalog, 'read', { asset_id: asset.asset_id });
      if (disposed) break;
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      let kind = '기타';
      if (asset.kind === 'ticket') kind = '티켓';
      if (asset.kind === 'poster') kind = '포스터';
      const image = el('img', { src: url, alt: movie.title + ' ' + kind, loading: 'lazy' });
      const caption = el('figcaption', {}, kind);
      card.append(image, caption);
    } catch (error) {
      if (disposed) break;
      const failed = el('p', { className: 'status error' }, '사진 원본을 읽지 못했습니다. 사진 보관함에서 확인해 주세요.');
      card.append(failed);
    }
  }
  return cleanupPhotos;
}

boot({
  page: 'movie',
  title: '영화 상세',
  render: renderMovie
});
