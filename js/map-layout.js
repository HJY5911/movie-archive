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
