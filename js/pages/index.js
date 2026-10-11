import { boot, el, movieCard, showMessage } from '../ui.js';
import { getHomeSummary } from '../selectors.js';
import { mutateWatchLog } from '../repository.js';

boot({
  page: 'index',
  title: '메인 페이지',
  render: async ({ app, catalog, repo, snapshot, refresh }) => {
  const totals = getHomeSummary(catalog, snapshot.logs);

  const hero = document.createElement('section');
  const heading = document.createElement('h1');
  heading.textContent = '영화 감상 기록';
  hero.appendChild(heading);

  const form = el('form', {
    className: 'search-form',
    action: 'movies.html'
  });
  const input = el('input', {
    id: 'movie-search',
    type: 'search',
    name: 'q',
    placeholder: '영화 제목, 배우 또는 감독을 검색하세요',
    ariaLabel: '영화 검색어'
  });

  form.append(
    el('label', { htmlFor: 'movie-search' }, '영화 검색'),
    input,
    el('button', { className: 'button', type: 'submit' }, '검색')
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    location.href = `movies.html?${new URLSearchParams({ q: input.value.trim() })}`;
  });

  hero.append(
    form,
    el('p', { className: 'muted small' }, `등록된 영화: ${catalog.Movie.length}편`)
  );

  const stats = el('section', {
    className: 'stat-grid',
    ariaLabel: '나의 감상 요약'
  });

  for (const [label, value, unit] of [
    ['감상한 영화', totals.unique_movie_count, '편'],
    ['감상 횟수', totals.watch_count, '회'],
    ['총 감상 시간', totals.runtime_total, '분']
  ]) {
    stats.append(el('article', { className: 'stat-card' },
      el('span', { className: 'muted' }, `${label}: `),
      el('strong', {}, String(value), el('small', {}, ` ${unit}`))
    ));
  }

  const recent = el('section', { className: 'page-section' },
    el('div', { className: 'section-heading' },
      el('h2', {}, '최근 감상 기록'),
      el('a', { href: 'calendar.html', className: 'text-link' }, '캘린더로 이동')
    )
  );

  if (!snapshot.logs.length) {
    const empty = el('div', { className: 'empty-state' },
      el('h3', {}, '감상 기록이 없습니다'),
      el('p', {}, '예시 기록 버튼으로 저장과 감상 요약을 확인할 수 있습니다.'),
      el('a', { href: 'movies.html', className: 'button' }, '영화 검색 페이지로 이동')
    );
    const sampleButton = el('button', {
      type: 'button',
      className: 'button secondary'
    }, '예시 감상 기록 6개 넣어보기');

    sampleButton.disabled = catalog.Movie.length === 0;

    sampleButton.addEventListener('click', async () => {
      sampleButton.disabled = true;
      let saved = 0;
      try {
        const now = new Date();

        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const picks = [0, 1, 2, 0, 3, 4];

        for (const [i, position] of picks.entries()) {
          await mutateWatchLog(repo, catalog, 'create', {
            movie_id: catalog.Movie[position % catalog.Movie.length].movie_id,

            watched_on: `${prefix}-${String(Math.max(1, Math.min(now.getDate(), i + 1))).padStart(2, '0')}`,

            rating: [4.5, 3.5, null, 5, 4, 0.5][i],

            review_text: i === 3 ? '다시 보니 새로운 장면이 눈에 들어왔다. (예시)' : '직접 수정하거나 삭제해도 되는 예시 기록입니다.'
          });

          saved += 1;
        }

        showMessage('예시 감상 기록 6개를 저장했습니다.');
        await refresh();
      } catch (error) {
        showMessage(`${saved}개 저장 후 중단되었습니다. ${error.message}`, 'error');
        if (saved) await refresh();
      } finally {
        sampleButton.disabled = false;
      }
    });

    empty.append(sampleButton);
    recent.append(empty);
  } else {
    const cards = el('div', { className: 'card-grid' });

    const logs = snapshot.logs.slice(0, 4);

    for (const log of logs) {
      const movie = catalog.lookup.movieById.get(log.movie_id);
      const card = movieCard(catalog, movie, { watched: true });

      card.append(el('p', { className: 'card-note' }, `${log.watched_on} · ${log.rating === null ? '별점 미입력' : `★ ${log.rating.toFixed(1)}`}`));
      cards.append(card);
    }
    recent.append(cards);
  }

  const explore = el('section', { className: 'page-section' },
    el('div', { className: 'section-heading' },
      el('h2', {}, '영화 목록'),
      el('a', { href: 'movies.html', className: 'text-link' }, '전체 영화 보기')
    )
  );
  const collection = el('div', { className: 'card-grid' });

  for (const movie of catalog.Movie.slice(0, 4)) collection.append(movieCard(catalog, movie));
  explore.append(collection);

  app.replaceChildren(hero, stats, recent, explore);

} });
