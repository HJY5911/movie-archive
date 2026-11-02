# 외부 코드 고지 (Third-party notices)

이 저장소에 포함된 다른 사람의 코드와 그 라이선스를 적은 문서임.

현재 두 출처의 코드를 옮겨 씀: React Bits(로고 입자·첫 화면·지도 조준선)와 21st.dev의 Sonar Grid(모든 페이지의 배경 점 격자).

## React Bits

- 출처: https://github.com/DavidHDev/react-bits (https://reactbits.dev)
- 저작권: Copyright (c) 2026 David Haz
- 라이선스: MIT + Commons Clause (아래에 원문을 그대로 포함함)
- 사용 방식: React 없이 순수 JavaScript로 옮겨 쓰고 이 사이트에 맞게 줄임. 웹사이트 안에서 쓰는 것은 라이선스가 허용하며, 컴포넌트 자체를 따로 판매·재배포하지 않음.

| 이 저장소의 파일 | React Bits 원본 컴포넌트 | 사용 위치 |
| --- | --- | --- |
| js/effects/particle-text.js | ParticleText (TextAnimations/ParticleText) | 모든 페이지 메뉴의 FILMLOG 로고(js/ui.js), 메인 첫 화면의 큰 로고(js/intro.js) |
| js/intro.js, css/intro.css | ScrollExpand (Animations/ScrollExpand) | 메인 페이지(index.html) 첫 화면의 뷰파인더 소개 화면 |
| js/effects/crosshair.js | Crosshair (Animations/Crosshair) | 영화 지도(map.html, js/pages/map.js)의 조준선 |

원본에서 가져온 계산과 뺀 기능은 각 파일의 주석 설명본(docs/annotated/ 아래 같은 경로) 맨 위에 적혀 있음.

## React Bits 라이선스 원문

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

The same restriction covers the React Bits tools (Background Studio, Texture Lab, Shape Magic, Center Stage, Sound Lab and any tools added later) and the sounds in the sound library. **You may not sell, sublicense, or redistribute the tools or the sounds themselves, or offer the tools or a substantially similar copy of them as a hosted service-whether alone, in a bundle, or as a ported version.**

What you make with the tools is yours to use. You can use exported code, images, videos, and audio files in any personal or commercial application, website, or product, including paid ones. **You may not sell or redistribute the exports on their own, either individually or as the product itself, such as a sound, texture, background, or template pack.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Sonar Grid (21st.dev)

- 출처: https://21st.dev/@n1m4mz/components/sonar-grid
- 저작권: Copyright (c) 2026 NIMA MZ
- 라이선스: MIT (아래에 원문을 그대로 포함함)
- 사용 방식: React 없이 순수 JavaScript로 옮겨 쓰고 이 사이트에 맞게 고침. 조용한 점은 먹색, 지나가는 파동은 주황으로 물들게 색을 나누고, 글자가 잘 읽히도록 점을 옅고 작게 맞춤. MIT 라이선스는 저작권·허가 고지를 함께 두는 조건으로 사용·수정·배포를 허용함.

| 이 저장소의 파일 | Sonar Grid 원본 컴포넌트 | 사용 위치 |
| --- | --- | --- |
| js/effects/sonar-grid.js, css/common.css(.site-sonar) | Sonar Grid (@n1m4mz/components/sonar-grid) | 모든 페이지 배경의 점 격자와 파동(js/ui.js의 mountSonarGrid) |

원본에서 가져온 계산과 바꾼 점은 주석 설명본 docs/annotated/js/effects/sonar-grid.js 맨 위에 적혀 있음.

## Sonar Grid 라이선스 원문

MIT License

Copyright (c) 2026 NIMA MZ

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
