/*
 * map-layout.js — 지도 핀의 표시 위치를 계산하는 순수 함수.
 * 국가 좌표와 핀 크기를 받아, 실제 좌표에 가장 가까운 겹치지 않는 중심점을 찾음.
 * radius는 45도 회전과 선택/마우스 올림 시 1.15배 확대까지 포함한 반경임.
 * 핀 사이에 8px 여유를 두고, 같은 자료와 화면 크기에는 같은 배치를 반환함.
 * 결과의 anchorX/anchorY는 실제 지리 좌표이며 연결선으로 표시함.
 * 공간이 부족하면 null을 반환하여 호출부가 지도 너비를 늘려 다시 계산하게 함.
 */
export function arrangeMapPins(pins, width, height) {
  const placed = [];
  const ordered = pins.slice().sort((a, b) => b.size - a.size || a.code.localeCompare(b.code));

  for (const pin of ordered) {
    const radius = pin.size * Math.SQRT1_2 * 1.15;
    const margin = radius + 4;
    const anchorX = pin.left / 100 * width;
    const anchorY = pin.top / 100 * height;
    const targetX = anchorX;
    const targetY = anchorY - pin.size * 0.707;
    let best = null;
    let bestDistance = Infinity;

    function consider(x, y) {
      if (x < margin || x > width - margin || y < margin || y > height - margin) return;
      const distance = (x - targetX) ** 2 + (y - targetY) ** 2;
      if (distance >= bestDistance) return;
      for (const other of placed) {
        const separation = radius + other.radius + 8;
        if ((x - other.x) ** 2 + (y - other.y) ** 2 < separation ** 2) return;
      }
      best = { code: pin.code, size: pin.size, x, y, radius, anchorX, anchorY };
      bestDistance = distance;
    }

    consider(targetX, targetY);
    if (best === null) {
      for (let y = margin; y <= height - margin; y += 8) {
        for (let x = margin; x <= width - margin; x += 8) {
          consider(x, y);
        }
      }
    }
    if (best === null) return null;
    placed.push(best);
  }

  return placed;
}
