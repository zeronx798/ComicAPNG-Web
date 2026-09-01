export interface PageLayout {
  sourceWidth: number;
  sourceHeight: number;
  renderWidth: number;
  renderHeight: number;
  offsetX: number;
  offsetY: number;
}

export function calculateCanvas(sizes: Array<[number, number]>): [number, number] {
  if (sizes.length === 0) {
    throw new Error("canvas.empty");
  }
  if (sizes.some(([width, height]) => width <= 0 || height <= 0)) {
    throw new Error("canvas.invalid_size");
  }
  return [
    Math.max(...sizes.map(([width]) => width)),
    Math.max(...sizes.map(([, height]) => height)),
  ];
}

export function calculateFit(
  sourceSize: [number, number],
  canvasSize: [number, number],
): PageLayout {
  const [sourceWidth, sourceHeight] = sourceSize;
  const [canvasWidth, canvasHeight] = canvasSize;
  if (Math.min(sourceWidth, sourceHeight, canvasWidth, canvasHeight) <= 0) {
    throw new Error("canvas.invalid_size");
  }
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const renderWidth = Math.max(1, Math.min(canvasWidth, Math.floor(sourceWidth * scale + 0.5)));
  const renderHeight = Math.max(
    1,
    Math.min(canvasHeight, Math.floor(sourceHeight * scale + 0.5)),
  );
  return {
    sourceWidth,
    sourceHeight,
    renderWidth,
    renderHeight,
    offsetX: Math.floor((canvasWidth - renderWidth) / 2),
    offsetY: Math.floor((canvasHeight - renderHeight) / 2),
  };
}
