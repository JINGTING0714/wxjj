import { enhancePixels, type EnhancementSettings } from './image-enhancement';
self.addEventListener('message',(event: MessageEvent<{ data: Uint8ClampedArray; width: number; height: number; settings: EnhancementSettings }>) => {
  try { const { data,width,height,settings } = event.data, output = enhancePixels(data,width,height,settings,progress => self.postMessage({ progress })); self.postMessage({ data: output, width,height },{ transfer:[output.buffer] }); }
  catch (reason) { self.postMessage({ error: reason instanceof Error ? reason.message : '画质增强失败' }); }
});
