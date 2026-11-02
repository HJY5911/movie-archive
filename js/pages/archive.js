import { boot, el, showMessage } from '../ui.js';
import { manageMedia } from '../repository.js';
import { searchMovies } from '../selectors.js';
import { MEDIA_KINDS, MEDIA_MAX_FILE_BYTES, MEDIA_MAX_TOTAL_BYTES } from '../validation.js';

const parameters = new URLSearchParams(location.search);
const linkedMovieId = parameters.get('movie_id');
const bytesPerMiB = 1024 * 1024;
const resultLimit = 8;

let selectedMovieId = linkedMovieId;
let selectedKind = null;
let selectedFile = null;
let previewUrl = null;
let searchText = '';
let kindFilter = 'all';
let viewingAssetId = null;
let busy = false;
let statusText = '';
let statusIsError = false;

function kindLabel(kind) {
  if (kind === 'ticket') {
    return '티켓';
  }
  if (kind === 'poster') {
    return '포스터';
  }
  return '기타';
}

function filterLabel(kind) {
  if (kind === 'all') {
    return '전체';
  }
  return kindLabel(kind);
}

function movieLabel(movie) {
  let yearText = '개봉일 미등록';
  if (movie.release_date !== null) {
    yearText = movie.release_date.slice(0, 4);
  }
  return `${movie.title} (${yearText})`;
}

function movieTitle(catalog, movieId) {
  const movie = catalog.lookup.movieById.get(movieId);
  if (movie === undefined) {
    return '영화 정보 없음';
  }
  return movie.title;
}

function formatSize(bytes) {
  if (bytes < bytesPerMiB) {
    return Math.ceil(bytes / 1024) + ' KiB';
  }
  return (bytes / bytesPerMiB).toFixed(1) + ' MiB';
}

function formatUsage(bytes) {
  return (Math.ceil(bytes * 10 / bytesPerMiB) / 10).toFixed(1) + ' MiB';
}

function savedDateText(isoText) {
  return new Date(isoText).toLocaleDateString('ko-KR');
}

function errorText(error) {
  if (error && typeof error.message === 'string') {
    return error.message;
  }
  return '작업을 완료하지 못했습니다. 다시 시도해 주세요.';
}

function setBusy(value) {
  busy = value;
  const controls = document.querySelectorAll('#archive-upload-form input, #archive-upload-form button, .archive-delete');
  for (const control of controls) {
    control.disabled = value;
  }
}

function setStatus(text, isError) {
  statusText = text;
  statusIsError = isError;
  const status = document.getElementById('archive-status');
  if (status === null) {
    return;
  }
  status.textContent = text;
  status.className = 'archive-status';
  if (isError) {
    status.classList.add('error');
  }
}

function clearFormError() {
  if (!statusIsError) {
    return;
  }
  setStatus('', false);
  const messages = document.getElementById('messages');
  if (messages !== null && messages.classList.contains('error')) {
    messages.hidden = true;
  }
}

function clearSelectedFile() {
  if (previewUrl !== null) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = null;
  selectedFile = null;
}

function rememberFile(file) {
  clearSelectedFile();
  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
}

async function refreshArchive(refresh, focusId) {
  try {
    await refresh();
  } catch (error) {
    return;
  }

  const target = document.getElementById(focusId);
  if (target !== null) {
    target.focus();
  }
}

function compareGroups(a, b) {
  return a.title.localeCompare(b.title);
}

function buildUploadPanel(context) {
  const catalog = context.catalog;
  const repo = context.repo;
  const snapshot = context.snapshot;
  const refresh = context.refresh;

  const watchedMovies = new Set();
  for (const log of snapshot.logs) {
    watchedMovies.add(log.movie_id);
  }

  const fileLabel = el('label', { htmlFor: 'archive-file' }, '사진 파일 · 필수');
  const fileInput = el('input', {
    id: 'archive-file',
    name: 'file',
    type: 'file',
    className: 'form-control',
    accept: 'image/jpeg,image/png,image/webp',
    disabled: busy
  });
  fileInput.setAttribute('aria-describedby', 'archive-file-help');
  const fileHelp = el('p', { id: 'archive-file-help', className: 'archive-help' }, `JPEG·PNG·WebP 사진, 한 장 ${MEDIA_MAX_FILE_BYTES / bytesPerMiB} MiB 이하`);
  if (selectedFile !== null) {
    const transfer = new DataTransfer();
    transfer.items.add(selectedFile);
    fileInput.files = transfer.files;
  }
  const fileField = el('div', { className: 'archive-field' });
  fileField.append(fileLabel, fileInput, fileHelp);

  const preview = el('div', { id: 'archive-preview', className: 'archive-preview' });

  function showPreview() {
    if (selectedFile === null) {
      const emptyText = el('p', {}, '선택한 사진이 없습니다. 파일을 고르면 여기에 미리 보여줍니다.');
      preview.replaceChildren(emptyText);
      return;
    }
    const image = el('img', { src: previewUrl, alt: '선택한 사진 미리보기' });
    const fileText = el('p', {}, `${selectedFile.name} · ${formatSize(selectedFile.size)}`);

    function showBrokenPreview() {
      if (!preview.contains(image)) {
        return;
      }
      const brokenText = el('p', { className: 'archive-preview-error' }, '미리 볼 수 없는 파일입니다. JPEG·PNG·WebP 사진을 골라 주세요.');
      preview.replaceChildren(brokenText, fileText);
    }
    image.addEventListener('error', showBrokenPreview);
    preview.replaceChildren(image, fileText);
  }

  function chooseFile() {
    clearFormError();
    if (fileInput.files.length === 0) {
      clearSelectedFile();
    } else {
      rememberFile(fileInput.files[0]);
    }
    showPreview();
  }
  fileInput.addEventListener('change', chooseFile);
  showPreview();

  const kindSet = el('fieldset', { className: 'archive-kind' });
  const kindLegend = el('legend', {}, '사진 종류 · 필수');
  const kindButtons = el('div', { className: 'archive-kind-buttons' });

  function markKind() {
    for (const button of kindButtons.children) {
      button.setAttribute('aria-pressed', String(button.dataset.kind === selectedKind));
    }
  }

  for (const kind of MEDIA_KINDS) {
    const kindButton = el('button', {
      id: 'archive-kind-' + kind,
      type: 'button',
      className: 'btn btn-link',
      dataset: { kind: kind },
      disabled: busy
    }, kindLabel(kind));

    function pickKind() {
      clearFormError();
      selectedKind = kind;
      markKind();
    }
    kindButton.addEventListener('click', pickKind);
    kindButtons.append(kindButton);
  }
  markKind();
  kindSet.append(kindLegend, kindButtons);

  const searchLabel = el('label', { htmlFor: 'archive-movie-search' }, '영화 찾기 · 필수');
  const searchInput = el('input', {
    id: 'archive-movie-search',
    type: 'search',
    className: 'form-control',
    value: searchText,
    placeholder: '예: 시달소',
    autocomplete: 'off',
    disabled: busy
  });
  searchInput.setAttribute('aria-describedby', 'archive-movie-help');
  searchInput.setAttribute('aria-controls', 'archive-movie-results');
  const searchHelp = el('p', { id: 'archive-movie-help', className: 'archive-help' }, '제목·별칭·배우·감독 이름으로 찾은 뒤 아래 목록에서 영화를 누르세요.');
  const movieField = el('div', { className: 'archive-field' });
  movieField.append(searchLabel, searchInput, searchHelp);

  const resultCount = el('p', { className: 'archive-result-count', ariaLive: 'polite' });
  const resultList = el('ul', { id: 'archive-movie-results', className: 'archive-movie-results' });
  const selectedText = el('p', { id: 'archive-selected-movie', className: 'archive-selected', ariaLive: 'polite' });

  function markMovie() {
    for (const button of resultList.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.movieId === selectedMovieId));
    }
    if (selectedMovieId === null) {
      selectedText.textContent = '선택한 영화: 없음';
      return;
    }
    const movie = catalog.lookup.movieById.get(selectedMovieId);
    selectedText.textContent = '선택한 영화: ' + movieLabel(movie);
  }

  function showResults() {
    const results = searchMovies(catalog, searchText);
    resultList.replaceChildren();
    let shown = 0;
    for (const movie of results) {
      if (shown === resultLimit) {
        break;
      }
      const resultButton = el('button', {
        type: 'button',
        dataset: { movieId: movie.movie_id },
        disabled: busy
      });
      const name = el('span', {}, movieLabel(movie));
      resultButton.append(name);
      if (watchedMovies.has(movie.movie_id)) {
        const watched = el('small', {}, '감상한 영화');
        resultButton.append(watched);
      }

      function pickMovie() {
        clearFormError();
        selectedMovieId = movie.movie_id;
        markMovie();
      }
      resultButton.addEventListener('click', pickMovie);

      const item = el('li');
      item.append(resultButton);
      resultList.append(item);
      shown += 1;
    }

    let countText = `검색 결과 ${results.length}편`;
    if (searchText.trim() === '') {
      countText = `등록된 영화 ${results.length}편`;
    }
    if (results.length > resultLimit) {
      countText = countText + ` 중 ${resultLimit}편을 보여줍니다. 검색어를 더 자세히 입력해 보세요.`;
    }
    if (results.length === 0) {
      countText = '검색 결과가 없습니다. 다른 제목·별칭·인물 이름으로 찾아 보세요.';
    }
    resultCount.textContent = countText;
    markMovie();
  }

  function searchMovieList() {
    searchText = searchInput.value;
    showResults();
  }

  function blockEnterSubmit(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }
  searchInput.addEventListener('input', searchMovieList);
  searchInput.addEventListener('keydown', blockEnterSubmit);
  showResults();

  const saveButton = el('button', { id: 'archive-save', type: 'submit', className: 'btn btn-primary', disabled: busy }, '사진 저장');
  const actions = el('div', { className: 'archive-form-actions' });
  actions.append(saveButton);
  const status = el('p', { id: 'archive-status', className: 'archive-status', ariaLive: 'polite' }, statusText);
  if (statusIsError) {
    status.classList.add('error');
  }

  async function savePhoto(event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    const missing = [];
    if (selectedMovieId === null) {
      missing.push('사진을 연결할 영화를 선택해 주세요.');
    }
    if (selectedKind === null) {
      missing.push('사진 종류를 선택해 주세요.');
    }
    if (selectedFile === null) {
      missing.push('사진 파일을 선택해 주세요.');
    }
    if (missing.length > 0) {
      const missingText = missing.join(' ');
      setStatus(missingText, true);
      showMessage(missingText, 'error');
      return;
    }
    const payload = { movie_id: selectedMovieId, kind: selectedKind, file: selectedFile };
    setBusy(true);
    setStatus('사진을 저장하는 중입니다.', false);
    try {
      await manageMedia(repo, catalog, 'add', payload);
    } catch (error) {
      const message = errorText(error);
      setBusy(false);
      setStatus(message, true);
      showMessage(message, 'error');
      return;
    }

    clearSelectedFile();
    if (kindFilter !== 'all' && kindFilter !== payload.kind) {
      kindFilter = 'all';
    }
    setBusy(false);
    setStatus('', false);
    showMessage(kindLabel(payload.kind) + ' 사진을 보관함에 저장했습니다.');
    await refreshArchive(refresh, 'archive-file');
  }

  const form = el('form', { id: 'archive-upload-form' });
  form.addEventListener('submit', savePhoto);
  const fileColumn = el('div', { className: 'archive-form-column' });
  fileColumn.append(fileField, preview);
  const movieColumn = el('div', { className: 'archive-form-column' });
  movieColumn.append(kindSet, movieField, resultCount, resultList, selectedText);
  const formGrid = el('div', { className: 'archive-form-grid' });
  formGrid.append(fileColumn, movieColumn);
  form.append(formGrid, actions, status);

  const panel = el('section', { className: 'archive-upload-panel' });
  const panelTitle = el('h2', {}, '사진 올리기');
  panel.append(panelTitle, form);
  return panel;
}

function buildViewer() {
  const viewer = el('dialog', { id: 'archive-viewer', className: 'archive-viewer' });
  viewer.setAttribute('aria-labelledby', 'archive-viewer-title');
  const viewerTitle = el('h2', { id: 'archive-viewer-title' });
  const closeButton = el('button', { type: 'button', className: 'btn btn-link' }, '닫기');
  const viewerHeading = el('div', { className: 'archive-viewer-heading' });
  viewerHeading.append(viewerTitle, closeButton);
  const viewerImage = el('img', { id: 'archive-viewer-image', alt: '' });
  const viewerInfo = el('p', { id: 'archive-viewer-info' });
  const viewerBody = el('div', { className: 'archive-viewer-body' });
  viewerBody.append(viewerHeading, viewerImage, viewerInfo);
  viewer.append(viewerBody);

  function closeViewer() {
    viewer.close();
  }

  function closeOnBackdrop(event) {
    if (event.target === viewer) {
      viewer.close();
    }
  }

  function returnFocus() {
    const focusId = 'archive-view-' + viewingAssetId;
    viewingAssetId = null;
    const target = document.getElementById(focusId);
    if (target !== null) {
      target.focus();
    }
  }
  closeButton.addEventListener('click', closeViewer);
  viewer.addEventListener('click', closeOnBackdrop);
  viewer.addEventListener('close', returnFocus);
  return viewer;
}

function openViewer(catalog, asset, url) {
  const viewer = document.getElementById('archive-viewer');
  const title = movieTitle(catalog, asset.movie_id);
  const kind = kindLabel(asset.kind);
  viewingAssetId = asset.asset_id;
  document.getElementById('archive-viewer-title').textContent = `${title} · ${kind}`;
  const image = document.getElementById('archive-viewer-image');
  image.src = url;
  image.alt = `${title} ${kind} 사진`;
  document.getElementById('archive-viewer-info').textContent = `저장일 ${savedDateText(asset.created_at)} · ${formatSize(asset.byte_size)}`;
  if (!viewer.open) {
    viewer.showModal();
  }
}

function restoreViewer(catalog, assets, photoUrls) {
  if (viewingAssetId === null) {
    return;
  }
  for (const asset of assets) {
    if (asset.asset_id === viewingAssetId && photoUrls[asset.asset_id] !== null) {
      openViewer(catalog, asset, photoUrls[asset.asset_id]);
      return;
    }
  }
  viewingAssetId = null;
}

function buildPhotoCard(context, asset, url) {
  const catalog = context.catalog;
  const repo = context.repo;
  const refresh = context.refresh;
  const title = movieTitle(catalog, asset.movie_id);
  const kind = kindLabel(asset.kind);

  const figure = el('figure', { className: 'archive-figure' });
  if (url === null) {
    const failed = el('p', { className: 'archive-photo-error' }, '사진 원본을 읽지 못했습니다. 삭제한 뒤 다시 올려 주세요.');
    figure.append(failed);
  } else {
    const viewButton = el('button', {
      id: 'archive-view-' + asset.asset_id,
      type: 'button',
      className: 'archive-view',
      ariaLabel: `${title} ${kind} 사진 크게 보기`
    });
    viewButton.setAttribute('aria-haspopup', 'dialog');
    const image = el('img', { src: url, alt: `${title} ${kind} 사진`, loading: 'lazy' });
    viewButton.append(image);

    function viewPhoto() {
      openViewer(catalog, asset, url);
    }
    viewButton.addEventListener('click', viewPhoto);
    figure.append(viewButton);
  }
  const kindText = el('strong', {}, kind);
  const savedText = el('small', {}, '저장일 ' + savedDateText(asset.created_at));
  const caption = el('figcaption');
  caption.append(kindText, savedText);
  figure.append(caption);

  const deleteButton = el('button', {
    type: 'button',
    className: 'btn btn-link text-danger archive-delete',
    ariaLabel: `${title} ${kind} 사진 삭제`,
    disabled: busy
  }, '삭제');

  async function deletePhoto() {
    if (busy) {
      return;
    }
    const accepted = confirm(`${title} ${kind} 사진을 삭제할까요? 삭제한 사진은 되돌릴 수 없습니다.`);
    if (!accepted) {
      return;
    }
    setBusy(true);
    try {
      await manageMedia(repo, catalog, 'delete', { asset_id: asset.asset_id });
    } catch (error) {
      setBusy(false);
      showMessage(errorText(error), 'error');
      return;
    }
    setBusy(false);
    showMessage(`${title} ${kind} 사진을 삭제했습니다.`);
    await refreshArchive(refresh, 'archive-gallery-title');
  }
  deleteButton.addEventListener('click', deletePhoto);

  const card = el('li', { className: 'media-card archive-card', dataset: { kind: asset.kind } });
  card.append(figure, deleteButton);
  return card;
}

function buildGallery(context, photoUrls) {
  const catalog = context.catalog;
  const assets = context.snapshot.assets;

  let totalBytes = 0;
  const kindCounts = { all: 0 };
  for (const kind of MEDIA_KINDS) {
    kindCounts[kind] = 0;
  }
  for (const asset of assets) {
    totalBytes += asset.byte_size;
    kindCounts.all += 1;
    kindCounts[asset.kind] += 1;
  }

  const section = el('section', { className: 'page-section archive-gallery' });
  const heading = el('div', { className: 'section-heading' });
  const title = el('h2', { id: 'archive-gallery-title', tabIndex: -1 }, '모아 보기');
  const usage = el('p', { className: 'archive-usage' }, `사용량 ${formatUsage(totalBytes)} / ${MEDIA_MAX_TOTAL_BYTES / bytesPerMiB} MiB · 사진 ${assets.length}장`);
  heading.append(title, usage);
  section.append(heading);

  if (assets.length === 0) {
    viewingAssetId = null;
    const empty = el('p', { className: 'empty-state' }, '아직 보관한 사진이 없습니다. 위의 사진 올리기에서 감상한 영화의 티켓이나 특전 포스터 사진을 저장해 보세요.');
    section.append(empty);
    return section;
  }

  const filter = el('div', { className: 'archive-filter', role: 'group', ariaLabel: '사진 종류로 거르기' });
  const filterKinds = ['all'];
  for (const kind of MEDIA_KINDS) {
    filterKinds.push(kind);
  }
  const filterSummary = el('p', { className: 'archive-filter-summary', ariaLive: 'polite' });
  const filterEmpty = el('p', { className: 'empty-state' }, '선택한 종류의 사진이 없습니다. 다른 종류를 눌러 보세요.');
  const groupEntries = [];

  function applyFilter() {
    let visibleTotal = 0;
    for (const entry of groupEntries) {
      let visible = 0;
      for (const card of entry.cards) {
        if (kindFilter === 'all' || card.dataset.kind === kindFilter) {
          card.hidden = false;
          visible += 1;
        } else {
          card.hidden = true;
        }
      }
      entry.section.hidden = visible === 0;
      entry.count.textContent = `사진 ${visible}장`;
      visibleTotal += visible;
    }
    for (const button of filter.children) {
      button.setAttribute('aria-pressed', String(button.dataset.kind === kindFilter));
    }
    filterEmpty.hidden = visibleTotal > 0;
    filterSummary.textContent = `${filterLabel(kindFilter)} 사진 ${visibleTotal}장을 보여줍니다.`;
  }

  for (const kind of filterKinds) {
    const filterButton = el('button', {
      id: 'archive-filter-' + kind,
      type: 'button',
      className: 'btn btn-link',
      dataset: { kind: kind }
    }, `${filterLabel(kind)} ${kindCounts[kind]}장`);

    function pickFilter() {
      kindFilter = kind;
      applyFilter();
    }
    filterButton.addEventListener('click', pickFilter);
    filter.append(filterButton);
  }

  const groups = [];
  const groupByMovie = {};
  for (const asset of assets) {
    if (groupByMovie[asset.movie_id] === undefined) {
      const group = { title: movieTitle(catalog, asset.movie_id), movie_id: asset.movie_id, assets: [] };
      groupByMovie[asset.movie_id] = group;
      groups.push(group);
    }
    groupByMovie[asset.movie_id].assets.push(asset);
  }
  groups.sort(compareGroups);

  const groupList = el('div', { className: 'archive-groups' });
  for (const group of groups) {
    const groupTitle = el('h3');
    if (catalog.lookup.movieById.has(group.movie_id)) {
      const movieLink = el('a', { href: `movie.html?id=${encodeURIComponent(group.movie_id)}` }, group.title);
      groupTitle.append(movieLink);
    } else {
      groupTitle.textContent = group.title;
    }
    const groupCount = el('p');
    const groupHeading = el('div', { className: 'archive-group-heading' });
    groupHeading.append(groupTitle, groupCount);

    const photoList = el('ul', { className: 'media-grid archive-photo-list' });
    const cards = [];
    for (const asset of group.assets) {
      const card = buildPhotoCard(context, asset, photoUrls[asset.asset_id]);
      photoList.append(card);
      cards.push(card);
    }

    const groupSection = el('section', { className: 'archive-group' });
    groupSection.append(groupHeading, photoList);
    groupList.append(groupSection);
    groupEntries.push({ section: groupSection, count: groupCount, cards: cards });
  }

  section.append(filter, filterSummary, groupList, filterEmpty);
  applyFilter();
  return section;
}

async function renderArchive(context) {
  const app = context.app;
  const catalog = context.catalog;
  const repo = context.repo;
  const snapshot = context.snapshot;

  if (selectedMovieId !== null && !catalog.lookup.movieById.has(selectedMovieId)) {
    selectedMovieId = null;
    const notFoundText = '주소에 있는 영화를 찾지 못했습니다. 영화 찾기에서 다시 선택해 주세요.';
    setStatus(notFoundText, true);
    showMessage(notFoundText, 'error');
  }

  const objectUrls = [];
  const photoUrls = {};
  for (const asset of snapshot.assets) {
    try {
      const blob = await manageMedia(repo, catalog, 'read', { asset_id: asset.asset_id });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      photoUrls[asset.asset_id] = url;
    } catch (error) {
      photoUrls[asset.asset_id] = null;
    }
  }

  function releasePhotos() {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    objectUrls.length = 0;
  }

  const heading = el('div', { className: 'page-heading' });
  if (linkedMovieId !== null && catalog.lookup.movieById.has(linkedMovieId)) {
    const backLink = el('a', { href: `movie.html?id=${encodeURIComponent(linkedMovieId)}`, className: 'back-link' }, '← ' + movieTitle(catalog, linkedMovieId) + ' 상세 정보');
    heading.append(backLink);
  }
  const pageTitle = el('h1', {}, '사진 보관함');
  const description = el('p', { className: 'muted' }, '감상한 영화의 티켓·특전 포스터 사진을 영화별로 모아 보관합니다. 사진은 현재 브라우저에만 저장됩니다.');
  heading.append(pageTitle, description);

  const uploadPanel = buildUploadPanel(context);
  const gallery = buildGallery(context, photoUrls);
  const viewer = buildViewer();
  app.replaceChildren(heading, uploadPanel, gallery, viewer);
  restoreViewer(catalog, snapshot.assets, photoUrls);
  return releasePhotos;
}

boot({
  page: 'archive',
  title: '사진 보관함',
  render: renderArchive
});
