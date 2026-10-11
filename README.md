# movie-archive

웹프로그래밍 4인 팀 프로젝트 - 영화 리뷰 및 감상 아카이브

## 실행용 코드와 주석 설명본

- 루트의 HTML, `css/`, `js/`: 사이트에서 실제 사용하는 주석 없는 코드임.
- [`docs/annotated/`](docs/annotated/README.md): 같은 코드를 자세한 주석과 함께 보관한 학습용 사본임. 주석은 `~임.`, `~함.` 형태로 작성함.
- 실행할 때는 프로젝트 루트의 `index.html`을 Live Server로 열면 됨. 설명용 폴더의 HTML은 실행 대상이 아님.
- 이미지와 영화 기본 자료는 기존 `assets/`, `data/`를 사용하며, 설명용 폴더에는 중복 저장하지 않음.
- 기능을 수정하면 실행용 파일과 같은 경로의 설명용 사본을 함께 갱신함.




2026/10/12
index.html, calendar.html 추가

임시로 테이블 스키마 제작, 검토 후 구현에 사용하지 않을 테이블 및 속성 제거



index.html / index.js         : 메인 페이지의 구조와 동작을 담당하며, 영화 검색창·감상 요약·최근 감상 기록·영화 목록을 표시

calendar.html / calendar.js : 월별 캘린더를 구성하고, 선택한 날짜의 영화 감상 기록을 표시

movies.html / movies.js : 제목·별칭·배우·감독으로 영화를 검색하고 결과 목록을 표시

movie.html / movie.js : 영화 상세 정보와 감상 기록 추가·수정·삭제 및 보관 사진 조회를 담당

ui.js                             : 공통 메뉴·영화 카드·알림 등 여러 페이지에서 사용하는 UI를 생성하고, 데이터 로딩과 화면 갱신을 연결

repository.js                   : 영화 기본 데이터(JSON)를 불러오고, IndexedDB를 이용해 감상 기록과 사진을 저장·조회·관리

selectors.js                     : 영화 검색, 감상 통계 계산, 날짜별 기록 분류, 시리즈 감상 현황 계산을 담당

validation.js                    : 저장하기 전에 감상 날짜·별점 등의 입력값과 사진 파일의 형식·용량을 검사

common.css                   : 공통 글꼴·여백·화면 배치·버튼과 입력 폼 등의 기본 스타일을 정의



catalog.json : 영화 제목, 개봉일, 상영 시간, 포스터 경로, 줄거리와 장르·제작 국가·인물·검색 별칭·시리즈 등의 정보를 담은 JSON 파일

영화 기본 정보는 catalog.json에서 불러오고, 사용자 프로필·감상 기록·사진은 브라우저의 IndexedDB에 저장



Movie : 영화 한 편의 기본 정보
movie\_id     : 영화 한 편을 구분하는 고유 번호

title           : 사이트에서 대표로 보여줄 영화 제목

~~original\_title : 작품의 원래 언어로 된 제목~~

release\_date	: 영화의 개봉 날짜

runtime\_min	: 영화 전체 상영 시간, 단위는 분

poster\_url	: 대표 포스터 이미지의 주소 또는 상대 경로

overview	: 영화 줄거리·소개 문구



Profile : 사용자 프로필

profile\_id      : 사용자 또는 프로필의 고유 번호

display\_name : 화면에 보여줄 이름·닉네임

created\_at     : 프로필을 처음 만든 날짜와 시각



WatchLog : 영화를 감상한 사건을 저장하는 감상 기록

log\_id         : 감상 기록 한 건의 고유 번호

profile\_id     : 이 기록을 남긴 프로필

movie\_id     : 어떤 영화를 감상했는지 나타내는 연결 번호

watched\_on : 실제로 영화를 본 날짜

rating         : 이 감상 기록에 남긴 개인 별점

review\_text  : 해당 감상에 대한 후기·메모

created\_at   : 이 기록을 사이트에 처음 저장한 시각

updated\_at  : 이 기록을 마지막으로 수정한 시각



MediaAsset : 티켓·특전 사진

asset\_id       : 사진 한 장을 구분하는 고유 번호

profile\_id     : 사진을 보관한 프로필

movie\_id     : 이 사진이 어느 영화와 관련 있는지 나타내는 번호

kind           : 티켓·포스터·기타 등 사진 종류 <- 검토 필요

storage\_key : 실제 사진 데이터를 찾아가는 저장 키

mime\_type   : image/jpeg, image/png 같은 파일 형식

byte\_size     : 사진 파일의 크기, 단위는 바이트

created\_at   : 사진을 보관함에 등록한 시각



MovieAlias : 검색 별칭 (영화 제목의 줄임말이나 다른 검색 이름)

alias\_id             : 별칭 한 건의 고유 번호 <- 검토 필요

movie\_id          : 이 별칭이 가리키는 영화

alias                : 검색에 사용할 다른 이름·줄임말

~~normalized\_alias : 검색하기 편하도록 공백·대소문자를 정리한 별칭~~



Person : 인물 / MovieCredit : 출연·연출 연결 (N:M 연결을 위해 필요)

Person.person\_id        : 인물의 고유 번호

Person.name             : 배우·감독 등의 이름

MovieCredit.movie\_id  : 참여한 영화 번호

MovieCredit.person\_id : 참여한 인물 번호

MovieCredit.role        : 해당 영화에서 맡은 역할 (배우, 감독)



Genre : 장르 / MovieGenre : 영화·장르 연결 (N:M 연결을 위해 필요)

Genre.genre\_id         : 장르의 고유 번호

Genre.name             : 장르 이름

MovieGenre.movie\_id : 장르를 연결할 영화 번호

MovieGenre.genre\_id : 연결할 장르 번호



Country : 제작 국가 / MovieCountry : 영화·국가 연결 (N:M 연결을 위해 필요)

Country.country\_code         : KR, US 같은 국가 구분 코드

Country.name                   : 대한민국, 미국 같은 표시용 국가 이름

Country.pin\_lat                  : 지도에서 국가를 대표할 핀 위치의 위도 <- 위도와 경도를 하나의 데이터로 나타낼 시

Country.pin\_lng                 : 지도에서 국가를 대표할 핀 위치의 경도 <- 하나로 합쳐야 함

MovieCountry.movie\_id       : 제작 국가를 연결할 영화 번호

MovieCountry.country\_code : 해당 영화의 제작 국가 코드



Series : 시리즈 / SeriesMovie : 시리즈·영화 연결 (N:M 연결을 위해 필요)

Series.series\_id                : 시리즈의 고유 번호

Series.name                   : 시리즈 이름

Series.description            : 시리즈를 소개하는 문장 <- 검토 필요

SeriesMovie.movie\_id       : 시리즈에 포함되는 영화 번호

SeriesMovie.series\_id        : 어느 시리즈에 포함되는지 나타내는 번호

SeriesMovie.release\_order : 해당 시리즈 안에서의 개봉 순서

