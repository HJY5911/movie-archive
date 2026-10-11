# 주석 설명본

사이트의 실제 실행 파일을 자세한 주석과 함께 보관한 학습용 사본임.
주석은 `~임.`, `~함.`, `~됨.`처럼 간결한 말투로 작성함. 주석에 들어 있는 코드 예시의 문자열과 실제 화면 안내 문구는 원문을 유지함.

| 실행용 파일 위치 | 설명용 파일 위치 |
| --- | --- |
| 루트의 `index.html`, `calendar.html`, `movies.html`, `movie.html` | 이 폴더의 같은 이름 HTML |
| `css/common.css` | `css/common.css` |
| `js/ui.js`, `repository.js`, `selectors.js`, `validation.js` | `js/` 아래 같은 이름 JS |
| `js/pages/index.js`, `calendar.js`, `movies.js`, `movie.js` | `js/pages/` 아래 같은 이름 JS |

설명용 파일은 GitHub나 VS Code에서 읽고 비교하기 위한 자료임. 사이트가 이 폴더의 코드를 불러오지는 않음.
실행은 프로젝트 루트의 `index.html`을 Live Server로 열어서 진행함. 이 폴더에는 이미지와 영화 JSON을 복제하지 않았으므로 설명용 HTML을 별도 사이트로 실행하지 않음.

실행 코드와 설명용 사본은 주석과 빈 줄을 제외하면 같은 동작을 갖도록 유지함. 기능을 바꿀 때는 같은 경로의 두 파일을 함께 갱신하고, 상세 설명도 새 코드에 맞춰 수정함.
