/** Sangeetham (సంగీతం): "music" in Telugu. */
export const APP_NAME = 'Sangeetham';

/** The wordmark in the top bar; matches the installed app's short name. */
export const APP_SHORT_NAME = 'Sangeetham';

export const AUDIO_EXTENSIONS = ['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'webm'];

export const AUDIO_ACCEPT = `${AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(',')},audio/*`;

export function isSupportedAudioFile(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return fileName.includes('.') && AUDIO_EXTENSIONS.includes(extension);
}
